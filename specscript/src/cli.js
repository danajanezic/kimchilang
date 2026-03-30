#!/usr/bin/env node

// SpecScript CLI — the `sp` command

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname, basename, join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SpecScriptCompiler } from './index.js';
import { splitSections } from './section-splitter.js';
import { parseSpec } from './spec-parser.js';
import { computeSpecHash, extractHash } from './hasher.js';
import { loadConfig, loadLearnedRules, regen, runQa, analyzeAndLearn, tryTranspileAll, buildGeneratePrompt, buildTranspileFixPrompt, buildReviewPrompt, buildFixPrompt, invokeLlm, invokeLlmAsync, parseResponse, showDiff } from './llm.js';

export function parseArgs(args) {
  const result = {
    command: null,
    file: null,
    output: null,
    debug: false,
    regenTarget: null,
    yes: false,
  };

  let i = 0;
  if (args.length > 0) {
    result.command = args[0];
    i = 1;
  }

  while (i < args.length) {
    const arg = args[i];
    if (arg === '-o' && i + 1 < args.length) {
      result.output = args[i + 1];
      i += 2;
    } else if (arg === '--debug') {
      result.debug = true;
      i++;
    } else if (arg === '--test') {
      result.regenTarget = 'test';
      i++;
    } else if (arg === '--impl') {
      result.regenTarget = 'impl';
      i++;
    } else if (arg === '--all') {
      result.regenTarget = 'all';
      i++;
    } else if (arg === '--yes' || arg === '-y') {
      result.yes = true;
      i++;
    } else if (!result.file) {
      result.file = arg;
      i++;
    } else {
      i++;
    }
  }

  return result;
}

function readFile(path) {
  return readFileSync(resolve(path), 'utf-8');
}

function findSpFiles(dir) {
  const files = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...findSpFiles(full));
    } else if (extname(full) === '.sp') {
      files.push(full);
    }
  }
  return files;
}

function cmdCheck(file) {
  const source = readFile(file);
  try {
    const sections = splitSections(source);
    const specHash = computeSpecHash(sections.spec);
    const testHash = extractHash(sections.test);
    const implHash = extractHash(sections.impl);

    if (!testHash || !implHash) {
      console.log(`MISSING HASH: ${file}`);
      if (!testHash) console.log('  ## test section has no spec-hash comment');
      if (!implHash) console.log('  ## impl section has no spec-hash comment');
      return false;
    }

    if (testHash !== specHash || implHash !== specHash) {
      console.log(`STALE: ${file}`);
      if (testHash !== specHash) console.log('  ## test section hash does not match spec');
      if (implHash !== specHash) console.log('  ## impl section hash does not match spec');
      console.log(`  Current spec hash: ${specHash}`);
      return false;
    }

    console.log(`FRESH: ${file}`);
    return true;
  } catch (e) {
    console.log(`ERROR: ${file} — ${e.message}`);
    return false;
  }
}

function cmdCompile(file, output, debug) {
  const source = readFile(file);
  const compiler = new SpecScriptCompiler({ debug });
  const result = compiler.compile(source);

  if (output) {
    const dir = dirname(resolve(output));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(output), result.js);
    console.log(`Compiled ${file} → ${output}`);
  } else {
    process.stdout.write(result.js);
  }
}

function cmdStale(target) {
  const path = resolve(target);
  const stat = statSync(path);
  const files = stat.isDirectory() ? findSpFiles(path) : [path];

  const staleFiles = [];
  for (const file of files) {
    try {
      const source = readFileSync(file, 'utf-8');
      const sections = splitSections(source);
      const specHash = computeSpecHash(sections.spec);
      const testHash = extractHash(sections.test);
      const implHash = extractHash(sections.impl);

      const reasons = [];
      if (!testHash) reasons.push('test section missing hash');
      else if (testHash !== specHash) reasons.push('test section stale');
      if (!implHash) reasons.push('impl section missing hash');
      else if (implHash !== specHash) reasons.push('impl section stale');

      if (reasons.length > 0) {
        staleFiles.push({ file, reasons });
      }
    } catch (e) {
      staleFiles.push({ file, reasons: [e.message] });
    }
  }

  if (staleFiles.length === 0) {
    console.log('All files are fresh.');
  } else {
    for (const { file, reasons } of staleFiles) {
      console.log(`${file}:`);
      for (const r of reasons) console.log(`  - ${r}`);
    }
  }
}

function extractSpec(source) {
  const specStart = source.match(/^## spec\s*$/m);
  if (!specStart) throw new Error('File has no ## spec section');
  const startIdx = specStart.index + specStart[0].length;

  // Find where spec ends (next ## heading or end of file)
  const rest = source.slice(startIdx);
  const nextSection = rest.match(/^## (test|impl)\s*$/m);
  const specContent = nextSection ? rest.slice(0, nextSection.index) : rest;
  return specContent;
}

async function regenFile(file, target, config, autoYes, log) {
  const source = readFile(file);
  const specContent = extractSpec(source);
  const specHash = computeSpecHash(specContent);

  return await regen({
    filePath: resolve(file),
    source,
    specContent,
    specHash,
    target,
    config,
    autoYes,
    log,
  });
}

async function cmdRegen(fileOrDir, target, autoYes) {
  const resolved = resolve(fileOrDir);
  let files;

  try {
    const stat = statSync(resolved);
    files = stat.isDirectory() ? findSpFiles(resolved) : [resolved];
  } catch {
    files = [resolved];
  }

  if (files.length === 0) {
    console.error('No .sp files found.');
    process.exit(1);
  }

  let config;
  try {
    config = loadConfig(dirname(files[0]));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const log = [];

  // Single file: use the original per-file regen
  if (files.length === 1) {
    const result = await regenFile(files[0], target, config, autoYes, log);
    writeRegenLog(log, dirname(files[0]));
    if (log.length > 0) {
      console.log('Analyzing errors to improve future prompts...');
      await analyzeAndLearn(log, dirname(resolve(files[0])), config.command);
    }
    if (!result) process.exit(1);
    return;
  }

  // Multi-file: generate all, then transpile-all loop, then review loop
  console.log(`\n=== Generating ${files.length} files ===\n`);

  // Step 1: Generate all files in parallel
  const fileData = new Map();
  let genFailed = 0;

  // Load learned rules for generation prompts
  const learnedRules = loadLearnedRules(dirname(files[0]));

  // Prepare all generation requests
  const genTasks = files.map(file => {
    const source = readFile(file);
    const specContent = extractSpec(source);
    const specHash = computeSpecHash(specContent);

    let existingTests = null;
    if (target === 'impl') {
      const testMatch = source.match(/^## test\s*$/m);
      const implMatch = source.match(/^## impl\s*$/m);
      if (testMatch && implMatch) {
        existingTests = source.slice(testMatch.index + testMatch[0].length, implMatch.index).trim();
      } else if (testMatch) {
        existingTests = source.slice(testMatch.index + testMatch[0].length).trim();
      }
    }

    const genPrompt = buildGeneratePrompt({ specContent, specHash, target, existingTests, learnedRules });
    return { file, source, specContent, specHash, genPrompt };
  });

  console.log(`Generating ${genTasks.length} files in parallel...`);

  // Fire all LLM calls concurrently
  const genResults = await Promise.all(
    genTasks.map(async (task) => {
      const result = await invokeLlmAsync(config.command, task.genPrompt);
      return { ...task, result };
    })
  );

  // Collect results
  for (const { file, source, specContent, specHash, result } of genResults) {
    if (!result.success) {
      console.error(`  ✗ ${file}: ${result.error}`);
      genFailed++;
      continue;
    }

    const parsed = parseResponse(result.output, specHash);
    if (!parsed) {
      console.error(`  ✗ ${file}: Could not parse LLM response`);
      genFailed++;
      continue;
    }

    let generatedContent = '';
    if (parsed.test) generatedContent += `## test\n\n${parsed.test}\n\n`;
    if (parsed.impl) generatedContent += `## impl\n\n${parsed.impl}`;
    generatedContent = generatedContent.trim();

    fileData.set(file, { source, specContent, specHash, generatedContent });
    console.log(`  ✓ ${file}`);
  }

  if (genFailed > 0) {
    console.error(`\n${genFailed} files failed generation.`);
  }
  if (fileData.size === 0) {
    console.error('No files generated successfully.');
    process.exit(1);
  }

  // Step 2: Transpile-all loop (type checker + linter ON across all files)
  const maxRetries = config.maxRetries;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    console.log(`\n=== Transpile check (attempt ${attempt + 1}/${maxRetries}) ===\n`);

    const allContents = new Map();
    for (const [file, data] of fileData) {
      allContents.set(file, data.generatedContent);
    }

    const transpileResult = tryTranspileAll(allContents);

    if (transpileResult.success) {
      console.log('All files transpile OK.');
      break;
    }

    // Fix files with errors in parallel
    console.log(`${transpileResult.errors.length} file(s) have errors — fixing in parallel...`);
    for (const { filePath, error } of transpileResult.errors) {
      console.log(`  ✗ ${filePath}: ${error}`);
      log.push({ file: filePath, phase: 'transpile', attempt: attempt + 1, error });
    }

    const fixResults = await Promise.all(
      transpileResult.errors.map(async ({ filePath, error }) => {
        const data = fileData.get(filePath);
        if (!data) return { filePath, success: false };

        const fixPrompt = buildTranspileFixPrompt({
          specContent: data.specContent,
          specHash: data.specHash,
          generatedContent: data.generatedContent,
          transpileError: error,
        });
        const fixResult = await invokeLlmAsync(config.command, fixPrompt);
        return { filePath, fixResult, data };
      })
    );

    for (const { filePath, fixResult, data } of fixResults) {
      if (!data) continue;
      if (fixResult.success) {
        const fixParsed = parseResponse(fixResult.output, data.specHash);
        if (fixParsed) {
          let fixed = '';
          if (fixParsed.test) fixed += `## test\n\n${fixParsed.test}\n\n`;
          if (fixParsed.impl) fixed += `## impl\n\n${fixParsed.impl}`;
          data.generatedContent = fixed.trim();
          console.log(`  ✓ ${filePath} fixed`);
        }
      }
    }

    if (attempt === maxRetries - 1) {
      console.error(`\nMax retries (${maxRetries}) exhausted during transpilation.`);
      for (const [file, data] of fileData) {
        const draftPath = file + '.draft';
        const specEnd = data.source.match(/^## test\s*$/m) || data.source.match(/^## impl\s*$/m);
        const specPart = specEnd ? data.source.slice(0, specEnd.index) : data.source + '\n\n';
        writeFileSync(draftPath, specPart.trimEnd() + '\n\n' + data.generatedContent + '\n');
      }
      console.error('Drafts saved as .draft files.');
      process.exit(1);
    }
  }

  // Step 3: Review loop — review all files in parallel, fix failures in parallel
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    console.log(`\n=== Review pass (attempt ${attempt + 1}/${maxRetries}) ===\n`);

    // Review all files in parallel
    const reviewResults = await Promise.all(
      [...fileData.entries()].map(async ([file, data]) => {
        const reviewPrompt = buildReviewPrompt({
          specContent: data.specContent,
          generatedContent: data.generatedContent,
        });
        const reviewResult = await invokeLlmAsync(config.command, reviewPrompt);
        return { file, data, reviewResult };
      })
    );

    // Collect files that need fixing
    const needsFix = [];
    let allApproved = true;

    for (const { file, data, reviewResult } of reviewResults) {
      if (!reviewResult.success) {
        console.error(`  ✗ ${file}: review failed`);
        allApproved = false;
        continue;
      }

      const feedback = reviewResult.output.trim();
      if (feedback.includes('APPROVED')) {
        console.log(`  ✓ ${file}`);
        continue;
      }

      console.log(`  ✗ ${file}: issues found`);
      allApproved = false;
      log.push({ file, phase: 'review', attempt: attempt + 1, feedback });
      needsFix.push({ file, data, feedback });
    }

    if (allApproved) {
      console.log('\nAll files approved!');
      break;
    }

    // Fix all failing files in parallel
    if (needsFix.length > 0) {
      console.log(`\nFixing ${needsFix.length} file(s) in parallel...`);
      const fixResults = await Promise.all(
        needsFix.map(async ({ file, data, feedback }) => {
          const fixPrompt = buildFixPrompt({
            specContent: data.specContent,
            specHash: data.specHash,
            generatedContent: data.generatedContent,
            reviewFeedback: feedback,
          });
          const fixResult = await invokeLlmAsync(config.command, fixPrompt);
          return { file, data, fixResult };
        })
      );

      for (const { file, data, fixResult } of fixResults) {
        if (fixResult.success) {
          const fixParsed = parseResponse(fixResult.output, data.specHash);
          if (fixParsed) {
            let fixed = '';
            if (fixParsed.test) fixed += `## test\n\n${fixParsed.test}\n\n`;
            if (fixParsed.impl) fixed += `## impl\n\n${fixParsed.impl}`;
            data.generatedContent = fixed.trim();
            console.log(`  ✓ ${file} fixed`);
          }
        }
      }
    }

    if (attempt === maxRetries - 1) {
      console.error(`\nMax retries (${maxRetries}) exhausted during review.`);
    }
  }

  // Step 4: Write all files
  console.log(`\n=== Writing ${fileData.size} files ===\n`);

  for (const [file, data] of fileData) {
    const specEnd = data.source.match(/^## test\s*$/m) || data.source.match(/^## impl\s*$/m);
    const specPart = specEnd ? data.source.slice(0, specEnd.index) : data.source + '\n\n';
    const newContent = specPart.trimEnd() + '\n\n' + data.generatedContent + '\n';

    showDiff(file, data.source, newContent);

    if (autoYes) {
      writeFileSync(file, newContent);
      console.log(`  ✓ Updated ${file}`);
    } else {
      const readline = await import('node:readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise(r => {
        rl.question(`Apply changes to ${file}? (y/n) `, r);
      });
      rl.close();

      if (answer.toLowerCase().trim() === 'y') {
        writeFileSync(file, newContent);
        console.log(`  ✓ Updated ${file}`);
      } else {
        console.log(`  Skipped ${file}`);
      }
    }
  }

  writeRegenLog(log, dirname(files[0]));
  if (log.length > 0) {
    console.log('Analyzing errors to improve future prompts...');
    await analyzeAndLearn(log, dirname(resolve(files[0])), config.command);
  }
  console.log('\nDone.');
}

function writeRegenLog(log, dir) {
  if (log.length === 0) return;
  const logPath = resolve(dir, '.regen-log.json');
  const existing = existsSync(logPath)
    ? JSON.parse(readFileSync(logPath, 'utf-8'))
    : [];
  const entry = {
    timestamp: new Date().toISOString(),
    errors: log,
  };
  existing.push(entry);
  writeFileSync(logPath, JSON.stringify(existing, null, 2) + '\n');
  console.log(`\nRegen log written to ${logPath} (${log.length} issues recorded)`);
}

function cmdRun(file, debug) {
  const source = readFile(file);
  const compiler = new SpecScriptCompiler({ debug });
  const result = compiler.compile(source);

  const tmp = resolve(dirname(file), `.${basename(file)}.tmp.mjs`);
  try {
    writeFileSync(tmp, result.js);
    execFileSync('node', [tmp], { stdio: 'inherit' });
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}

function cmdTest(fileOrDir) {
  const resolved = resolve(fileOrDir);
  let files;
  try {
    const stat = statSync(resolved);
    files = stat.isDirectory() ? findSpFiles(resolved) : [resolved];
  } catch {
    files = [resolved];
  }

  if (files.length === 0) {
    console.error('No .sp files found.');
    process.exit(1);
  }

  let totalPassed = 0;
  let totalFailed = 0;

  for (const file of files) {
    if (files.length > 1) console.log(`\n--- ${file} ---\n`);

    const source = readFile(file);
    const compiler = new SpecScriptCompiler();
    let result;
    try {
      result = compiler.compile(source);
    } catch (e) {
      console.error(`  ✗ ${file}: ${e.message}`);
      totalFailed++;
      continue;
    }

    const tmp = resolve(dirname(file), `.${basename(file)}.test.mjs`);
    try {
      writeFileSync(tmp, result.js);
      const output = execFileSync('node', [tmp], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000,
      });
      process.stdout.write(output);

      const passMatch = output.match(/(\d+) passed/);
      const failMatch = output.match(/(\d+) failed/);
      if (passMatch) totalPassed += parseInt(passMatch[1]);
      if (failMatch) totalFailed += parseInt(failMatch[1]);
    } catch (error) {
      const output = (error.stdout || '') + (error.stderr || '');
      process.stdout.write(output);
      const passMatch = output.match(/(\d+) passed/);
      const failMatch = output.match(/(\d+) failed/);
      if (passMatch) totalPassed += parseInt(passMatch[1]);
      if (failMatch) totalFailed += parseInt(failMatch[1]);
      else totalFailed++;
    } finally {
      try { unlinkSync(tmp); } catch {}
    }
  }

  if (files.length > 1) {
    console.log(`\n--- Total: ${totalPassed} passed, ${totalFailed} failed ---`);
  }

  if (totalFailed > 0) process.exit(1);
}

function cmdInit() {
  const projectFile = 'project.md';
  if (!existsSync(projectFile)) {
    const template = `# MyProject

**intent:** Describe what this project does
**reason:** Describe why it exists

## config

- target: javascript
- runtime: node
- strict: true

## requires

- Add project-wide requirements here

## modules

- Add module entries here (e.g., module.name :: Description)
`;
    writeFileSync(projectFile, template);
    console.log('Created project.md');
  } else {
    console.log('project.md already exists.');
  }

  const configFile = 'specscript.config.json';
  if (!existsSync(configFile)) {
    const configTemplate = JSON.stringify({
      llm: {
        command: 'YOUR_LLM_COMMAND_HERE',
        maxRetries: 5,
      },
    }, null, 2) + '\n';
    writeFileSync(configFile, configTemplate);
    console.log('Created specscript.config.json — update llm.command with your LLM command.');
  } else {
    console.log('specscript.config.json already exists.');
  }
}

function cmdBuild(dir, debug) {
  const files = findSpFiles(resolve(dir));
  if (files.length === 0) {
    console.log('No .sp files found.');
    return;
  }

  let compiled = 0;
  let errors = 0;
  for (const file of files) {
    try {
      const source = readFileSync(file, 'utf-8');
      const compiler = new SpecScriptCompiler({ debug });
      const result = compiler.compile(source);
      const outPath = file.replace(/\.sp$/, '.js');
      writeFileSync(outPath, result.js);
      console.log(`  ✓ ${file}`);
      compiled++;
    } catch (e) {
      console.log(`  ✗ ${file}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n${compiled} compiled, ${errors} errors`);
  if (errors > 0) process.exit(1);
}

// Main entry point
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  await (async () => {
    switch (args.command) {
      case 'init':
        cmdInit();
        break;
      case 'check':
        if (!args.file) { console.error('Usage: sp check <file>'); process.exit(1); }
        cmdCheck(args.file);
        break;
      case 'compile':
        if (!args.file) { console.error('Usage: sp compile <file> [-o output]'); process.exit(1); }
        cmdCompile(args.file, args.output, args.debug);
        break;
      case 'stale':
        if (!args.file) { console.error('Usage: sp stale <file|dir>'); process.exit(1); }
        cmdStale(args.file);
        break;
      case 'regen':
        if (!args.file || !args.regenTarget) {
          console.error('Usage: sp regen <file> --test|--impl|--all [--yes]');
          process.exit(1);
        }
        await cmdRegen(args.file, args.regenTarget, args.yes);
        break;
      case 'build':
        cmdBuild(args.file || '.', args.debug);
        break;
      case 'run':
        if (!args.file) { console.error('Usage: sp run <file>'); process.exit(1); }
        cmdRun(args.file, args.debug);
        break;
      case 'test':
        if (!args.file) { console.error('Usage: sp test <file|dir>'); process.exit(1); }
        cmdTest(args.file);
        break;
      case 'qa': {
        if (!args.file) { console.error('Usage: sp qa <file|dir>'); process.exit(1); }
        const qaResolved = resolve(args.file);
        let qaFiles;
        try {
          const stat = statSync(qaResolved);
          qaFiles = stat.isDirectory() ? findSpFiles(qaResolved) : [qaResolved];
        } catch {
          qaFiles = [qaResolved];
        }
        if (qaFiles.length === 0) { console.error('No .sp files found.'); process.exit(1); }

        let qaConfig;
        try { qaConfig = loadConfig(dirname(qaFiles[0])); } catch (e) { console.error(e.message); process.exit(1); }

        const qaLog = [];
        let qaPassed = 0;
        let qaFailed = 0;

        for (const file of qaFiles) {
          const result = await runQa({ filePath: resolve(file), config: qaConfig, log: qaLog });
          if (result) qaPassed++;
          else qaFailed++;
        }

        if (qaFiles.length > 1) {
          console.log(`\n--- QA: ${qaPassed} passed, ${qaFailed} failed ---`);
        }

        if (qaLog.length > 0) {
          writeRegenLog(qaLog, dirname(qaFiles[0]));
          console.log('Analyzing QA failures...');
          await analyzeAndLearn(qaLog, dirname(resolve(qaFiles[0])), qaConfig.command);
        }

        if (qaFailed > 0) process.exit(1);
        break;
      }
      case 'analyze': {
        const targetDir = resolve(args.file || '.');
        const logPath = resolve(targetDir, '.regen-log.json');
        if (!existsSync(logPath)) {
          console.error('No .regen-log.json found. Run sp regen first.');
          process.exit(1);
        }
        let config;
        try { config = loadConfig(targetDir); } catch (e) { console.error(e.message); process.exit(1); }
        const logData = JSON.parse(readFileSync(logPath, 'utf-8'));
        const allErrors = logData.flatMap(entry => entry.errors);
        if (allErrors.length === 0) {
          console.log('No errors in log. Nothing to analyze.');
          break;
        }
        console.log(`Analyzing ${allErrors.length} errors from ${logData.length} regen runs...`);
        await analyzeAndLearn(allErrors, targetDir, config.command);

        const rulesPath = resolve(targetDir, '.prompt-rules');
        if (existsSync(rulesPath)) {
          console.log('\nCurrent rules:\n');
          console.log(readFileSync(rulesPath, 'utf-8'));
        }
        break;
      }
      case 'rules': {
        const targetDir = resolve(args.file || '.');
        const rulesPath = resolve(targetDir, '.prompt-rules');
        if (!existsSync(rulesPath)) {
          console.log('No .prompt-rules file found. Rules are generated after regen errors.');
        } else {
          console.log(readFileSync(rulesPath, 'utf-8'));
        }
        break;
      }
      case '--version': {
        const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
        console.log(`SpecScript v${pkg.version}`);
        break;
      }
      default:
        console.log('SpecScript Compiler\n');
        console.log('Usage: sp <command> [options]\n');
        console.log('Commands:');
        console.log('  init                    Scaffold a new project');
        console.log('  check <file>            Validate structure and hash freshness');
        console.log('  compile <file> [-o out]  Compile to JavaScript');
        console.log('  stale <file|dir>        Report stale files');
        console.log('  regen <file> --test|--impl|--all [--yes]');
        console.log('                          Generate test/impl via LLM');
        console.log('  build <dir>             Compile all .sp files');
        console.log('  run <file>              Compile and execute');
        console.log('  test <file|dir>         Run embedded tests');
        console.log('  qa <file|dir>           Run independent QA tests against spec');
        console.log('  analyze [dir]           Analyze regen errors and improve prompt rules');
        console.log('  rules [dir]             Show current learned prompt rules');
        break;
    }
  })();
}
