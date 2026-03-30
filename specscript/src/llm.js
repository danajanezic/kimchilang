// LLM integration — config loading, prompt building, invocation, response parsing

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { LANGUAGE_REF, STYLE_GUIDANCE } from './language-ref.js';
import { KimchiValidator, formatDiagnostics } from '../../src/validator.js';

export function loadConfig(startDir) {
  let dir = resolve(startDir);
  while (true) {
    const configPath = resolve(dir, 'specscript.config.json');
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw);
      if (!config.llm || !config.llm.command) {
        throw new Error(
          'specscript.config.json is missing llm.command. Example:\n' +
          '{\n  "llm": {\n    "command": "claude --print",\n    "maxRetries": 5\n  }\n}'
        );
      }
      return {
        command: config.llm.command,
        maxRetries: config.llm.maxRetries || 5,
      };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'No specscript.config.json found. Create one with:\n' +
    '{\n  "llm": {\n    "command": "claude --print",\n    "maxRetries": 5\n  }\n}'
  );
}

export function loadLearnedRules(startDir) {
  let dir = resolve(startDir);
  while (true) {
    const rulesPath = resolve(dir, '.prompt-rules');
    if (existsSync(rulesPath)) {
      return readFileSync(rulesPath, 'utf-8').trim();
    }
    const parent = dirname(dir);
    if (parent === dir) return '';
    dir = parent;
  }
}

export function buildAnalyzePrompt(errors) {
  const errorList = errors.map((e, i) => {
    if (e.phase === 'transpile') {
      return `${i + 1}. [TRANSPILE ERROR] ${e.file}\n   ${e.error}`;
    }
    return `${i + 1}. [REVIEW REJECTION] ${e.file}\n   ${e.feedback}`;
  }).join('\n\n');

  return `You are improving a code generation prompt for KimchiLang (a language that transpiles to JavaScript).

The following errors occurred when an LLM generated KimchiLang code. Analyze them and produce a concise list of rules that would prevent these errors in the future.

## Errors

${errorList}

## Instructions

Output ONLY a list of rules, one per line, starting with "- ". Each rule should be:
- Specific and actionable (not vague)
- About KimchiLang syntax or patterns the LLM got wrong
- Short (one sentence)

Do not repeat rules that say the same thing. Do not include preamble or explanation. Output only the rules.`;
}

export async function analyzeAndLearn(log, configDir, llmCommand) {
  if (log.length === 0) return;

  const rulesPath = resolve(configDir, '.prompt-rules');
  const existingRules = existsSync(rulesPath)
    ? readFileSync(rulesPath, 'utf-8').trim()
    : '';

  const prompt = buildAnalyzePrompt(log);
  const result = await invokeLlmAsync(llmCommand, prompt);

  if (!result.success) {
    console.error('Could not analyze errors: ' + result.error);
    return;
  }

  // Extract rules (lines starting with "- ")
  const newRules = result.output
    .split('\n')
    .filter(line => line.trim().startsWith('- '))
    .map(line => line.trim())
    .join('\n');

  if (!newRules) return;

  // Deduplicate against existing rules
  const existingSet = new Set(existingRules.split('\n').filter(Boolean));
  const dedupedNew = newRules
    .split('\n')
    .filter(rule => !existingSet.has(rule))
    .join('\n');

  if (!dedupedNew) return;

  const combined = existingRules
    ? existingRules + '\n' + dedupedNew
    : dedupedNew;

  writeFileSync(rulesPath, combined + '\n');
  const count = combined.split('\n').filter(Boolean).length;
  console.log(`Updated .prompt-rules (${count} rules total)`);
}

export function buildGeneratePrompt({ specContent, specHash, target, existingTests, learnedRules }) {
  let instructions;
  if (target === 'test') {
    instructions = `Generate ONLY the ## test section for this spec.
Each test block uses: test "description" { expect(...).matcher(...) }
Write tests that cover each requirement in the spec.

Output ONLY the ## test section. No markdown code fences, no other text:

## test

<!-- spec-hash: ${specHash} -->

[test blocks here]`;
  } else if (target === 'impl') {
    instructions = `Here are the existing tests that your implementation must pass:

${existingTests}

Generate ONLY the ## impl section that passes these tests.

Output ONLY the ## impl section. No markdown code fences, no other text:

## impl

<!-- spec-hash: ${specHash} -->

[implementation here]`;
  } else {
    instructions = `Generate two sections for this spec. Each section must start with a spec-hash comment.
Write tests that cover each requirement in the spec, then implement the functions.

Output ONLY the following two sections. Do NOT wrap code in markdown code fences (no backticks). No other text:

## test

<!-- spec-hash: ${specHash} -->

[test blocks here]

## impl

<!-- spec-hash: ${specHash} -->

[implementation here]`;
  }

  const rulesSection = learnedRules
    ? `\n## IMPORTANT: Learned Rules (from previous errors)\n\n${learnedRules}\n`
    : '';

  return `You are generating code for SpecScript, a spec-first language that transpiles to JavaScript via KimchiLang.

${LANGUAGE_REF}

${STYLE_GUIDANCE}
${rulesSection}
## Spec to Implement

${specContent}

## Instructions

${instructions}`;
}

export function buildReviewPrompt({ specContent, generatedContent }) {
  return `Review whether the generated tests and implementation match the spec requirements.

## Spec

${specContent}

## Generated Code

${generatedContent}

## Instructions

For each requirement listed in the spec:
1. Verify there is at least one test that covers it
2. Verify the implementation would satisfy it

Check that:
- Tests verify behavior described in the spec, not implementation details
- All exposed functions declared in the spec are implemented
- All internal functions declared in the spec are implemented
- Types/enums declared in the spec are defined in the implementation

If everything looks correct, respond with exactly: APPROVED

Otherwise, list each issue as:
- ISSUE: [description of what's missing or wrong]
- FIX: [what should be added or changed]`;
}

export function buildFixPrompt({ specContent, specHash, generatedContent, reviewFeedback }) {
  return `Fix the following issues in the KimchiLang test and implementation sections.

Quick syntax reminders: \`dec\` (immutable), \`mut\` (mutable), \`fn\`/\`expose fn\`, \`if cond { }\` (no parens), \`catch (e)\` (parens required), \`//\` comments, \`~>\` pipe, \`>>\` flow, \`??\` nullish, \`guard cond else { }\`, \`match val { pattern => body }\`, enums are numeric constants.

## Spec

${specContent}

## Current Code

${generatedContent}

## Issues Found

${reviewFeedback}

## Instructions

Fix all listed issues. Output the corrected sections.

Output ONLY the following two sections. Do NOT wrap code in markdown code fences (no backticks). No other text:

## test

<!-- spec-hash: ${specHash} -->

[corrected test blocks]

## impl

<!-- spec-hash: ${specHash} -->

[corrected implementation]`;
}

function cleanGeneratedCode(content) {
  return content
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^```\w*\s*$/gm, '')
    .replace(/^# .+$/gm, (m) => '//' + m.slice(1))
    .replace(/^## (test|impl)\s*$/gm, '')
    .trim();
}

export function tryTranspile(generatedContent) {
  try {
    const cleanCode = cleanGeneratedCode(generatedContent);
    const validator = new KimchiValidator();
    const result = validator.validate(cleanCode);
    if (result.success) {
      return { success: true };
    }
    return { success: false, error: formatDiagnostics(result.diagnostics) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Validate all files together — enables cross-module type checking
// fileContents: Map<filePath, generatedContent>
export function tryTranspileAll(fileContents) {
  const validator = new KimchiValidator();

  const cleanFiles = new Map();
  for (const [filePath, content] of fileContents) {
    const cleanCode = cleanGeneratedCode(content);
    if (cleanCode) cleanFiles.set(filePath, cleanCode);
  }

  const results = validator.validateAll(cleanFiles);
  const errors = [];

  for (const [filePath, result] of results) {
    if (!result.success) {
      errors.push({ filePath, error: formatDiagnostics(result.diagnostics) });
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
      error: errors.map(e => `${e.filePath}:\n${e.error}`).join('\n\n'),
    };
  }
  return { success: true, errors: [] };
}

export function buildTranspileFixPrompt({ specContent, specHash, generatedContent, transpileError }) {
  return `The generated KimchiLang code has syntax/compilation errors. Fix them.

## Spec

${specContent}

## Current Code (has errors)

${generatedContent}

## Compilation Error

${transpileError}

## Common Fixes
- \`catch (e)\` requires parentheses around the parameter, not \`catch e\`
- \`dec\` bindings are immutable — use \`mut\` for mutable variables
- \`if condition { }\` — no parentheses around the condition
- \`expose fn name()\` or \`expose name\` — expose as keyword modifier or standalone
- Enum variants: \`enum Name { A, B }\` — access as \`Name.A\`

## Instructions

Fix the compilation errors. Output the corrected sections.

Output ONLY the following two sections. Do NOT wrap code in markdown code fences (no backticks). No other text:

## test

<!-- spec-hash: ${specHash} -->

[corrected test blocks]

## impl

<!-- spec-hash: ${specHash} -->

[corrected implementation]`;
}

export function parseResponse(response, specHash) {
  const testMatch = response.match(/^## test\s*$/m);
  const implMatch = response.match(/^## impl\s*$/m);

  if (!testMatch && !implMatch) return null;

  let testContent = '';
  let implContent = '';

  if (testMatch && implMatch) {
    const testStart = testMatch.index + testMatch[0].length;
    testContent = response.slice(testStart, implMatch.index).trim();
    const implStart = implMatch.index + implMatch[0].length;
    implContent = response.slice(implStart).trim();
  } else if (testMatch && !implMatch) {
    const testStart = testMatch.index + testMatch[0].length;
    testContent = response.slice(testStart).trim();
  } else if (implMatch && !testMatch) {
    const implStart = implMatch.index + implMatch[0].length;
    implContent = response.slice(implStart).trim();
  }

  // Inject hash if missing
  if (specHash) {
    const hashComment = `<!-- spec-hash: ${specHash} -->`;
    if (testContent && !testContent.includes('spec-hash:')) {
      testContent = hashComment + '\n\n' + testContent;
    }
    if (implContent && !implContent.includes('spec-hash:')) {
      implContent = hashComment + '\n\n' + implContent;
    }
  }

  return {
    test: testContent || null,
    impl: implContent || null,
  };
}

export function invokeLlm(command, prompt) {
  try {
    const result = execSync(command, {
      input: prompt,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024 * 10,
    });
    return { success: true, output: result };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || '',
      error: error.stderr || error.message,
    };
  }
}

export function invokeLlmAsync(command, prompt) {
  return new Promise((resolve) => {
    const proc = spawn('sh', ['-c', command], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });

    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout });
      } else {
        resolve({ success: false, output: stdout, error: stderr || `Exit code ${code}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, output: '', error: err.message });
    });
  });
}

export function showDiff(filePath, oldContent, newContent) {
  console.log(`\nChanges to ${filePath}:\n`);

  const oldTestStart = oldContent.match(/^## test\s*$/m);
  const newTestStart = newContent.match(/^## test\s*$/m);

  if (oldTestStart) {
    const oldRest = oldContent.slice(oldTestStart.index);
    for (const line of oldRest.split('\n')) {
      console.log(`- ${line}`);
    }
    console.log('');
  }

  if (newTestStart) {
    const newRest = newContent.slice(newTestStart.index);
    for (const line of newRest.split('\n')) {
      console.log(`+ ${line}`);
    }
  }

  console.log('');
}

async function askForFeedback() {
  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(r => {
    rl.question('What would you like changed? ', r);
  });
  rl.close();
  return answer;
}

export async function regen({ filePath, source, specContent, specHash, target, config, autoYes, log }) {
  const maxRetries = config.maxRetries;

  // Get existing tests for --impl mode
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

  // Load learned rules from previous errors
  const learnedRules = loadLearnedRules(dirname(filePath));

  // Pass 1: Generate
  console.log('Generating test and implementation...');
  const genPrompt = buildGeneratePrompt({ specContent, specHash, target, existingTests, learnedRules });
  const genResult = invokeLlm(config.command, genPrompt);

  if (!genResult.success) {
    console.error(`LLM command failed: ${genResult.error}`);
    return false;
  }

  let parsed = parseResponse(genResult.output, specHash);
  if (!parsed) {
    console.error('Could not parse LLM response. No ## test or ## impl sections found.');
    return false;
  }

  let generatedContent = '';
  if (parsed.test) generatedContent += `## test\n\n${parsed.test}\n\n`;
  if (parsed.impl) generatedContent += `## impl\n\n${parsed.impl}`;
  generatedContent = generatedContent.trim();

  // Pass 2+: Transpile + Review loop
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Try transpilation first
    console.log(`Transpiling (attempt ${attempt + 1}/${maxRetries})...`);
    const transpileResult = tryTranspile(generatedContent);

    if (!transpileResult.success) {
      console.log(`Compilation failed: ${transpileResult.error}`);
      if (log) log.push({ file: filePath, phase: 'transpile', attempt: attempt + 1, error: transpileResult.error });
      console.log('Sending error to LLM for fix...');
      const fixPrompt = buildTranspileFixPrompt({
        specContent,
        specHash,
        generatedContent,
        transpileError: transpileResult.error,
      });
      const fixResult = invokeLlm(config.command, fixPrompt);

      if (fixResult.success) {
        const fixParsed = parseResponse(fixResult.output, specHash);
        if (fixParsed) {
          generatedContent = '';
          if (fixParsed.test) generatedContent += `## test\n\n${fixParsed.test}\n\n`;
          if (fixParsed.impl) generatedContent += `## impl\n\n${fixParsed.impl}`;
          generatedContent = generatedContent.trim();
        }
      }
      continue; // Retry transpilation
    }

    console.log('Transpilation OK. Reviewing...');
    const reviewPrompt = buildReviewPrompt({ specContent, generatedContent });
    const reviewResult = invokeLlm(config.command, reviewPrompt);

    if (!reviewResult.success) {
      console.error(`Review LLM call failed: ${reviewResult.error}`);
      continue;
    }

    const feedback = reviewResult.output.trim();

    if (!feedback.includes('APPROVED')) {
      if (log) log.push({ file: filePath, phase: 'review', attempt: attempt + 1, feedback });
    }

    if (feedback.includes('APPROVED')) {
      console.log('Review passed!');

      // Build new file content
      const specEnd = source.match(/^## test\s*$/m) || source.match(/^## impl\s*$/m);
      const specPart = specEnd ? source.slice(0, specEnd.index) : source + '\n\n';
      const newContent = specPart.trimEnd() + '\n\n' + generatedContent + '\n';

      // Show diff and confirm
      showDiff(filePath, source, newContent);

      if (autoYes) {
        writeFileSync(filePath, newContent);
        console.log(`Updated ${filePath}`);
        return true;
      }

      const readline = await import('node:readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise(r => {
        rl.question('Apply these changes? (y/n/edit) ', r);
      });
      rl.close();

      const choice = answer.toLowerCase().trim();
      if (choice === 'y' || choice === 'yes') {
        writeFileSync(filePath, newContent);
        console.log(`Updated ${filePath}`);
        return true;
      } else if (choice === 'n' || choice === 'no') {
        console.log('Changes discarded.');
        return false;
      } else {
        // Treat any other input as change request feedback
        const userFeedback = choice === 'edit' ? await askForFeedback() : answer;
        console.log('Regenerating with your feedback...');
        const fixPrompt = buildFixPrompt({
          specContent,
          specHash,
          generatedContent,
          reviewFeedback: userFeedback,
        });
        const fixResult = invokeLlm(config.command, fixPrompt);
        if (fixResult.success) {
          const fixParsed = parseResponse(fixResult.output, specHash);
          if (fixParsed) {
            generatedContent = '';
            if (fixParsed.test) generatedContent += `## test\n\n${fixParsed.test}\n\n`;
            if (fixParsed.impl) generatedContent += `## impl\n\n${fixParsed.impl}`;
            generatedContent = generatedContent.trim();
          }
        }
        continue; // Back to review loop
      }
    }

    // Not approved -- fix
    console.log('Issues found, regenerating...');
    const fixPrompt = buildFixPrompt({
      specContent,
      specHash,
      generatedContent,
      reviewFeedback: feedback,
    });
    const fixResult = invokeLlm(config.command, fixPrompt);

    if (!fixResult.success) {
      console.error(`Fix LLM call failed: ${fixResult.error}`);
      continue;
    }

    const fixParsed = parseResponse(fixResult.output, specHash);
    if (fixParsed) {
      generatedContent = '';
      if (fixParsed.test) generatedContent += `## test\n\n${fixParsed.test}\n\n`;
      if (fixParsed.impl) generatedContent += `## impl\n\n${fixParsed.impl}`;
      generatedContent = generatedContent.trim();
    }
  }

  // Max retries exhausted
  console.error(`\nMax retries (${maxRetries}) exhausted. Saving draft...`);
  const draftPath = filePath + '.draft';
  const specEnd = source.match(/^## test\s*$/m) || source.match(/^## impl\s*$/m);
  const specPart = specEnd ? source.slice(0, specEnd.index) : source + '\n\n';
  const draftContent = specPart.trimEnd() + '\n\n' + generatedContent + '\n';
  writeFileSync(draftPath, draftContent);
  console.error(`Draft saved to ${draftPath}. Review and edit manually.`);
  return false;
}
