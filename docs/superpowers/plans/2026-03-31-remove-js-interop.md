# Remove js { } Interop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `js { }` blocks from KimchiLang — migrate all usage to `extern` + `Foo.new()`, then delete compiler support.

**Architecture:** First migrate stdlib and examples away from `js { }` (Tasks 1-3). Then remove `js { }` from the compiler pipeline: lexer, parser, type checker, generator (Task 4). Then update tests (Task 5) and docs (Task 6).

**Tech Stack:** Pure JavaScript, zero dependencies.

---

### Task 1: Migrate stdlib/bitwise.km to extern

**Files:**
- Create: `stdlib/_bitwise_helpers.js`
- Modify: `stdlib/bitwise.km`
- Modify: `test/stdlib_test.js`
- Test: `test/stdlib_test.js`

- [ ] **Step 1: Create the JS helper file**

Create `stdlib/_bitwise_helpers.js`:

```javascript
export function band(a, b) { return a & b; }
export function bor(a, b) { return a | b; }
export function bxor(a, b) { return a ^ b; }
export function bnot(a) { return ~a; }
export function lshift(a, b) { return a << b; }
export function rshift(a, b) { return a >> b; }
export function urshift(a, b) { return a >>> b; }
```

- [ ] **Step 2: Rewrite stdlib/bitwise.km to use extern**

Replace the entire file content with:

```kimchi
// KimchiLang Standard Library - Bitwise Operations

extern "./_bitwise_helpers.js" {
  fn band(a: number, b: number): number
  fn bor(a: number, b: number): number
  fn bxor(a: number, b: number): number
  fn bnot(a: number): number
  fn lshift(a: number, b: number): number
  fn rshift(a: number, b: number): number
  fn urshift(a: number, b: number): number
}

expose fn _describe() {
  return "Bitwise operations: band, bor, bxor, bnot, lshift, rshift, urshift"
}

expose fn band(a, b) { return band(a, b) }
expose fn bor(a, b) { return bor(a, b) }
expose fn bxor(a, b) { return bxor(a, b) }
expose fn bnot(a) { return bnot(a) }
expose fn lshift(a, b) { return lshift(a, b) }
expose fn rshift(a, b) { return rshift(a, b) }
expose fn urshift(a, b) { return urshift(a, b) }
```

Wait — that won't work because the extern names conflict with the exposed function names. Instead, import with the extern and re-export directly. The simpler approach: just extern and have users call the extern'd functions via the module:

```kimchi
// KimchiLang Standard Library - Bitwise Operations

extern "./_bitwise_helpers.js" {
  fn _band(a: number, b: number): number
  fn _bor(a: number, b: number): number
  fn _bxor(a: number, b: number): number
  fn _bnot(a: number): number
  fn _lshift(a: number, b: number): number
  fn _rshift(a: number, b: number): number
  fn _urshift(a: number, b: number): number
}

expose fn _describe() {
  return "Bitwise operations: band, bor, bxor, bnot, lshift, rshift, urshift"
}

expose fn band(a, b) { return _band(a, b) }
expose fn bor(a, b) { return _bor(a, b) }
expose fn bxor(a, b) { return _bxor(a, b) }
expose fn bnot(a) { return _bnot(a) }
expose fn lshift(a, b) { return _lshift(a, b) }
expose fn rshift(a, b) { return _rshift(a, b) }
expose fn urshift(a, b) { return _urshift(a, b) }
```

And update `_bitwise_helpers.js` to use underscored names:

```javascript
export function _band(a, b) { return a & b; }
export function _bor(a, b) { return a | b; }
export function _bxor(a, b) { return a ^ b; }
export function _bnot(a) { return ~a; }
export function _lshift(a, b) { return a << b; }
export function _rshift(a, b) { return a >> b; }
export function _urshift(a, b) { return a >>> b; }
```

- [ ] **Step 3: Update stdlib tests for bitwise**

In `test/stdlib_test.js`, the bitwise tests (lines 667-693) check for raw JS operators in compiled output (e.g., `a & b`). After the migration, the compiled output will call `_band(a, b)` instead. Update the tests:

Replace the operator assertion tests (lines 667-693) with:

```javascript
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
```

- [ ] **Step 4: Verify tests pass**

Run: `node test/stdlib_test.js 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add stdlib/_bitwise_helpers.js stdlib/bitwise.km test/stdlib_test.js
git commit -m "refactor(stdlib): migrate bitwise.km from js {} to extern"
```

---

### Task 2: Migrate examples away from js { }

**Files:**
- Delete: `examples/js_interop.km`
- Modify: `examples/testing/math.km`
- Modify: `examples/readme_examples.km`

- [ ] **Step 1: Delete examples/js_interop.km**

```bash
rm examples/js_interop.km
```

- [ ] **Step 2: Update examples/testing/math.km**

Replace `throw js { return new Error("..."); }` with `throw Error.new("...")`.

Find line 18: `throw js { return new Error("Cannot divide by zero"); }`
Replace with: `throw Error.new("Cannot divide by zero")`

Find line 24: `|n < 0| => throw js { return new Error("Factorial not defined for negative numbers"); }`
Replace with: `|n < 0| => throw Error.new("Factorial not defined for negative numbers")`

Find the `isPrime` function (line 42) which uses `js(n, i) { ... }` for a for-loop. Replace with KimchiLang:

```kimchi
expose fn isPrime(n) {
  guard n > 1 else { return false }
  mut i = 2
  while i * i <= n {
    guard n % i != 0 else { return false }
    i += 1
  }
  return true
}
```

- [ ] **Step 3: Update examples/readme_examples.km**

Remove the JS interop section. Find the section with `js {` blocks (around lines 290-320) and delete it entirely. The section starts with a comment like `// JavaScript Interop` or similar and contains the `js {}`, `js(name, count) {}`, `js(numbers) {}`, and `js { return Date.now(); }` examples.

- [ ] **Step 4: Verify examples compile**

```bash
node src/cli.js check examples/testing/math.km 2>&1
node src/cli.js check examples/readme_examples.km 2>&1
```

Expected: No errors for both.

- [ ] **Step 5: Commit**

```bash
git rm examples/js_interop.km
git add examples/testing/math.km examples/readme_examples.km
git commit -m "refactor(examples): remove all js {} usage from examples"
```

---

### Task 3: Update js2km reverse compiler

**Files:**
- Modify: `src/js2km.js`
- Modify: `test/test.js`

- [ ] **Step 1: Update NewExpression handler**

In `src/js2km.js`, find the `NewExpression` case (line ~492). It currently emits `js { return new X(); }`. Change to emit `X.new()`:

Replace:
```javascript
      case 'NewExpression': {
        // Emit as js { new X(...) } until Foo.new() is implemented
        const ctorName = this.visitExpression(node.callee);
        const newArgs = node.arguments.map(a => this.visitExpression(a)).join(', ');
        return `js { return new ${ctorName}(${newArgs}); }`;
      }
```

With:
```javascript
      case 'NewExpression': {
        const ctorName = this.visitExpression(node.callee);
        const newArgs = node.arguments.map(a => this.visitExpression(a)).join(', ');
        return `${ctorName}.new(${newArgs})`;
      }
```

- [ ] **Step 2: Update js2km tests**

In `test/test.js`, find the test `'js2km: new expression emits js block'` (line ~2227). Update:

Replace:
```javascript
test('js2km: new expression emits js block', () => {
  const km = convertJS('const d = new Date();');
  assertContains(km, 'js { return new Date(); }');
});
```

With:
```javascript
test('js2km: new expression emits Foo.new()', () => {
  const km = convertJS('const d = new Date();');
  assertContains(km, 'Date.new()');
});
```

Also update the Express app test (line ~2271) which asserts `js { return new Pool(`:

Find: `assertContains(km, 'js { return new Pool(');`
Replace with: `assertContains(km, 'Pool.new(');`

- [ ] **Step 3: Run tests to verify**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/js2km.js test/test.js
git commit -m "refactor(js2km): emit Foo.new() instead of js {} for constructors"
```

---

### Task 4: Remove js { } from compiler pipeline

**Files:**
- Modify: `src/lexer.js` (remove JS, JS_CONTENT tokens and raw capture)
- Modify: `src/parser.js` (remove JSBlock, parseJSBlock, parseJSBlockExpression, add error)
- Modify: `src/typechecker.js` (remove JSBlock case)
- Modify: `src/generator.js` (remove visitJSBlock, visitJSBlockExpression)

- [ ] **Step 1: Remove from lexer**

In `src/lexer.js`:

Remove `JS: 'JS',` from TokenType enum (line 39).
Remove `JS_CONTENT: 'JS_CONTENT',` from TokenType enum (line 40).
Remove `'js': TokenType.JS,` from KEYWORDS map (line ~146).
Remove the entire `if (type === TokenType.JS) { ... }` raw content capture block (lines ~463-537). This is a large block that captures raw JS content between braces.

- [ ] **Step 2: Remove from parser**

In `src/parser.js`:

Remove `JSBlock: 'JSBlock',` from NodeType enum (line 74).

Remove the `js { }` handling in `parseStatement()`:
```javascript
    if (this.check(TokenType.JS)) {
      return this.parseJSBlock();
    }
```

Remove the `js { }` handling in `parsePrimary()`:
```javascript
    if (this.check(TokenType.JS)) {
      return this.parseJSBlockExpression();
    }
```

Remove the `parseJSBlock()` method entirely (lines ~1293-1340).
Remove the `parseJSBlockExpression()` method entirely (lines ~1741-1790).

Add a helpful error message. In `parsePrimary()`, where `js` might appear as an identifier, we can't easily intercept it since `js` is no longer a keyword — it's now just an identifier. The error will naturally come from trying to use `js` as a function call, which is fine.

- [ ] **Step 3: Remove from type checker**

In `src/typechecker.js`, remove the JSBlock case from `visitStatement` (line ~549):

```javascript
      case NodeType.JSBlock:
      case NodeType.ShellBlock:
        // JS/Shell blocks are opaque - no type checking inside
        break;
```

Change to:

```javascript
      case NodeType.ShellBlock:
        // Shell blocks are opaque - no type checking inside
        break;
```

- [ ] **Step 4: Remove from generator**

In `src/generator.js`:

Remove `case NodeType.JSBlock:` and `this.visitJSBlock(node);` from `visitStatement` (lines ~704-705).

Remove `case NodeType.JSBlock:` and `return this.visitJSBlockExpression(node);` from `visitExpression` (lines ~1309-1310).

Remove the `visitJSBlock()` method entirely (lines ~902-938).
Remove the `visitJSBlockExpression()` method entirely (lines ~940-978).

- [ ] **Step 5: Verify existing tests pass**

Run: `node test/test.js 2>&1 | tail -5`
Expected: Some tests will FAIL because they use `js { }` in test source strings. Those are fixed in Task 5.

- [ ] **Step 6: Commit**

```bash
git add src/lexer.js src/parser.js src/typechecker.js src/generator.js
git commit -m "feat: remove js {} interop from compiler pipeline"
```

---

### Task 5: Update tests

**Files:**
- Modify: `test/test.js`
- Modify: `test/stdlib_test.js`

- [ ] **Step 1: Remove js { } compiler tests**

In `test/test.js`, find and remove these tests:

1. `'Opt1b: dec var passed to js() is Object.freeze-d'` (line ~1410)
2. `'Opt1b: mut var passed to js() is NOT frozen'` (line ~1415)
3. `'Opt1b: js block without params has no freeze at call site'` (line ~1420)
4. Any other test whose source string contains `js {` or `js(`.

Search for `js {` and `js(` in test source strings — each match is a test that needs to be removed.

- [ ] **Step 2: Add test for js { } producing a parse error**

Add to `test/test.js`:

```javascript
test('js {} is removed — produces parse error', () => {
  let threw = false;
  try {
    compile('js { console.log("hi"); }');
  } catch(e) {
    threw = true;
  }
  assertEqual(threw, true);
});
```

- [ ] **Step 3: Run both test suites**

Run: `node test/test.js 2>&1 | tail -5`
Run: `node test/stdlib_test.js 2>&1 | tail -5`
Expected: All tests pass, 0 failures.

- [ ] **Step 4: Commit**

```bash
git add test/test.js test/stdlib_test.js
git commit -m "test: remove js {} tests, add parse error test"
```

---

### Task 6: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/language-guide.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Update CLAUDE.md**

Remove mentions of `js { }` from the Key Runtime Patterns section. The line about `dec` vars being `Object.freeze`d when passed to `js()` blocks is no longer relevant.

Remove `js { }` from the New Language Features references.

Update the description of `src/js2km.js` to remove the `js { }` mention.

- [ ] **Step 2: Update docs/language-guide.md**

Remove or replace the "JavaScript & Shell Interop" section. Keep shell interop, remove the `js { }` example. Replace with a note pointing to `extern` declarations:

```markdown
### JavaScript Interop

Use [extern declarations](#extern-declarations) to import JavaScript modules with typed contracts. Use [`Foo.new(args)`](#constructor-syntax) for constructor calls.
```

- [ ] **Step 3: Update README.md**

In the Features section, change the JS Interop bullet. Remove `js { } escape hatch`:

Replace: `- **JS Interop** - [`extern` declarations](docs/language-guide.md#extern-declarations) for typed JS module contracts, [`Foo.new()`](docs/language-guide.md#constructor-syntax) constructor syntax, `js { }` escape hatch`

With: `- **JS Interop** - [`extern` declarations](docs/language-guide.md#extern-declarations) for typed JS module contracts, [`Foo.new()`](docs/language-guide.md#constructor-syntax) constructor syntax`

- [ ] **Step 4: Update ROADMAP.md**

Mark "Remove `js { }` interop" as done:

Replace: `- [ ] Remove `js { }` interop — blocked by extern declarations and `Foo.new()` covering all current `js { }` use cases`

With: `- [x] ~~Remove `js { }` interop~~ — replaced by extern declarations and `Foo.new()` constructor syntax`

- [ ] **Step 5: Run full test suite**

Run: `node test/test.js 2>&1 | tail -5`
Run: `node test/stdlib_test.js 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/language-guide.md README.md ROADMAP.md
git commit -m "docs: remove js {} references, mark removal as done"
```
