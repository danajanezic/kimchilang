# KimchiLang Interpreter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make KimchiLang scripts directly executable via `#!/usr/bin/env kimchi` with cached transpilation and stdin support.

**Architecture:** A `KimchiInterpreter` class wraps the existing compiler. It hashes source, checks a `.kimchi-cache/` directory for cached JS, compiles on miss, and executes the cached file. Cached files are self-contained (runtime inlined). The CLI's `runFile` delegates to the interpreter. Stdin is read when no file argument is given.

**Tech Stack:** Node.js `crypto` for hashing. Zero external dependencies.

**Spec:** `docs/superpowers/specs/2026-03-29-interpreter-design.md`

---

## File Map

| File | Changes |
|------|---------|
| `src/interpreter.js` | **Create** — `KimchiInterpreter` class with `prepare()` method |
| `src/cli.js` | **Modify** — `runFile` uses interpreter, stdin handling, `cache clear` command, `runTests` updated |
| `test/interpreter_test.js` | **Create** — tests for interpreter |

---

### Task 1: KimchiInterpreter — core with caching

**Files:**
- Create: `src/interpreter.js`
- Create: `test/interpreter_test.js`

- [ ] **Step 1: Write failing tests**

Create `test/interpreter_test.js`:

```javascript
import { KimchiInterpreter } from '../src/interpreter.js';
import { existsSync, mkdirSync, rmSync, readdirSync } from 'fs';
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

// Clean up before tests
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

// Clean up after tests
if (existsSync(testCacheDir)) rmSync(testCacheDir, { recursive: true });

console.log('\n' + '='.repeat(50));
console.log(`Interpreter Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/interpreter_test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement KimchiInterpreter**

Create `src/interpreter.js`:

```javascript
// KimchiLang Interpreter — cached transpiler for direct script execution

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { compile } from './index.js';

// Read runtime source once at module load, strip ES module syntax for inlining
const RUNTIME_SOURCE = readFileSync(new URL('./runtime.js', import.meta.url), 'utf-8');
const RUNTIME_INLINE = RUNTIME_SOURCE
  .replace(/^export /gm, '')
  .replace(/^import .+$/gm, '');

export class KimchiInterpreter {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || null;
  }

  prepare(source, options = {}) {
    const hash = createHash('sha256').update(source).digest('hex').slice(0, 16);

    // Check cache
    if (this.cacheDir) {
      const cacheFile = join(this.cacheDir, `${hash}.mjs`);
      if (existsSync(cacheFile)) {
        return readFileSync(cacheFile, 'utf-8');
      }
    }

    // Compile via existing pipeline
    const javascript = compile(source, {
      skipLint: options.skipLint,
      showLintWarnings: true,
      basePath: options.basePath,
    });

    // Wrap: inline runtime, remove imports, make callable
    const wrapped = this._wrap(javascript, hash);

    // Write to cache
    if (this.cacheDir) {
      if (!existsSync(this.cacheDir)) {
        mkdirSync(this.cacheDir, { recursive: true });
      }
      writeFileSync(join(this.cacheDir, `${hash}.mjs`), wrapped);
    }

    return wrapped;
  }

  getCachePath(source) {
    const hash = createHash('sha256').update(source).digest('hex').slice(0, 16);
    return this.cacheDir ? join(this.cacheDir, `${hash}.mjs`) : null;
  }

  _wrap(javascript, hash) {
    const withoutImport = javascript.replace(/^import .* from '.*kimchi-runtime\.js';\n?/m, '');
    const withoutExport = withoutImport.replace(
      /^export default (?:async )?function/m,
      'const _module = async function'
    );
    return `// kimchi-cache: ${hash}\n${RUNTIME_INLINE}\n${withoutExport}\nawait _module({});\n`;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/interpreter_test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/interpreter.js test/interpreter_test.js
git commit -m "feat: add KimchiInterpreter with cached transpilation"
```

---

### Task 2: CLI integration — runFile and runTests use interpreter

**Files:**
- Modify: `src/cli.js`

- [ ] **Step 1: Replace runFile**

Find `async function runFile(filePath, options = {})` in `src/cli.js`. Replace the entire function with:

```javascript
async function runFile(filePath, options = {}) {
  const { KimchiInterpreter } = await import('./interpreter.js');

  const projectRoot = findProjectRoot(dirname(resolve(filePath)));
  const cacheDir = join(projectRoot, '.kimchi-cache');
  const interp = new KimchiInterpreter({ cacheDir });
  const source = readFileSync(resolve(filePath), 'utf-8');

  try {
    const code = interp.prepare(source, {
      basePath: dirname(resolve(filePath)),
      skipLint: options.skipLint,
    });

    if (options.debug) {
      console.log(`Cache dir: ${cacheDir}`);
      console.log('\n--- Cached JavaScript ---\n');
      console.log(code);
      console.log('\n--- Output ---\n');
    }

    const cachePath = interp.getCachePath(source);
    execSync(`node "${cachePath}"`, {
      stdio: 'inherit',
      cwd: dirname(resolve(filePath))
    });
  } catch (error) {
    if (error.status) {
      process.exit(error.status);
    }
    console.error('Error:', error.message);
    if (options.debug) console.error(error.stack);
    process.exit(1);
  }
}
```

- [ ] **Step 2: Replace runTests**

Find `async function runTests(filePath, options = {})`. Replace with:

```javascript
async function runTests(filePath, options = {}) {
  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const { KimchiInterpreter } = await import('./interpreter.js');
  const source = readFileSync(resolve(filePath), 'utf-8');
  const interp = new KimchiInterpreter(); // no persistent cache for tests

  try {
    const code = interp.prepare(source, {
      basePath: dirname(resolve(filePath)),
    });

    // Append test runner invocation
    const testCode = code.replace(
      /await _module\(\{\}\);\s*$/,
      'await _module({});\nawait _runTests();\n'
    );

    const os = await import('os');
    const crypto = await import('crypto');
    const tempFile = join(os.default.tmpdir(), `kimchi_test_${crypto.default.randomBytes(8).toString('hex')}.mjs`);
    writeFileSync(tempFile, testCode);

    try {
      execSync(`node "${tempFile}"`, {
        stdio: 'inherit',
        cwd: dirname(resolve(filePath))
      });
    } finally {
      try { const fs = await import('fs'); fs.default.unlinkSync(tempFile); } catch {}
    }
  } catch (error) {
    if (error.status) process.exit(error.status);
    console.error('Test Error:', error.message);
    if (options.debug) console.error(error.stack);
    process.exit(1);
  }
}
```

- [ ] **Step 3: Test both**

```bash
PATH="/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin:$PATH"
rm -rf .kimchi-cache
node src/cli.js run examples/hello.kimchi
# Should print: Hello, World!
ls .kimchi-cache/
# Should show a .mjs file

node src/cli.js test examples/test_example.km 2>&1 | grep -c "✓"
# Should show passing test count
```

- [ ] **Step 4: Commit**

```bash
git add src/cli.js
git commit -m "feat: runFile and runTests use KimchiInterpreter"
```

---

### Task 3: stdin support and cache clear

**Files:**
- Modify: `src/cli.js`

- [ ] **Step 1: Add stdin handling**

In the `default:` case of the command switch, find the final `else` that shows help. Replace it with:

```javascript
      } else if (!process.stdin.isTTY) {
        // Piped stdin — read and execute
        const chunks = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        const source = Buffer.concat(chunks).toString('utf-8');
        const { KimchiInterpreter } = await import('./interpreter.js');
        const interp = new KimchiInterpreter();
        try {
          const code = interp.prepare(source);
          const os = await import('os');
          const crypto = await import('crypto');
          const tempFile = join(os.default.tmpdir(), `kimchi_stdin_${crypto.default.randomBytes(4).toString('hex')}.mjs`);
          writeFileSync(tempFile, code);
          try {
            execSync(`node "${tempFile}"`, { stdio: 'inherit' });
          } finally {
            try { const fs = await import('fs'); fs.default.unlinkSync(tempFile); } catch {}
          }
        } catch (error) {
          console.error('Error:', error.message);
          process.exit(1);
        }
      } else {
        console.log(HELP);
      }
```

- [ ] **Step 2: Add cache clear command**

In the command switch, add before the `default:` case:

```javascript
    case 'cache': {
      if (options.file === 'clear') {
        const projectRoot = findProjectRoot(process.cwd());
        const cacheDir = join(projectRoot, '.kimchi-cache');
        if (existsSync(cacheDir)) {
          const { rmSync } = await import('fs');
          rmSync(cacheDir, { recursive: true });
          console.log('Cache cleared.');
        } else {
          console.log('No cache to clear.');
        }
      } else {
        console.log('Usage: kimchi cache clear');
      }
      break;
    }
```

- [ ] **Step 3: Add to help text**

Find the HELP string and add:
```
  cache clear           Clear transpilation cache
```

- [ ] **Step 4: Test stdin and cache clear**

```bash
echo 'print "hello from stdin"' | node src/cli.js
# Should print: hello from stdin

node src/cli.js run examples/hello.kimchi
ls .kimchi-cache/
node src/cli.js cache clear
ls .kimchi-cache/ 2>&1
# Should say "No such file or directory"
```

- [ ] **Step 5: Commit**

```bash
git add src/cli.js
git commit -m "feat: add stdin execution and cache clear command"
```

---

### Task 4: End-to-end verification and docs

**Files:**
- Create: `examples/shebang_test.km`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create shebang example**

Create `examples/shebang_test.km`:

```kimchi
#!/usr/bin/env kimchi
print "Shebang works!"
dec x = 42
print "The answer is ${x}"
```

- [ ] **Step 2: Run all examples through interpreter**

```bash
PATH="/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin:$PATH"
rm -rf .kimchi-cache

for file in examples/hello.kimchi examples/fibonacci.kimchi examples/basic.kimchi examples/task_runner.km examples/memo_fibonacci.km examples/new_features.kimchi examples/shebang_test.km; do
  echo "--- $(basename $file) ---"
  node src/cli.js run "$file" 2>&1 | head -3
  echo ""
done
```

- [ ] **Step 3: Run all test suites**

```bash
node test/test.js 2>&1 | tail -3
node test/interpreter_test.js 2>&1 | tail -3
node test/validator_test.js 2>&1 | tail -3
node test/lsp_test.js 2>&1 | tail -3
node test/stdlib_test.js 2>&1 | tail -3
```

- [ ] **Step 4: Update CLAUDE.md**

Add `cache clear` to the Commands section and note that `run` uses cached transpilation.

- [ ] **Step 5: Commit**

```bash
git add examples/shebang_test.km CLAUDE.md
git commit -m "feat: add shebang example, update docs for interpreter"
```
