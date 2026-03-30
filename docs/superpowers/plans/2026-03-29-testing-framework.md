# Testing Framework Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lifecycle hooks, `.not` modifier, `.only`/`.skip` modifiers, and 4 new matchers to KimchiLang's built-in testing framework.

**Architecture:** Most changes are to the injected JavaScript runtime in generator.js (lines 206-272). The parser needs small changes for `.not` on expect statements and `.only`/`.skip` on test/describe blocks. New lifecycle hook keywords need lexer+parser+generator additions. All features are backward compatible.

**Tech Stack:** Node.js ES modules, zero dependencies. Custom test harness in test/test.js.

**Spec:** `docs/superpowers/specs/2026-03-29-testing-framework-design.md`

---

## File Map

| File | Changes |
|------|---------|
| `src/lexer.js` | Add tokens: `BEFORE_ALL`, `AFTER_ALL`, `BEFORE_EACH`, `AFTER_EACH` |
| `src/parser.js` | Add node types for hooks. Modify `parseTestBlock`/`parseDescribeBlock` for `.only`/`.skip`. Modify `parseExpectStatement` for `.not`. |
| `src/generator.js` | Rewrite runtime (lines 206-272) with hooks, `.not`, `.only`/`.skip`, new matchers. Update `visitTestBlock`, `visitDescribeBlock`, `visitExpectStatement`. Add visitors for hook blocks. |
| `test/test.js` | Add test sections for each feature. |

---

### Task 1: New Matchers and `.not` Modifier — Runtime

The simplest changes. Modify the runtime `_expect` function to add 4 new matchers and a `.not` property.

**Files:**
- Modify: `src/generator.js:228-246` (the `_expect` function in runtime)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/test.js` before the summary output:

```javascript
// --- Testing Framework Enhancement Tests ---
console.log('\n--- Testing Framework Enhancements ---\n');

test('Runtime: new matchers in compiled output', () => {
  const js = generate(parse(tokenize('test "x" { expect(1).toBeDefined() }')));
  assertContains(js, 'toBeDefined');
  assertContains(js, 'toBeUndefined');
  assertContains(js, 'toBeCloseTo');
  assertContains(js, 'toBeInstanceOf');
});

test('Runtime: .not modifier in compiled output', () => {
  const js = generate(parse(tokenize('test "x" { expect(1).toBe(1) }')));
  assertContains(js, 'get not()');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Rewrite `_expect` function in runtime**

In `src/generator.js`, replace lines 228-246 (the `_expect` function) with this expanded version. The function should still be emitted via `this.emitLine()` calls inside `emitRuntimeExtensions()`:

Replace the block from `this.emitLine('function _expect(actual) {');` through the closing `this.emitLine('}');` for `_expect`:

```javascript
    this.emitLine('function _expect(actual) {');
    this.pushIndent();
    this.emitLine('const matchers = {');
    this.pushIndent();
    this.emitLine('toBe(expected) { if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`); },');
    this.emitLine('toEqual(expected) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)} to equal ${JSON.stringify(actual)}`); },');
    this.emitLine('toContain(item) { if (!actual.includes(item)) throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`); },');
    this.emitLine('toBeNull() { if (actual !== null) throw new Error(`Expected null but got ${JSON.stringify(actual)}`); },');
    this.emitLine('toBeTruthy() { if (!actual) throw new Error(`Expected truthy but got ${JSON.stringify(actual)}`); },');
    this.emitLine('toBeFalsy() { if (actual) throw new Error(`Expected falsy but got ${JSON.stringify(actual)}`); },');
    this.emitLine('toBeGreaterThan(n) { if (actual <= n) throw new Error(`Expected ${actual} > ${n}`); },');
    this.emitLine('toBeLessThan(n) { if (actual >= n) throw new Error(`Expected ${actual} < ${n}`); },');
    this.emitLine('toHaveLength(n) { if (actual.length !== n) throw new Error(`Expected length ${n} but got ${actual.length}`); },');
    this.emitLine('toMatch(pattern) { if (!pattern.test(actual)) throw new Error(`Expected ${JSON.stringify(actual)} to match ${pattern}`); },');
    this.emitLine('toThrow(msg) { try { actual(); throw new Error("Expected to throw"); } catch(e) { if (msg && !e.message.includes(msg)) throw new Error(`Expected error containing "${msg}" but got "${e.message}"`); } },');
    this.emitLine('toBeDefined() { if (actual === undefined) throw new Error(`Expected value to be defined but got undefined`); },');
    this.emitLine('toBeUndefined() { if (actual !== undefined) throw new Error(`Expected undefined but got ${JSON.stringify(actual)}`); },');
    this.emitLine('toBeCloseTo(num, digits = 2) { const precision = Math.pow(10, -digits) / 2; if (Math.abs(actual - num) >= precision) throw new Error(`Expected ${actual} to be close to ${num} (precision: ${digits} digits)`); },');
    this.emitLine('toBeInstanceOf(type) { if (actual?._id !== type?._id) throw new Error(`Expected instance of ${type?._id || type} but got ${actual?._id || actual}`); },');
    this.popIndent();
    this.emitLine('};');
    this.emitLine('const notMatchers = {};');
    this.emitLine('for (const [name, fn] of Object.entries(matchers)) {');
    this.pushIndent();
    this.emitLine('notMatchers[name] = (...args) => {');
    this.pushIndent();
    this.emitLine('let threw = false;');
    this.emitLine('try { fn(...args); } catch(e) { threw = true; }');
    this.emitLine('if (!threw) throw new Error(`Expected not.${name} to fail but it passed`);');
    this.popIndent();
    this.emitLine('};');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('Object.defineProperty(matchers, "not", { get() { return notMatchers; } });');
    this.emitLine('return matchers;');
    this.popIndent();
    this.emitLine('}');
```

- [ ] **Step 4: Run all tests**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat: add new matchers (toBeDefined, toBeUndefined, toBeCloseTo, toBeInstanceOf) and .not modifier to test runtime"
```

---

### Task 2: `.not` Modifier — Parser

The parser needs to recognize `expect(x).not.matcher(y)` and set a `negated` flag.

**Files:**
- Modify: `src/parser.js:2173-2201` (parseExpectStatement)
- Modify: `src/generator.js:1428-1472` (visitExpectStatement)
- Test: `test/test.js`

- [ ] **Step 1: Write failing test**

```javascript
test('Parse expect with .not modifier', () => {
  const ast = parse(tokenize('expect(x).not.toBe(5)'));
  const stmt = ast.body[0];
  assertEqual(stmt.type, 'ExpectStatement');
  assertEqual(stmt.negated, true);
  assertEqual(stmt.matcher, 'toBe');
});

test('Parse expect without .not', () => {
  const ast = parse(tokenize('expect(x).toBe(5)'));
  const stmt = ast.body[0];
  assertEqual(stmt.negated, false);
});

test('Generate expect with .not', () => {
  const js = generate(parse(tokenize('expect(x).not.toBe(5)')));
  assertContains(js, '_expect(x).not.toBe(');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`
Expected: FAIL — parser doesn't recognize `.not.`

- [ ] **Step 3: Modify parseExpectStatement for .not**

In `src/parser.js`, replace `parseExpectStatement()` (lines 2173-2201):

```javascript
  parseExpectStatement() {
    this.expect(TokenType.EXPECT, 'Expected expect');
    this.expect(TokenType.LPAREN, 'Expected ( after expect');

    const actual = this.parseExpression();

    this.expect(TokenType.RPAREN, 'Expected ) after expect value');
    this.expect(TokenType.DOT, 'Expected . after expect()');

    // Check for .not modifier
    let negated = false;
    if (this.check(TokenType.IDENTIFIER) && this.tokens[this.pos].value === 'not') {
      this.advance(); // consume 'not'
      negated = true;
      this.expect(TokenType.DOT, 'Expected . after not');
    }

    // Parse matcher: toBe, toEqual, toContain, etc.
    const matcher = this.expect(TokenType.IDENTIFIER, 'Expected matcher name').value;

    this.expect(TokenType.LPAREN, 'Expected ( after matcher');

    // Parse expected value (optional for some matchers like toBeNull)
    let expected = null;
    if (!this.check(TokenType.RPAREN)) {
      expected = this.parseExpression();
    }

    this.expect(TokenType.RPAREN, 'Expected ) after matcher value');

    return {
      type: NodeType.ExpectStatement,
      actual,
      matcher,
      expected,
      negated,
    };
  }
```

- [ ] **Step 4: Modify visitExpectStatement for negated flag**

In `src/generator.js`, update `visitExpectStatement()` (lines 1428-1472). Add the `not.` prefix when negated:

```javascript
  visitExpectStatement(node) {
    const actual = this.visitExpression(node.actual);
    const matcher = node.matcher;
    const expected = node.expected ? this.visitExpression(node.expected) : '';
    const not = node.negated ? 'not.' : '';

    switch (matcher) {
      case 'toBe':
        this.emitLine(`_expect(${actual}).${not}toBe(${expected});`);
        break;
      case 'toEqual':
        this.emitLine(`_expect(${actual}).${not}toEqual(${expected});`);
        break;
      case 'toContain':
        this.emitLine(`_expect(${actual}).${not}toContain(${expected});`);
        break;
      case 'toBeNull':
        this.emitLine(`_expect(${actual}).${not}toBeNull();`);
        break;
      case 'toBeTruthy':
        this.emitLine(`_expect(${actual}).${not}toBeTruthy();`);
        break;
      case 'toBeFalsy':
        this.emitLine(`_expect(${actual}).${not}toBeFalsy();`);
        break;
      case 'toBeGreaterThan':
        this.emitLine(`_expect(${actual}).${not}toBeGreaterThan(${expected});`);
        break;
      case 'toBeLessThan':
        this.emitLine(`_expect(${actual}).${not}toBeLessThan(${expected});`);
        break;
      case 'toThrow':
        this.emitLine(`_expect(${actual}).${not}toThrow(${expected});`);
        break;
      case 'toMatch':
        this.emitLine(`_expect(${actual}).${not}toMatch(${expected});`);
        break;
      case 'toHaveLength':
        this.emitLine(`_expect(${actual}).${not}toHaveLength(${expected});`);
        break;
      default:
        this.emitLine(`_expect(${actual}).${not}${matcher}(${expected});`);
    }
  }
```

- [ ] **Step 5: Run all tests**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/parser.js src/generator.js test/test.js
git commit -m "feat: add .not modifier to expect statements in parser and generator"
```

---

### Task 3: `test.only` / `test.skip` / `describe.only` / `describe.skip` — Parser

**Files:**
- Modify: `src/parser.js:2137-2171` (parseTestBlock, parseDescribeBlock)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests**

```javascript
test('Parse test.only', () => {
  const ast = parse(tokenize('test.only "critical" { assert true }'));
  assertEqual(ast.body[0].type, 'TestBlock');
  assertEqual(ast.body[0].modifier, 'only');
});

test('Parse test.skip', () => {
  const ast = parse(tokenize('test.skip "todo" { assert true }'));
  assertEqual(ast.body[0].type, 'TestBlock');
  assertEqual(ast.body[0].modifier, 'skip');
});

test('Parse test without modifier', () => {
  const ast = parse(tokenize('test "normal" { assert true }'));
  assertEqual(ast.body[0].modifier, null);
});

test('Parse describe.only', () => {
  const ast = parse(tokenize('describe.only "Auth" { test "login" { assert true } }'));
  assertEqual(ast.body[0].type, 'DescribeBlock');
  assertEqual(ast.body[0].modifier, 'only');
});

test('Parse describe.skip', () => {
  const ast = parse(tokenize('describe.skip "Legacy" { test "old" { assert true } }'));
  assertEqual(ast.body[0].type, 'DescribeBlock');
  assertEqual(ast.body[0].modifier, 'skip');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Modify parseTestBlock and parseDescribeBlock**

In `src/parser.js`, replace `parseTestBlock()` (lines 2137-2153):

```javascript
  parseTestBlock() {
    this.expect(TokenType.TEST, 'Expected test');

    // Check for .only or .skip modifier
    let modifier = null;
    if (this.match(TokenType.DOT)) {
      const mod = this.expect(TokenType.IDENTIFIER, 'Expected only or skip after test.').value;
      if (mod !== 'only' && mod !== 'skip') {
        this.error('Expected only or skip after test., got ' + mod);
      }
      modifier = mod;
    }

    const name = this.expect(TokenType.STRING, 'Expected test name').value;

    this.skipNewlines();

    const body = this.parseBlock();

    return {
      type: NodeType.TestBlock,
      name,
      body,
      modifier,
    };
  }
```

Replace `parseDescribeBlock()` (lines 2155-2171):

```javascript
  parseDescribeBlock() {
    this.expect(TokenType.DESCRIBE, 'Expected describe');

    // Check for .only or .skip modifier
    let modifier = null;
    if (this.match(TokenType.DOT)) {
      const mod = this.expect(TokenType.IDENTIFIER, 'Expected only or skip after describe.').value;
      if (mod !== 'only' && mod !== 'skip') {
        this.error('Expected only or skip after describe., got ' + mod);
      }
      modifier = mod;
    }

    const name = this.expect(TokenType.STRING, 'Expected describe name').value;

    this.skipNewlines();

    const body = this.parseBlock();

    return {
      type: NodeType.DescribeBlock,
      name,
      body,
      modifier,
    };
  }
```

- [ ] **Step 4: Run all tests**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser.js test/test.js
git commit -m "feat: add .only and .skip modifiers to test/describe parser"
```

---

### Task 4: `test.only` / `test.skip` — Generator and Runtime

**Files:**
- Modify: `src/generator.js:209-270` (runtime _test, _describe, _runTests)
- Modify: `src/generator.js:1408-1426` (visitTestBlock, visitDescribeBlock)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests**

```javascript
test('Generate test.only passes modifier', () => {
  const js = generate(parse(tokenize('test.only "critical" { assert true }')));
  assertContains(js, '_test("critical"');
  assertContains(js, '"only"');
});

test('Generate test.skip passes modifier', () => {
  const js = generate(parse(tokenize('test.skip "todo" { assert true }')));
  assertContains(js, '"skip"');
});

test('Generate describe.only passes modifier', () => {
  const js = generate(parse(tokenize('describe.only "Auth" { test "login" { assert true } }')));
  assertContains(js, '_describe("Auth"');
  assertContains(js, '"only"');
});

test('Runtime: _runTests handles skipped output', () => {
  const js = generate(parse(tokenize('test "x" { assert true }')));
  assertContains(js, 'skipped');
  assertContains(js, '_hasOnly');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Update visitTestBlock and visitDescribeBlock**

In `src/generator.js`, replace `visitTestBlock` (around line 1408):

```javascript
  visitTestBlock(node) {
    const modifier = node.modifier ? `, ${JSON.stringify(node.modifier)}` : '';
    this.emitLine(`_test(${JSON.stringify(node.name)}, async () => {`);
    this.pushIndent();
    for (const stmt of node.body.body) {
      this.visitStatement(stmt);
    }
    this.popIndent();
    this.emitLine(`}${modifier});`);
  }
```

Replace `visitDescribeBlock` (around line 1418):

```javascript
  visitDescribeBlock(node) {
    const modifier = node.modifier ? `, ${JSON.stringify(node.modifier)}` : '';
    this.emitLine(`_describe(${JSON.stringify(node.name)}, () => {`);
    this.pushIndent();
    for (const stmt of node.body.body) {
      this.visitStatement(stmt);
    }
    this.popIndent();
    this.emitLine(`}${modifier});`);
  }
```

- [ ] **Step 4: Rewrite runtime _test, _describe, _runTests**

In `src/generator.js`, replace the runtime block from `this.emitLine('const _tests = [];');` (line 209) through `this.emitLine('}');` that closes `_runTests` (line 270) with:

```javascript
    this.emitLine('const _tests = [];');
    this.emitLine('let _currentDescribe = null;');
    this.emitLine('let _hasOnly = false;');

    // _describe with modifier support
    this.emitLine('function _describe(name, fn, modifier = null) {');
    this.pushIndent();
    this.emitLine('const prev = _currentDescribe;');
    this.emitLine('_currentDescribe = { name, tests: [], parent: prev, modifier };');
    this.emitLine('if (modifier === "only") _hasOnly = true;');
    this.emitLine('fn();');
    this.emitLine('if (prev) { prev.tests.push(_currentDescribe); }');
    this.emitLine('else { _tests.push(_currentDescribe); }');
    this.emitLine('_currentDescribe = prev;');
    this.popIndent();
    this.emitLine('}');

    // _test with modifier support
    this.emitLine('function _test(name, fn, modifier = null) {');
    this.pushIndent();
    this.emitLine('if (modifier === "only") _hasOnly = true;');
    this.emitLine('const test = { name, fn, describe: _currentDescribe, modifier };');
    this.emitLine('if (_currentDescribe) { _currentDescribe.tests.push(test); }');
    this.emitLine('else { _tests.push(test); }');
    this.popIndent();
    this.emitLine('}');

    // _runTests with only/skip logic
    this.emitLine('async function _runTests() {');
    this.pushIndent();
    this.emitLine('let passed = 0, failed = 0, skipped = 0;');
    this.emitLine('function shouldSkip(item, parentSkipped) {');
    this.pushIndent();
    this.emitLine('if (item.modifier === "skip" || parentSkipped) return true;');
    this.emitLine('if (_hasOnly && item.modifier !== "only") {');
    this.pushIndent();
    this.emitLine('// Check if any child has .only (for describes)');
    this.emitLine('if (item.tests) { return !hasOnly(item); }');
    this.emitLine('return true;');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('return false;');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('function hasOnly(item) {');
    this.pushIndent();
    this.emitLine('if (item.modifier === "only") return true;');
    this.emitLine('if (item.tests) return item.tests.some(t => hasOnly(t));');
    this.emitLine('return false;');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('async function runItem(item, indent = "", parentSkipped = false) {');
    this.pushIndent();
    this.emitLine('const skip = shouldSkip(item, parentSkipped);');
    this.emitLine('if (item.fn) {');
    this.pushIndent();
    this.emitLine('if (skip) { console.log(indent + "○ " + item.name + " (skipped)"); skipped++; return; }');
    this.emitLine('try { await item.fn(); console.log(indent + "✓ " + item.name); passed++; }');
    this.emitLine('catch (e) { console.log(indent + "✗ " + item.name); console.log(indent + "  " + e.message); failed++; }');
    this.popIndent();
    this.emitLine('} else {');
    this.pushIndent();
    this.emitLine('console.log(indent + item.name);');
    this.emitLine('const childSkipped = skip || item.modifier === "skip";');
    this.emitLine('for (const t of item.tests) await runItem(t, indent + "  ", childSkipped);');
    this.popIndent();
    this.emitLine('}');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('for (const item of _tests) await runItem(item);');
    this.emitLine('const total = passed + failed + skipped;');
    this.emitLine('const parts = [`${total} tests`, `${passed} passed`, `${failed} failed`];');
    this.emitLine('if (skipped > 0) parts.push(`${skipped} skipped`);');
    this.emitLine('console.log("\\n" + parts.join(", "));');
    this.emitLine('return { passed, failed, skipped };');
    this.popIndent();
    this.emitLine('}');
```

- [ ] **Step 5: Run all tests**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat: add .only/.skip runtime support with filtering and skip output"
```

---

### Task 5: Lifecycle Hooks — Lexer and Parser

**Files:**
- Modify: `src/lexer.js:3-99` (TokenType), `src/lexer.js:101-141` (KEYWORDS)
- Modify: `src/parser.js:6-68` (NodeType), `src/parser.js:333-353` (parseStatement)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests**

```javascript
test('Tokenize beforeEach keyword', () => {
  const tokens = tokenize('beforeEach { }');
  assertEqual(tokens[0].type, 'BEFORE_EACH');
});

test('Tokenize afterAll keyword', () => {
  const tokens = tokenize('afterAll { }');
  assertEqual(tokens[0].type, 'AFTER_ALL');
});

test('Parse beforeEach block', () => {
  const ast = parse(tokenize('describe "x" { beforeEach { dec x = 1 } test "t" { assert true } }'));
  const describe = ast.body[0];
  assertEqual(describe.body.body[0].type, 'BeforeEachBlock');
});

test('Parse afterAll block', () => {
  const ast = parse(tokenize('describe "x" { afterAll { print "done" } test "t" { assert true } }'));
  const describe = ast.body[0];
  assertEqual(describe.body.body[0].type, 'AfterAllBlock');
});

test('Parse all four hook types', () => {
  const source = 'describe "x" { beforeAll { } afterAll { } beforeEach { } afterEach { } test "t" { assert true } }';
  const ast = parse(tokenize(source));
  const body = ast.body[0].body.body;
  assertEqual(body[0].type, 'BeforeAllBlock');
  assertEqual(body[1].type, 'AfterAllBlock');
  assertEqual(body[2].type, 'BeforeEachBlock');
  assertEqual(body[3].type, 'AfterEachBlock');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Add hook tokens to lexer**

In `src/lexer.js`, add to TokenType enum (after GUARD):

```javascript
  BEFORE_ALL: 'BEFORE_ALL',
  AFTER_ALL: 'AFTER_ALL',
  BEFORE_EACH: 'BEFORE_EACH',
  AFTER_EACH: 'AFTER_EACH',
```

Add to KEYWORDS map:

```javascript
  'beforeAll': TokenType.BEFORE_ALL,
  'afterAll': TokenType.AFTER_ALL,
  'beforeEach': TokenType.BEFORE_EACH,
  'afterEach': TokenType.AFTER_EACH,
```

- [ ] **Step 4: Add hook node types and parsing to parser**

In `src/parser.js`, add to NodeType enum:

```javascript
  BeforeAllBlock: 'BeforeAllBlock',
  AfterAllBlock: 'AfterAllBlock',
  BeforeEachBlock: 'BeforeEachBlock',
  AfterEachBlock: 'AfterEachBlock',
```

In `parseStatement()`, before the test/describe handling (around line 335), add:

```javascript
    // Lifecycle hooks
    if (this.check(TokenType.BEFORE_ALL)) {
      this.advance();
      return { type: NodeType.BeforeAllBlock, body: this.parseBlock() };
    }
    if (this.check(TokenType.AFTER_ALL)) {
      this.advance();
      return { type: NodeType.AfterAllBlock, body: this.parseBlock() };
    }
    if (this.check(TokenType.BEFORE_EACH)) {
      this.advance();
      return { type: NodeType.BeforeEachBlock, body: this.parseBlock() };
    }
    if (this.check(TokenType.AFTER_EACH)) {
      this.advance();
      return { type: NodeType.AfterEachBlock, body: this.parseBlock() };
    }
```

- [ ] **Step 5: Run all tests**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/lexer.js src/parser.js test/test.js
git commit -m "feat: add lifecycle hook keywords and parsing (beforeAll, afterAll, beforeEach, afterEach)"
```

---

### Task 6: Lifecycle Hooks — Generator and Runtime

**Files:**
- Modify: `src/generator.js` (visitStatement switch, runtime, new visit methods)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests**

```javascript
test('Generate beforeEach hook', () => {
  const js = generate(parse(tokenize('describe "x" { beforeEach { dec x = 1 } test "t" { assert true } }')));
  assertContains(js, '_beforeEach(');
});

test('Generate afterAll hook', () => {
  const js = generate(parse(tokenize('describe "x" { afterAll { print "done" } test "t" { assert true } }')));
  assertContains(js, '_afterAll(');
});

test('Runtime includes hook functions', () => {
  const js = generate(parse(tokenize('test "x" { assert true }')));
  assertContains(js, '_beforeAll');
  assertContains(js, '_afterAll');
  assertContains(js, '_beforeEach');
  assertContains(js, '_afterEach');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Add hook visitor methods**

In `src/generator.js`, add to the `visitStatement` switch (near the TestBlock/DescribeBlock cases):

```javascript
      case NodeType.BeforeAllBlock:
        this.visitHookBlock('_beforeAll', node);
        break;
      case NodeType.AfterAllBlock:
        this.visitHookBlock('_afterAll', node);
        break;
      case NodeType.BeforeEachBlock:
        this.visitHookBlock('_beforeEach', node);
        break;
      case NodeType.AfterEachBlock:
        this.visitHookBlock('_afterEach', node);
        break;
```

Add the visitor method (near the other test visitor methods):

```javascript
  visitHookBlock(hookName, node) {
    this.emitLine(`${hookName}(async () => {`);
    this.pushIndent();
    for (const stmt of node.body.body) {
      this.visitStatement(stmt);
    }
    this.popIndent();
    this.emitLine('});');
  }
```

- [ ] **Step 4: Add hook registration and execution to runtime**

In the runtime section of `src/generator.js`, add after the `_currentDescribe` declaration:

```javascript
    // Hook registration functions
    this.emitLine('function _beforeAll(fn) { if (_currentDescribe) { _currentDescribe.beforeAll = _currentDescribe.beforeAll || []; _currentDescribe.beforeAll.push(fn); } }');
    this.emitLine('function _afterAll(fn) { if (_currentDescribe) { _currentDescribe.afterAll = _currentDescribe.afterAll || []; _currentDescribe.afterAll.push(fn); } }');
    this.emitLine('function _beforeEach(fn) { if (_currentDescribe) { _currentDescribe.beforeEach = _currentDescribe.beforeEach || []; _currentDescribe.beforeEach.push(fn); } }');
    this.emitLine('function _afterEach(fn) { if (_currentDescribe) { _currentDescribe.afterEach = _currentDescribe.afterEach || []; _currentDescribe.afterEach.push(fn); } }');
```

In the `_runTests` function, modify the `runItem` function to call hooks. Replace the `else` branch (the describe handler) inside `runItem`:

Find the line `this.emitLine('console.log(indent + item.name);');` inside the else branch and replace that whole else block with:

```javascript
    this.emitLine('} else {');
    this.pushIndent();
    this.emitLine('console.log(indent + item.name);');
    this.emitLine('const childSkipped = skip || item.modifier === "skip";');
    this.emitLine('if (!childSkipped && item.beforeAll) { for (const h of item.beforeAll) await h(); }');
    this.emitLine('for (const t of item.tests) {');
    this.pushIndent();
    this.emitLine('if (!childSkipped && t.fn && !shouldSkip(t, childSkipped)) {');
    this.pushIndent();
    this.emitLine('if (item.beforeEach) { for (const h of item.beforeEach) await h(); }');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('await runItem(t, indent + "  ", childSkipped);');
    this.emitLine('if (!childSkipped && t.fn && !shouldSkip(t, childSkipped)) {');
    this.pushIndent();
    this.emitLine('if (item.afterEach) { for (const h of item.afterEach) await h(); }');
    this.popIndent();
    this.emitLine('}');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('if (!childSkipped && item.afterAll) { for (const h of item.afterAll) await h(); }');
    this.popIndent();
    this.emitLine('}');
```

- [ ] **Step 5: Run all tests**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat: add lifecycle hooks runtime (beforeAll, afterAll, beforeEach, afterEach)"
```

---

### Task 7: End-to-End Test with `kimchi test`

Write a KimchiLang test file that exercises all new features and run it with `kimchi test`.

**Files:**
- Create: `examples/testing/framework_features.test.km`
- Test: run via `kimchi test`

- [ ] **Step 1: Create the test file**

```kimchi
// Test file for testing framework enhancements

dec counter = { value: 0 }

describe "Lifecycle hooks" {
  beforeAll {
    counter.value = 100
  }

  afterAll {
    print "  (afterAll ran)"
  }

  beforeEach {
    // Reset before each test
  }

  afterEach {
    // Cleanup after each test
  }

  test "beforeAll sets counter" {
    expect(counter.value).toBe(100)
  }

  test "second test also sees counter" {
    expect(counter.value).toBe(100)
  }
}

describe "New matchers" {
  test "toBeDefined" {
    expect(1).toBeDefined()
    expect("hello").toBeDefined()
  }

  test "toBeUndefined" {
    dec obj = { a: 1 }
    expect(obj.b).toBeUndefined()
  }

  test "toBeCloseTo" {
    dec result = 0.1 + 0.2
    expect(result).toBeCloseTo(0.3, 5)
  }
}

describe ".not modifier" {
  test "not.toBe" {
    expect(1).not.toBe(2)
  }

  test "not.toBeNull" {
    expect("hello").not.toBeNull()
  }

  test "not.toContain" {
    dec items = [1, 2, 3]
    expect(items).not.toContain(4)
  }

  test "not.toBeUndefined" {
    expect(42).not.toBeUndefined()
  }
}

describe.skip "Skipped suite" {
  test "this should be skipped" {
    assert false, "Should not run"
  }
}

test.skip "Individual skipped test" {
  assert false, "Should not run"
}
```

- [ ] **Step 2: Run with kimchi test**

Run: `PATH="/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin:$PATH" node src/cli.js test examples/testing/framework_features.test.km`

Expected output should show:
- Lifecycle hooks tests passing
- New matchers tests passing
- .not modifier tests passing
- Skipped suite showing `○` markers
- Skipped individual test showing `○`
- Summary with skipped count

- [ ] **Step 3: Commit**

```bash
git add examples/testing/framework_features.test.km
git commit -m "test: add end-to-end test file for testing framework enhancements"
```

---

### Task 8: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add testing framework info to CLAUDE.md**

In the "Test Structure" section, add:

```markdown
## Built-in Testing Framework

KimchiLang has a built-in test runner invoked with `kimchi test <file>`. Syntax:

- `test "name" { ... }` / `describe "name" { ... }` — test and suite blocks
- `expect(actual).matcher(expected)` — 15 matchers: `toBe`, `toEqual`, `toContain`, `toBeNull`, `toBeTruthy`, `toBeFalsy`, `toBeGreaterThan`, `toBeLessThan`, `toHaveLength`, `toMatch`, `toThrow`, `toBeDefined`, `toBeUndefined`, `toBeCloseTo`, `toBeInstanceOf`
- `expect(x).not.toBe(y)` — `.not` inverts any matcher
- `test.only` / `test.skip` / `describe.only` / `describe.skip` — focus or skip tests (file-scoped)
- `beforeAll { }` / `afterAll { }` / `beforeEach { }` / `afterEach { }` — lifecycle hooks inside `describe`
- `assert condition, "message"` — simple assertion
- Mocking via dependency injection: `as svc dep module({ "dep.path": mock })`
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with testing framework features"
```
