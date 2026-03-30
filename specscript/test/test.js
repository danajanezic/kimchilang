// specscript/test/test.js
import { splitSections } from '../src/section-splitter.js';
import { parseSpec } from '../src/spec-parser.js';
import { computeSpecHash, extractHash, normalizeSpec } from '../src/hasher.js';

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
  assertThrows(() => parseSpec('**intent:** x\n**reason:** y'), 'module name');
});

test('rejects spec missing intent', () => {
  assertThrows(() => parseSpec('# Mod\n**reason:** y'), 'intent');
});

test('rejects spec missing reason', () => {
  assertThrows(() => parseSpec('# Mod\n**intent:** x'), 'reason');
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
  assertEqual(hash.length, 7 + 64);
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

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
