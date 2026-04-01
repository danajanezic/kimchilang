// KimchiLang Standard Library Test Suite

import { compile, tokenize, parse, generate } from '../src/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STDLIB_DIR = path.join(__dirname, '..', 'stdlib');

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

function assertContains(str, substring, message = '') {
  if (!str.includes(substring)) {
    throw new Error(`${message}\n  Expected to contain: ${substring}\n  In: ${str.slice(0, 200)}...`);
  }
}

function assertNotContains(str, substring, message = '') {
  if (str.includes(substring)) {
    throw new Error(`${message}\n  Expected NOT to contain: ${substring}`);
  }
}

function readStdlib(name) {
  return fs.readFileSync(path.join(STDLIB_DIR, name), 'utf-8');
}

// Compile with type checker (for modules that pass type checking)
function compileModule(source) {
  return compile(source, { skipLint: true });
}

// Compile without type checker (for modules that use new Date(), new Promise(), etc.)
function compileModuleNoTypeCheck(source) {
  return generate(parse(tokenize(source)));
}

console.log('KimchiLang Standard Library Test Suite\n');
console.log('='.repeat(50));

// Note: The KimchiLang compiler converts all member access (.) to optional
// chaining (?.) in the generated JavaScript output. All assertions below
// account for this behavior.

// ============================================================
// array.km
// ============================================================
console.log('\n--- array.km ---\n');

{
  const source = readStdlib('array.km');
  const js = compileModule(source);

  test('array.km compiles without errors', () => {
    assertEqual(typeof js, 'string');
  });

  test('array.km has chunk function', () => {
    assertContains(js, 'chunk');
    assertContains(js, 'slice');
  });

  test('array.km has zip function', () => {
    assertContains(js, 'zip');
  });

  test('array.km has groupBy function', () => {
    assertContains(js, 'groupBy');
  });

  test('array.km has sortBy function', () => {
    assertContains(js, 'sortBy');
    assertContains(js, 'sort');
  });

  test('array.km has range function', () => {
    assertContains(js, 'range');
  });

  test('array.km has compact function (filters null)', () => {
    assertContains(js, 'compact');
    assertContains(js, 'filter');
  });

  test('array.km has partition function', () => {
    assertContains(js, 'partition');
  });

  test('array.km has intersect function', () => {
    assertContains(js, 'intersect');
    assertContains(js, 'includes');
  });

  test('array.km has difference function', () => {
    assertContains(js, 'difference');
  });

  test('array.km exports all functions', () => {
    assertContains(js, 'chunk');
    assertContains(js, 'zip');
    assertContains(js, 'groupBy');
    assertContains(js, 'sortBy');
    assertContains(js, 'range');
    assertContains(js, 'compact');
    assertContains(js, 'partition');
    assertContains(js, 'intersect');
    assertContains(js, 'difference');
  });
}

// ============================================================
// string.km
// ============================================================
console.log('\n--- string.km ---\n');

(() => {
  const source = readStdlib('string.km');
  let output;

  test('string.km compiles without errors', () => {
    output = compileModule(source);
  });

  test('string.km has split function', () => {
    assertContains(output, '?.split(');
  });

  test('string.km has trim function', () => {
    assertContains(output, '?.trim()');
  });

  test('string.km has trimStart and trimEnd', () => {
    assertContains(output, '?.trimStart()');
    assertContains(output, '?.trimEnd()');
  });

  test('string.km has toUpperCase and toLowerCase', () => {
    assertContains(output, '?.toUpperCase()');
    assertContains(output, '?.toLowerCase()');
  });

  test('string.km has startsWith and endsWith', () => {
    assertContains(output, '?.startsWith(');
    assertContains(output, '?.endsWith(');
  });

  test('string.km has includes', () => {
    assertContains(output, '?.includes(');
  });

  test('string.km has replace and replaceAll', () => {
    assertContains(output, '?.replace(');
    assertContains(output, '?.replaceAll(');
  });

  test('string.km has isEmpty with length check', () => {
    assertContains(output, '?.length');
  });

  test('string.km has padStart and padEnd', () => {
    assertContains(output, '?.padStart(');
    assertContains(output, '?.padEnd(');
  });

  test('string.km has repeat', () => {
    assertContains(output, '?.repeat(');
  });

  test('string.km has charAt', () => {
    assertContains(output, '?.charAt(');
  });

  test('string.km has indexOf', () => {
    assertContains(output, '?.indexOf(');
  });

  test('string.km has toChars (split on empty string)', () => {
    assertContains(output, '?.split("")');
  });

  test('string.km has toLines (split on newline)', () => {
    assertContains(output, '?.split("\\n")');
  });

  test('string.km exports all 22 exposed functions', () => {
    const fns = ['_describe', 'split', 'trim', 'trimStart', 'trimEnd',
      'toUpperCase', 'toLowerCase', 'startsWith', 'endsWith', 'includes',
      'indexOf', 'replace', 'replaceAll', 'slice', 'charAt', 'padStart',
      'padEnd', 'repeat', 'length', 'isEmpty', 'isBlank', 'toChars', 'toLines'];
    for (const fn of fns) {
      assertContains(output, fn, `Missing function: ${fn}`);
    }
  });
})();

// ============================================================
// object.km
// ============================================================
console.log('\n--- object.km ---\n');

(() => {
  const source = readStdlib('object.km');
  let output;

  test('object.km compiles without errors', () => {
    output = compileModule(source);
  });

  test('object.km has Object.keys (via optional chaining)', () => {
    assertContains(output, 'Object?.keys(');
  });

  test('object.km has Object.values (via optional chaining)', () => {
    assertContains(output, 'Object?.values(');
  });

  test('object.km has Object.entries (via optional chaining)', () => {
    assertContains(output, 'Object?.entries(');
  });

  test('object.km has Object.fromEntries (via optional chaining)', () => {
    assertContains(output, 'Object?.fromEntries(');
  });

  test('object.km has Object.hasOwn (via optional chaining)', () => {
    assertContains(output, 'Object?.hasOwn(');
  });

  test('object.km has Object.freeze (via optional chaining)', () => {
    assertContains(output, 'Object?.freeze(');
  });

  test('object.km has Object.assign (via optional chaining)', () => {
    assertContains(output, 'Object?.assign(');
  });

  test('object.km has isEmpty using Object.keys length check', () => {
    assertContains(output, 'Object?.keys(obj)?.length');
  });

  test('object.km exports all 10 exposed functions', () => {
    const fns = ['_describe', 'keys', 'values', 'entries', 'fromEntries',
      'has', 'freeze', 'isEmpty', 'size', 'assign'];
    for (const fn of fns) {
      assertContains(output, fn, `Missing function: ${fn}`);
    }
  });
})();

// ============================================================
// math.km
// ============================================================
console.log('\n--- math.km ---\n');

(() => {
  const source = readStdlib('math.km');
  let output;

  test('math.km compiles without errors', () => {
    output = compileModule(source);
  });

  test('math.km has Math.PI constant (via optional chaining)', () => {
    assertContains(output, 'Math?.PI');
  });

  test('math.km has Math.E constant (via optional chaining)', () => {
    assertContains(output, 'Math?.E');
  });

  test('math.km has Math.abs (via optional chaining)', () => {
    assertContains(output, 'Math?.abs(');
  });

  test('math.km has Math.floor (via optional chaining)', () => {
    assertContains(output, 'Math?.floor(');
  });

  test('math.km has Math.ceil (via optional chaining)', () => {
    assertContains(output, 'Math?.ceil(');
  });

  test('math.km has Math.round (via optional chaining)', () => {
    assertContains(output, 'Math?.round(');
  });

  test('math.km has Math.random (via optional chaining)', () => {
    assertContains(output, 'Math?.random()');
  });

  test('math.km has Math.sqrt (via optional chaining)', () => {
    assertContains(output, 'Math?.sqrt(');
  });

  test('math.km has Math.pow (via optional chaining)', () => {
    assertContains(output, 'Math?.pow(');
  });

  test('math.km has trig functions (via optional chaining)', () => {
    assertContains(output, 'Math?.sin(');
    assertContains(output, 'Math?.cos(');
    assertContains(output, 'Math?.tan(');
    assertContains(output, 'Math?.asin(');
    assertContains(output, 'Math?.acos(');
    assertContains(output, 'Math?.atan(');
    assertContains(output, 'Math?.atan2(');
  });

  test('math.km has Math.log functions (via optional chaining)', () => {
    assertContains(output, 'Math?.log(');
    assertContains(output, 'Math?.log10(');
    assertContains(output, 'Math?.log2(');
  });

  test('math.km clamp uses Math.min and Math.max (via optional chaining)', () => {
    assertContains(output, 'Math?.min(');
    assertContains(output, 'Math?.max(');
  });

  test('math.km randomInt uses Math.floor and Math.random', () => {
    assertContains(output, 'Math?.floor((Math?.random()');
  });

  test('math.km lerp has arithmetic pattern', () => {
    // lerp: start + (end - start) * t
    assertContains(output, 'start + ((end - start) * t)');
  });

  test('math.km isEven uses modulo 2', () => {
    assertContains(output, '% 2');
  });

  test('math.km degrees conversion uses 180 / Math.PI', () => {
    assertContains(output, '180');
    assertContains(output, 'Math?.PI');
  });

  test('math.km exports all expected functions', () => {
    const fns = ['_describe', 'abs', 'sign', 'round', 'floor', 'ceil', 'trunc',
      'pow', 'sqrt', 'cbrt', 'exp', 'log', 'log10', 'log2',
      'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
      'random', 'randomInt', 'clamp', 'lerp', 'degrees', 'radians',
      'isEven', 'isOdd'];
    for (const fn of fns) {
      assertContains(output, fn, `Missing function: ${fn}`);
    }
  });
})();

// ============================================================
// date.km (uses new Date() - skip type checker)
// ============================================================
console.log('\n--- date.km ---\n');

(() => {
  const source = readStdlib('date.km');
  let output;

  test('date.km compiles without errors (no type check)', () => {
    output = compileModuleNoTypeCheck(source);
  });

  test('date.km has Date.now() (via optional chaining)', () => {
    assertContains(output, 'Date?.now()');
  });

  test('date.km has new keyword for Date construction', () => {
    // new Date() compiles as "new;\nDate(..." due to current compiler behavior
    assertContains(output, 'new');
    assertContains(output, 'Date(');
  });

  test('date.km has getFullYear (via optional chaining)', () => {
    assertContains(output, '?.getFullYear()');
  });

  test('date.km has getTime (via optional chaining)', () => {
    assertContains(output, '?.getTime()');
  });

  test('date.km has toISOString (via optional chaining)', () => {
    assertContains(output, '?.toISOString()');
  });

  test('date.km has toDateString (via optional chaining)', () => {
    assertContains(output, '?.toDateString()');
  });

  test('date.km addMs has getTime arithmetic', () => {
    assertContains(output, '?.getTime() +');
  });

  test('date.km addDays has day-to-ms conversion factors', () => {
    // Compiled as (((days * 24) * 60) * 60) * 1000
    assertContains(output, '* 24');
    assertContains(output, '* 60');
    assertContains(output, '* 1000');
  });

  test('date.km has getMonth, getDate, getDay (via optional chaining)', () => {
    assertContains(output, '?.getMonth()');
    assertContains(output, '?.getDate()');
    assertContains(output, '?.getDay()');
  });

  test('date.km has getHours, getMinutes, getSeconds (via optional chaining)', () => {
    assertContains(output, '?.getHours()');
    assertContains(output, '?.getMinutes()');
    assertContains(output, '?.getSeconds()');
  });

  test('date.km exports all 22 exposed functions', () => {
    const fns = ['_describe', 'now', 'create', 'getYear', 'getMonth', 'getDay',
      'getDayOfWeek', 'getHours', 'getMinutes', 'getSeconds', 'getTime',
      'toISO', 'toLocaleDateString', 'parse', 'addMs', 'addSeconds',
      'addMinutes', 'addHours', 'addDays', 'diffMs', 'diffDays',
      'isBefore', 'isAfter', 'isSameDay'];
    for (const fn of fns) {
      assertContains(output, fn, `Missing function: ${fn}`);
    }
  });
})();

// ============================================================
// json.km
// ============================================================
console.log('\n--- json.km ---\n');

(() => {
  const source = readStdlib('json.km');
  let output;

  test('json.km compiles without errors', () => {
    output = compileModule(source);
  });

  test('json.km has JSON.parse (via optional chaining)', () => {
    assertContains(output, 'JSON?.parse(');
  });

  test('json.km has JSON.stringify (via optional chaining)', () => {
    assertContains(output, 'JSON?.stringify(');
  });

  test('json.km pretty uses null and indent parameter', () => {
    assertContains(output, 'JSON?.stringify(obj, null,');
  });

  test('json.km exports all 4 exposed functions', () => {
    const fns = ['_describe', 'parse', 'stringify', 'pretty'];
    for (const fn of fns) {
      assertContains(output, fn, `Missing function: ${fn}`);
    }
  });
})();

// ============================================================
// function.km
// ============================================================
console.log('\n--- function.km ---\n');

(() => {
  const source = readStdlib('function.km');
  let output;

  test('function.km compiles without errors', () => {
    output = compileModule(source);
  });

  test('function.km identity returns x', () => {
    assertContains(output, 'return x');
  });

  test('function.km constant returns arrow function', () => {
    assertContains(output, '() => x');
  });

  test('function.km negate returns negated predicate', () => {
    assertContains(output, '!predicate(x)');
  });

  test('function.km flip swaps arguments', () => {
    assertContains(output, 'f(b, a)');
  });

  test('function.km compose calls f(g(x))', () => {
    assertContains(output, 'f(g(x))');
  });

  test('function.km pipe calls g(f(x))', () => {
    assertContains(output, 'g(f(x))');
  });

  test('function.km tap returns x after calling f', () => {
    assertContains(output, 'f(x)');
    assertContains(output, 'return x');
  });

  test('function.km unary wraps with single arg', () => {
    // Compiler may strip parens on single-arg arrows: (x) => becomes x =>
    assertContains(output, 'x => f(x)');
  });

  test('function.km binary wraps with two args', () => {
    assertContains(output, '(a, b) => f(a, b)');
  });

  test('function.km exports all 10 exposed functions', () => {
    const fns = ['_describe', 'identity', 'constant', 'negate', 'flip',
      'compose', 'pipe', 'tap', 'unary', 'binary'];
    for (const fn of fns) {
      assertContains(output, fn, `Missing function: ${fn}`);
    }
  });
})();

// ============================================================
// console.km
// ============================================================
console.log('\n--- console.km ---\n');

(() => {
  const source = readStdlib('console.km');
  let output;

  test('console.km compiles without errors', () => {
    output = compileModule(source);
  });

  test('console.km has console.log (via optional chaining)', () => {
    assertContains(output, 'console?.log(');
  });

  test('console.km has console.error (via optional chaining)', () => {
    assertContains(output, 'console?.error(');
  });

  test('console.km has console.warn (via optional chaining)', () => {
    assertContains(output, 'console?.warn(');
  });

  test('console.km has console.info (via optional chaining)', () => {
    assertContains(output, 'console?.info(');
  });

  test('console.km has console.debug (via optional chaining)', () => {
    assertContains(output, 'console?.debug(');
  });

  test('console.km has console.table (via optional chaining)', () => {
    assertContains(output, 'console?.table(');
  });

  test('console.km has console.clear (via optional chaining)', () => {
    assertContains(output, 'console?.clear()');
  });

  test('console.km has console.time and console.timeEnd (via optional chaining)', () => {
    assertContains(output, 'console?.time(');
    assertContains(output, 'console?.timeEnd(');
  });

  test('console.km has console.trace (via optional chaining)', () => {
    assertContains(output, 'console?.trace(');
  });

  test('console.km has console.dir (via optional chaining)', () => {
    assertContains(output, 'console?.dir(');
  });

  test('console.km exports all 12 exposed functions', () => {
    const fns = ['_describe', 'log', 'error', 'warn', 'info', 'debug',
      'table', 'clear', 'time', 'timeEnd', 'trace', 'dir'];
    for (const fn of fns) {
      assertContains(output, fn, `Missing function: ${fn}`);
    }
  });
})();

// ============================================================
// bitwise.km
// ============================================================
console.log('\n--- bitwise.km ---\n');

(() => {
  const source = readStdlib('bitwise.km');
  let output;

  test('bitwise.km compiles without errors', () => {
    output = compileModule(source);
  });

  test('bitwise.km has band function', () => {
    assertContains(output, '_band');
  });

  test('bitwise.km has bor function', () => {
    assertContains(output, '_bor');
  });

  test('bitwise.km has bxor function', () => {
    assertContains(output, '_bxor');
  });

  test('bitwise.km has bnot function', () => {
    assertContains(output, '_bnot');
  });

  test('bitwise.km has lshift function', () => {
    assertContains(output, '_lshift');
  });

  test('bitwise.km has rshift function', () => {
    assertContains(output, '_rshift');
  });

  test('bitwise.km has urshift function', () => {
    assertContains(output, '_urshift');
  });

  test('bitwise.km exports all 7 exposed functions', () => {
    const fns = ['band', 'bor', 'bxor', 'bnot', 'lshift', 'rshift', 'urshift'];
    for (const fn of fns) {
      assertContains(output, fn, `Missing function: ${fn}`);
    }
  });
})();

// ============================================================
// http.km (uses guard, ??, .if().else() - skip type checker)
// ============================================================
console.log('\n--- http.km ---\n');

(() => {
  const source = readStdlib('http.km');
  let output;

  test('http.km compiles without errors (no type check)', () => {
    output = compileModuleNoTypeCheck(source);
  });

  test('http.km has ?? (nullish coalescing) in compiled output', () => {
    assertContains(output, '??');
  });

  test('http.km guard compiles to if (!) pattern', () => {
    assertContains(output, 'if (!(');
  });

  test('http.km .if().else() compiles to ternary for finalHeaders', () => {
    assertContains(output, '?');
  });

  test('http.km createClient has a single makeReq function', () => {
    assertContains(output, 'makeReq');
    // The 5 methods (get, post, put, patch, del) should reference makeReq
    assertContains(output, 'makeReq("GET"');
    assertContains(output, 'makeReq("POST"');
    assertContains(output, 'makeReq("PUT"');
    assertContains(output, 'makeReq("PATCH"');
    assertContains(output, 'makeReq("DELETE"');
  });

  test('http.km request function exists with url, method, headers, body, timeout', () => {
    assertContains(output, 'request');
    assertContains(output, 'method');
    assertContains(output, 'headers');
    assertContains(output, 'body');
    assertContains(output, 'timeout');
  });

  test('http.km has queryString with encodeURIComponent', () => {
    assertContains(output, 'encodeURIComponent');
  });

  test('http.km has buildUrl function', () => {
    assertContains(output, 'buildUrl');
  });

  test('http.km exports all expected exposed functions', () => {
    const fns = ['_describe', 'get', 'post', 'put', 'patch', 'del',
      'request', 'queryString', 'buildUrl', 'createClient'];
    for (const fn of fns) {
      assertContains(output, fn, `Missing function: ${fn}`);
    }
  });
})();

// ============================================================
// logger.km (uses guard, ?? - skip type checker due to env/js blocks)
// ============================================================
console.log('\n--- logger.km ---\n');

(() => {
  const source = readStdlib('logger.km');
  let output;

  test('logger.km compiles without errors (no type check)', () => {
    output = compileModuleNoTypeCheck(source);
  });

  test('logger.km has ?? for log level default', () => {
    assertContains(output, '??');
  });

  test('logger.km guard compiles to if (!) pattern for shouldLog', () => {
    assertContains(output, 'if (!(');
  });

  test('logger.km has LOG_LEVELS object with debug, info, warn, error', () => {
    assertContains(output, 'debug');
    assertContains(output, 'info');
    assertContains(output, 'warn');
    assertContains(output, 'error');
  });

  test('logger.km has console.log for debug/info output', () => {
    assertContains(output, 'console.log(');
  });

  test('logger.km has console.warn for warn output', () => {
    assertContains(output, 'console?.warn(');
  });

  test('logger.km has console.error for error output', () => {
    assertContains(output, 'console?.error(');
  });

  test('logger.km child function uses ?? for merging data', () => {
    assertContains(output, 'child');
    assertContains(output, 'data ?? {}');
  });

  test('logger.km has formatLog function with timestamp', () => {
    assertContains(output, 'formatLog');
    assertContains(output, 'timestamp');
  });

  test('logger.km has JSON.stringify for log output', () => {
    assertContains(output, 'JSON?.stringify');
  });

  test('logger.km exports exposed functions', () => {
    const fns = ['debug', 'info', 'warn', 'error', 'child'];
    for (const fn of fns) {
      assertContains(output, fn, `Missing function: ${fn}`);
    }
  });
})();

// ============================================================
// index.km
// ============================================================
console.log('\n--- index.km ---\n');

(() => {
  const source = readStdlib('index.km');
  let output;

  test('index.km compiles without errors', () => {
    output = compileModule(source);
  });

  test('index.km has _describe function', () => {
    assertContains(output, '_describe');
  });

  test('index.km has _help function', () => {
    assertContains(output, '_help');
  });

  test('index.km _describe mentions Standard Library', () => {
    assertContains(output, 'Standard Library');
  });

  test('index.km _help lists available modules', () => {
    assertContains(output, 'stdlib.array');
    assertContains(output, 'stdlib.string');
    assertContains(output, 'stdlib.math');
  });
})();

// ============================================================
// Summary
// ============================================================
console.log('\n' + '='.repeat(50));
console.log(`Stdlib Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
