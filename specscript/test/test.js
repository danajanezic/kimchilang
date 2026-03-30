// specscript/test/test.js
import { SpecScriptCompiler } from '../src/index.js';
import { LANGUAGE_REF } from '../src/language-ref.js';
import { parseArgs } from '../src/cli.js';
import { splitSections } from '../src/section-splitter.js';
import { parseSpec } from '../src/spec-parser.js';
import { computeSpecHash, extractHash, normalizeSpec } from '../src/hasher.js';
import { DependencyGraph } from '../src/dependency-graph.js';
import { buildGeneratePrompt, buildReviewPrompt, buildFixPrompt, parseResponse, tryTranspile, regen } from '../src/llm.js';

let passed = 0;
let failed = 0;

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

console.log('--- Section Splitter Tests ---');

await test('splits a valid .sp file into three sections', () => {
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

await test('rejects file missing ## spec section', () => {
  assertThrows(
    () => splitSections('## test\n\n## impl\n'),
    '## spec'
  );
});

await test('rejects file missing ## test section', () => {
  assertThrows(
    () => splitSections('## spec\n\n## impl\n'),
    '## test'
  );
});

await test('rejects file missing ## impl section', () => {
  assertThrows(
    () => splitSections('## spec\n\n## test\n'),
    '## impl'
  );
});

await test('rejects file with sections out of order (impl before test)', () => {
  assertThrows(
    () => splitSections('## spec\n\n## impl\n\n## test\n'),
    'order'
  );
});

await test('rejects file exceeding 500 lines', () => {
  const longFile = '## spec\n' + 'line\n'.repeat(499) + '## test\n\n## impl\n';
  assertThrows(
    () => splitSections(longFile),
    '500'
  );
});

await test('accepts file at exactly 500 lines', () => {
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

console.log('--- Spec Parser Tests ---');

await test('parses module name from # heading', () => {
  const spec = `# OrderProcessor

**intent:** Process orders
**reason:** Replaces manual handling`;
  const result = parseSpec(spec);
  assertEqual(result.module, 'OrderProcessor');
});

await test('parses intent and reason', () => {
  const spec = `# Mod

**intent:** Does things
**reason:** Because reasons`;
  const result = parseSpec(spec);
  assertEqual(result.intent, 'Does things');
  assertEqual(result.reason, 'Because reasons');
});

await test('parses requires list', () => {
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

await test('parses type definitions', () => {
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

await test('parses depends list', () => {
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

await test('parses expose function declarations', () => {
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

await test('parses internal function declarations', () => {
  const spec = `# Mod

**intent:** x
**reason:** y

### internal helper :: (String) -> Number

**intent:** Convert string to number`;
  const result = parseSpec(spec);
  assertEqual(result.functions[0].visibility, 'internal');
  assertEqual(result.functions[0].name, 'helper');
});

await test('rejects spec missing module name', () => {
  assertThrows(() => parseSpec('**intent:** x\n**reason:** y'), 'module name');
});

await test('rejects spec missing intent', () => {
  assertThrows(() => parseSpec('# Mod\n**reason:** y'), 'intent');
});

await test('rejects spec missing reason', () => {
  assertThrows(() => parseSpec('# Mod\n**intent:** x'), 'reason');
});

await test('parses full spec with all sections', () => {
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

console.log('--- Hasher Tests ---');

await test('normalizeSpec collapses whitespace', () => {
  const a = normalizeSpec('# Mod\n\n\n**intent:** x\n  **reason:** y');
  const b = normalizeSpec('# Mod\n**intent:** x\n**reason:** y');
  assertEqual(a, b);
});

await test('normalizeSpec trims lines', () => {
  const a = normalizeSpec('  # Mod  \n  **intent:** x  ');
  const b = normalizeSpec('# Mod\n**intent:** x');
  assertEqual(a, b);
});

await test('computeSpecHash returns consistent hash for same content', () => {
  const hash1 = computeSpecHash('# Mod\n**intent:** x\n**reason:** y');
  const hash2 = computeSpecHash('# Mod\n**intent:** x\n**reason:** y');
  assertEqual(hash1, hash2);
});

await test('computeSpecHash returns different hash for different content', () => {
  const hash1 = computeSpecHash('# Mod\n**intent:** x\n**reason:** y');
  const hash2 = computeSpecHash('# Mod\n**intent:** z\n**reason:** y');
  const different = hash1 !== hash2;
  assertEqual(different, true);
});

await test('computeSpecHash ignores whitespace differences', () => {
  const hash1 = computeSpecHash('# Mod\n**intent:** x\n**reason:** y');
  const hash2 = computeSpecHash('# Mod\n\n  **intent:** x  \n\n**reason:** y\n\n');
  assertEqual(hash1, hash2);
});

await test('computeSpecHash returns sha256: prefixed string', () => {
  const hash = computeSpecHash('# Mod');
  assertEqual(hash.startsWith('sha256:'), true);
  assertEqual(hash.length, 7 + 64);
});

await test('extractHash finds hash in HTML comment', () => {
  const section = '<!-- spec-hash: sha256:abc123def456 -->\n\nsome code';
  const hash = extractHash(section);
  assertEqual(hash, 'sha256:abc123def456');
});

await test('extractHash returns null when no hash present', () => {
  const hash = extractHash('just some code\nno hash here');
  assertEqual(hash, null);
});


console.log('--- Compiler Tests ---');

function makeFile(spec, testSection, implSection) {
  return `## spec\n\n${spec}\n\n## test\n\n${testSection}\n\n## impl\n\n${implSection}`;
}

await test('compiles a valid .sp file to JavaScript', () => {
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

await test('rejects stale test hash', () => {
  const spec = `# Mod\n\n**intent:** x\n**reason:** y`;
  const staleHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
  const source = makeFile(
    spec,
    `<!-- spec-hash: ${staleHash} -->\n\ntest "x" { expect(1).toBe(1) }`,
    `<!-- spec-hash: ${staleHash} -->\n\nfn x() { return 1 }`
  );

  const compiler = new SpecScriptCompiler();
  assertThrows(() => compiler.compile(source), 'stale');
});

await test('rejects missing test hash', () => {
  const spec = `# Mod\n\n**intent:** x\n**reason:** y`;
  const source = makeFile(
    spec,
    'test "x" { expect(1).toBe(1) }',
    '<!-- spec-hash: sha256:abc -->\n\nfn x() { return 1 }'
  );

  const compiler = new SpecScriptCompiler();
  assertThrows(() => compiler.compile(source), 'hash');
});

await test('rejects stale impl hash when test is fresh', () => {
  const compiler = new SpecScriptCompiler();
  const spec = `# Mod\n\n**intent:** x\n**reason:** y`;
  const hash = compiler.computeHash(spec);
  const staleHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

  const source = makeFile(
    spec,
    `<!-- spec-hash: ${hash} -->\n\ntest "x" { expect(1).toBe(1) }`,
    `<!-- spec-hash: ${staleHash} -->\n\nfn x() { return 1 }`
  );

  assertThrows(() => compiler.compile(source), 'stale');
});

await test('rejects file where test hash is stale but impl hash is fresh (invalid state)', () => {
  const compiler = new SpecScriptCompiler();
  const spec = `# Mod\n\n**intent:** x\n**reason:** y`;
  const hash = compiler.computeHash(spec);
  const staleHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

  const source = makeFile(
    spec,
    `<!-- spec-hash: ${staleHash} -->\n\ntest "x" { expect(1).toBe(1) }`,
    `<!-- spec-hash: ${hash} -->\n\nfn x() { return 1 }`
  );

  assertThrows(() => compiler.compile(source), 'test');
});

await test('returns parsed spec metadata alongside compiled JS', () => {
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

console.log('--- CLI Tests ---');

await test('parseArgs recognizes compile command', () => {
  const args = parseArgs(['compile', 'myfile.sp']);
  assertEqual(args.command, 'compile');
  assertEqual(args.file, 'myfile.sp');
});

await test('parseArgs recognizes check command', () => {
  const args = parseArgs(['check', 'myfile.sp']);
  assertEqual(args.command, 'check');
});

await test('parseArgs recognizes run command', () => {
  const args = parseArgs(['run', 'myfile.sp']);
  assertEqual(args.command, 'run');
});

await test('parseArgs recognizes stale command with directory', () => {
  const args = parseArgs(['stale', './src']);
  assertEqual(args.command, 'stale');
  assertEqual(args.file, './src');
});

await test('parseArgs recognizes regen command with flags', () => {
  const args = parseArgs(['regen', 'myfile.sp', '--test']);
  assertEqual(args.command, 'regen');
  assertEqual(args.regenTarget, 'test');
});

await test('parseArgs recognizes regen --impl', () => {
  const args = parseArgs(['regen', 'myfile.sp', '--impl']);
  assertEqual(args.regenTarget, 'impl');
});

await test('parseArgs recognizes regen --all', () => {
  const args = parseArgs(['regen', 'myfile.sp', '--all']);
  assertEqual(args.regenTarget, 'all');
});

await test('parseArgs recognizes init command', () => {
  const args = parseArgs(['init']);
  assertEqual(args.command, 'init');
});

await test('parseArgs recognizes build command', () => {
  const args = parseArgs(['build', './src']);
  assertEqual(args.command, 'build');
});

await test('parseArgs recognizes -o output flag', () => {
  const args = parseArgs(['compile', 'myfile.sp', '-o', 'dist/out.js']);
  assertEqual(args.output, 'dist/out.js');
});

await test('parseArgs recognizes --debug flag', () => {
  const args = parseArgs(['compile', 'myfile.sp', '--debug']);
  assertEqual(args.debug, true);
});

console.log('--- Dependency Graph Tests ---');

await test('registers modules and their spec hashes', () => {
  const graph = new DependencyGraph();
  graph.register('order.processor', { hash: 'sha256:aaa', depends: ['inventory.stock'] });
  graph.register('inventory.stock', { hash: 'sha256:bbb', depends: [] });
  assertEqual(graph.getHash('order.processor'), 'sha256:aaa');
  assertEqual(graph.getHash('inventory.stock'), 'sha256:bbb');
});

await test('detects stale consumers when dependency hash changes', () => {
  const graph = new DependencyGraph();
  graph.register('inventory.stock', { hash: 'sha256:old', depends: [] });
  graph.register('order.processor', {
    hash: 'sha256:aaa',
    depends: ['inventory.stock'],
    depHashes: { 'inventory.stock': 'sha256:old' },
  });
  graph.register('inventory.stock', { hash: 'sha256:new', depends: [] });
  const stale = graph.findStaleConsumers('inventory.stock');
  assertEqual(stale.length, 1);
  assertEqual(stale[0], 'order.processor');
});

await test('does not flag consumers when dependency hash unchanged', () => {
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

await test('tracks transitive dependencies', () => {
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

await test('getAllStale returns all stale module paths', () => {
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

console.log('--- Integration Tests ---');

await test('full pipeline: compile valid source with correct hashes', () => {
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

await test('full pipeline: spec change invalidates everything', () => {
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

await test('full pipeline: rejects file over 500 lines', () => {
  const lines = ['## spec', '', '# Big', '', '**intent:** x', '**reason:** y'];
  while (lines.length < 495) lines.push('// padding');
  lines.push('', '## test', '', '<!-- spec-hash: sha256:abc123 -->', '', '## impl', '', '<!-- spec-hash: sha256:abc123 -->');

  assertThrows(() => {
    const compiler = new SpecScriptCompiler();
    compiler.compile(lines.join('\n'));
  }, '500');
});

console.log('--- Language Reference Tests ---');

await test('LANGUAGE_REF contains test syntax', () => {
  assertContains(LANGUAGE_REF, 'test "description"');
  assertContains(LANGUAGE_REF, 'expect(');
  assertContains(LANGUAGE_REF, '.toBe(');
});

await test('LANGUAGE_REF contains impl syntax', () => {
  assertContains(LANGUAGE_REF, 'dec ');
  assertContains(LANGUAGE_REF, 'fn ');
  assertContains(LANGUAGE_REF, '~>');
  assertContains(LANGUAGE_REF, 'enum');
});

await test('LANGUAGE_REF contains file structure info', () => {
  assertContains(LANGUAGE_REF, '## spec');
  assertContains(LANGUAGE_REF, '## test');
  assertContains(LANGUAGE_REF, '## impl');
  assertContains(LANGUAGE_REF, 'spec-hash');
});

console.log('--- LLM Module Tests ---');

await test('buildGeneratePrompt includes language ref and spec for --all', () => {
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

await test('buildGeneratePrompt for --test only asks for test section', () => {
  const prompt = buildGeneratePrompt({
    specContent: '# Mod\n\n**intent:** x\n**reason:** y',
    specHash: 'sha256:abc',
    target: 'test',
  });
  assertContains(prompt, '## test');
  assertContains(prompt, 'ONLY the ## test section');
});

await test('buildGeneratePrompt for --impl includes existing tests', () => {
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

await test('buildReviewPrompt includes spec and generated code', () => {
  const prompt = buildReviewPrompt({
    specContent: '# Mod\n\n**intent:** x\n**reason:** y',
    generatedContent: '## test\n\ntest "x" {}\n\n## impl\n\nfn x() {}',
  });
  assertContains(prompt, '# Mod');
  assertContains(prompt, 'test "x"');
  assertContains(prompt, 'APPROVED');
  assertContains(prompt, 'ISSUE');
});

await test('buildFixPrompt includes spec, code, and feedback', () => {
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

await test('parseResponse extracts test and impl sections', () => {
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

await test('parseResponse returns null when sections missing', () => {
  const result = parseResponse('just some random text with no sections');
  assertEqual(result, null);
});

await test('parseResponse injects hash if missing', () => {
  const response = `## test

test "x" { expect(1).toBe(1) }

## impl

fn x() { return 1 }`;

  const result = parseResponse(response, 'sha256:abc123');
  assertContains(result.test, 'spec-hash: sha256:abc123');
  assertContains(result.impl, 'spec-hash: sha256:abc123');
});

await test('parseResponse handles test-only response', () => {
  const response = `## test

<!-- spec-hash: sha256:abc -->

test "it works" { expect(1).toBe(1) }`;

  const result = parseResponse(response);
  assertContains(result.test, 'test "it works"');
  assertEqual(result.impl, null);
});

await test('parseResponse handles impl-only response', () => {
  const response = `## impl

<!-- spec-hash: sha256:abc -->

fn doIt() { return 1 }`;

  const result = parseResponse(response);
  assertEqual(result.test, null);
  assertContains(result.impl, 'fn doIt()');
});

console.log('--- Transpilation Check Tests ---');

await test('tryTranspile succeeds on valid KimchiLang code', () => {
  const code = `## impl\n\n<!-- spec-hash: sha256:abc -->\n\nfn add(a, b) {\n  return a + b\n}\n\n## test\n\n<!-- spec-hash: sha256:abc -->\n\ntest "add works" {\n  expect(add(1, 2)).toBe(3)\n}`;
  const result = tryTranspile(code);
  assertEqual(result.success, true);
});

await test('tryTranspile fails on invalid syntax', () => {
  const code = `## impl\n\n<!-- spec-hash: sha256:abc -->\n\nfn add(a, b) {\n  return a +\n}`;
  const result = tryTranspile(code);
  assertEqual(result.success, false);
  assertEqual(typeof result.error, 'string');
});

await test('tryTranspile strips HTML comments before compiling', () => {
  const code = `## test\n\n<!-- spec-hash: sha256:abc123 -->\n\ntest "x" {\n  expect(1).toBe(1)\n}\n\n## impl\n\n<!-- spec-hash: sha256:abc123 -->\n\nfn x() {\n  return 1\n}`;
  const result = tryTranspile(code);
  assertEqual(result.success, true);
});

console.log('--- CLI LLM Integration Tests ---');

await test('parseArgs recognizes --yes flag for non-interactive regen', () => {
  const args = parseArgs(['regen', 'myfile.sp', '--all', '--yes']);
  assertEqual(args.yes, true);
});

await test('parseArgs recognizes -y shorthand', () => {
  const args = parseArgs(['regen', 'myfile.sp', '--all', '-y']);
  assertEqual(args.yes, true);
});

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

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
