import { KimchiInterpreter } from '../src/interpreter.js';
import { existsSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';

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

const testCacheDir = join(import.meta.dirname, '.test-kimchi-cache');
if (existsSync(testCacheDir)) rmSync(testCacheDir, { recursive: true });

console.log('KimchiInterpreter Test Suite\n');
console.log('='.repeat(50));
console.log('\n--- prepare() ---\n');

test('prepare returns executable code for valid source', () => {
  const interp = new KimchiInterpreter({ cacheDir: testCacheDir });
  const result = interp.prepare('print "hello"');
  assertEqual(typeof result, 'string');
  assertEqual(result.includes('console.log'), true, 'Should contain console.log');
});

test('prepare creates cache file', () => {
  const interp = new KimchiInterpreter({ cacheDir: testCacheDir });
  interp.prepare('print "cached"');
  const files = readdirSync(testCacheDir);
  assertEqual(files.length > 0, true, 'Cache dir should have files');
  assertEqual(files[0].endsWith('.mjs'), true, 'Cache file should be .mjs');
});

test('prepare returns same code on cache hit', () => {
  const interp = new KimchiInterpreter({ cacheDir: testCacheDir });
  const code1 = interp.prepare('print "same"');
  const code2 = interp.prepare('print "same"');
  assertEqual(code1, code2, 'Cached result should match');
});

test('prepare creates different cache for different source', () => {
  const interp = new KimchiInterpreter({ cacheDir: testCacheDir });
  interp.prepare('print "aaa"');
  interp.prepare('print "bbb"');
  const files = readdirSync(testCacheDir);
  assertEqual(files.length >= 2, true, 'Should have multiple cache files');
});

test('prepared code is self-contained (has runtime inlined)', () => {
  const interp = new KimchiInterpreter({ cacheDir: testCacheDir });
  const code = interp.prepare('dec x = [1,2,3]\nprint x.sum()');
  assertEqual(code.includes('Array.prototype.sum'), true, 'Should inline stdlib extensions');
  assertEqual(code.includes("from '"), false, 'Should not have import statements');
});

test('prepare throws on invalid source', () => {
  const interp = new KimchiInterpreter({ cacheDir: testCacheDir });
  let threw = false;
  try {
    interp.prepare('dec = invalid');
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'Should throw on invalid source');
});

test('getCachePath returns correct path', () => {
  const interp = new KimchiInterpreter({ cacheDir: testCacheDir });
  const path = interp.getCachePath('print "hello"');
  assertEqual(path !== null, true, 'Should return a path');
  assertEqual(path.endsWith('.mjs'), true, 'Path should end with .mjs');
  assertEqual(path.startsWith(testCacheDir), true, 'Path should be in cache dir');
});

test('getCachePath returns null when no cacheDir', () => {
  const interp = new KimchiInterpreter();
  const path = interp.getCachePath('print "hello"');
  assertEqual(path, null, 'Should return null without cacheDir');
});

if (existsSync(testCacheDir)) rmSync(testCacheDir, { recursive: true });

console.log('\n' + '='.repeat(50));
console.log(`Interpreter Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
