// LLM integration — config loading, prompt building, invocation, response parsing

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { LANGUAGE_REF } from './language-ref.js';

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

export function buildGeneratePrompt({ specContent, specHash, target, existingTests }) {
  let instructions;
  if (target === 'test') {
    instructions = `Generate ONLY the ## test section for this spec.
Each test block uses: test "description" { expect(...).matcher(...) }
Write tests that cover each requirement in the spec.

Output ONLY the ## test section, no other text:

## test

<!-- spec-hash: ${specHash} -->

[test blocks here]`;
  } else if (target === 'impl') {
    instructions = `Here are the existing tests that your implementation must pass:

${existingTests}

Generate ONLY the ## impl section that passes these tests.

Output ONLY the ## impl section, no other text:

## impl

<!-- spec-hash: ${specHash} -->

[implementation here]`;
  } else {
    instructions = `Generate two sections for this spec. Each section must start with a spec-hash comment.
Write tests that cover each requirement in the spec, then implement the functions.

Output ONLY the following two sections, no other text:

## test

<!-- spec-hash: ${specHash} -->

[test blocks here]

## impl

<!-- spec-hash: ${specHash} -->

[implementation here]`;
  }

  return `You are generating code for SpecScript, a spec-first language that transpiles to JavaScript.

${LANGUAGE_REF}

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
  return `Fix the following issues in the SpecScript test and implementation sections.

## Spec

${specContent}

## Current Code

${generatedContent}

## Issues Found

${reviewFeedback}

## Instructions

Fix all listed issues. Output the corrected sections.

Output ONLY the following two sections, no other text:

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

export async function regen({ filePath, source, specContent, specHash, target, config, autoYes }) {
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

  // Pass 1: Generate
  console.log('Generating test and implementation...');
  const genPrompt = buildGeneratePrompt({ specContent, specHash, target, existingTests });
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

  // Pass 2+: Review loop
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    console.log(`Reviewing (attempt ${attempt + 1}/${maxRetries})...`);
    const reviewPrompt = buildReviewPrompt({ specContent, generatedContent });
    const reviewResult = invokeLlm(config.command, reviewPrompt);

    if (!reviewResult.success) {
      console.error(`Review LLM call failed: ${reviewResult.error}`);
      continue;
    }

    const feedback = reviewResult.output.trim();

    if (feedback.includes('APPROVED')) {
      console.log('Review passed!');

      // Build new file content
      const specEnd = source.match(/^## test\s*$/m) || source.match(/^## impl\s*$/m);
      const specPart = specEnd ? source.slice(0, specEnd.index) : source + '\n\n';
      const newContent = specPart.trimEnd() + '\n\n' + generatedContent + '\n';

      // Show diff and confirm
      showDiff(filePath, source, newContent);

      let shouldApply = autoYes;
      if (!autoYes) {
        const readline = await import('node:readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise(r => {
          rl.question('Apply these changes? (y/n) ', r);
        });
        rl.close();
        shouldApply = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
      }

      if (shouldApply) {
        writeFileSync(filePath, newContent);
        console.log(`Updated ${filePath}`);
        return true;
      } else {
        console.log('Changes not applied.');
        return false;
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
