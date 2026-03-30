import { KimchiValidator, formatDiagnostics } from '../src/validator.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

console.log('KimchiValidator Test Suite\n');
console.log('='.repeat(50));

// --- validate() tests ---
console.log('\n--- validate() ---\n');

test('valid code returns success with no errors', () => {
  const v = new KimchiValidator();
  const result = v.validate('dec x = 42\nprint x');
  assertEqual(result.success, true);
  // May have lint warnings but no errors
  const errors = result.diagnostics.filter(d => d.severity === 'error');
  assertEqual(errors.length, 0);
});

test('parse error returns structured diagnostic', () => {
  const v = new KimchiValidator();
  const result = v.validate('dec = 42');
  assertEqual(result.success, false);
  assertEqual(result.diagnostics.length > 0, true);
  assertEqual(result.diagnostics[0].severity, 'error');
  assertEqual(result.diagnostics[0].source, 'kimchi-parser');
  assertEqual(typeof result.diagnostics[0].line, 'number');
  assertEqual(typeof result.diagnostics[0].column, 'number');
  assertEqual(typeof result.diagnostics[0].message, 'string');
});

test('type error returns structured diagnostic', () => {
  const v = new KimchiValidator();
  const result = v.validate('dec x = 42\nx()');
  assertEqual(result.success, false);
  const typeError = result.diagnostics.find(d => d.source === 'kimchi-typechecker');
  assertEqual(typeError !== undefined, true);
  assertEqual(typeError.severity, 'error');
});

test('lint warning returns diagnostic but success is true', () => {
  const v = new KimchiValidator();
  // x is declared but never used — linter should warn
  const result = v.validate('dec x = 42');
  // success is true because warnings don't count as failure
  assertEqual(result.success, true);
});

test('diagnostic has all required fields', () => {
  const v = new KimchiValidator();
  const result = v.validate('dec = 42');
  const d = result.diagnostics[0];
  assertEqual('line' in d, true);
  assertEqual('column' in d, true);
  assertEqual('severity' in d, true);
  assertEqual('message' in d, true);
  assertEqual('source' in d, true);
});

test('empty source returns success', () => {
  const v = new KimchiValidator();
  const result = v.validate('');
  assertEqual(result.success, true);
  assertEqual(result.diagnostics.length, 0);
});

test('null source returns success', () => {
  const v = new KimchiValidator();
  const result = v.validate(null);
  assertEqual(result.success, true);
});

test('valid function compiles without errors', () => {
  const v = new KimchiValidator();
  const result = v.validate('fn add(a, b) { return a + b }\nprint add(1, 2)');
  const errors = result.diagnostics.filter(d => d.severity === 'error');
  assertEqual(errors.length, 0);
});

// --- validateAll() tests ---
console.log('\n--- validateAll() ---\n');

test('validateAll returns results per file', () => {
  const v = new KimchiValidator();
  const files = new Map();
  files.set('a.km', 'dec x = 1\nprint x');
  files.set('b.km', 'dec y = 2\nprint y');
  const results = v.validateAll(files);
  assertEqual(results.size, 2);
  assertEqual(results.get('a.km').success, true);
  assertEqual(results.get('b.km').success, true);
});

test('validateAll catches errors in individual files', () => {
  const v = new KimchiValidator();
  const files = new Map();
  files.set('good.km', 'dec x = 1\nprint x');
  files.set('bad.km', 'dec = ');
  const results = v.validateAll(files);
  assertEqual(results.get('good.km').success, true);
  assertEqual(results.get('bad.km').success, false);
});

test('validateAll with empty map returns empty results', () => {
  const v = new KimchiValidator();
  const results = v.validateAll(new Map());
  assertEqual(results.size, 0);
});

// --- formatDiagnostics() tests ---
console.log('\n--- formatDiagnostics() ---\n');

test('formatDiagnostics produces readable output', () => {
  const output = formatDiagnostics([
    { line: 5, column: 12, severity: 'error', message: 'Undefined identifier', source: 'kimchi-typechecker' },
    { line: 10, column: 3, severity: 'warning', message: 'Unused variable', source: 'kimchi-linter', code: 'unused-variable' },
  ]);
  assertEqual(output.includes('Line 5, col 12'), true);
  assertEqual(output.includes('error'), true);
  assertEqual(output.includes('kimchi-typechecker'), true);
  assertEqual(output.includes('Line 10, col 3'), true);
  assertEqual(output.includes('unused-variable'), true);
});

test('formatDiagnostics handles empty array', () => {
  const output = formatDiagnostics([]);
  assertEqual(output, '');
});

console.log('\n' + '='.repeat(50));
console.log(`Validator Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
