# SpecScript Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SpecScript compiler — a spec-first language that transpiles to JavaScript, with mandatory spec/test/impl sections and hash-based sync enforcement.

**Architecture:** SpecScript compiles `.sp` files through a pipeline: section splitting (spec/test/impl) → spec parsing → hash validation → code lexing → code parsing → JavaScript generation. The compiler rejects files where spec hashes don't match, tests are missing, or tests fail. Built as a standalone project inside `specscript/` within the kimchilang repo.

**Tech Stack:** Node.js, ES modules, zero external dependencies (following KimchiLang's pattern). Custom test harness.

**Spec:** `docs/superpowers/specs/2026-03-29-specscript-design.md`

---

## File Structure

```
specscript/
  package.json
  src/
    index.js              # SpecScriptCompiler class — orchestrates all stages
    cli.js                # CLI entry point (sp command)
    section-splitter.js   # Splits .sp files into spec/test/impl sections
    spec-parser.js        # Parses the ## spec section into structured data
    hasher.js             # Normalizes spec content and computes SHA-256 hashes
    lexer.js              # Tokenizes code in ## test and ## impl sections
    parser.js             # Parses tokenized code into AST
    generator.js          # Emits JavaScript from AST
    dependency-graph.js   # Tracks cross-module spec hashes for staleness cascade
  test/
    test.js               # Test suite (custom harness, no framework)
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `specscript/package.json`
- Create: `specscript/test/test.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "specscript",
  "version": "0.1.0",
  "description": "A spec-first programming language optimized for LLMs",
  "main": "src/index.js",
  "bin": {
    "sp": "src/cli.js"
  },
  "type": "module",
  "scripts": {
    "test": "node test/test.js"
  },
  "keywords": ["language", "compiler", "spec-first", "llm"],
  "license": "MIT"
}
```

- [ ] **Step 2: Create test harness**

```javascript
// specscript/test/test.js

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(
      `${message ? message + ': ' : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertDeepEqual(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(
      `${message ? message + ': ' : ''}Expected ${b}, got ${a}`
    );
  }
}

function assertContains(str, substring, message = '') {
  if (!str.includes(substring)) {
    throw new Error(
      `${message ? message + ': ' : ''}Expected "${str}" to contain "${substring}"`
    );
  }
}

function assertThrows(fn, expectedMessage = null) {
  try {
    fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (error) {
    if (error.message === 'Expected function to throw, but it did not') {
      throw error;
    }
    if (expectedMessage && !error.message.includes(expectedMessage)) {
      throw new Error(
        `Expected error containing "${expectedMessage}", got "${error.message}"`
      );
    }
  }
}

// --- Tests will be added by subsequent tasks ---

console.log('\n--- SpecScript Test Suite ---\n');

// (test calls will be added here by each task)

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 3: Run tests to verify harness works**

Run: `cd specscript && node test/test.js`
Expected: `--- Results: 0 passed, 0 failed ---`

- [ ] **Step 4: Commit**

```bash
git add specscript/package.json specscript/test/test.js
git commit -m "feat: scaffold specscript project with test harness"
```

---

### Task 2: Section Splitter

**Files:**
- Create: `specscript/src/section-splitter.js`
- Modify: `specscript/test/test.js`

The section splitter takes raw `.sp` file content and splits it into three sections based on `## spec`, `## test`, and `## impl` headings. It enforces ordering, presence of all three sections, and the 500-line file limit.

- [ ] **Step 1: Write failing tests**

Add to `specscript/test/test.js` before the results summary:

```javascript
import { splitSections } from '../src/section-splitter.js';

console.log('--- Section Splitter Tests ---');

test('splits a valid .sp file into three sections', () => {
  const source = `## spec

# MyModule

**intent:** Does something

## test

<!-- spec-hash: sha256:abc123 -->

test "it works" {
  expect(1).toBe(1)
}

## impl

<!-- spec-hash: sha256:abc123 -->

fn doSomething() {
  return 1
}`;

  const sections = splitSections(source);
  assertEqual(sections.spec.trim().startsWith('# MyModule'), true);
  assertContains(sections.test, 'spec-hash: sha256:abc123');
  assertContains(sections.impl, 'fn doSomething');
});

test('rejects file missing ## spec section', () => {
  assertThrows(
    () => splitSections('## test\n\n## impl\n'),
    '## spec'
  );
});

test('rejects file missing ## test section', () => {
  assertThrows(
    () => splitSections('## spec\n\n## impl\n'),
    '## test'
  );
});

test('rejects file missing ## impl section', () => {
  assertThrows(
    () => splitSections('## spec\n\n## test\n'),
    '## impl'
  );
});

test('rejects file with sections out of order (impl before test)', () => {
  assertThrows(
    () => splitSections('## spec\n\n## impl\n\n## test\n'),
    'order'
  );
});

test('rejects file exceeding 500 lines', () => {
  const longFile = '## spec\n' + 'line\n'.repeat(499) + '## test\n\n## impl\n';
  assertThrows(
    () => splitSections(longFile),
    '500'
  );
});

test('accepts file at exactly 500 lines', () => {
  const lines = [];
  lines.push('## spec');
  for (let i = 0; i < 494; i++) lines.push('x');
  lines.push('## test');
  lines.push('test content');
  lines.push('## impl');
  lines.push('impl content');
  lines.push('end');
  const source = lines.join('\n');
  const sections = splitSections(source);
  assertEqual(typeof sections.spec, 'string');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd specscript && node test/test.js`
Expected: FAIL — `splitSections` not found

- [ ] **Step 3: Implement section splitter**

Create `specscript/src/section-splitter.js`:

```javascript
// Section Splitter — splits .sp files into spec/test/impl sections

const MAX_LINES = 500;
const SECTION_PATTERN = /^## (spec|test|impl)\s*$/;

export function splitSections(source) {
  const lines = source.split('\n');

  if (lines.length > MAX_LINES) {
    throw new Error(
      `File exceeds 500 line limit (${lines.length} lines). Split into smaller modules.`
    );
  }

  const sectionStarts = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SECTION_PATTERN);
    if (match) {
      sectionStarts.push({ name: match[1], line: i });
    }
  }

  const names = sectionStarts.map(s => s.name);

  if (!names.includes('spec')) {
    throw new Error('Missing required ## spec section');
  }
  if (!names.includes('test')) {
    throw new Error('Missing required ## test section');
  }
  if (!names.includes('impl')) {
    throw new Error('Missing required ## impl section');
  }

  const specIdx = names.indexOf('spec');
  const testIdx = names.indexOf('test');
  const implIdx = names.indexOf('impl');

  if (!(specIdx < testIdx && testIdx < implIdx)) {
    throw new Error(
      'Sections must be in order: ## spec, ## test, ## impl'
    );
  }

  const specStart = sectionStarts[specIdx].line + 1;
  const testStart = sectionStarts[testIdx].line + 1;
  const implStart = sectionStarts[implIdx].line + 1;

  const specEnd = sectionStarts[testIdx].line;
  const testEnd = sectionStarts[implIdx].line;
  const implEnd = lines.length;

  return {
    spec: lines.slice(specStart, specEnd).join('\n'),
    test: lines.slice(testStart, testEnd).join('\n'),
    impl: lines.slice(implStart, implEnd).join('\n'),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd specscript && node test/test.js`
Expected: All section splitter tests PASS

- [ ] **Step 5: Commit**

```bash
git add specscript/src/section-splitter.js specscript/test/test.js
git commit -m "feat: add section splitter for .sp files"
```

---

### Task 3: Spec Parser

**Files:**
- Create: `specscript/src/spec-parser.js`
- Modify: `specscript/test/test.js`

The spec parser takes the raw text of the `## spec` section and produces a structured object with module name, intent, reason, requires, types, depends, and function declarations.

- [ ] **Step 1: Write failing tests**

Add to `specscript/test/test.js`:

```javascript
import { parseSpec } from '../src/spec-parser.js';

console.log('--- Spec Parser Tests ---');

test('parses module name from # heading', () => {
  const spec = `# OrderProcessor

**intent:** Process orders
**reason:** Replaces manual handling`;

  const result = parseSpec(spec);
  assertEqual(result.module, 'OrderProcessor');
});

test('parses intent and reason', () => {
  const spec = `# Mod

**intent:** Does things
**reason:** Because reasons`;

  const result = parseSpec(spec);
  assertEqual(result.intent, 'Does things');
  assertEqual(result.reason, 'Because reasons');
});

test('parses requires list', () => {
  const spec = `# Mod

**intent:** x
**reason:** y

### requires

- First requirement
- Second requirement
- Third requirement`;

  const result = parseSpec(spec);
  assertEqual(result.requires.length, 3);
  assertEqual(result.requires[0], 'First requirement');
  assertEqual(result.requires[2], 'Third requirement');
});

test('parses type definitions', () => {
  const spec = `# Mod

**intent:** x
**reason:** y

### types

- Order :: { items: [Item], customer: Customer }
- Status :: Active | Inactive`;

  const result = parseSpec(spec);
  assertEqual(result.types.length, 2);
  assertEqual(result.types[0].name, 'Order');
  assertContains(result.types[0].definition, '{ items: [Item]');
  assertEqual(result.types[1].name, 'Status');
});

test('parses depends list', () => {
  const spec = `# Mod

**intent:** x
**reason:** y

### depends

- inventory.stock :: checkInventory
- payment.gateway :: processPayment, rollbackPayment`;

  const result = parseSpec(spec);
  assertEqual(result.depends.length, 2);
  assertEqual(result.depends[0].module, 'inventory.stock');
  assertDeepEqual(result.depends[0].functions, ['checkInventory']);
  assertDeepEqual(result.depends[1].functions, ['processPayment', 'rollbackPayment']);
});

test('parses expose function declarations', () => {
  const spec = `# Mod

**intent:** x
**reason:** y

### expose processOrder :: (Order) -> OrderResult

**intent:** Validate and process an order`;

  const result = parseSpec(spec);
  assertEqual(result.functions.length, 1);
  assertEqual(result.functions[0].name, 'processOrder');
  assertEqual(result.functions[0].visibility, 'expose');
  assertEqual(result.functions[0].params, '(Order)');
  assertEqual(result.functions[0].returnType, 'OrderResult');
  assertEqual(result.functions[0].intent, 'Validate and process an order');
});

test('parses internal function declarations', () => {
  const spec = `# Mod

**intent:** x
**reason:** y

### internal helper :: (String) -> Number

**intent:** Convert string to number`;

  const result = parseSpec(spec);
  assertEqual(result.functions[0].visibility, 'internal');
  assertEqual(result.functions[0].name, 'helper');
});

test('rejects spec missing module name', () => {
  assertThrows(
    () => parseSpec('**intent:** x\n**reason:** y'),
    'module name'
  );
});

test('rejects spec missing intent', () => {
  assertThrows(
    () => parseSpec('# Mod\n**reason:** y'),
    'intent'
  );
});

test('rejects spec missing reason', () => {
  assertThrows(
    () => parseSpec('# Mod\n**intent:** x'),
    'reason'
  );
});

test('parses full spec with all sections', () => {
  const spec = `# OrderProcessor

**intent:** Process customer orders
**reason:** Automate order handling

### requires

- Validate items against inventory
- Process payment before reserving

### types

- Order :: { items: [Item] }
- Result :: Success | Failure

### depends

- inventory.stock :: checkInventory

### expose processOrder :: (Order) -> Result

**intent:** Main order processing

### internal validate :: (Order) -> Boolean

**intent:** Validate order data`;

  const result = parseSpec(spec);
  assertEqual(result.module, 'OrderProcessor');
  assertEqual(result.requires.length, 2);
  assertEqual(result.types.length, 2);
  assertEqual(result.depends.length, 1);
  assertEqual(result.functions.length, 2);
  assertEqual(result.functions[0].visibility, 'expose');
  assertEqual(result.functions[1].visibility, 'internal');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd specscript && node test/test.js`
Expected: FAIL — `parseSpec` not found

- [ ] **Step 3: Implement spec parser**

Create `specscript/src/spec-parser.js`:

```javascript
// Spec Parser — parses ## spec section into structured data

export function parseSpec(source) {
  const lines = source.split('\n');
  const result = {
    module: null,
    intent: null,
    reason: null,
    requires: [],
    types: [],
    depends: [],
    functions: [],
  };

  let currentSection = null; // 'requires' | 'types' | 'depends' | null
  let currentFunction = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Module name: # ModuleName
    const moduleMatch = trimmed.match(/^# (\w+)$/);
    if (moduleMatch) {
      result.module = moduleMatch[1];
      currentSection = null;
      continue;
    }

    // Intent: **intent:** text
    const intentMatch = trimmed.match(/^\*\*intent:\*\*\s*(.+)$/);
    if (intentMatch) {
      if (currentFunction) {
        currentFunction.intent = intentMatch[1];
        result.functions.push(currentFunction);
        currentFunction = null;
      } else {
        result.intent = intentMatch[1];
      }
      currentSection = null;
      continue;
    }

    // Reason: **reason:** text
    const reasonMatch = trimmed.match(/^\*\*reason:\*\*\s*(.+)$/);
    if (reasonMatch) {
      result.reason = reasonMatch[1];
      currentSection = null;
      continue;
    }

    // Section headers
    if (trimmed === '### requires') {
      flushFunction();
      currentSection = 'requires';
      continue;
    }
    if (trimmed === '### types') {
      flushFunction();
      currentSection = 'types';
      continue;
    }
    if (trimmed === '### depends') {
      flushFunction();
      currentSection = 'depends';
      continue;
    }

    // Function declarations: ### expose/internal name :: (Params) -> ReturnType
    const funcMatch = trimmed.match(
      /^### (expose|internal)\s+(\w+)\s*::\s*(\([^)]*\))\s*->\s*(.+)$/
    );
    if (funcMatch) {
      flushFunction();
      currentSection = null;
      currentFunction = {
        visibility: funcMatch[1],
        name: funcMatch[2],
        params: funcMatch[3],
        returnType: funcMatch[4].trim(),
        intent: null,
      };
      continue;
    }

    // List items within sections
    const listMatch = trimmed.match(/^- (.+)$/);
    if (listMatch && currentSection) {
      const content = listMatch[1];
      if (currentSection === 'requires') {
        result.requires.push(content);
      } else if (currentSection === 'types') {
        const typeMatch = content.match(/^(\w+)\s*::\s*(.+)$/);
        if (typeMatch) {
          result.types.push({
            name: typeMatch[1],
            definition: typeMatch[2].trim(),
          });
        }
      } else if (currentSection === 'depends') {
        const depMatch = content.match(/^([\w.]+)\s*::\s*(.+)$/);
        if (depMatch) {
          result.depends.push({
            module: depMatch[1],
            functions: depMatch[2].split(',').map(f => f.trim()),
          });
        }
      }
      continue;
    }
  }

  flushFunction();

  // Validation
  if (!result.module) {
    throw new Error('Spec missing module name (# ModuleName heading)');
  }
  if (!result.intent) {
    throw new Error('Spec missing **intent:** field');
  }
  if (!result.reason) {
    throw new Error('Spec missing **reason:** field');
  }

  return result;

  function flushFunction() {
    if (currentFunction) {
      result.functions.push(currentFunction);
      currentFunction = null;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd specscript && node test/test.js`
Expected: All spec parser tests PASS

- [ ] **Step 5: Commit**

```bash
git add specscript/src/spec-parser.js specscript/test/test.js
git commit -m "feat: add spec parser for ## spec section"
```

---

### Task 4: Hash Mechanism

**Files:**
- Create: `specscript/src/hasher.js`
- Modify: `specscript/test/test.js`

The hasher normalizes spec content (collapses whitespace, trims lines) and computes SHA-256 hashes. It also extracts and validates hashes from test/impl sections.

- [ ] **Step 1: Write failing tests**

Add to `specscript/test/test.js`:

```javascript
import { computeSpecHash, extractHash, normalizeSpec } from '../src/hasher.js';

console.log('--- Hasher Tests ---');

test('normalizeSpec collapses whitespace', () => {
  const a = normalizeSpec('# Mod\n\n\n**intent:** x\n  **reason:** y');
  const b = normalizeSpec('# Mod\n**intent:** x\n**reason:** y');
  assertEqual(a, b);
});

test('normalizeSpec trims lines', () => {
  const a = normalizeSpec('  # Mod  \n  **intent:** x  ');
  const b = normalizeSpec('# Mod\n**intent:** x');
  assertEqual(a, b);
});

test('computeSpecHash returns consistent hash for same content', () => {
  const hash1 = computeSpecHash('# Mod\n**intent:** x\n**reason:** y');
  const hash2 = computeSpecHash('# Mod\n**intent:** x\n**reason:** y');
  assertEqual(hash1, hash2);
});

test('computeSpecHash returns different hash for different content', () => {
  const hash1 = computeSpecHash('# Mod\n**intent:** x\n**reason:** y');
  const hash2 = computeSpecHash('# Mod\n**intent:** z\n**reason:** y');
  const different = hash1 !== hash2;
  assertEqual(different, true);
});

test('computeSpecHash ignores whitespace differences', () => {
  const hash1 = computeSpecHash('# Mod\n**intent:** x\n**reason:** y');
  const hash2 = computeSpecHash('# Mod\n\n  **intent:** x  \n\n**reason:** y\n\n');
  assertEqual(hash1, hash2);
});

test('computeSpecHash returns sha256: prefixed string', () => {
  const hash = computeSpecHash('# Mod');
  assertEqual(hash.startsWith('sha256:'), true);
  assertEqual(hash.length, 7 + 64); // "sha256:" + 64 hex chars
});

test('extractHash finds hash in HTML comment', () => {
  const section = '<!-- spec-hash: sha256:abc123def456 -->\n\nsome code';
  const hash = extractHash(section);
  assertEqual(hash, 'sha256:abc123def456');
});

test('extractHash returns null when no hash present', () => {
  const hash = extractHash('just some code\nno hash here');
  assertEqual(hash, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd specscript && node test/test.js`
Expected: FAIL — imports not found

- [ ] **Step 3: Implement hasher**

Create `specscript/src/hasher.js`:

```javascript
// Hasher — normalizes spec content and computes SHA-256 hashes

import { createHash } from 'node:crypto';

export function normalizeSpec(source) {
  return source
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}

export function computeSpecHash(source) {
  const normalized = normalizeSpec(source);
  const hash = createHash('sha256').update(normalized).digest('hex');
  return `sha256:${hash}`;
}

export function extractHash(section) {
  const match = section.match(/<!--\s*spec-hash:\s*(sha256:[a-f0-9]+)\s*-->/);
  return match ? match[1] : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd specscript && node test/test.js`
Expected: All hasher tests PASS

- [ ] **Step 5: Commit**

```bash
git add specscript/src/hasher.js specscript/test/test.js
git commit -m "feat: add spec hash computation and validation"
```

---

### Task 5: Code Lexer

**Files:**
- Create: `specscript/src/lexer.js`
- Modify: `specscript/test/test.js`

The lexer tokenizes code in `## test` and `## impl` sections. It follows KimchiLang's token design: keywords (`dec`, `fn`, `return`, `if`, `else`, `for`, `in`, `not`, `and`, `or`, `test`, `expect`), operators (`~>`, `>>`, `=>`, `==`, `!=`, `::`, `..`, `|`), literals (numbers, strings, booleans), identifiers, and delimiters.

- [ ] **Step 1: Write failing tests**

Add to `specscript/test/test.js`:

```javascript
import { tokenize, TokenType } from '../src/lexer.js';

console.log('--- Lexer Tests ---');

test('tokenizes keywords', () => {
  const tokens = tokenize('dec fn return if else');
  assertEqual(tokens[0].type, TokenType.DEC);
  assertEqual(tokens[1].type, TokenType.FN);
  assertEqual(tokens[2].type, TokenType.RETURN);
  assertEqual(tokens[3].type, TokenType.IF);
  assertEqual(tokens[4].type, TokenType.ELSE);
});

test('tokenizes identifiers', () => {
  const tokens = tokenize('myVar foo_bar');
  assertEqual(tokens[0].type, TokenType.IDENTIFIER);
  assertEqual(tokens[0].value, 'myVar');
  assertEqual(tokens[1].type, TokenType.IDENTIFIER);
  assertEqual(tokens[1].value, 'foo_bar');
});

test('tokenizes numbers', () => {
  const tokens = tokenize('42 3.14');
  assertEqual(tokens[0].type, TokenType.NUMBER);
  assertEqual(tokens[0].value, '42');
  assertEqual(tokens[1].type, TokenType.NUMBER);
  assertEqual(tokens[1].value, '3.14');
});

test('tokenizes strings', () => {
  const tokens = tokenize('"hello world"');
  assertEqual(tokens[0].type, TokenType.STRING);
  assertEqual(tokens[0].value, 'hello world');
});

test('tokenizes operators', () => {
  const tokens = tokenize('= == != => ~> >> + - * /');
  assertEqual(tokens[0].type, TokenType.ASSIGN);
  assertEqual(tokens[1].type, TokenType.EQ);
  assertEqual(tokens[2].type, TokenType.NEQ);
  assertEqual(tokens[3].type, TokenType.FAT_ARROW);
  assertEqual(tokens[4].type, TokenType.PIPE);
  assertEqual(tokens[5].type, TokenType.FLOW);
});

test('tokenizes delimiters', () => {
  const tokens = tokenize('( ) { } [ ] , .');
  assertEqual(tokens[0].type, TokenType.LPAREN);
  assertEqual(tokens[1].type, TokenType.RPAREN);
  assertEqual(tokens[2].type, TokenType.LBRACE);
  assertEqual(tokens[3].type, TokenType.RBRACE);
  assertEqual(tokens[4].type, TokenType.LBRACKET);
  assertEqual(tokens[5].type, TokenType.RBRACKET);
  assertEqual(tokens[6].type, TokenType.COMMA);
  assertEqual(tokens[7].type, TokenType.DOT);
});

test('tokenizes test block keywords', () => {
  const tokens = tokenize('test expect');
  assertEqual(tokens[0].type, TokenType.TEST);
  assertEqual(tokens[1].type, TokenType.EXPECT);
});

test('tokenizes logical operators', () => {
  const tokens = tokenize('and or not');
  assertEqual(tokens[0].type, TokenType.AND);
  assertEqual(tokens[1].type, TokenType.OR);
  assertEqual(tokens[2].type, TokenType.NOT);
});

test('tokenizes boolean literals', () => {
  const tokens = tokenize('true false');
  assertEqual(tokens[0].type, TokenType.BOOLEAN);
  assertEqual(tokens[0].value, 'true');
  assertEqual(tokens[1].type, TokenType.BOOLEAN);
  assertEqual(tokens[1].value, 'false');
});

test('tokenizes pipe operator in expression', () => {
  const tokens = tokenize('items ~> filter(x => x > 0)');
  assertEqual(tokens[0].type, TokenType.IDENTIFIER);
  assertEqual(tokens[1].type, TokenType.PIPE);
  assertEqual(tokens[2].type, TokenType.IDENTIFIER);
});

test('tracks line and column', () => {
  const tokens = tokenize('dec x = 1\ndec y = 2');
  assertEqual(tokens[0].line, 1);
  assertEqual(tokens[0].column, 1);
  const yToken = tokens.find(t => t.value === 'y');
  assertEqual(yToken.line, 2);
});

test('skips comments', () => {
  const tokens = tokenize('dec x = 1 // this is a comment\ndec y = 2');
  const identifiers = tokens.filter(t => t.type === TokenType.IDENTIFIER);
  assertEqual(identifiers.length, 2);
});

test('skips HTML comments (hash lines)', () => {
  const tokens = tokenize('<!-- spec-hash: sha256:abc -->\nfn foo() {}');
  assertEqual(tokens[0].type, TokenType.FN);
});

test('ends with EOF', () => {
  const tokens = tokenize('dec x = 1');
  assertEqual(tokens[tokens.length - 1].type, TokenType.EOF);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd specscript && node test/test.js`
Expected: FAIL — imports not found

- [ ] **Step 3: Implement lexer**

Create `specscript/src/lexer.js`:

```javascript
// Lexer — tokenizes code in ## test and ## impl sections

export const TokenType = {
  // Literals
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  IDENTIFIER: 'IDENTIFIER',
  BOOLEAN: 'BOOLEAN',
  NULL: 'NULL',

  // Keywords
  DEC: 'DEC',
  FN: 'FN',
  RETURN: 'RETURN',
  IF: 'IF',
  ELSE: 'ELSE',
  ELIF: 'ELIF',
  FOR: 'FOR',
  IN: 'IN',
  WHILE: 'WHILE',
  BREAK: 'BREAK',
  CONTINUE: 'CONTINUE',
  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT',
  ASYNC: 'ASYNC',
  AWAIT: 'AWAIT',
  TRY: 'TRY',
  CATCH: 'CATCH',
  FINALLY: 'FINALLY',
  THROW: 'THROW',
  ENUM: 'ENUM',
  EXPOSE: 'EXPOSE',
  TEST: 'TEST',
  EXPECT: 'EXPECT',

  // Operators
  PLUS: 'PLUS',
  MINUS: 'MINUS',
  STAR: 'STAR',
  SLASH: 'SLASH',
  PERCENT: 'PERCENT',
  ASSIGN: 'ASSIGN',
  EQ: 'EQ',
  NEQ: 'NEQ',
  LT: 'LT',
  GT: 'GT',
  LTE: 'LTE',
  GTE: 'GTE',
  FAT_ARROW: 'FAT_ARROW',
  PIPE: 'PIPE',
  FLOW: 'FLOW',
  RANGE: 'RANGE',
  SPREAD: 'SPREAD',
  DOUBLE_COLON: 'DOUBLE_COLON',
  BITOR: 'BITOR',

  // Delimiters
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  LBRACE: 'LBRACE',
  RBRACE: 'RBRACE',
  LBRACKET: 'LBRACKET',
  RBRACKET: 'RBRACKET',
  COMMA: 'COMMA',
  DOT: 'DOT',
  COLON: 'COLON',
  NEWLINE: 'NEWLINE',

  // Special
  EOF: 'EOF',
};

const KEYWORDS = {
  dec: TokenType.DEC,
  fn: TokenType.FN,
  return: TokenType.RETURN,
  if: TokenType.IF,
  else: TokenType.ELSE,
  elif: TokenType.ELIF,
  for: TokenType.FOR,
  in: TokenType.IN,
  while: TokenType.WHILE,
  break: TokenType.BREAK,
  continue: TokenType.CONTINUE,
  and: TokenType.AND,
  or: TokenType.OR,
  not: TokenType.NOT,
  async: TokenType.ASYNC,
  await: TokenType.AWAIT,
  try: TokenType.TRY,
  catch: TokenType.CATCH,
  finally: TokenType.FINALLY,
  throw: TokenType.THROW,
  enum: TokenType.ENUM,
  expose: TokenType.EXPOSE,
  test: TokenType.TEST,
  expect: TokenType.EXPECT,
  true: TokenType.BOOLEAN,
  false: TokenType.BOOLEAN,
  null: TokenType.NULL,
};

class Token {
  constructor(type, value, line, column) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.column = column;
  }
}

class Lexer {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];
  }

  peek(offset = 0) {
    return this.source[this.pos + offset] || '\0';
  }

  advance() {
    const ch = this.source[this.pos];
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  skipWhitespace() {
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        this.advance();
      } else {
        break;
      }
    }
  }

  skipLineComment() {
    while (this.pos < this.source.length && this.peek() !== '\n') {
      this.advance();
    }
  }

  skipHtmlComment() {
    while (this.pos < this.source.length) {
      if (this.peek() === '-' && this.peek(1) === '-' && this.peek(2) === '>') {
        this.advance(); this.advance(); this.advance();
        return;
      }
      this.advance();
    }
  }

  readString(quote) {
    let value = '';
    while (this.pos < this.source.length && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance();
        const escaped = this.advance();
        switch (escaped) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case '\\': value += '\\'; break;
          case '"': value += '"'; break;
          case "'": value += "'"; break;
          default: value += escaped;
        }
      } else {
        value += this.advance();
      }
    }
    if (this.pos < this.source.length) this.advance(); // closing quote
    return value;
  }

  readNumber() {
    let num = '';
    while (this.pos < this.source.length && (this.isDigit(this.peek()) || this.peek() === '.')) {
      num += this.advance();
    }
    return num;
  }

  readIdentifier() {
    let id = '';
    while (this.pos < this.source.length && this.isIdentChar(this.peek())) {
      id += this.advance();
    }
    return id;
  }

  isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }

  isAlpha(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  isIdentChar(ch) {
    return this.isAlpha(ch) || this.isDigit(ch);
  }

  tokenize() {
    while (this.pos < this.source.length) {
      this.skipWhitespace();
      if (this.pos >= this.source.length) break;

      const ch = this.peek();
      const startLine = this.line;
      const startCol = this.column;

      // Newlines
      if (ch === '\n') {
        this.advance();
        continue;
      }

      // HTML comments (skip hash lines)
      if (ch === '<' && this.peek(1) === '!' && this.peek(2) === '-' && this.peek(3) === '-') {
        this.skipHtmlComment();
        continue;
      }

      // Line comments
      if (ch === '/' && this.peek(1) === '/') {
        this.skipLineComment();
        continue;
      }

      // Strings
      if (ch === '"' || ch === "'") {
        this.advance();
        const value = this.readString(ch);
        this.tokens.push(new Token(TokenType.STRING, value, startLine, startCol));
        continue;
      }

      // Numbers
      if (this.isDigit(ch)) {
        const num = this.readNumber();
        this.tokens.push(new Token(TokenType.NUMBER, num, startLine, startCol));
        continue;
      }

      // Identifiers and keywords
      if (this.isAlpha(ch)) {
        const id = this.readIdentifier();
        const type = KEYWORDS[id] || TokenType.IDENTIFIER;
        this.tokens.push(new Token(type, id, startLine, startCol));
        continue;
      }

      // Two-character operators
      if (ch === '=' && this.peek(1) === '=') {
        this.advance(); this.advance();
        this.tokens.push(new Token(TokenType.EQ, '==', startLine, startCol));
        continue;
      }
      if (ch === '!' && this.peek(1) === '=') {
        this.advance(); this.advance();
        this.tokens.push(new Token(TokenType.NEQ, '!=', startLine, startCol));
        continue;
      }
      if (ch === '=' && this.peek(1) === '>') {
        this.advance(); this.advance();
        this.tokens.push(new Token(TokenType.FAT_ARROW, '=>', startLine, startCol));
        continue;
      }
      if (ch === '~' && this.peek(1) === '>') {
        this.advance(); this.advance();
        this.tokens.push(new Token(TokenType.PIPE, '~>', startLine, startCol));
        continue;
      }
      if (ch === '>' && this.peek(1) === '>') {
        this.advance(); this.advance();
        this.tokens.push(new Token(TokenType.FLOW, '>>', startLine, startCol));
        continue;
      }
      if (ch === '<' && this.peek(1) === '=') {
        this.advance(); this.advance();
        this.tokens.push(new Token(TokenType.LTE, '<=', startLine, startCol));
        continue;
      }
      if (ch === '>' && this.peek(1) === '=') {
        this.advance(); this.advance();
        this.tokens.push(new Token(TokenType.GTE, '>=', startLine, startCol));
        continue;
      }
      if (ch === ':' && this.peek(1) === ':') {
        this.advance(); this.advance();
        this.tokens.push(new Token(TokenType.DOUBLE_COLON, '::', startLine, startCol));
        continue;
      }
      if (ch === '.' && this.peek(1) === '.') {
        if (this.peek(2) === '.') {
          this.advance(); this.advance(); this.advance();
          this.tokens.push(new Token(TokenType.SPREAD, '...', startLine, startCol));
        } else {
          this.advance(); this.advance();
          this.tokens.push(new Token(TokenType.RANGE, '..', startLine, startCol));
        }
        continue;
      }

      // Single-character operators and delimiters
      this.advance();
      switch (ch) {
        case '=': this.tokens.push(new Token(TokenType.ASSIGN, '=', startLine, startCol)); break;
        case '+': this.tokens.push(new Token(TokenType.PLUS, '+', startLine, startCol)); break;
        case '-': this.tokens.push(new Token(TokenType.MINUS, '-', startLine, startCol)); break;
        case '*': this.tokens.push(new Token(TokenType.STAR, '*', startLine, startCol)); break;
        case '/': this.tokens.push(new Token(TokenType.SLASH, '/', startLine, startCol)); break;
        case '%': this.tokens.push(new Token(TokenType.PERCENT, '%', startLine, startCol)); break;
        case '<': this.tokens.push(new Token(TokenType.LT, '<', startLine, startCol)); break;
        case '>': this.tokens.push(new Token(TokenType.GT, '>', startLine, startCol)); break;
        case '|': this.tokens.push(new Token(TokenType.BITOR, '|', startLine, startCol)); break;
        case '(': this.tokens.push(new Token(TokenType.LPAREN, '(', startLine, startCol)); break;
        case ')': this.tokens.push(new Token(TokenType.RPAREN, ')', startLine, startCol)); break;
        case '{': this.tokens.push(new Token(TokenType.LBRACE, '{', startLine, startCol)); break;
        case '}': this.tokens.push(new Token(TokenType.RBRACE, '}', startLine, startCol)); break;
        case '[': this.tokens.push(new Token(TokenType.LBRACKET, '[', startLine, startCol)); break;
        case ']': this.tokens.push(new Token(TokenType.RBRACKET, ']', startLine, startCol)); break;
        case ',': this.tokens.push(new Token(TokenType.COMMA, ',', startLine, startCol)); break;
        case '.': this.tokens.push(new Token(TokenType.DOT, '.', startLine, startCol)); break;
        case ':': this.tokens.push(new Token(TokenType.COLON, ':', startLine, startCol)); break;
        default:
          throw new Error(`Unexpected character '${ch}' at line ${startLine}, column ${startCol}`);
      }
    }

    this.tokens.push(new Token(TokenType.EOF, null, this.line, this.column));
    return this.tokens;
  }
}

export function tokenize(source) {
  const lexer = new Lexer(source);
  return lexer.tokenize();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd specscript && node test/test.js`
Expected: All lexer tests PASS

- [ ] **Step 5: Commit**

```bash
git add specscript/src/lexer.js specscript/test/test.js
git commit -m "feat: add code lexer for test/impl blocks"
```

---

### Task 6: Code Parser

**Files:**
- Create: `specscript/src/parser.js`
- Modify: `specscript/test/test.js`

The parser takes tokens and produces an AST. It handles: `dec` declarations, `fn` declarations, `return`, `if/else/elif`, `for/in`, `while`, `try/catch`, `throw`, `test` blocks, `expect` expressions, binary/unary expressions, function calls, member access, arrow functions, object/array literals, destructuring, pipe/flow operators, and enum declarations.

- [ ] **Step 1: Write failing tests**

Add to `specscript/test/test.js`:

```javascript
import { parse, NodeType } from '../src/parser.js';
import { tokenize as tok } from '../src/lexer.js';

console.log('--- Parser Tests ---');

test('parses dec declaration', () => {
  const ast = parse(tok('dec x = 42'));
  assertEqual(ast.body[0].type, NodeType.DecDeclaration);
  assertEqual(ast.body[0].name, 'x');
  assertEqual(ast.body[0].init.value, 42);
});

test('parses fn declaration', () => {
  const ast = parse(tok('fn add(a, b) { return a + b }'));
  assertEqual(ast.body[0].type, NodeType.FunctionDeclaration);
  assertEqual(ast.body[0].name, 'add');
  assertEqual(ast.body[0].params.length, 2);
});

test('parses if/else', () => {
  const ast = parse(tok('if x > 0 { return 1 } else { return 0 }'));
  assertEqual(ast.body[0].type, NodeType.IfStatement);
  assertEqual(ast.body[0].alternate.type, NodeType.BlockStatement);
});

test('parses for/in loop', () => {
  const ast = parse(tok('for item in items { print(item) }'));
  assertEqual(ast.body[0].type, NodeType.ForInStatement);
  assertEqual(ast.body[0].variable, 'item');
});

test('parses test block', () => {
  const ast = parse(tok('test "it works" { expect(1).toBe(1) }'));
  assertEqual(ast.body[0].type, NodeType.TestBlock);
  assertEqual(ast.body[0].name, 'it works');
});

test('parses expect expression', () => {
  const ast = parse(tok('expect(x).toBe(5)'));
  const expr = ast.body[0].expression;
  assertEqual(expr.type, NodeType.CallExpression);
  assertEqual(expr.callee.property, 'toBe');
});

test('parses arrow function', () => {
  const ast = parse(tok('dec f = x => x * 2'));
  assertEqual(ast.body[0].init.type, NodeType.ArrowFunctionExpression);
});

test('parses pipe operator', () => {
  const ast = parse(tok('dec result = items ~> filter(x => x > 0)'));
  assertEqual(ast.body[0].init.type, NodeType.PipeExpression);
});

test('parses object literal', () => {
  const ast = parse(tok('dec obj = { name: "alice", age: 30 }'));
  assertEqual(ast.body[0].init.type, NodeType.ObjectExpression);
  assertEqual(ast.body[0].init.properties.length, 2);
});

test('parses array literal', () => {
  const ast = parse(tok('dec arr = [1, 2, 3]'));
  assertEqual(ast.body[0].init.type, NodeType.ArrayExpression);
  assertEqual(ast.body[0].init.elements.length, 3);
});

test('parses member access', () => {
  const ast = parse(tok('dec x = obj.name'));
  assertEqual(ast.body[0].init.type, NodeType.MemberExpression);
  assertEqual(ast.body[0].init.property, 'name');
});

test('parses function call', () => {
  const ast = parse(tok('doSomething(1, "two", three)'));
  const expr = ast.body[0].expression;
  assertEqual(expr.type, NodeType.CallExpression);
  assertEqual(expr.arguments.length, 3);
});

test('parses enum declaration', () => {
  const ast = parse(tok('enum Color { Red, Green, Blue }'));
  assertEqual(ast.body[0].type, NodeType.EnumDeclaration);
  assertEqual(ast.body[0].name, 'Color');
  assertEqual(ast.body[0].variants.length, 3);
});

test('parses try/catch', () => {
  const ast = parse(tok('try { risky() } catch e { handle(e) }'));
  assertEqual(ast.body[0].type, NodeType.TryStatement);
  assertEqual(ast.body[0].param, 'e');
});

test('parses object destructuring', () => {
  const ast = parse(tok('dec { name, age } = person'));
  assertEqual(ast.body[0].type, NodeType.DecDeclaration);
  assertEqual(ast.body[0].pattern.type, NodeType.ObjectPattern);
});

test('parses array destructuring', () => {
  const ast = parse(tok('dec [a, b] = pair'));
  assertEqual(ast.body[0].type, NodeType.DecDeclaration);
  assertEqual(ast.body[0].pattern.type, NodeType.ArrayPattern);
});

test('parses named constructor (enum variant with fields)', () => {
  const ast = parse(tok('dec x = Confirmed { orderId: 123 }'));
  assertEqual(ast.body[0].init.type, NodeType.NamedConstructor);
  assertEqual(ast.body[0].init.name, 'Confirmed');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd specscript && node test/test.js`
Expected: FAIL — imports not found

- [ ] **Step 3: Implement parser**

Create `specscript/src/parser.js`:

```javascript
// Parser — recursive descent parser for SpecScript code

import { TokenType } from './lexer.js';

export const NodeType = {
  Program: 'Program',
  DecDeclaration: 'DecDeclaration',
  FunctionDeclaration: 'FunctionDeclaration',
  ReturnStatement: 'ReturnStatement',
  IfStatement: 'IfStatement',
  ForInStatement: 'ForInStatement',
  WhileStatement: 'WhileStatement',
  BreakStatement: 'BreakStatement',
  ContinueStatement: 'ContinueStatement',
  TryStatement: 'TryStatement',
  ThrowStatement: 'ThrowStatement',
  BlockStatement: 'BlockStatement',
  ExpressionStatement: 'ExpressionStatement',
  TestBlock: 'TestBlock',
  EnumDeclaration: 'EnumDeclaration',

  // Expressions
  Identifier: 'Identifier',
  Literal: 'Literal',
  BinaryExpression: 'BinaryExpression',
  UnaryExpression: 'UnaryExpression',
  CallExpression: 'CallExpression',
  MemberExpression: 'MemberExpression',
  ArrowFunctionExpression: 'ArrowFunctionExpression',
  ObjectExpression: 'ObjectExpression',
  ArrayExpression: 'ArrayExpression',
  PipeExpression: 'PipeExpression',
  FlowExpression: 'FlowExpression',
  SpreadElement: 'SpreadElement',
  RangeExpression: 'RangeExpression',
  NamedConstructor: 'NamedConstructor',

  // Patterns
  ObjectPattern: 'ObjectPattern',
  ArrayPattern: 'ArrayPattern',
  Property: 'Property',
};

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos];
  }

  advance() {
    const token = this.tokens[this.pos];
    this.pos++;
    return token;
  }

  expect(type) {
    const token = this.peek();
    if (token.type !== type) {
      throw new Error(
        `Expected ${type}, got ${token.type} ("${token.value}") at line ${token.line}`
      );
    }
    return this.advance();
  }

  match(type) {
    if (this.peek().type === type) {
      return this.advance();
    }
    return null;
  }

  parse() {
    const body = [];
    while (this.peek().type !== TokenType.EOF) {
      body.push(this.parseStatement());
    }
    return { type: NodeType.Program, body };
  }

  parseStatement() {
    const token = this.peek();

    switch (token.type) {
      case TokenType.DEC: return this.parseDecDeclaration();
      case TokenType.FN: return this.parseFunctionDeclaration();
      case TokenType.RETURN: return this.parseReturnStatement();
      case TokenType.IF: return this.parseIfStatement();
      case TokenType.FOR: return this.parseForStatement();
      case TokenType.WHILE: return this.parseWhileStatement();
      case TokenType.BREAK: this.advance(); return { type: NodeType.BreakStatement };
      case TokenType.CONTINUE: this.advance(); return { type: NodeType.ContinueStatement };
      case TokenType.TRY: return this.parseTryStatement();
      case TokenType.THROW: return this.parseThrowStatement();
      case TokenType.TEST: return this.parseTestBlock();
      case TokenType.ENUM: return this.parseEnumDeclaration();
      case TokenType.ASYNC: return this.parseAsyncFunctionDeclaration();
      default:
        return this.parseExpressionStatement();
    }
  }

  parseDecDeclaration() {
    this.expect(TokenType.DEC);

    // Object destructuring: dec { a, b } = expr
    if (this.peek().type === TokenType.LBRACE) {
      const pattern = this.parseObjectPattern();
      this.expect(TokenType.ASSIGN);
      const init = this.parseExpression();
      return { type: NodeType.DecDeclaration, pattern, init, name: null };
    }

    // Array destructuring: dec [a, b] = expr
    if (this.peek().type === TokenType.LBRACKET) {
      const pattern = this.parseArrayPattern();
      this.expect(TokenType.ASSIGN);
      const init = this.parseExpression();
      return { type: NodeType.DecDeclaration, pattern, init, name: null };
    }

    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.ASSIGN);
    const init = this.parseExpression();
    return { type: NodeType.DecDeclaration, name, init, pattern: null };
  }

  parseObjectPattern() {
    this.expect(TokenType.LBRACE);
    const properties = [];
    while (this.peek().type !== TokenType.RBRACE) {
      if (properties.length > 0) this.expect(TokenType.COMMA);
      const name = this.expect(TokenType.IDENTIFIER).value;
      properties.push(name);
    }
    this.expect(TokenType.RBRACE);
    return { type: NodeType.ObjectPattern, properties };
  }

  parseArrayPattern() {
    this.expect(TokenType.LBRACKET);
    const elements = [];
    while (this.peek().type !== TokenType.RBRACKET) {
      if (elements.length > 0) this.expect(TokenType.COMMA);
      elements.push(this.expect(TokenType.IDENTIFIER).value);
    }
    this.expect(TokenType.RBRACKET);
    return { type: NodeType.ArrayPattern, elements };
  }

  parseFunctionDeclaration() {
    this.expect(TokenType.FN);
    const name = this.expect(TokenType.IDENTIFIER).value;
    const params = this.parseParams();
    const body = this.parseBlock();
    return { type: NodeType.FunctionDeclaration, name, params, body, async: false };
  }

  parseAsyncFunctionDeclaration() {
    this.expect(TokenType.ASYNC);
    this.expect(TokenType.FN);
    const name = this.expect(TokenType.IDENTIFIER).value;
    const params = this.parseParams();
    const body = this.parseBlock();
    return { type: NodeType.FunctionDeclaration, name, params, body, async: true };
  }

  parseParams() {
    this.expect(TokenType.LPAREN);
    const params = [];
    while (this.peek().type !== TokenType.RPAREN) {
      if (params.length > 0) this.expect(TokenType.COMMA);
      if (this.peek().type === TokenType.SPREAD) {
        this.advance();
        params.push({ name: this.expect(TokenType.IDENTIFIER).value, rest: true });
      } else {
        const name = this.expect(TokenType.IDENTIFIER).value;
        let defaultValue = null;
        if (this.match(TokenType.ASSIGN)) {
          defaultValue = this.parseExpression();
        }
        params.push({ name, defaultValue });
      }
    }
    this.expect(TokenType.RPAREN);
    return params;
  }

  parseBlock() {
    this.expect(TokenType.LBRACE);
    const body = [];
    while (this.peek().type !== TokenType.RBRACE) {
      body.push(this.parseStatement());
    }
    this.expect(TokenType.RBRACE);
    return { type: NodeType.BlockStatement, body };
  }

  parseReturnStatement() {
    this.expect(TokenType.RETURN);
    let argument = null;
    if (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      argument = this.parseExpression();
    }
    return { type: NodeType.ReturnStatement, argument };
  }

  parseIfStatement() {
    this.expect(TokenType.IF);
    const test = this.parseExpression();
    const consequent = this.parseBlock();
    let alternate = null;
    if (this.match(TokenType.ELIF)) {
      this.pos--;
      this.tokens[this.pos] = { ...this.tokens[this.pos], type: TokenType.IF };
      alternate = this.parseIfStatement();
    } else if (this.match(TokenType.ELSE)) {
      if (this.peek().type === TokenType.IF) {
        alternate = this.parseIfStatement();
      } else {
        alternate = this.parseBlock();
      }
    }
    return { type: NodeType.IfStatement, test, consequent, alternate };
  }

  parseForStatement() {
    this.expect(TokenType.FOR);
    const variable = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.IN);
    const iterable = this.parseExpression();
    const body = this.parseBlock();
    return { type: NodeType.ForInStatement, variable, iterable, body };
  }

  parseWhileStatement() {
    this.expect(TokenType.WHILE);
    const test = this.parseExpression();
    const body = this.parseBlock();
    return { type: NodeType.WhileStatement, test, body };
  }

  parseTryStatement() {
    this.expect(TokenType.TRY);
    const block = this.parseBlock();
    this.expect(TokenType.CATCH);
    const param = this.expect(TokenType.IDENTIFIER).value;
    const handler = this.parseBlock();
    let finalizer = null;
    if (this.match(TokenType.FINALLY)) {
      finalizer = this.parseBlock();
    }
    return { type: NodeType.TryStatement, block, param, handler, finalizer };
  }

  parseThrowStatement() {
    this.expect(TokenType.THROW);
    const argument = this.parseExpression();
    return { type: NodeType.ThrowStatement, argument };
  }

  parseTestBlock() {
    this.expect(TokenType.TEST);
    const name = this.expect(TokenType.STRING).value;
    const body = this.parseBlock();
    return { type: NodeType.TestBlock, name, body };
  }

  parseEnumDeclaration() {
    this.expect(TokenType.ENUM);
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.LBRACE);
    const variants = [];
    while (this.peek().type !== TokenType.RBRACE) {
      if (variants.length > 0) this.expect(TokenType.COMMA);
      variants.push(this.expect(TokenType.IDENTIFIER).value);
    }
    this.expect(TokenType.RBRACE);
    return { type: NodeType.EnumDeclaration, name, variants };
  }

  parseExpressionStatement() {
    const expression = this.parseExpression();
    return { type: NodeType.ExpressionStatement, expression };
  }

  parseExpression() {
    return this.parsePipe();
  }

  parsePipe() {
    let left = this.parseFlow();
    while (this.peek().type === TokenType.PIPE) {
      this.advance();
      const right = this.parseFlow();
      left = { type: NodeType.PipeExpression, left, right };
    }
    return left;
  }

  parseFlow() {
    let left = this.parseOr();
    while (this.peek().type === TokenType.FLOW) {
      this.advance();
      const right = this.parseOr();
      left = { type: NodeType.FlowExpression, left, right };
    }
    return left;
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.peek().type === TokenType.OR) {
      this.advance();
      const right = this.parseAnd();
      left = { type: NodeType.BinaryExpression, operator: 'or', left, right };
    }
    return left;
  }

  parseAnd() {
    let left = this.parseEquality();
    while (this.peek().type === TokenType.AND) {
      this.advance();
      const right = this.parseEquality();
      left = { type: NodeType.BinaryExpression, operator: 'and', left, right };
    }
    return left;
  }

  parseEquality() {
    let left = this.parseComparison();
    while (this.peek().type === TokenType.EQ || this.peek().type === TokenType.NEQ) {
      const op = this.advance().value;
      const right = this.parseComparison();
      left = { type: NodeType.BinaryExpression, operator: op, left, right };
    }
    return left;
  }

  parseComparison() {
    let left = this.parseRange();
    while (
      this.peek().type === TokenType.LT || this.peek().type === TokenType.GT ||
      this.peek().type === TokenType.LTE || this.peek().type === TokenType.GTE
    ) {
      const op = this.advance().value;
      const right = this.parseRange();
      left = { type: NodeType.BinaryExpression, operator: op, left, right };
    }
    return left;
  }

  parseRange() {
    let left = this.parseAddition();
    if (this.peek().type === TokenType.RANGE) {
      this.advance();
      const right = this.parseAddition();
      return { type: NodeType.RangeExpression, start: left, end: right };
    }
    return left;
  }

  parseAddition() {
    let left = this.parseMultiplication();
    while (this.peek().type === TokenType.PLUS || this.peek().type === TokenType.MINUS) {
      const op = this.advance().value;
      const right = this.parseMultiplication();
      left = { type: NodeType.BinaryExpression, operator: op, left, right };
    }
    return left;
  }

  parseMultiplication() {
    let left = this.parseUnary();
    while (
      this.peek().type === TokenType.STAR || this.peek().type === TokenType.SLASH ||
      this.peek().type === TokenType.PERCENT
    ) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = { type: NodeType.BinaryExpression, operator: op, left, right };
    }
    return left;
  }

  parseUnary() {
    if (this.peek().type === TokenType.NOT) {
      this.advance();
      const argument = this.parseUnary();
      return { type: NodeType.UnaryExpression, operator: 'not', argument };
    }
    if (this.peek().type === TokenType.MINUS) {
      this.advance();
      const argument = this.parseUnary();
      return { type: NodeType.UnaryExpression, operator: '-', argument };
    }
    return this.parseCallMember();
  }

  parseCallMember() {
    let expr = this.parsePrimary();

    while (true) {
      if (this.peek().type === TokenType.LPAREN) {
        expr = this.parseCallExpression(expr);
      } else if (this.peek().type === TokenType.DOT) {
        this.advance();
        const property = this.expect(TokenType.IDENTIFIER).value;
        expr = { type: NodeType.MemberExpression, object: expr, property };
      } else if (this.peek().type === TokenType.LBRACKET) {
        this.advance();
        const index = this.parseExpression();
        this.expect(TokenType.RBRACKET);
        expr = { type: NodeType.MemberExpression, object: expr, property: index, computed: true };
      } else {
        break;
      }
    }

    return expr;
  }

  parseCallExpression(callee) {
    this.expect(TokenType.LPAREN);
    const args = [];
    while (this.peek().type !== TokenType.RPAREN) {
      if (args.length > 0) this.expect(TokenType.COMMA);
      if (this.peek().type === TokenType.SPREAD) {
        this.advance();
        args.push({ type: NodeType.SpreadElement, argument: this.parseExpression() });
      } else {
        args.push(this.parseExpression());
      }
    }
    this.expect(TokenType.RPAREN);
    return { type: NodeType.CallExpression, callee, arguments: args };
  }

  parsePrimary() {
    const token = this.peek();

    switch (token.type) {
      case TokenType.NUMBER:
        this.advance();
        return { type: NodeType.Literal, value: Number(token.value) };

      case TokenType.STRING:
        this.advance();
        return { type: NodeType.Literal, value: token.value };

      case TokenType.BOOLEAN:
        this.advance();
        return { type: NodeType.Literal, value: token.value === 'true' };

      case TokenType.NULL:
        this.advance();
        return { type: NodeType.Literal, value: null };

      case TokenType.IDENTIFIER: {
        this.advance();
        // Check for arrow function: x => expr
        if (this.peek().type === TokenType.FAT_ARROW) {
          this.advance();
          const body = this.peek().type === TokenType.LBRACE
            ? this.parseBlock()
            : this.parseExpression();
          return {
            type: NodeType.ArrowFunctionExpression,
            params: [{ name: token.value }],
            body,
          };
        }
        // Check for named constructor: Name { field: value }
        if (token.value[0] >= 'A' && token.value[0] <= 'Z' && this.peek().type === TokenType.LBRACE) {
          const fields = this.parseObjectBody();
          return { type: NodeType.NamedConstructor, name: token.value, fields };
        }
        return { type: NodeType.Identifier, name: token.value };
      }

      case TokenType.EXPECT: {
        this.advance();
        return { type: NodeType.Identifier, name: 'expect' };
      }

      case TokenType.LPAREN: {
        this.advance();
        // Empty parens arrow: () => expr
        if (this.peek().type === TokenType.RPAREN) {
          this.advance();
          if (this.peek().type === TokenType.FAT_ARROW) {
            this.advance();
            const body = this.peek().type === TokenType.LBRACE
              ? this.parseBlock()
              : this.parseExpression();
            return { type: NodeType.ArrowFunctionExpression, params: [], body };
          }
        }
        // Check if this is a multi-param arrow function
        const saved = this.pos;
        try {
          const params = this.tryParseArrowParams();
          if (params && this.peek().type === TokenType.FAT_ARROW) {
            this.advance();
            const body = this.peek().type === TokenType.LBRACE
              ? this.parseBlock()
              : this.parseExpression();
            return { type: NodeType.ArrowFunctionExpression, params, body };
          }
        } catch {
          // Not an arrow function
        }
        this.pos = saved;

        // Regular parenthesized expression
        const expr = this.parseExpression();
        this.expect(TokenType.RPAREN);
        return expr;
      }

      case TokenType.LBRACE:
        return { type: NodeType.ObjectExpression, properties: this.parseObjectBody() };

      case TokenType.LBRACKET:
        return this.parseArrayExpression();

      case TokenType.AWAIT: {
        this.advance();
        const argument = this.parseExpression();
        return { type: 'AwaitExpression', argument };
      }

      default:
        throw new Error(
          `Unexpected token ${token.type} ("${token.value}") at line ${token.line}`
        );
    }
  }

  tryParseArrowParams() {
    const params = [];
    while (this.peek().type !== TokenType.RPAREN) {
      if (params.length > 0) this.expect(TokenType.COMMA);
      const name = this.expect(TokenType.IDENTIFIER).value;
      params.push({ name });
    }
    this.expect(TokenType.RPAREN);
    return params;
  }

  parseObjectBody() {
    this.expect(TokenType.LBRACE);
    const properties = [];
    while (this.peek().type !== TokenType.RBRACE) {
      if (properties.length > 0) this.expect(TokenType.COMMA);
      const key = this.expect(TokenType.IDENTIFIER).value;
      if (this.match(TokenType.COLON)) {
        const value = this.parseExpression();
        properties.push({ type: NodeType.Property, key, value });
      } else {
        properties.push({
          type: NodeType.Property,
          key,
          value: { type: NodeType.Identifier, name: key },
          shorthand: true,
        });
      }
    }
    this.expect(TokenType.RBRACE);
    return properties;
  }

  parseArrayExpression() {
    this.expect(TokenType.LBRACKET);
    const elements = [];
    while (this.peek().type !== TokenType.RBRACKET) {
      if (elements.length > 0) this.expect(TokenType.COMMA);
      if (this.peek().type === TokenType.SPREAD) {
        this.advance();
        elements.push({ type: NodeType.SpreadElement, argument: this.parseExpression() });
      } else {
        elements.push(this.parseExpression());
      }
    }
    this.expect(TokenType.RBRACKET);
    return { type: NodeType.ArrayExpression, elements };
  }
}

export function parse(tokens) {
  const parser = new Parser(tokens);
  return parser.parse();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd specscript && node test/test.js`
Expected: All parser tests PASS

- [ ] **Step 5: Commit**

```bash
git add specscript/src/parser.js specscript/test/test.js
git commit -m "feat: add code parser for test/impl blocks"
```

---

### Task 7: Code Generator

**Files:**
- Create: `specscript/src/generator.js`
- Modify: `specscript/test/test.js`

The generator walks the AST and emits JavaScript. It follows KimchiLang's patterns: `dec` → `const _deepFreeze(...)`, member access → optional chaining, `==` → `===`, pipe → async helper, plus runtime helpers for deep freeze and testing.

- [ ] **Step 1: Write failing tests**

Add to `specscript/test/test.js`:

```javascript
import { generate } from '../src/generator.js';

console.log('--- Generator Tests ---');

function gen(code) {
  return generate(parse(tok(code)));
}

test('generates dec with deep freeze', () => {
  const js = gen('dec x = 42');
  assertContains(js, 'const x = _deepFreeze(42)');
});

test('generates fn declaration', () => {
  const js = gen('fn add(a, b) { return a + b }');
  assertContains(js, 'function add(a, b)');
  assertContains(js, 'return a + b');
});

test('generates strict equality for ==', () => {
  const js = gen('dec x = a == b');
  assertContains(js, '===');
});

test('generates strict inequality for !=', () => {
  const js = gen('dec x = a != b');
  assertContains(js, '!==');
});

test('generates optional chaining for member access', () => {
  const js = gen('dec x = obj.name');
  assertContains(js, 'obj?.name');
});

test('generates logical operators', () => {
  const js = gen('dec x = a and b or not c');
  assertContains(js, '&&');
  assertContains(js, '||');
  assertContains(js, '!');
});

test('generates if/else', () => {
  const js = gen('if x > 0 { return 1 } else { return 0 }');
  assertContains(js, 'if (');
  assertContains(js, '} else {');
});

test('generates for/in loop', () => {
  const js = gen('for item in items { print(item) }');
  assertContains(js, 'for (const item of');
});

test('generates arrow function', () => {
  const js = gen('dec f = x => x * 2');
  assertContains(js, '(x) => ');
});

test('generates object literal', () => {
  const js = gen('dec obj = { name: "alice" }');
  assertContains(js, '"name": "alice"');
});

test('generates array literal', () => {
  const js = gen('dec arr = [1, 2, 3]');
  assertContains(js, '[1, 2, 3]');
});

test('generates test block', () => {
  const js = gen('test "it works" { expect(1).toBe(1) }');
  assertContains(js, '_test("it works"');
});

test('generates enum as frozen object', () => {
  const js = gen('enum Color { Red, Green, Blue }');
  assertContains(js, 'const Color = Object.freeze');
});

test('generates try/catch', () => {
  const js = gen('try { risky() } catch e { handle(e) }');
  assertContains(js, 'try {');
  assertContains(js, 'catch (e)');
});

test('generates pipe operator', () => {
  const js = gen('dec result = items ~> filter(x => x > 0)');
  assertContains(js, '_pipe(');
});

test('generates runtime helpers at top', () => {
  const js = gen('dec x = 1');
  assertContains(js, 'function _deepFreeze');
  assertContains(js, 'function _test');
  assertContains(js, 'function _expect');
});

test('generates named constructor', () => {
  const js = gen('dec x = Confirmed { orderId: 123 }');
  assertContains(js, '_deepFreeze({');
  assertContains(js, '"_type": "Confirmed"');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd specscript && node test/test.js`
Expected: FAIL — `generate` not found

- [ ] **Step 3: Implement generator**

Create `specscript/src/generator.js`:

```javascript
// Generator — emits JavaScript from SpecScript AST

import { NodeType } from './parser.js';

const RUNTIME_HELPERS = `
function _deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null && !Object.isFrozen(obj[key])) {
      _deepFreeze(obj[key]);
    }
  }
  return obj;
}

async function _pipe(value, ...fns) {
  let result = value;
  for (const fn of fns) {
    result = await fn(result);
  }
  return result;
}

function _flow(...fns) {
  return async (value) => {
    let result = value;
    for (const fn of fns) {
      result = await fn(result);
    }
    return result;
  };
}

const _tests = [];
function _test(name, fn) {
  _tests.push({ name, fn });
}

function _expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(\`Expected \${JSON.stringify(expected)}, got \${JSON.stringify(actual)}\`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(\`Expected \${JSON.stringify(expected)}, got \${JSON.stringify(actual)}\`);
      }
    },
    toContain(item) {
      if (Array.isArray(actual) ? !actual.includes(item) : !actual?.includes?.(item)) {
        throw new Error(\`Expected \${JSON.stringify(actual)} to contain \${JSON.stringify(item)}\`);
      }
    },
    toBeTruthy() {
      if (!actual) throw new Error(\`Expected truthy, got \${JSON.stringify(actual)}\`);
    },
    toBeFalsy() {
      if (actual) throw new Error(\`Expected falsy, got \${JSON.stringify(actual)}\`);
    },
    toBeNull() {
      if (actual !== null) throw new Error(\`Expected null, got \${JSON.stringify(actual)}\`);
    },
    toHaveLength(len) {
      if (actual?.length !== len) {
        throw new Error(\`Expected length \${len}, got \${actual?.length}\`);
      }
    },
    toBeGreaterThan(n) {
      if (!(actual > n)) throw new Error(\`Expected \${actual} > \${n}\`);
    },
    toBeLessThan(n) {
      if (!(actual < n)) throw new Error(\`Expected \${actual} < \${n}\`);
    },
    toThrow(msg) {
      try { actual(); throw new Error('Expected function to throw'); }
      catch (e) {
        if (e.message === 'Expected function to throw') throw e;
        if (msg && !e.message.includes(msg)) {
          throw new Error(\`Expected throw containing "\${msg}", got "\${e.message}"\`);
        }
      }
    },
  };
}

async function _runTests() {
  let passed = 0, failed = 0;
  for (const t of _tests) {
    try {
      await t.fn();
      console.log(\`  \\u2713 \${t.name}\`);
      passed++;
    } catch (e) {
      console.log(\`  \\u2717 \${t.name}\`);
      console.log(\`    \${e.message}\`);
      failed++;
    }
  }
  console.log(\`\\n  \${passed} passed, \${failed} failed\`);
  if (failed > 0) process.exit(1);
}
`.trim();

class CodeGenerator {
  constructor() {
    this.indent = 0;
    this.output = '';
  }

  emit(code) {
    this.output += code;
  }

  emitLine(code) {
    this.output += '  '.repeat(this.indent) + code + '\n';
  }

  pushIndent() { this.indent++; }
  popIndent() { this.indent--; }

  generate(ast) {
    this.output = RUNTIME_HELPERS + '\n\n';
    let hasTests = false;

    for (const node of ast.body) {
      if (node.type === NodeType.TestBlock) hasTests = true;
      this.generateNode(node);
    }

    if (hasTests) {
      this.emitLine('');
      this.emitLine('_runTests();');
    }

    return this.output;
  }

  generateNode(node) {
    switch (node.type) {
      case NodeType.DecDeclaration: return this.generateDec(node);
      case NodeType.FunctionDeclaration: return this.generateFunction(node);
      case NodeType.ReturnStatement: return this.generateReturn(node);
      case NodeType.IfStatement: return this.generateIf(node);
      case NodeType.ForInStatement: return this.generateForIn(node);
      case NodeType.WhileStatement: return this.generateWhile(node);
      case NodeType.BreakStatement: return this.emitLine('break;');
      case NodeType.ContinueStatement: return this.emitLine('continue;');
      case NodeType.TryStatement: return this.generateTry(node);
      case NodeType.ThrowStatement: return this.generateThrow(node);
      case NodeType.TestBlock: return this.generateTest(node);
      case NodeType.EnumDeclaration: return this.generateEnum(node);
      case NodeType.ExpressionStatement:
        this.emitLine(this.expr(node.expression) + ';');
        return;
      case NodeType.BlockStatement:
        for (const stmt of node.body) this.generateNode(stmt);
        return;
      default:
        this.emitLine(this.expr(node) + ';');
    }
  }

  generateDec(node) {
    if (node.pattern) {
      if (node.pattern.type === NodeType.ObjectPattern) {
        const props = node.pattern.properties.join(', ');
        this.emitLine(`const { ${props} } = _deepFreeze(${this.expr(node.init)});`);
      } else if (node.pattern.type === NodeType.ArrayPattern) {
        const elems = node.pattern.elements.join(', ');
        this.emitLine(`const [${elems}] = _deepFreeze(${this.expr(node.init)});`);
      }
    } else {
      this.emitLine(`const ${node.name} = _deepFreeze(${this.expr(node.init)});`);
    }
  }

  generateFunction(node) {
    const params = node.params.map(p => {
      if (p.rest) return `...${p.name}`;
      if (p.defaultValue) return `${p.name} = ${this.expr(p.defaultValue)}`;
      return p.name;
    }).join(', ');
    const prefix = node.async ? 'async ' : '';
    this.emitLine(`${prefix}function ${node.name}(${params}) {`);
    this.pushIndent();
    for (const stmt of node.body.body) this.generateNode(stmt);
    this.popIndent();
    this.emitLine('}');
  }

  generateReturn(node) {
    if (node.argument) {
      this.emitLine(`return ${this.expr(node.argument)};`);
    } else {
      this.emitLine('return;');
    }
  }

  generateIf(node) {
    this.emitLine(`if (${this.expr(node.test)}) {`);
    this.pushIndent();
    for (const stmt of node.consequent.body) this.generateNode(stmt);
    this.popIndent();
    if (node.alternate) {
      if (node.alternate.type === NodeType.IfStatement) {
        this.emit('  '.repeat(this.indent) + '} else ');
        this.generateIf(node.alternate);
        return;
      }
      this.emitLine('} else {');
      this.pushIndent();
      for (const stmt of node.alternate.body) this.generateNode(stmt);
      this.popIndent();
    }
    this.emitLine('}');
  }

  generateForIn(node) {
    this.emitLine(`for (const ${node.variable} of ${this.expr(node.iterable)}) {`);
    this.pushIndent();
    for (const stmt of node.body.body) this.generateNode(stmt);
    this.popIndent();
    this.emitLine('}');
  }

  generateWhile(node) {
    this.emitLine(`while (${this.expr(node.test)}) {`);
    this.pushIndent();
    for (const stmt of node.body.body) this.generateNode(stmt);
    this.popIndent();
    this.emitLine('}');
  }

  generateTry(node) {
    this.emitLine('try {');
    this.pushIndent();
    for (const stmt of node.block.body) this.generateNode(stmt);
    this.popIndent();
    this.emitLine(`} catch (${node.param}) {`);
    this.pushIndent();
    for (const stmt of node.handler.body) this.generateNode(stmt);
    this.popIndent();
    if (node.finalizer) {
      this.emitLine('} finally {');
      this.pushIndent();
      for (const stmt of node.finalizer.body) this.generateNode(stmt);
      this.popIndent();
    }
    this.emitLine('}');
  }

  generateThrow(node) {
    this.emitLine(`throw ${this.expr(node.argument)};`);
  }

  generateTest(node) {
    this.emitLine(`_test(${JSON.stringify(node.name)}, async () => {`);
    this.pushIndent();
    for (const stmt of node.body.body) this.generateNode(stmt);
    this.popIndent();
    this.emitLine('});');
  }

  generateEnum(node) {
    const entries = node.variants.map(v => `"${v}": "${v}"`).join(', ');
    this.emitLine(`const ${node.name} = Object.freeze({ ${entries} });`);
  }

  expr(node) {
    switch (node.type) {
      case NodeType.Literal:
        return JSON.stringify(node.value);

      case NodeType.Identifier:
        return node.name;

      case NodeType.BinaryExpression:
        return this.exprBinary(node);

      case NodeType.UnaryExpression:
        if (node.operator === 'not') return `!${this.expr(node.argument)}`;
        return `${node.operator}${this.expr(node.argument)}`;

      case NodeType.CallExpression:
        return `${this.expr(node.callee)}(${node.arguments.map(a => this.expr(a)).join(', ')})`;

      case NodeType.MemberExpression:
        if (node.computed) return `${this.expr(node.object)}?.[${this.expr(node.property)}]`;
        return `${this.expr(node.object)}?.${node.property}`;

      case NodeType.ArrowFunctionExpression: {
        const params = node.params.map(p => p.name).join(', ');
        if (node.body.type === NodeType.BlockStatement) {
          const gen = new CodeGenerator();
          gen.indent = this.indent;
          for (const stmt of node.body.body) gen.generateNode(stmt);
          return `(${params}) => {\n${gen.output}${'  '.repeat(this.indent)}}`;
        }
        return `(${params}) => ${this.expr(node.body)}`;
      }

      case NodeType.ObjectExpression: {
        if (node.properties.length === 0) return '{}';
        const props = node.properties.map(p => {
          if (p.shorthand) return p.key;
          return `${JSON.stringify(p.key)}: ${this.expr(p.value)}`;
        }).join(', ');
        return `{ ${props} }`;
      }

      case NodeType.ArrayExpression:
        return `[${node.elements.map(e => this.expr(e)).join(', ')}]`;

      case NodeType.PipeExpression:
        return `_pipe(${this.expr(node.left)}, ${this.expr(node.right)})`;

      case NodeType.FlowExpression:
        return `_flow(${this.expr(node.left)}, ${this.expr(node.right)})`;

      case NodeType.SpreadElement:
        return `...${this.expr(node.argument)}`;

      case NodeType.RangeExpression:
        return `Array.from({ length: ${this.expr(node.end)} - ${this.expr(node.start)} }, (_, i) => ${this.expr(node.start)} + i)`;

      case NodeType.NamedConstructor: {
        const fields = node.fields.map(p => {
          if (p.shorthand) return p.key;
          return `${JSON.stringify(p.key)}: ${this.expr(p.value)}`;
        }).join(', ');
        return `_deepFreeze({ "_type": ${JSON.stringify(node.name)}, ${fields} })`;
      }

      case 'AwaitExpression':
        return `await ${this.expr(node.argument)}`;

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  exprBinary(node) {
    const left = this.expr(node.left);
    const right = this.expr(node.right);
    const ops = {
      '==': '===', '!=': '!==',
      'and': '&&', 'or': '||',
      '+': '+', '-': '-', '*': '*', '/': '/', '%': '%',
      '<': '<', '>': '>', '<=': '<=', '>=': '>=',
    };
    const op = ops[node.operator] || node.operator;
    return `${left} ${op} ${right}`;
  }
}

export function generate(ast) {
  const gen = new CodeGenerator();
  return gen.generate(ast);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd specscript && node test/test.js`
Expected: All generator tests PASS

- [ ] **Step 5: Commit**

```bash
git add specscript/src/generator.js specscript/test/test.js
git commit -m "feat: add JavaScript code generator"
```

---

### Task 8: Compiler Orchestrator

**Files:**
- Create: `specscript/src/index.js`
- Modify: `specscript/test/test.js`

The compiler orchestrator chains all stages: split sections → parse spec → validate hashes → tokenize code → parse code → generate JavaScript. It enforces the compilation states from the spec.

- [ ] **Step 1: Write failing tests**

Add to `specscript/test/test.js`:

```javascript
import { SpecScriptCompiler } from '../src/index.js';

console.log('--- Compiler Tests ---');

function makeFile(spec, testSection, implSection) {
  return `## spec\n\n${spec}\n\n## test\n\n${testSection}\n\n## impl\n\n${implSection}`;
}

test('compiles a valid .sp file to JavaScript', () => {
  const compiler = new SpecScriptCompiler();
  const spec = `# Adder\n\n**intent:** Add numbers\n**reason:** Math is useful`;
  const hash = compiler.computeHash(spec);

  const source = makeFile(
    spec,
    `<!-- spec-hash: ${hash} -->\n\ntest "adds" { expect(add(1, 2)).toBe(3) }`,
    `<!-- spec-hash: ${hash} -->\n\nfn add(a, b) { return a + b }`
  );

  const result = compiler.compile(source);
  assertContains(result.js, 'function add(a, b)');
});

test('rejects stale test hash', () => {
  const spec = `# Mod\n\n**intent:** x\n**reason:** y`;
  const source = makeFile(
    spec,
    '<!-- spec-hash: sha256:wronghash -->\n\ntest "x" { expect(1).toBe(1) }',
    '<!-- spec-hash: sha256:wronghash -->\n\nfn x() { return 1 }'
  );

  const compiler = new SpecScriptCompiler();
  assertThrows(() => compiler.compile(source), 'stale');
});

test('rejects missing test hash', () => {
  const spec = `# Mod\n\n**intent:** x\n**reason:** y`;
  const source = makeFile(
    spec,
    'test "x" { expect(1).toBe(1) }',
    '<!-- spec-hash: sha256:abc -->\n\nfn x() { return 1 }'
  );

  const compiler = new SpecScriptCompiler();
  assertThrows(() => compiler.compile(source), 'hash');
});

test('rejects stale impl hash when test is fresh', () => {
  const compiler = new SpecScriptCompiler();
  const spec = `# Mod\n\n**intent:** x\n**reason:** y`;
  const hash = compiler.computeHash(spec);

  const source = makeFile(
    spec,
    `<!-- spec-hash: ${hash} -->\n\ntest "x" { expect(1).toBe(1) }`,
    '<!-- spec-hash: sha256:wronghash -->\n\nfn x() { return 1 }'
  );

  assertThrows(() => compiler.compile(source), 'stale');
});

test('rejects file where test hash is stale but impl hash is fresh (invalid state)', () => {
  const compiler = new SpecScriptCompiler();
  const spec = `# Mod\n\n**intent:** x\n**reason:** y`;
  const hash = compiler.computeHash(spec);

  const source = makeFile(
    spec,
    '<!-- spec-hash: sha256:wronghash -->\n\ntest "x" { expect(1).toBe(1) }',
    `<!-- spec-hash: ${hash} -->\n\nfn x() { return 1 }`
  );

  assertThrows(() => compiler.compile(source), 'test');
});

test('returns parsed spec metadata alongside compiled JS', () => {
  const compiler = new SpecScriptCompiler();
  const spec = `# Calculator\n\n**intent:** Do math\n**reason:** Math needed\n\n### expose add :: (Number, Number) -> Number\n\n**intent:** Add two numbers`;
  const hash = compiler.computeHash(spec);

  const source = makeFile(
    spec,
    `<!-- spec-hash: ${hash} -->\n\ntest "adds" { expect(add(1, 2)).toBe(3) }`,
    `<!-- spec-hash: ${hash} -->\n\nfn add(a, b) { return a + b }`
  );

  const result = compiler.compile(source);
  assertEqual(result.spec.module, 'Calculator');
  assertEqual(result.spec.functions.length, 1);
  assertEqual(result.hash, hash);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd specscript && node test/test.js`
Expected: FAIL — `SpecScriptCompiler` not found

- [ ] **Step 3: Implement compiler orchestrator**

Create `specscript/src/index.js`:

```javascript
// SpecScript Compiler — orchestrates all compilation stages

import { splitSections } from './section-splitter.js';
import { parseSpec } from './spec-parser.js';
import { computeSpecHash, extractHash } from './hasher.js';
import { tokenize } from './lexer.js';
import { parse } from './parser.js';
import { generate } from './generator.js';

export class SpecScriptCompiler {
  constructor(options = {}) {
    this.options = options;
  }

  computeHash(specContent) {
    return computeSpecHash(specContent);
  }

  compile(source) {
    // Stage 1: Split into sections
    const sections = splitSections(source);

    // Stage 2: Parse spec
    const spec = parseSpec(sections.spec);

    // Stage 3: Hash validation
    const specHash = computeSpecHash(sections.spec);
    const testHash = extractHash(sections.test);
    const implHash = extractHash(sections.impl);

    if (!testHash) {
      throw new Error(
        'Compile Error: Missing spec-hash in ## test section. ' +
        'Add <!-- spec-hash: ' + specHash + ' --> to the test section.'
      );
    }

    if (!implHash) {
      throw new Error(
        'Compile Error: Missing spec-hash in ## impl section. ' +
        'Add <!-- spec-hash: ' + specHash + ' --> to the impl section.'
      );
    }

    // Check for invalid state: test stale but impl fresh
    if (testHash !== specHash && implHash === specHash) {
      throw new Error(
        'Compile Error: ## test section hash is stale but ## impl hash is fresh. ' +
        'Tests must be regenerated before impl. This is an invalid state.'
      );
    }

    if (testHash !== specHash) {
      throw new Error(
        'Compile Error: ## test section is stale. Spec has changed. ' +
        `Expected hash ${specHash}, found ${testHash}. ` +
        'Regenerate tests with: sp regen <file> --test'
      );
    }

    if (implHash !== specHash) {
      throw new Error(
        'Compile Error: ## impl section is stale. Spec has changed. ' +
        `Expected hash ${specHash}, found ${implHash}. ` +
        'Regenerate impl with: sp regen <file> --impl'
      );
    }

    // Stage 4: Tokenize test and impl code
    const testTokens = tokenize(sections.test);
    const implTokens = tokenize(sections.impl);

    // Stage 5: Parse into ASTs
    const testAst = parse(testTokens);
    const implAst = parse(implTokens);

    // Stage 6: Generate JavaScript
    // Combine impl and test ASTs — impl first, then tests
    const combinedAst = {
      type: 'Program',
      body: [...implAst.body, ...testAst.body],
    };
    const js = generate(combinedAst);

    return {
      js,
      spec,
      hash: specHash,
      testAst,
      implAst,
    };
  }
}

export function compile(source, options = {}) {
  const compiler = new SpecScriptCompiler(options);
  return compiler.compile(source);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd specscript && node test/test.js`
Expected: All compiler tests PASS

- [ ] **Step 5: Commit**

```bash
git add specscript/src/index.js specscript/test/test.js
git commit -m "feat: add compiler orchestrator with hash validation"
```

---

### Task 9: CLI

**Files:**
- Create: `specscript/src/cli.js`
- Modify: `specscript/test/test.js`

The CLI implements the `sp` command with subcommands: `init`, `check`, `compile`, `stale`, `regen`, `build`, `run`.

- [ ] **Step 1: Write failing tests**

Add to `specscript/test/test.js`:

```javascript
import { parseArgs } from '../src/cli.js';

console.log('--- CLI Tests ---');

test('parseArgs recognizes compile command', () => {
  const args = parseArgs(['compile', 'myfile.sp']);
  assertEqual(args.command, 'compile');
  assertEqual(args.file, 'myfile.sp');
});

test('parseArgs recognizes check command', () => {
  const args = parseArgs(['check', 'myfile.sp']);
  assertEqual(args.command, 'check');
});

test('parseArgs recognizes run command', () => {
  const args = parseArgs(['run', 'myfile.sp']);
  assertEqual(args.command, 'run');
});

test('parseArgs recognizes stale command with directory', () => {
  const args = parseArgs(['stale', './src']);
  assertEqual(args.command, 'stale');
  assertEqual(args.file, './src');
});

test('parseArgs recognizes regen command with flags', () => {
  const args = parseArgs(['regen', 'myfile.sp', '--test']);
  assertEqual(args.command, 'regen');
  assertEqual(args.regenTarget, 'test');
});

test('parseArgs recognizes regen --impl', () => {
  const args = parseArgs(['regen', 'myfile.sp', '--impl']);
  assertEqual(args.regenTarget, 'impl');
});

test('parseArgs recognizes regen --all', () => {
  const args = parseArgs(['regen', 'myfile.sp', '--all']);
  assertEqual(args.regenTarget, 'all');
});

test('parseArgs recognizes init command', () => {
  const args = parseArgs(['init']);
  assertEqual(args.command, 'init');
});

test('parseArgs recognizes build command', () => {
  const args = parseArgs(['build', './src']);
  assertEqual(args.command, 'build');
});

test('parseArgs recognizes -o output flag', () => {
  const args = parseArgs(['compile', 'myfile.sp', '-o', 'dist/out.js']);
  assertEqual(args.output, 'dist/out.js');
});

test('parseArgs recognizes --debug flag', () => {
  const args = parseArgs(['compile', 'myfile.sp', '--debug']);
  assertEqual(args.debug, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd specscript && node test/test.js`
Expected: FAIL — `parseArgs` not found

- [ ] **Step 3: Implement CLI**

Create `specscript/src/cli.js`:

```javascript
#!/usr/bin/env node

// SpecScript CLI — the `sp` command

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname, basename, join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SpecScriptCompiler } from './index.js';
import { splitSections } from './section-splitter.js';
import { parseSpec } from './spec-parser.js';
import { computeSpecHash, extractHash } from './hasher.js';

export function parseArgs(args) {
  const result = {
    command: null,
    file: null,
    output: null,
    debug: false,
    regenTarget: null,
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

function cmdRegen(file, target) {
  const source = readFile(file);
  const sections = splitSections(source);
  const spec = parseSpec(sections.spec);
  const specHash = computeSpecHash(sections.spec);

  const output = {
    file,
    specHash,
    spec,
    specContent: sections.spec,
  };

  if (target === 'test' || target === 'all') {
    output.regenerate = target === 'all' ? 'test and impl' : 'test';
    output.instructions = `Generate a ## test section for this spec. Include the hash comment: <!-- spec-hash: ${specHash} -->`;
  } else if (target === 'impl') {
    output.regenerate = 'impl';
    output.currentTests = sections.test;
    output.instructions = `Generate a ## impl section that passes the existing tests. Include the hash comment: <!-- spec-hash: ${specHash} -->`;
  }

  console.log(JSON.stringify(output, null, 2));
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
  if (existsSync(projectFile)) {
    console.log('project.md already exists.');
    return;
  }

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
        console.error('Usage: sp regen <file> --test|--impl|--all');
        process.exit(1);
      }
      cmdRegen(args.file, args.regenTarget);
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
      console.log('  regen <file> --test|--impl|--all');
      console.log('                          Output regen prompt for LLM');
      console.log('  build <dir>             Compile all .sp files');
      console.log('  run <file>              Compile and execute');
      break;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd specscript && node test/test.js`
Expected: All CLI tests PASS

- [ ] **Step 5: Commit**

```bash
git add specscript/src/cli.js specscript/test/test.js
git commit -m "feat: add sp CLI with all subcommands"
```

---

### Task 10: Cross-Module Dependency Tracking

**Files:**
- Create: `specscript/src/dependency-graph.js`
- Modify: `specscript/test/test.js`

The dependency graph tracks spec hashes across modules and detects when a structural change in one module should flag consumers as stale.

- [ ] **Step 1: Write failing tests**

Add to `specscript/test/test.js`:

```javascript
import { DependencyGraph } from '../src/dependency-graph.js';

console.log('--- Dependency Graph Tests ---');

test('registers modules and their spec hashes', () => {
  const graph = new DependencyGraph();
  graph.register('order.processor', { hash: 'sha256:aaa', depends: ['inventory.stock'] });
  graph.register('inventory.stock', { hash: 'sha256:bbb', depends: [] });

  assertEqual(graph.getHash('order.processor'), 'sha256:aaa');
  assertEqual(graph.getHash('inventory.stock'), 'sha256:bbb');
});

test('detects stale consumers when dependency hash changes', () => {
  const graph = new DependencyGraph();
  graph.register('inventory.stock', { hash: 'sha256:old', depends: [] });
  graph.register('order.processor', {
    hash: 'sha256:aaa',
    depends: ['inventory.stock'],
    depHashes: { 'inventory.stock': 'sha256:old' },
  });

  // Simulate inventory.stock spec change
  graph.register('inventory.stock', { hash: 'sha256:new', depends: [] });

  const stale = graph.findStaleConsumers('inventory.stock');
  assertEqual(stale.length, 1);
  assertEqual(stale[0], 'order.processor');
});

test('does not flag consumers when dependency hash unchanged', () => {
  const graph = new DependencyGraph();
  graph.register('inventory.stock', { hash: 'sha256:same', depends: [] });
  graph.register('order.processor', {
    hash: 'sha256:aaa',
    depends: ['inventory.stock'],
    depHashes: { 'inventory.stock': 'sha256:same' },
  });

  const stale = graph.findStaleConsumers('inventory.stock');
  assertEqual(stale.length, 0);
});

test('tracks transitive dependencies', () => {
  const graph = new DependencyGraph();
  graph.register('storage.db', { hash: 'sha256:111', depends: [] });
  graph.register('inventory.stock', {
    hash: 'sha256:222',
    depends: ['storage.db'],
    depHashes: { 'storage.db': 'sha256:111' },
  });
  graph.register('order.processor', {
    hash: 'sha256:333',
    depends: ['inventory.stock'],
    depHashes: { 'inventory.stock': 'sha256:222' },
  });

  graph.register('storage.db', { hash: 'sha256:444', depends: [] });

  const stale = graph.findStaleConsumers('storage.db');
  assertContains(stale.join(','), 'inventory.stock');
});

test('getAllStale returns all stale module paths', () => {
  const graph = new DependencyGraph();
  graph.register('a', { hash: 'sha256:1', depends: [] });
  graph.register('b', {
    hash: 'sha256:2',
    depends: ['a'],
    depHashes: { 'a': 'sha256:1' },
  });

  graph.register('a', { hash: 'sha256:changed', depends: [] });

  const all = graph.getAllStale();
  assertContains(all.join(','), 'b');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd specscript && node test/test.js`
Expected: FAIL — `DependencyGraph` not found

- [ ] **Step 3: Implement dependency graph**

Create `specscript/src/dependency-graph.js`:

```javascript
// Dependency Graph — tracks cross-module spec hashes for staleness cascade

export class DependencyGraph {
  constructor() {
    this.modules = new Map();
  }

  register(modulePath, info) {
    this.modules.set(modulePath, {
      hash: info.hash,
      depends: info.depends || [],
      depHashes: info.depHashes || {},
    });
  }

  getHash(modulePath) {
    const mod = this.modules.get(modulePath);
    return mod ? mod.hash : null;
  }

  findStaleConsumers(changedModule) {
    const stale = [];
    const currentHash = this.getHash(changedModule);

    for (const [path, info] of this.modules) {
      if (path === changedModule) continue;
      if (!info.depends.includes(changedModule)) continue;

      const recordedHash = info.depHashes[changedModule];
      if (recordedHash && recordedHash !== currentHash) {
        stale.push(path);
      }
    }

    return stale;
  }

  getAllStale() {
    const stale = new Set();

    for (const [path, info] of this.modules) {
      for (const dep of info.depends) {
        const depMod = this.modules.get(dep);
        if (!depMod) continue;
        const recordedHash = info.depHashes[dep];
        if (recordedHash && recordedHash !== depMod.hash) {
          stale.add(path);
        }
      }
    }

    return [...stale];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd specscript && node test/test.js`
Expected: All dependency graph tests PASS

- [ ] **Step 5: Commit**

```bash
git add specscript/src/dependency-graph.js specscript/test/test.js
git commit -m "feat: add cross-module dependency tracking"
```

---

### Task 11: Integration Test — Full End-to-End

**Files:**
- Create: `specscript/examples/calculator.sp`
- Modify: `specscript/test/test.js`

A full end-to-end test that compiles a real `.sp` file through the entire pipeline.

- [ ] **Step 1: Write the example .sp file**

Create `specscript/examples/calculator.sp` (the hash will be stamped in step 4):

```markdown
## spec

# Calculator

**intent:** Provide basic arithmetic operations
**reason:** Foundation for math-dependent modules

### requires

- Support addition of two numbers
- Support subtraction of two numbers
- Support multiplication of two numbers
- Return numeric results for all operations

### types

- Operation :: Add | Subtract | Multiply

### expose add :: (Number, Number) -> Number

**intent:** Add two numbers together

### expose subtract :: (Number, Number) -> Number

**intent:** Subtract second number from first

### expose multiply :: (Number, Number) -> Number

**intent:** Multiply two numbers together

## test

<!-- spec-hash: PLACEHOLDER -->

test "add returns sum" {
  expect(add(2, 3)).toBe(5)
}

test "add handles negatives" {
  expect(add(-1, 1)).toBe(0)
}

test "subtract returns difference" {
  expect(subtract(10, 4)).toBe(6)
}

test "multiply returns product" {
  expect(multiply(3, 4)).toBe(12)
}

test "multiply by zero returns zero" {
  expect(multiply(5, 0)).toBe(0)
}

## impl

<!-- spec-hash: PLACEHOLDER -->

fn add(a, b) {
  return a + b
}

fn subtract(a, b) {
  return a - b
}

fn multiply(a, b) {
  return a * b
}
```

- [ ] **Step 2: Write integration tests**

Add to `specscript/test/test.js`:

```javascript
console.log('--- Integration Tests ---');

test('full pipeline: compile valid source with correct hashes', () => {
  const compiler = new SpecScriptCompiler();

  const spec = `# Calculator

**intent:** Provide basic arithmetic operations
**reason:** Foundation for math-dependent modules

### requires

- Support addition of two numbers
- Support subtraction of two numbers
- Support multiplication of two numbers
- Return numeric results for all operations

### types

- Operation :: Add | Subtract | Multiply

### expose add :: (Number, Number) -> Number

**intent:** Add two numbers together

### expose subtract :: (Number, Number) -> Number

**intent:** Subtract second number from first

### expose multiply :: (Number, Number) -> Number

**intent:** Multiply two numbers together`;

  const hash = compiler.computeHash(spec);

  const source = `## spec

${spec}

## test

<!-- spec-hash: ${hash} -->

test "add returns sum" {
  expect(add(2, 3)).toBe(5)
}

test "subtract returns difference" {
  expect(subtract(10, 4)).toBe(6)
}

test "multiply returns product" {
  expect(multiply(3, 4)).toBe(12)
}

## impl

<!-- spec-hash: ${hash} -->

fn add(a, b) {
  return a + b
}

fn subtract(a, b) {
  return a - b
}

fn multiply(a, b) {
  return a * b
}`;

  const result = compiler.compile(source);

  assertEqual(result.spec.module, 'Calculator');
  assertEqual(result.spec.functions.length, 3);
  assertEqual(result.spec.requires.length, 4);

  assertContains(result.js, 'function add(a, b)');
  assertContains(result.js, 'function subtract(a, b)');
  assertContains(result.js, 'function multiply(a, b)');
  assertContains(result.js, '_test(');
  assertContains(result.js, '_deepFreeze');
  assertContains(result.js, '_runTests()');
});

test('full pipeline: spec change invalidates everything', () => {
  const compiler = new SpecScriptCompiler();
  const oldHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

  const source = `## spec

# Changed

**intent:** This was modified
**reason:** Testing staleness

## test

<!-- spec-hash: ${oldHash} -->

test "x" { expect(1).toBe(1) }

## impl

<!-- spec-hash: ${oldHash} -->

fn x() { return 1 }`;

  assertThrows(() => compiler.compile(source), 'stale');
});

test('full pipeline: rejects file over 500 lines', () => {
  const lines = ['## spec', '', '# Big', '', '**intent:** x', '**reason:** y'];
  while (lines.length < 495) lines.push('// padding');
  lines.push('', '## test', '', '<!-- spec-hash: sha256:x -->', '', '## impl', '', '<!-- spec-hash: sha256:x -->');

  assertThrows(() => {
    const compiler = new SpecScriptCompiler();
    compiler.compile(lines.join('\n'));
  }, '500');
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd specscript && node test/test.js`
Expected: All integration tests PASS

- [ ] **Step 4: Stamp the example file with correct hash**

Run:
```bash
cd specscript && node -e "
import { computeSpecHash } from './src/hasher.js';
import { readFileSync, writeFileSync } from 'fs';
const source = readFileSync('examples/calculator.sp', 'utf-8');
const specStart = source.indexOf('## spec') + '## spec'.length;
const specEnd = source.indexOf('## test');
const specContent = source.slice(specStart, specEnd);
const hash = computeSpecHash(specContent);
const updated = source.replaceAll('PLACEHOLDER', hash);
writeFileSync('examples/calculator.sp', updated);
console.log('Stamped hash:', hash);
"
```

- [ ] **Step 5: Verify the example compiles and runs**

Run: `cd specscript && node src/cli.js run examples/calculator.sp`
Expected: Test output showing all 5 tests passing

- [ ] **Step 6: Commit**

```bash
git add specscript/examples/calculator.sp specscript/test/test.js
git commit -m "feat: add integration tests and calculator example"
```

---

## Summary

| Task | Component | What it builds |
|------|-----------|----------------|
| 1 | Scaffolding | package.json, test harness |
| 2 | Section Splitter | Split .sp files into spec/test/impl |
| 3 | Spec Parser | Parse ## spec into structured data |
| 4 | Hasher | SHA-256 hashing and validation |
| 5 | Lexer | Tokenize code in test/impl |
| 6 | Parser | Build AST from tokens |
| 7 | Generator | Emit JavaScript from AST |
| 8 | Compiler | Orchestrate all stages with hash enforcement |
| 9 | CLI | `sp` command with all subcommands |
| 10 | Dependency Graph | Cross-module staleness tracking |
| 11 | Integration | End-to-end test and calculator example |
