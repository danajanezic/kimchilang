# SpecScript LLM Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `sp regen` invoke a configurable LLM command to automatically generate and review test/impl sections from specs.

**Architecture:** New `llm.js` module handles config loading, prompt building, LLM invocation via stdin, response parsing, and the generate-review-fix loop. `language-ref.js` exports the condensed SpecScript syntax reference as a string constant. `cli.js` is updated to wire regen and init to the new module.

**Tech Stack:** Node.js, ES modules, `child_process.execSync` for LLM invocation, zero external dependencies.

**Spec:** `docs/superpowers/specs/2026-03-29-specscript-llm-integration-design.md`

---

## File Structure

```
specscript/
  src/
    language-ref.js      # Exports LANGUAGE_REF string constant
    llm.js               # Config loading, prompt building, LLM invocation, response parsing, retry loop
    cli.js               # Modified: cmdRegen calls llm.js, cmdInit scaffolds config
  test/
    test.js              # New tests for config, prompts, response parsing
    mock-llm.js          # Mock LLM script for E2E testing
```

---

### Task 1: Language Reference

**Files:**
- Create: `specscript/src/language-ref.js`
- Modify: `specscript/test/test.js`

- [ ] **Step 1: Write failing tests**

Add to `specscript/test/test.js` — import at top and tests before results summary:

```javascript
import { LANGUAGE_REF } from '../src/language-ref.js';

console.log('--- Language Reference Tests ---');

test('LANGUAGE_REF contains test syntax', () => {
  assertContains(LANGUAGE_REF, 'test "description"');
  assertContains(LANGUAGE_REF, 'expect(');
  assertContains(LANGUAGE_REF, '.toBe(');
});

test('LANGUAGE_REF contains impl syntax', () => {
  assertContains(LANGUAGE_REF, 'dec ');
  assertContains(LANGUAGE_REF, 'fn ');
  assertContains(LANGUAGE_REF, '~>');
  assertContains(LANGUAGE_REF, 'enum');
});

test('LANGUAGE_REF contains file structure info', () => {
  assertContains(LANGUAGE_REF, '## spec');
  assertContains(LANGUAGE_REF, '## test');
  assertContains(LANGUAGE_REF, '## impl');
  assertContains(LANGUAGE_REF, 'spec-hash');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd specscript && mise exec -- node test/test.js`
Expected: FAIL — import not found

- [ ] **Step 3: Implement language-ref.js**

Create `specscript/src/language-ref.js`:

```javascript
// Condensed SpecScript language reference for LLM prompts

export const LANGUAGE_REF = `## SpecScript Language Reference

### File Structure
SpecScript files have three ordered sections delimited by markdown headings:
- \`## spec\` — human-written specification (intent, requirements, types, function signatures)
- \`## test\` — tests that verify the spec requirements
- \`## impl\` — implementation code

Both ## test and ## impl must start with a hash comment:
\`<!-- spec-hash: sha256:HASH_VALUE -->\`

### Test Syntax
\`\`\`
test "description" {
  expect(expression).toBe(expected)
  expect(expression).toEqual(expected)
  expect(expression).toBeTruthy()
  expect(expression).toBeFalsy()
  expect(expression).toContain(item)
  expect(expression).toHaveLength(n)
  expect(expression).toBeGreaterThan(n)
  expect(expression).toBeLessThan(n)
  expect(expression).toBeNull()
  expect(fn).toThrow(message)
}
\`\`\`

### Implementation Syntax
- \`dec x = value\` — immutable declaration (deeply frozen)
- \`fn name(params) { body }\` — function declaration
- \`async fn name(params) { body }\` — async function
- \`if condition { body } else { body }\` — conditional (no parens around condition)
- \`for item in iterable { body }\` — for-in loop
- \`while condition { body }\` — while loop
- \`try { body } catch e { body }\` — error handling
- \`throw expression\` — throw error
- \`return expression\` — return value
- \`enum Name { Variant1, Variant2 }\` — enum declaration
- \`x => expression\` — single-param arrow function
- \`(a, b) => expression\` — multi-param arrow function
- \`items ~> transform(fn)\` — pipe operator (eager)
- \`a >> b\` — flow operator (lazy composition)
- \`a == b\` — strict equality (compiles to ===)
- \`a != b\` — strict inequality (compiles to !==)
- \`a and b\`, \`a or b\`, \`not a\` — logical operators
- \`obj.property\` — null-safe member access (compiles to ?.)
- \`[1, 2, 3]\` — array literal
- \`{ key: value }\` — object literal
- \`Name { field: value }\` — named constructor (enum variant with data)
- \`start..end\` — range expression
- \`...arr\` — spread operator
- \`dec { a, b } = obj\` — object destructuring
- \`dec [a, b] = arr\` — array destructuring
`;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd specscript && mise exec -- node test/test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add specscript/src/language-ref.js specscript/test/test.js
git commit -m "feat: add condensed SpecScript language reference for LLM prompts"
```

---

### Task 2: LLM Module — Config, Prompts, Parsing, Invocation

**Files:**
- Create: `specscript/src/llm.js`
- Modify: `specscript/test/test.js`

- [ ] **Step 1: Write failing tests**

Add to `specscript/test/test.js` — import at top and tests before results summary:

```javascript
import { buildGeneratePrompt, buildReviewPrompt, buildFixPrompt, parseResponse } from '../src/llm.js';

console.log('--- LLM Module Tests ---');

test('buildGeneratePrompt includes language ref and spec for --all', () => {
  const prompt = buildGeneratePrompt({
    specContent: '# Calculator\n\n**intent:** Math\n**reason:** Need it',
    specHash: 'sha256:abc123',
    target: 'all',
  });
  assertContains(prompt, 'SpecScript');
  assertContains(prompt, '# Calculator');
  assertContains(prompt, 'sha256:abc123');
  assertContains(prompt, '## test');
  assertContains(prompt, '## impl');
});

test('buildGeneratePrompt for --test only asks for test section', () => {
  const prompt = buildGeneratePrompt({
    specContent: '# Mod\n\n**intent:** x\n**reason:** y',
    specHash: 'sha256:abc',
    target: 'test',
  });
  assertContains(prompt, '## test');
  assertContains(prompt, 'ONLY the ## test section');
});

test('buildGeneratePrompt for --impl includes existing tests', () => {
  const prompt = buildGeneratePrompt({
    specContent: '# Mod\n\n**intent:** x\n**reason:** y',
    specHash: 'sha256:abc',
    target: 'impl',
    existingTests: 'test "x" { expect(1).toBe(1) }',
  });
  assertContains(prompt, '## impl');
  assertContains(prompt, 'test "x"');
  assertContains(prompt, 'ONLY the ## impl section');
});

test('buildReviewPrompt includes spec and generated code', () => {
  const prompt = buildReviewPrompt({
    specContent: '# Mod\n\n**intent:** x\n**reason:** y',
    generatedContent: '## test\n\ntest "x" {}\n\n## impl\n\nfn x() {}',
  });
  assertContains(prompt, '# Mod');
  assertContains(prompt, 'test "x"');
  assertContains(prompt, 'APPROVED');
  assertContains(prompt, 'ISSUE');
});

test('buildFixPrompt includes spec, code, and feedback', () => {
  const prompt = buildFixPrompt({
    specContent: '# Mod\n\n**intent:** x\n**reason:** y',
    specHash: 'sha256:abc',
    generatedContent: '## test\n\ntest "x" {}',
    reviewFeedback: 'ISSUE: Missing test for edge case',
  });
  assertContains(prompt, '# Mod');
  assertContains(prompt, 'Missing test for edge case');
  assertContains(prompt, 'sha256:abc');
});

test('parseResponse extracts test and impl sections', () => {
  const response = `Some preamble text

## test

<!-- spec-hash: sha256:abc -->

test "it works" {
  expect(1).toBe(1)
}

## impl

<!-- spec-hash: sha256:abc -->

fn doIt() {
  return 1
}`;

  const result = parseResponse(response);
  assertContains(result.test, 'test "it works"');
  assertContains(result.impl, 'fn doIt()');
});

test('parseResponse returns null when sections missing', () => {
  const result = parseResponse('just some random text with no sections');
  assertEqual(result, null);
});

test('parseResponse injects hash if missing', () => {
  const response = `## test

test "x" { expect(1).toBe(1) }

## impl

fn x() { return 1 }`;

  const result = parseResponse(response, 'sha256:abc123');
  assertContains(result.test, 'spec-hash: sha256:abc123');
  assertContains(result.impl, 'spec-hash: sha256:abc123');
});

test('parseResponse handles test-only response', () => {
  const response = `## test

<!-- spec-hash: sha256:abc -->

test "it works" { expect(1).toBe(1) }`;

  const result = parseResponse(response);
  assertContains(result.test, 'test "it works"');
  assertEqual(result.impl, null);
});

test('parseResponse handles impl-only response', () => {
  const response = `## impl

<!-- spec-hash: sha256:abc -->

fn doIt() { return 1 }`;

  const result = parseResponse(response);
  assertEqual(result.test, null);
  assertContains(result.impl, 'fn doIt()');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd specscript && mise exec -- node test/test.js`
Expected: FAIL — import not found

- [ ] **Step 3: Implement llm.js**

Create `specscript/src/llm.js`:

```javascript
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

    // Not approved — fix
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd specscript && mise exec -- node test/test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add specscript/src/llm.js specscript/test/test.js
git commit -m "feat: add LLM config loading, prompt building, and response parsing"
```

---

### Task 3: Update CLI — Regen and Init

**Files:**
- Modify: `specscript/src/cli.js`
- Modify: `specscript/test/test.js`

- [ ] **Step 1: Write failing test**

Add to `specscript/test/test.js` before results summary:

```javascript
console.log('--- CLI LLM Integration Tests ---');

test('parseArgs recognizes --yes flag for non-interactive regen', () => {
  const args = parseArgs(['regen', 'myfile.sp', '--all', '--yes']);
  assertEqual(args.yes, true);
});

test('parseArgs recognizes -y shorthand', () => {
  const args = parseArgs(['regen', 'myfile.sp', '--all', '-y']);
  assertEqual(args.yes, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd specscript && mise exec -- node test/test.js`
Expected: FAIL — `args.yes` is undefined

- [ ] **Step 3: Update cli.js**

Make these changes to `specscript/src/cli.js`:

**3a. Add import at top:**

```javascript
import { loadConfig, regen } from './llm.js';
```

**3b. Add `yes: false` to parseArgs result object and `--yes`/`-y` handling in the while loop:**

In the `parseArgs` function, add `yes: false` to the result object:

```javascript
export function parseArgs(args) {
  const result = {
    command: null,
    file: null,
    output: null,
    debug: false,
    regenTarget: null,
    yes: false,
  };
```

Add this case in the while loop, after the `--all` case:

```javascript
    } else if (arg === '--yes' || arg === '-y') {
      result.yes = true;
      i++;
```

**3c. Replace `cmdRegen` function (keep `extractSpec` as-is):**

```javascript
async function cmdRegen(file, target, autoYes) {
  const source = readFile(file);
  const specContent = extractSpec(source);
  const specHash = computeSpecHash(specContent);

  let config;
  try {
    config = loadConfig(dirname(resolve(file)));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const result = await regen({
    filePath: resolve(file),
    source,
    specContent,
    specHash,
    target,
    config,
    autoYes,
  });

  if (!result) process.exit(1);
}
```

**3d. Update `cmdInit` to also scaffold config:**

```javascript
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
```

**3e. Update the regen case in the main switch and wrap in async:**

Replace the `if (isMain)` block. The regen case becomes:

```javascript
    case 'regen':
      if (!args.file || !args.regenTarget) {
        console.error('Usage: sp regen <file> --test|--impl|--all [--yes]');
        process.exit(1);
      }
      await cmdRegen(args.file, args.regenTarget, args.yes);
      break;
```

And wrap the entire switch in an async IIFE to support top-level await:

```javascript
if (isMain) {
  const args = parseArgs(process.argv.slice(2));

  await (async () => {
    switch (args.command) {
      // ... all existing cases ...
    }
  })();
}
```

**3f. Update regen help text in default case:**

```javascript
      console.log('  regen <file> --test|--impl|--all [--yes]');
      console.log('                          Generate test/impl via LLM');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd specscript && mise exec -- node test/test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add specscript/src/cli.js specscript/test/test.js
git commit -m "feat: wire LLM integration into sp regen and sp init"
```

---

### Task 4: Mock LLM and End-to-End Test

**Files:**
- Create: `specscript/test/mock-llm.js`
- Modify: `specscript/test/test.js`

- [ ] **Step 1: Create mock LLM script**

Create `specscript/test/mock-llm.js`:

```javascript
#!/usr/bin/env node

// Mock LLM for testing — reads prompt from stdin, returns canned response

import { readFileSync } from 'node:fs';

const input = readFileSync('/dev/stdin', 'utf-8');

// If the prompt contains "Review whether", respond with APPROVED
if (input.includes('Review whether')) {
  process.stdout.write('APPROVED\n');
  process.exit(0);
}

// If the prompt contains "Fix the following", respond with APPROVED
if (input.includes('Fix the following')) {
  process.stdout.write('APPROVED\n');
  process.exit(0);
}

// Otherwise it's a generate request — extract the hash from the prompt
const hashMatch = input.match(/spec-hash: (sha256:[a-f0-9]+)/);
const hash = hashMatch ? hashMatch[1] : 'sha256:unknown';

// Check what target is requested
if (input.includes('ONLY the ## test section')) {
  process.stdout.write(`## test

<!-- spec-hash: ${hash} -->

test "basic functionality" {
  expect(1).toBe(1)
}
`);
} else if (input.includes('ONLY the ## impl section')) {
  process.stdout.write(`## impl

<!-- spec-hash: ${hash} -->

fn placeholder() {
  return 1
}
`);
} else {
  // --all: generate both
  process.stdout.write(`## test

<!-- spec-hash: ${hash} -->

test "basic functionality" {
  expect(1).toBe(1)
}

## impl

<!-- spec-hash: ${hash} -->

fn placeholder() {
  return 1
}
`);
}
```

- [ ] **Step 2: Make mock executable**

```bash
chmod +x specscript/test/mock-llm.js
```

- [ ] **Step 3: Write E2E test**

Add to `specscript/test/test.js` before results summary. Note: since we need `async`, and the test harness uses synchronous `test()`, we need to handle this. The simplest approach is to make `test` support async:

First, update the `test` function at the top of the file to support async:

```javascript
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    failed++;
  }
}
```

Then update all test calls to use `await`:

Every `test(` call in the file needs `await test(` in front of it. This is a mechanical change — add `await` before every `test(` call.

Then add the E2E test before results summary:

```javascript
import { regen } from '../src/llm.js';

console.log('--- LLM Integration E2E Tests ---');

await test('regen with mock LLM generates and applies sections', async () => {
  const { writeFileSync: ws, readFileSync: rs, unlinkSync: us, existsSync: ex } = await import('node:fs');
  const { resolve: res } = await import('node:path');

  const testFile = res('test/temp-regen-test.sp');
  const specSource = `## spec

# TempTest

**intent:** Temporary test module
**reason:** Testing regen flow
`;

  ws(testFile, specSource);

  try {
    const source = rs(testFile, 'utf-8');
    const specText = source.slice(source.indexOf('## spec') + '## spec'.length);
    const specHash = computeSpecHash(specText);

    const result = await regen({
      filePath: testFile,
      source,
      specContent: specText,
      specHash,
      target: 'all',
      config: { command: 'node test/mock-llm.js', maxRetries: 3 },
      autoYes: true,
    });

    assertEqual(result, true);

    const updated = rs(testFile, 'utf-8');
    assertContains(updated, '## spec');
    assertContains(updated, '## test');
    assertContains(updated, '## impl');
    assertContains(updated, 'spec-hash:');
  } finally {
    if (ex(testFile)) us(testFile);
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd specscript && mise exec -- node test/test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add specscript/test/mock-llm.js specscript/test/test.js
git commit -m "feat: add mock LLM and end-to-end regen test"
```

---

### Task 5: Example Config

**Files:**
- Create: `specscript/examples/specscript.config.json`

- [ ] **Step 1: Create example config**

Create `specscript/examples/specscript.config.json`:

```json
{
  "llm": {
    "command": "claude --print",
    "maxRetries": 5
  }
}
```

- [ ] **Step 2: Run full test suite to verify nothing broke**

Run: `cd specscript && mise exec -- node test/test.js`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add specscript/examples/specscript.config.json
git commit -m "feat: add example LLM config for specscript examples"
```

---

## Summary

| Task | Component | What it builds |
|------|-----------|----------------|
| 1 | Language Reference | `language-ref.js` — condensed syntax reference for LLM prompts |
| 2 | LLM Module | `llm.js` — config loading, prompt building, LLM invocation, response parsing, retry loop |
| 3 | CLI Integration | Updated `cli.js` — regen calls LLM, init scaffolds config, `--yes` flag |
| 4 | E2E Test | Mock LLM + integration test for full regen flow |
| 5 | Example Config | Config file for the examples directory |
