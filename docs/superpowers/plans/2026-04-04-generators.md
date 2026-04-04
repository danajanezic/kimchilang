# Generators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lazy generator directive blocks (`gen`) with `yield`, a `done` primitive, pipe composition, and `for...in` integration.

**Architecture:** `gen (args) { yield ... }` compiles to a JS `function*` wrapped in an IIFE that returns a next-function. The next-function hides the iterator protocol — calling it returns the next value or `done`. A `DONE` sentinel symbol backs the `done` keyword. Pipe operator extended to detect generators and return lazy wrappers. Async generators auto-detected via existing `buildAsyncMap()`.

**Tech Stack:** Pure JavaScript compiler pipeline (lexer → parser → typechecker → linter → generator). No external dependencies.

---

### Task 1: Lexer — Add GEN, YIELD, DONE Tokens

**Files:**
- Modify: `src/lexer.js:58-64` (TokenType enum)
- Modify: `src/lexer.js:164-178` (KEYWORDS map)
- Test: `test/test.js` (new tests before line 3776)

- [ ] **Step 1: Write failing test for `gen` tokenization**

Add before the test summary (line 3776) in `test/test.js`:

```javascript
// === Generator tests ===

test('Tokenize gen keyword', () => {
  const tokens = tokenize('gen { yield 1 }');
  assertEqual(tokens[0].type, 'GEN');
  assertEqual(tokens[2].type, 'YIELD');
});

test('Tokenize done keyword', () => {
  const tokens = tokenize('done');
  assertEqual(tokens[0].type, 'DONE');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL — `GEN` token not recognized

- [ ] **Step 3: Add tokens to lexer**

In `src/lexer.js`, add to TokenType enum after the `LAZY` entry (~line 64):

```javascript
GEN: 'GEN',
YIELD: 'YIELD',
DONE: 'DONE',
```

In the KEYWORDS map (~line 170), add before `'print'`:

```javascript
'gen': TokenType.GEN,
'yield': TokenType.YIELD,
'done': TokenType.DONE,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/test.js 2>&1 | tail -5`
Expected: Both new tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lexer.js test/test.js
git commit -m "feat: add GEN, YIELD, DONE tokens to lexer"
```

---

### Task 2: Parser — `done` Literal

**Files:**
- Modify: `src/parser.js:6-87` (NodeType enum — no change needed, reuses `Literal`)
- Modify: `src/parser.js:2510-2517` (parsePrimary, near null literal)
- Test: `test/test.js`

- [ ] **Step 1: Write failing test for `done` parsing**

```javascript
test('Parse done literal', () => {
  const ast = parse('dec x = done');
  const decl = ast.body[0];
  assertEqual(decl.init.type, 'Literal');
  assertEqual(decl.init.value, 'done');
  assertEqual(decl.init.raw, 'done');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL — unexpected token `done`

- [ ] **Step 3: Add `done` literal to parser**

In `src/parser.js`, in the `parsePrimary()` method, add a block near the `null` literal handling (~line 2510):

```javascript
if (this.check(TokenType.DONE)) {
  this.advance();
  return {
    type: NodeType.Literal,
    value: 'done',
    raw: 'done',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/test.js 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser.js test/test.js
git commit -m "feat: parse done as literal"
```

---

### Task 3: Parser — `yield` Expression

**Files:**
- Modify: `src/parser.js:6-87` (NodeType enum)
- Modify: `src/parser.js:1867` (parseExpression)
- Test: `test/test.js`

- [ ] **Step 1: Write failing test for `yield` parsing**

```javascript
test('Parse yield expression', () => {
  const ast = parse('dec next = gen { yield 42 }');
  const genExpr = ast.body[0].init;
  const yieldExpr = genExpr.body.body[0].expression;
  assertEqual(yieldExpr.type, 'YieldExpression');
  assertEqual(yieldExpr.argument.value, 42);
});

test('Parse bare yield (no argument)', () => {
  const ast = parse('dec next = gen { yield }');
  const genExpr = ast.body[0].init;
  const yieldExpr = genExpr.body.body[0].expression;
  assertEqual(yieldExpr.type, 'YieldExpression');
  assertEqual(yieldExpr.argument, null);
});
```

Note: These tests depend on Task 4 (`gen` block parsing) to pass. Write them now so they're ready, but they'll fail until Task 4 is done.

- [ ] **Step 2: Add YieldExpression to NodeType enum**

In `src/parser.js`, add to the NodeType enum (~line 85, before the closing `}`):

```javascript
GeneratorExpression: 'GeneratorExpression',
YieldExpression: 'YieldExpression',
```

- [ ] **Step 3: Add yield parsing**

`yield` should have lower precedence than assignment — it captures everything to its right. In `parseExpression()` (~line 1867), add a `yield` check before calling `parseAssignment()`:

```javascript
parseExpression() {
  if (this.check(TokenType.YIELD)) {
    return this.parseYield();
  }
  return this.parseAssignment();
}
```

Add the `parseYield()` method:

```javascript
parseYield() {
  this.advance(); // consume 'yield'
  let argument = null;
  // yield takes an argument unless followed by } or another statement boundary
  if (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF) && !this.isAtStatementBoundary()) {
    argument = this.parseAssignment();
  }
  return {
    type: NodeType.YieldExpression,
    argument,
  };
}
```

The `isAtStatementBoundary()` helper checks if the next token starts a new statement (a keyword like `dec`, `mut`, `fn`, `if`, `for`, `while`, `return`, `yield`, etc.). If the parser already has such a method, use it. If not, check for NEWLINE or use the existing line-tracking to detect statement boundaries — yield's argument ends at the next newline.

- [ ] **Step 4: Run tests to verify yield-only tests pass**

Run: `node test/test.js 2>&1 | tail -5`
Expected: yield tests still FAIL (need gen block from Task 4), but no parse errors on yield itself

- [ ] **Step 5: Commit**

```bash
git add src/parser.js test/test.js
git commit -m "feat: parse yield expressions"
```

---

### Task 4: Parser — `gen` Block

**Files:**
- Modify: `src/parser.js` (parsePrimary or parseExpression — add gen block parsing)
- Test: `test/test.js`

- [ ] **Step 1: Write failing test for `gen` block parsing**

```javascript
test('Parse gen block with no params', () => {
  const ast = parse('dec next = gen { yield 1 }');
  const genExpr = ast.body[0].init;
  assertEqual(genExpr.type, 'GeneratorExpression');
  assertEqual(genExpr.params.length, 0);
  assertEqual(genExpr.body.body.length, 1);
});

test('Parse gen block with empty parens', () => {
  const ast = parse('dec next = gen () { yield 1 }');
  const genExpr = ast.body[0].init;
  assertEqual(genExpr.type, 'GeneratorExpression');
  assertEqual(genExpr.params.length, 0);
  assertEqual(genExpr.body.body.length, 1);
});

test('Parse gen block with params', () => {
  const ast = parse('dec next = gen (max) { yield max }');
  const genExpr = ast.body[0].init;
  assertEqual(genExpr.type, 'GeneratorExpression');
  assertEqual(genExpr.params.length, 1);
  assertEqual(genExpr.params[0], 'max');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL — unexpected token `gen`

- [ ] **Step 3: Add gen block parsing to parsePrimary**

In `parsePrimary()` in `src/parser.js`, add a block for `GEN` (following the `worker` pattern from ~line 1432):

```javascript
if (this.check(TokenType.GEN)) {
  return this.parseGeneratorExpression();
}
```

Add the `parseGeneratorExpression()` method:

```javascript
parseGeneratorExpression() {
  this.advance(); // consume 'gen'
  const params = [];
  // Optional params in parens
  if (this.check(TokenType.LPAREN)) {
    this.advance(); // consume '('
    while (!this.check(TokenType.RPAREN)) {
      if (params.length > 0) {
        this.expect(TokenType.COMMA);
      }
      const name = this.expect(TokenType.IDENTIFIER).value;
      params.push(name);
    }
    this.expect(TokenType.RPAREN);
  }
  const body = this.parseBlock();
  return {
    type: NodeType.GeneratorExpression,
    params,
    body,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All gen + yield parse tests PASS (including Task 3's tests)

- [ ] **Step 5: Commit**

```bash
git add src/parser.js test/test.js
git commit -m "feat: parse gen blocks with optional params"
```

---

### Task 5: Generator — `done` Literal Compilation

**Files:**
- Modify: `src/generator.js:47-67` (scanUsedFeatures)
- Modify: `src/generator.js:235+` (emitRuntimeExtensions)
- Modify: `src/generator.js:1686-1688` (visitLiteral)
- Test: `test/test.js`

- [ ] **Step 1: Write failing test for `done` compilation**

```javascript
test('Generate done literal', () => {
  const js = compile('dec x = done', { skipTypeCheck: true });
  assertContains(js, 'const DONE = Object.freeze(Symbol("done"))');
  assertContains(js, 'const x = DONE');
});

test('done sentinel is tree-shaken when not used', () => {
  const js = compile('dec x = 42', { skipTypeCheck: true });
  assertEqual(js.includes('DONE'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL — `done` literal not compiled

- [ ] **Step 3: Add DONE sentinel to runtime extensions**

In `src/generator.js`, in `emitRuntimeExtensions()` (~line 235), add:

```javascript
if (this.usedFeatures && (this.usedFeatures.has('done') || this.usedFeatures.has('GeneratorExpression'))) {
  this.emitLine('const DONE = Object.freeze(Symbol("done"));');
  this.emitLine();
}
```

- [ ] **Step 4: Add `done` to feature scanning**

In `scanUsedFeatures()` (~line 47), add after the `secret` check (~line 53):

```javascript
if (node.type === 'Literal' && node.value === 'done') features.add('done');
```

- [ ] **Step 5: Add `done` literal to visitLiteral**

In `visitLiteral()` (~line 1686), add before the null check:

```javascript
if (node.value === 'done') {
  return 'DONE';
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node test/test.js 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat: compile done literal to DONE sentinel"
```

---

### Task 6: Generator — `is Type.Done` and `is Type.Generator` Compilation

**Files:**
- Modify: `src/generator.js:2024-2057` (emitIsCheck)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for `is Type.Done`, `is done`, and `is Type.Generator`**

```javascript
test('Generate is Type.Done check', () => {
  const source = `fn check(val) {
  return val is Type.Done
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '=== DONE');
});

test('Generate is done keyword check', () => {
  const source = `fn check(val) {
  return val is done
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '=== DONE');
});

test('Generate is not done keyword check', () => {
  const source = `fn check(val) {
  return val is not done
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '!==');
  assertContains(js, 'DONE');
});

test('Generate is not Type.Done check', () => {
  const source = `fn check(val) {
  return val is not Type.Done
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '!==');
  assertContains(js, 'DONE');
});

test('Generate is Type.Generator check', () => {
  const source = `fn check(val) {
  return val is Type.Generator
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '_isGenerator');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL — `Done` and `Generator` not recognized as primitive types

- [ ] **Step 3: Add `Done` and `Generator` to emitIsCheck**

In `emitIsCheck()` (~line 2028), in the primitive checks section, add cases for `'done'` and `'generator'`:

```javascript
if (primitive === 'done') {
  return negated ? `(${subject} !== DONE)` : `(${subject} === DONE)`;
}
if (primitive === 'generator') {
  return negated ? `(!${subject}?._isGenerator)` : `(${subject}?._isGenerator === true)`;
}
```

The `_isGenerator` flag is a property set on the next-function during compilation (Task 8). This is more reliable than checking `Symbol.iterator` since other iterables also have that.

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/test.js 2>&1 | tail -5`
Expected: PASS (may still fail if type checker hasn't added Done/Generator — test with `skipTypeCheck: true` should work since `isKind` is set during parsing via `resolveIsOperator`)

- [ ] **Step 5: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat: compile is Type.Done and is Type.Generator checks"
```

---

### Task 7: Type Checker — `done` and `GeneratorExpression`

**Files:**
- Modify: `src/typechecker.js:78-86` (builtinTypeEnum)
- Modify: `src/typechecker.js:1335-1417` (visitExpression switch)
- Modify: `src/typechecker.js:1420-1428` (visitLiteral)
- Test: `test/test.js`

- [ ] **Step 1: Write failing test for type checking**

```javascript
test('Type check gen block', () => {
  // Should not throw
  const js = compile(`
dec pull = gen { yield 1 }
dec val = pull()
  `);
  assertContains(js, 'function*');
});

test('Type check done literal', () => {
  const js = compile('dec x = done');
  assertContains(js, 'DONE');
});

test('Type check is Type.Done', () => {
  const js = compile(`
fn check(val) {
  guard val is not Type.Done else { return }
  return val
}
  `);
  assertContains(js, 'DONE');
});

test('Type check is Type.Generator', () => {
  const js = compile(`
fn check(val) {
  return val is Type.Generator
}
  `);
  assertContains(js, '_isGenerator');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL — type checker errors on `gen` or `done`

- [ ] **Step 3: Add `Done` and `Generator` to builtinTypeEnum**

In `src/typechecker.js`, in the `builtinTypeEnum` map (~line 78):

```javascript
['Done', 'done'],
['Generator', 'generator'],
```

- [ ] **Step 4: Handle `val is done` in resolveIsOperator**

In `resolveIsOperator()` (~line 1528), add a check for `done` literals before the Tier 1 `Type.Member` check:

```javascript
// done keyword — val is done / val is not done
if (right.type === NodeType.Literal && right.value === 'done') {
  node.isKind = 'primitive';
  node.isPrimitive = 'done';
  return;
}
```

This means `val is done` and `val is Type.Done` both resolve to `isKind: 'primitive'`, `isPrimitive: 'done'` — identical codegen path.

Also add the same check in `resolveIsPattern()` (~line 1569) if `is done` can appear in match arms.

- [ ] **Step 6: Add `done` literal to visitLiteral**

In `visitLiteral()` (~line 1424), add before the null check:

```javascript
if (node.value === 'done') return this.createType(Type.Any);
```

Using `Type.Any` for now — `done` is a sentinel, not a value you do operations on.

- [ ] **Step 7: Add GeneratorExpression and YieldExpression to visitExpression**

In the `visitExpression()` switch (~line 1335), add cases:

```javascript
case NodeType.GeneratorExpression: {
  this.pushScope();
  for (const param of node.params) {
    this.defineVariable(param, this.createType(Type.Any));
  }
  if (node.body && node.body.body) {
    for (const stmt of node.body.body) {
      this.visitStatement(stmt);
    }
  }
  this.popScope();
  return this.createType('generator');
}

case NodeType.YieldExpression: {
  if (node.argument) {
    this.visitExpression(node.argument);
  }
  return this.createType(Type.Any);
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `node test/test.js 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/typechecker.js test/test.js
git commit -m "feat: type check gen blocks, yield, done, and is done"
```

---

### Task 8: Generator — `gen` Block Compilation

**Files:**
- Modify: `src/generator.js` (add visitGeneratorExpression, visitYieldExpression)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for gen compilation**

```javascript
test('Generate basic gen block', () => {
  const source = `dec pull = gen {
  yield 1
  yield 2
  yield 3
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'function*');
  assertContains(js, 'yield 1');
  assertContains(js, 'yield 2');
  assertContains(js, 'yield 3');
  assertContains(js, 'DONE');
  assertContains(js, '.next(');
});

test('Generate gen block with params', () => {
  const source = `dec pull = gen (max) {
  mut i = 0
  while i < max {
    yield i
    i += 1
  }
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'function*(max)');
  assertContains(js, 'yield i');
});

test('Generate yield as expression (receives value)', () => {
  const source = `dec pull = gen {
  mut val = yield "ready"
  yield val
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'yield "ready"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL — `GeneratorExpression` not handled

- [ ] **Step 3: Add visitGeneratorExpression**

In `src/generator.js`, add a new method:

```javascript
visitGeneratorExpression(node) {
  const params = node.params.join(', ');
  const lines = [];
  
  // Build the inner function* body
  lines.push(`(() => {`);
  lines.push(`  const _gen = function*(${params}) {`);
  
  // Save current output, generate body into temp buffer
  const savedLines = this.lines;
  const savedIndent = this.indentLevel;
  this.lines = [];
  this.indentLevel = 2;
  
  this.insideGenerator = true;
  for (const stmt of node.body.body) {
    this.visitStatement(stmt);
  }
  this.insideGenerator = false;
  
  const bodyLines = this.lines;
  this.lines = savedLines;
  this.indentLevel = savedIndent;
  
  lines.push(...bodyLines);
  lines.push(`  };`);
  lines.push(`  const _iter = _gen(${params});`);
  lines.push(`  const _next = function(_sendValue) {`);
  lines.push(`    const _result = _iter.next(_sendValue);`);
  lines.push(`    return _result.done ? DONE : _result.value;`);
  lines.push(`  };`);
  lines.push(`  _next[Symbol.iterator] = function() {`);
  lines.push(`    return {`);
  lines.push(`      next() {`);
  lines.push(`        const value = _next();`);
  lines.push(`        return value === DONE`);
  lines.push(`          ? { value: undefined, done: true }`);
  lines.push(`          : { value, done: false };`);
  lines.push(`      }`);
  lines.push(`    };`);
  lines.push(`  };`);
  lines.push(`  return _next;`);
  lines.push(`})()`);
  
  return lines.join('\n');
}
```

Note: The exact output buffering approach depends on how the generator manages output. The key pattern is: look at how `visitWorkerExpression()` (~line 1255) builds its output. Follow the same pattern for buffering the inner function body. The IIFE wraps a `function*`, creates the iterator, and returns the next-function with:
- `_isGenerator = true` — marks this as a generator next-function (used by `is Type.Generator` and pipe detection)
- `Symbol.iterator` — makes it iterable for `for...in` compatibility

- [ ] **Step 4: Add visitYieldExpression**

```javascript
visitYieldExpression(node) {
  if (node.argument) {
    return `yield ${this.visitExpression(node.argument)}`;
  }
  return 'yield';
}
```

- [ ] **Step 5: Wire up in the visitor dispatch**

Add `GeneratorExpression` to the expression visitor dispatch (the switch or if-chain that calls `visitXxx` methods). Add `YieldExpression` similarly. If yield appears as a statement (expression statement), the existing `visitExpressionStatement` should handle it by calling `visitExpression` on the expression.

- [ ] **Step 6: Run test to verify it passes**

Run: `node test/test.js 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat: compile gen blocks to function* with next-function wrapper"
```

---

### Task 9: Async Generator Detection

**Files:**
- Modify: `src/generator.js:69-178` (buildAsyncMap)
- Modify: `src/generator.js:180-200` (_containsAsyncMarker)
- Test: `test/test.js`

- [ ] **Step 1: Write failing test for async gen**

```javascript
test('Generate async gen block', () => {
  const source = `dec pull = gen {
  yield sleep 100
  yield sleep 200
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'async function*');
  assertContains(js, 'await _iter.next(');
  assertContains(js, 'Symbol.asyncIterator');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL — still compiles as sync `function*`

- [ ] **Step 3: Extend async detection for generators**

In `_containsAsyncMarker()` (~line 180), the existing recursive scan already detects `SleepStatement`, `ShellBlock`, `SpawnBlock`, etc. inside any node tree. Since the `gen` block body is part of the AST, async markers inside the body should already be detected.

The change is in `visitGeneratorExpression`: check if the body contains async markers and if so:
1. Use `async function*` instead of `function*`
2. Use `await _iter.next(_sendValue)` instead of `_iter.next(_sendValue)`
3. Make the next-function `async`
4. Use `Symbol.asyncIterator` instead of `Symbol.iterator`

Update `visitGeneratorExpression` to check:

```javascript
const isAsync = this._containsAsyncMarker(node.body);
const fnKeyword = isAsync ? 'async function*' : 'function*';
const awaitPrefix = isAsync ? 'await ' : '';
const iteratorSymbol = isAsync ? 'Symbol.asyncIterator' : 'Symbol.iterator';
const nextAsync = isAsync ? 'async ' : '';
```

Then use these in the generated code:
- `const _gen = ${fnKeyword}(${params}) {`
- `const _next = ${nextAsync}function(_sendValue) {`
- `const _result = ${awaitPrefix}_iter.next(_sendValue);`
- `_next[${iteratorSymbol}] = ...`

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/test.js 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat: auto-detect async generators"
```

---

### Task 10: Pipe Composition with Generators

**Files:**
- Modify: `src/generator.js:254-267` (_pipe runtime helper)
- Test: `test/test.js`

- [ ] **Step 1: Write failing test for generator pipe**

```javascript
test('Generate gen piped through function returns lazy wrapper', () => {
  const source = `fn double(x) { return x * 2 }
dec pull = gen { yield 1; yield 2; yield 3 }
dec doubled = pull ~> double`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '_pipe(');
  // The _pipe function should handle generators
  assertContains(js, 'DONE');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL or the pipe doesn't handle generators correctly

- [ ] **Step 3: Extend _pipe to detect generators**

In `emitRuntimeExtensions()`, update the `_pipe` helper (~line 254). The next-function has `_isGenerator = true` — use that to detect it:

```javascript
if (this.usedFeatures && this.usedFeatures.has('PipeExpression')) {
this.emitLine('function _pipe(value, ...fns) {');
this.pushIndent();
this.emitLine('if (value && value._isGenerator) {');
this.pushIndent();
this.emitLine('const gen = value;');
this.emitLine('const wrapped = function(_sendValue) {');
this.pushIndent();
this.emitLine('let result = gen(_sendValue);');
this.emitLine('if (result === DONE) return DONE;');
this.emitLine('for (const fn of fns) { result = fn(result); }');
this.emitLine('return result;');
this.popIndent();
this.emitLine('};');
this.emitLine('wrapped._isGenerator = true;');
this.emitLine('wrapped[Symbol.iterator] = function() { return { next() { const value = wrapped(); return value === DONE ? { value: undefined, done: true } : { value, done: false }; } }; };');
this.emitLine('return wrapped;');
this.popIndent();
this.emitLine('}');
this.emitLine('let result = value;');
this.emitLine('for (let i = 0; i < fns.length; i++) {');
this.pushIndent();
this.emitLine('if (result && typeof result.then === "function") { return result.then(async r => { let v = r; for (let j = i; j < fns.length; j++) { v = await fns[j](v); } return v; }); }');
this.emitLine('result = fns[i](result);');
this.popIndent();
this.emitLine('}');
this.emitLine('return result;');
this.popIndent();
this.emitLine('}');
this.emitLine();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/test.js 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat: extend pipe operator for lazy generator composition"
```

---

### Task 11: for...in Integration

**Files:**
- Test: `test/test.js`

The `for...in` already compiles to `for...of` (line 1414 of generator.js), and generators attach `Symbol.iterator`. This should already work. This task verifies it.

- [ ] **Step 1: Write integration test**

```javascript
test('for...in consumes generator via Symbol.iterator', () => {
  const source = `dec pull = gen {
  yield 1
  yield 2
  yield 3
}
for val in pull {
  print val
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'for (const val of');
  assertContains(js, 'Symbol.iterator');
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node test/test.js 2>&1 | tail -5`
Expected: PASS — no changes needed, just verification

- [ ] **Step 3: Commit test**

```bash
git add test/test.js
git commit -m "test: verify for...in works with generators"
```

---

### Task 12: Linter Rules

**Files:**
- Modify: `src/linter.js:33-51` (rules registration)
- Modify: `src/linter.js:54-71` (severity defaults)
- Modify: `src/linter.js:357-440` (analyzeStatement)
- Test: `test/test.js`

- [ ] **Step 1: Write failing test for linter warnings**

```javascript
test('Linter warns on yield outside gen block', () => {
  const source = `fn foo() { yield 1 }`;
  const linter = new Linter();
  const ast = parse(source);
  const messages = linter.lint(ast, source);
  const yieldWarning = messages.find(m => m.rule === 'yield-outside-gen');
  assertEqual(yieldWarning !== undefined, true);
});

test('Linter warns on gen block without yield', () => {
  const source = `dec x = gen { dec y = 1 }`;
  const linter = new Linter();
  const ast = parse(source);
  const messages = linter.lint(ast, source);
  const noYieldWarning = messages.find(m => m.rule === 'gen-without-yield');
  assertEqual(noYieldWarning !== undefined, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL — lint rules don't exist

- [ ] **Step 3: Register new lint rules**

In `src/linter.js`, add to the `rules` object (~line 33):

```javascript
'yield-outside-gen': true,
'gen-without-yield': true,
```

Add to the `severity` object (~line 54):

```javascript
'yield-outside-gen': Severity.Error,
'gen-without-yield': Severity.Warning,
```

- [ ] **Step 4: Implement lint checks**

For `yield-outside-gen`: Track whether we're inside a `gen` block (set a flag in `analyzeExpression` or `analyzeStatement` when entering a `GeneratorExpression`). If `YieldExpression` is encountered without the flag, report.

For `gen-without-yield`: When visiting a `GeneratorExpression`, scan its body for any `YieldExpression` nodes. If none found, report.

Add to the appropriate analysis methods:

```javascript
// In the expression/statement analysis, when encountering GeneratorExpression:
case NodeType.GeneratorExpression: {
  // Check for yield-less gen
  const hasYield = this.containsNodeType(node.body, NodeType.YieldExpression);
  if (!hasYield) {
    this.addMessage('gen-without-yield', 'gen block contains no yield — did you mean to use a function?', node);
  }
  // Analyze body with gen context
  const prevInGen = this.insideGen;
  this.insideGen = true;
  this.analyzeBlock(node.body);
  this.insideGen = prevInGen;
  break;
}

// When encountering YieldExpression:
case NodeType.YieldExpression: {
  if (!this.insideGen) {
    this.addMessage('yield-outside-gen', 'yield can only be used inside a gen block', node);
  }
  if (node.argument) {
    this.analyzeExpression(node.argument);
  }
  break;
}
```

Add a `containsNodeType` helper if one doesn't exist:

```javascript
containsNodeType(node, targetType) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === targetType) return true;
  for (const key of Object.keys(node)) {
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (this.containsNodeType(item, targetType)) return true;
      }
    } else if (val && typeof val === 'object' && val.type) {
      if (this.containsNodeType(val, targetType)) return true;
    }
  }
  return false;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node test/test.js 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/linter.js test/test.js
git commit -m "feat: lint rules for yield-outside-gen and gen-without-yield"
```

---

### Task 13: End-to-End Integration Test

**Files:**
- Create: `test/generators.km` (KimchiLang test file)
- Test: `test/test.js`

- [ ] **Step 1: Write end-to-end compile-and-run test**

Add to `test/test.js`:

```javascript
test('End-to-end: gen block produces values and done', () => {
  const source = `
dec pull = gen {
  yield 1
  yield 2
  yield 3
}
dec a = pull()
dec b = pull()
dec c = pull()
dec d = pull()
print a
print b
print c
print d is Type.Done
`;
  const js = compile(source);
  assertContains(js, 'function*');
  assertContains(js, 'DONE');
});

test('End-to-end: gen with params', () => {
  const source = `
dec pull = gen (start, end) {
  mut i = start
  while i < end {
    yield i
    i += 1
  }
}
for val in pull {
  print val
}
`;
  const js = compile(source);
  assertContains(js, 'function*(start, end)');
});

test('End-to-end: yield receives caller value', () => {
  const source = `
dec pull = gen {
  mut val = yield "ready"
  yield val + 1
}
dec first = pull()
dec second = pull(10)
print first
print second
`;
  const js = compile(source);
  assertContains(js, 'yield "ready"');
});

test('End-to-end: guard with is done keyword', () => {
  const source = `
dec pull = gen { yield 42 }
dec val = pull()
guard val is not done else { return }
print val
`;
  const js = compile(source);
  assertContains(js, 'DONE');
});

test('End-to-end: is done and is Type.Done are equivalent', () => {
  const source = `
fn check(val) {
  dec a = val is done
  dec b = val is Type.Done
  return a
}
`;
  const js = compile(source);
  // Both should compile to the same DONE check
  const doneChecks = js.match(/=== DONE/g);
  assertEqual(doneChecks.length, 2);
});

test('End-to-end: gen with empty parens', () => {
  const source = `
dec pull = gen () {
  yield 1
  yield 2
}
dec a = pull()
print a
`;
  const js = compile(source);
  assertContains(js, 'function*()');
  assertContains(js, 'DONE');
});

test('End-to-end: gen() result is Type.Generator', () => {
  const source = `
dec pull = gen { yield 1 }
print pull is Type.Generator
`;
  const js = compile(source);
  assertContains(js, '_isGenerator');
});

test('End-to-end: inline gen in for...in', () => {
  const source = `
for val in gen { yield 1; yield 2; yield 3 } {
  print val
}
`;
  const js = compile(source);
  assertContains(js, 'for (const val of');
  assertContains(js, 'function*');
});

test('End-to-end: inline gen() in for...in', () => {
  const source = `
for val in gen () { yield 10; yield 20 } {
  print val
}
`;
  const js = compile(source);
  assertContains(js, 'for (const val of');
  assertContains(js, 'function*');
});

test('End-to-end: match with done keyword', () => {
  const source = `
fn consume(pull) {
  match pull() {
    v is done => "exhausted"
    v => v
  }
}
`;
  const js = compile(source);
  assertContains(js, 'DONE');
});
```

- [ ] **Step 2: Run full test suite**

Run: `node test/test.js 2>&1 | tail -10`
Expected: All tests PASS

- [ ] **Step 3: Write a KimchiLang test file for `kimchi test`**

Create `test/generators.km`:

```
test "basic generator yields values" {
  dec pull = gen {
    yield 1
    yield 2
    yield 3
  }
  expect(pull()).toBe(1)
  expect(pull()).toBe(2)
  expect(pull()).toBe(3)
  expect(pull() is Type.Done).toBe(true)
}

test "gen with params" {
  dec pull = gen (max) {
    mut i = 0
    while i < max {
      yield i
      i += 1
    }
  }
  expect(pull()).toBe(0)
  expect(pull()).toBe(1)
  expect(pull()).toBe(2)
  expect(pull() is Type.Done).toBe(true)
}

test "for...in consumes generator" {
  dec pull = gen {
    yield 10
    yield 20
    yield 30
  }
  mut total = 0
  for val in pull {
    total += val
  }
  expect(total).toBe(60)
}

test "yield receives caller value" {
  dec pull = gen {
    mut val = yield "ready"
    yield val + 1
  }
  expect(pull()).toBe("ready")
  expect(pull(10)).toBe(11)
  expect(pull() is Type.Done).toBe(true)
}

test "done is a value" {
  dec x = done
  expect(x is Type.Done).toBe(true)
  expect(x is done).toBe(true)
}

test "is done keyword form" {
  dec pull = gen { yield 42 }
  dec a = pull()
  expect(a is done).toBe(false)
  dec b = pull()
  expect(b is done).toBe(true)
}

test "gen with empty parens" {
  dec pull = gen () {
    yield 42
  }
  expect(pull()).toBe(42)
  expect(pull() is Type.Done).toBe(true)
}

test "gen is Type.Generator" {
  dec pull = gen { yield 1 }
  expect(pull is Type.Generator).toBe(true)
  expect(42 is Type.Generator).toBe(false)
}

test "inline gen in for...in" {
  mut total = 0
  for val in gen { yield 1; yield 2; yield 3 } {
    total += val
  }
  expect(total).toBe(6)
}

test "inline gen() in for...in" {
  mut total = 0
  for val in gen () { yield 10; yield 20 } {
    total += val
  }
  expect(total).toBe(30)
}
```

- [ ] **Step 4: Run KimchiLang test file**

Run: `node src/cli.js test test/generators.km`
Expected: All tests PASS

- [ ] **Step 5: Run full test suite one final time**

Run: `node test/test.js && node test/stdlib_test.js`
Expected: All existing tests still PASS, no regressions

- [ ] **Step 6: Commit**

```bash
git add test/test.js test/generators.km
git commit -m "test: end-to-end generator tests"
```
