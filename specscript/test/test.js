// specscript/test/test.js
import { splitSections } from '../src/section-splitter.js';

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

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
