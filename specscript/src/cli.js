#!/usr/bin/env node

// SpecScript CLI — the `sp` command

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname, basename, join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SpecScriptCompiler } from './index.js';
import { splitSections } from './section-splitter.js';
import { parseSpec } from './spec-parser.js';
import { computeSpecHash, extractHash } from './hasher.js';
import { loadConfig, regen } from './llm.js';

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

async function regenFile(file, target, config, autoYes) {
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

  let succeeded = 0;
  let failed = 0;

  for (const file of files) {
    console.log(`\n--- ${file} ---\n`);
    try {
      const result = await regenFile(file, target, config, autoYes);
      if (result) {
        succeeded++;
      } else {
        failed++;
      }
    } catch (e) {
      console.error(`Error: ${e.message}`);
      failed++;
    }
  }

  if (files.length > 1) {
    console.log(`\n--- ${succeeded} succeeded, ${failed} failed ---`);
  }

  if (failed > 0 && succeeded === 0) process.exit(1);
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
        break;
    }
  })();
}
