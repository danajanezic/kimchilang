# Concurrency (I/O) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `collect`, `hoard`, and `race` concurrency primitives plus `.()` bind syntax to KimchiLang.

**Architecture:** Three new keywords (`collect`, `hoard`, `race`) parsed as `ConcurrentExpression` AST nodes with a `mode` field. A new `BindExpression` node handles `.()` syntax. The type checker enforces async-function scope. The generator emits `await Promise.all/allSettled/race(...)` with tree-shaken `STATUS` enum for `hoard`.

**Tech Stack:** Pure JavaScript, zero dependencies. Modifies lexer, parser, type checker, and generator. Tests use the existing custom harness.

---

### Task 1: Lexer — Add `collect`, `hoard`, `race` tokens

**Files:**
- Modify: `src/lexer.js:3-54` (TokenType enum)
- Modify: `src/lexer.js:111-159` (KEYWORDS map)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for new keyword tokens**

Add to `test/test.js` after the existing lexer tests section (`--- Lexer Tests ---`):

```javascript
test('Tokenize collect keyword', () => {
  const tokens = tokenize('collect [a, b]');
  assertEqual(tokens[0].type, 'COLLECT');
  assertEqual(tokens[0].value, 'collect');
});

test('Tokenize hoard keyword', () => {
  const tokens = tokenize('hoard [a, b]');
  assertEqual(tokens[0].type, 'HOARD');
  assertEqual(tokens[0].value, 'hoard');
});

test('Tokenize race keyword', () => {
  const tokens = tokenize('race [a, b]');
  assertEqual(tokens[0].type, 'RACE');
  assertEqual(tokens[0].value, 'race');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: 3 failures — tokens are `IDENTIFIER` instead of `COLLECT`/`HOARD`/`RACE`.

- [ ] **Step 3: Add token types to TokenType enum**

In `src/lexer.js`, add after the `WHEN: 'WHEN',` line (line 54):

```javascript
  COLLECT: 'COLLECT',
  HOARD: 'HOARD',
  RACE: 'RACE',
```

- [ ] **Step 4: Add keywords to KEYWORDS map**

In `src/lexer.js`, add after the `'when': TokenType.WHEN,` line (line 151):

```javascript
  'collect': TokenType.COLLECT,
  'hoard': TokenType.HOARD,
  'race': TokenType.RACE,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 3 new tests pass. No existing tests broken.

- [ ] **Step 6: Commit**

```bash
git add src/lexer.js test/test.js
git commit -m "feat(lexer): add collect, hoard, race keyword tokens"
```

---

### Task 2: Parser — Add `ConcurrentExpression` and `BindExpression` node types

**Files:**
- Modify: `src/parser.js:5-79` (NodeType enum)
- Modify: `src/parser.js:1993+` (parsePrimary — add concurrency expression parsing)
- Modify: `src/parser.js:1909-1979` (parseCall — add bind expression parsing)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for parsing collect**

Add to `test/test.js` after the parser tests section:

```javascript
test('Parse collect expression', () => {
  const ast = parse(tokenize('dec result = collect [a, b]'));
  const init = ast.body[0].init;
  assertEqual(init.type, 'ConcurrentExpression');
  assertEqual(init.mode, 'collect');
  assertEqual(init.elements.length, 2);
  assertEqual(init.elements[0].name, 'a');
  assertEqual(init.elements[1].name, 'b');
});

test('Parse hoard expression', () => {
  const ast = parse(tokenize('dec result = hoard [a, b, c]'));
  const init = ast.body[0].init;
  assertEqual(init.type, 'ConcurrentExpression');
  assertEqual(init.mode, 'hoard');
  assertEqual(init.elements.length, 3);
});

test('Parse race expression', () => {
  const ast = parse(tokenize('dec winner = race [a, b]'));
  const init = ast.body[0].init;
  assertEqual(init.type, 'ConcurrentExpression');
  assertEqual(init.mode, 'race');
  assertEqual(init.elements.length, 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failures — parser doesn't recognize `collect`/`hoard`/`race` as expression starters.

- [ ] **Step 3: Add node types to NodeType enum**

In `src/parser.js`, add after the `ConditionalMethodExpression` line (line 50):

```javascript
  ConcurrentExpression: 'ConcurrentExpression',
  BindExpression: 'BindExpression',
```

- [ ] **Step 4: Implement parseConcurrentExpression**

Add a new method to the `Parser` class (before `parsePrimary`):

```javascript
  parseConcurrentExpression() {
    const token = this.advance(); // consume collect/hoard/race
    const mode = token.value; // 'collect', 'hoard', or 'race'
    
    this.expect(TokenType.LBRACKET, `Expected [ after ${mode}`);
    
    const elements = [];
    if (!this.check(TokenType.RBRACKET)) {
      do {
        if (this.check(TokenType.RBRACKET)) break;
        elements.push(this.parseCall());
      } while (this.match(TokenType.COMMA));
    }
    
    this.expect(TokenType.RBRACKET, `Expected ] after ${mode} elements`);
    
    return {
      type: NodeType.ConcurrentExpression,
      mode,
      elements,
      line: token.line,
      column: token.column,
    };
  }
```

Note: elements are parsed with `this.parseCall()` — this allows both bare identifiers (`fetchUsers`) and bind expressions (`fetchUser.(1)`) but not full expressions with operators.

- [ ] **Step 5: Hook into parsePrimary**

In `src/parser.js`, at the top of `parsePrimary()` (line 1993), add before the `match` keyword check:

```javascript
    if (this.check(TokenType.COLLECT) || this.check(TokenType.HOARD) || this.check(TokenType.RACE)) {
      return this.parseConcurrentExpression();
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 3 new parser tests pass. No existing tests broken.

- [ ] **Step 7: Write failing tests for bind expression**

Add to `test/test.js`:

```javascript
test('Parse bind expression', () => {
  const ast = parse(tokenize('dec x = collect [fetchUser.(1)]'));
  const init = ast.body[0].init;
  assertEqual(init.type, 'ConcurrentExpression');
  const elem = init.elements[0];
  assertEqual(elem.type, 'BindExpression');
  assertEqual(elem.callee.name, 'fetchUser');
  assertEqual(elem.arguments.length, 1);
  assertEqual(elem.arguments[0].value, 1);
});

test('Parse bind expression with multiple args', () => {
  const ast = parse(tokenize('dec x = collect [fetch.("url", opts)]'));
  const elem = ast.body[0].init.elements[0];
  assertEqual(elem.type, 'BindExpression');
  assertEqual(elem.callee.name, 'fetch');
  assertEqual(elem.arguments.length, 2);
});

test('Parse mixed identifiers and bind expressions', () => {
  const ast = parse(tokenize('dec x = collect [fetchAll, fetchOne.(1)]'));
  const init = ast.body[0].init;
  assertEqual(init.elements[0].type, 'Identifier');
  assertEqual(init.elements[1].type, 'BindExpression');
});
```

- [ ] **Step 8: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failures — parser treats `.()` as property access.

- [ ] **Step 9: Implement bind expression parsing in parseCall**

In `src/parser.js` in `parseCall()`, inside the `else if (this.match(TokenType.DOT))` branch (line 1921), add a check for `.(` before the `.if()` check. Insert at line 1922, before the `if (this.check(TokenType.IF))`:

```javascript
        // Check for .() bind expression
        if (this.check(TokenType.LPAREN)) {
          this.advance(); // consume '('
          const args = [];
          if (!this.check(TokenType.RPAREN)) {
            do {
              if (this.check(TokenType.RPAREN)) break;
              args.push(this.parseExpression());
            } while (this.match(TokenType.COMMA));
          }
          this.expect(TokenType.RPAREN, 'Expected ) after bind arguments');
          expr = {
            type: NodeType.BindExpression,
            callee: expr,
            arguments: args,
            line: this.tokens[this.pos - 1].line,
            column: this.tokens[this.pos - 1].column,
          };
        } else if (this.check(TokenType.IF)) {
```

This replaces the original `if (this.check(TokenType.IF))` — the `.if()` branch becomes an `else if`.

- [ ] **Step 10: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 6 new parser tests pass. No existing tests broken.

- [ ] **Step 11: Commit**

```bash
git add src/parser.js test/test.js
git commit -m "feat(parser): parse collect/hoard/race and .() bind expressions"
```

---

### Task 3: Type checker — Enforce async function scope

**Files:**
- Modify: `src/typechecker.js:34-45` (constructor — add `_insideAsync` flag)
- Modify: `src/typechecker.js:550-624` (visitFunctionDeclaration — track async scope)
- Modify: `src/typechecker.js:739-788` (visitExpression — handle new node types)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for async enforcement**

Add to `test/test.js` after the type checker tests section:

```javascript
test('Type checker: collect inside async fn is valid', () => {
  const source = 'async fn main() { dec x = collect [a, b] }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  // Should not have an error about collect outside async
  const concurrencyErrors = errors.filter(e => e.message.includes('must be inside an async function'));
  assertEqual(concurrencyErrors.length, 0);
});

test('Type checker: collect outside async fn is an error', () => {
  const source = 'fn main() { dec x = collect [a, b] }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const concurrencyErrors = errors.filter(e => e.message.includes('must be inside an async function'));
  assertEqual(concurrencyErrors.length, 1);
});

test('Type checker: hoard outside async fn is an error', () => {
  const source = 'fn main() { dec x = hoard [a, b] }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const concurrencyErrors = errors.filter(e => e.message.includes('must be inside an async function'));
  assertEqual(concurrencyErrors.length, 1);
});

test('Type checker: race outside async fn is an error', () => {
  const source = 'fn main() { dec x = race [a, b] }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const concurrencyErrors = errors.filter(e => e.message.includes('must be inside an async function'));
  assertEqual(concurrencyErrors.length, 1);
});

test('Type checker: collect at top level is an error', () => {
  const source = 'dec x = collect [a, b]';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const concurrencyErrors = errors.filter(e => e.message.includes('must be inside an async function'));
  assertEqual(concurrencyErrors.length, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failures — type checker doesn't know about `ConcurrentExpression`.

- [ ] **Step 3: Add `_insideAsync` flag to TypeChecker constructor**

In `src/typechecker.js`, add after the `this._insideClosure = false;` line (line 45):

```javascript
    this._insideAsync = false;
```

- [ ] **Step 4: Track async scope in visitFunctionDeclaration**

In `src/typechecker.js`, in `visitFunctionDeclaration` (line 550), save and restore the async flag around the body visit. Replace the block from `this.pushScope();` (line 562) through `this.popScope();` (line 623) — wrap the body visit with async tracking:

```javascript
    this.pushScope();
    
    const previousAsync = this._insideAsync;
    this._insideAsync = !!node.async;

    // Build KMDoc param type map if available
    const kmdocParams = new Map();
    if (node.kmdoc && node.kmdoc.params) {
      for (const p of node.kmdoc.params) {
        kmdocParams.set(p.name, this.parseTypeString(p.type));
      }
    }

    // Define parameters in scope
    for (const param of node.params) {
      // Handle destructuring patterns
      if (param.destructuring === 'object' && param.pattern) {
        for (const prop of param.pattern.properties) {
          this.defineVariable(prop.key, this.createType(Type.Any));
        }
        continue;
      }
      
      if (param.destructuring === 'array' && param.pattern) {
        for (const elem of param.pattern.elements) {
          if (elem && elem.type === 'Identifier') {
            this.defineVariable(elem.name, this.createType(Type.Any));
          }
        }
        continue;
      }
      
      const name = param.name || param.argument;
      let paramType = this.createType(Type.Any);

      // KMDoc type takes priority over inference
      if (kmdocParams.has(name)) {
        paramType = kmdocParams.get(name);
      } else if (param.defaultValue) {
        paramType = this.visitExpression(param.defaultValue);
      }

      this.defineVariable(name, paramType);
    }
    
    // Visit function body
    if (node.body && node.body.body) {
      for (const stmt of node.body.body) {
        this.visitStatement(stmt);
      }
    }

    // Register function info with KMDoc types for call-site validation
    if (node.name && kmdocParams.size > 0) {
      this.functions.set(node.name, {
        params: node.params.map(p => {
          const name = p.name || p.argument;
          return { name, type: kmdocParams.get(name) || this.createType(Type.Any) };
        }),
        returnType: node.kmdoc && node.kmdoc.returns ? this.parseTypeString(node.kmdoc.returns.type) : this.createType(Type.Any),
        kmdocParams,
      });
    }

    this._insideAsync = previousAsync;
    this.popScope();
```

- [ ] **Step 5: Handle ConcurrentExpression and BindExpression in visitExpression**

In `src/typechecker.js`, in `visitExpression` (line 739), add cases before the `default:` case (line 785):

```javascript
      case NodeType.ConcurrentExpression: {
        if (!this._insideAsync) {
          this.addError(`${node.mode} must be inside an async function`, node);
        }
        for (const elem of node.elements) {
          this.visitExpression(elem);
        }
        return this.createType(Type.Array);
      }
      case NodeType.BindExpression: {
        this.visitExpression(node.callee);
        for (const arg of node.arguments) {
          this.visitExpression(arg);
        }
        return this.createType(Type.Function);
      }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 5 new type checker tests pass. No existing tests broken.

- [ ] **Step 7: Commit**

```bash
git add src/typechecker.js test/test.js
git commit -m "feat(typechecker): enforce collect/hoard/race inside async fn"
```

---

### Task 4: Generator — Emit JavaScript for collect and race

**Files:**
- Modify: `src/generator.js:1080-1131` (visitExpression — add new cases)
- Modify: `src/generator.js` (add visitConcurrentExpression and visitBindExpression methods)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for collect code generation**

Add to `test/test.js` after the generator tests section:

```javascript
test('Generate collect expression with bare identifiers', () => {
  const js = compile('async fn main() { dec x = collect [a, b] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.all([a(), b()])');
});

test('Generate collect with bind expressions', () => {
  const js = compile('async fn main() { dec x = collect [fetch.(1), fetch.(2)] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.all([fetch(1), fetch(2)])');
});

test('Generate collect with mixed identifiers and bind', () => {
  const js = compile('async fn main() { dec x = collect [fetchAll, fetchOne.(1)] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.all([fetchAll(), fetchOne(1)])');
});

test('Generate race expression', () => {
  const js = compile('async fn main() { dec x = race [a, b] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.race([a(), b()])');
});

test('Generate race with bind expressions', () => {
  const js = compile('async fn main() { dec x = race [fast.("url1"), fast.("url2")] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.race([fast("url1"), fast("url2")])');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failures — `Unknown expression type: ConcurrentExpression`.

- [ ] **Step 3: Add visitConcurrentExpression and visitBindExpression methods**

Add to `src/generator.js`, after the `visitConditionalMethodExpression` method (around line 1138):

```javascript
  visitConcurrentExpression(node) {
    const elements = node.elements.map(elem => {
      if (elem.type === NodeType.BindExpression) {
        const callee = this.visitExpression(elem.callee);
        const args = elem.arguments.map(a => this.visitExpression(a)).join(', ');
        return `${callee}(${args})`;
      }
      // Bare identifier — invoke with no args
      return `${this.visitExpression(elem)}()`;
    });

    const list = elements.join(', ');

    switch (node.mode) {
      case 'collect':
        return `await Promise.all([${list}])`;
      case 'race':
        return `await Promise.race([${list}])`;
      case 'hoard':
        return `await Promise.allSettled([${list}]).then(r => r.map(x => x.status === "fulfilled" ? { status: STATUS.OK, value: x.value } : { status: STATUS.REJECTED, error: x.reason }))`;
    }
  }

  visitBindExpression(node) {
    const callee = this.visitExpression(node.callee);
    const args = node.arguments.map(a => this.visitExpression(a)).join(', ');
    return `() => ${callee}(${args})`;
  }
```

- [ ] **Step 4: Add cases to visitExpression switch**

In `src/generator.js`, in `visitExpression` (line 1080), add before the `default:` case:

```javascript
      case NodeType.ConcurrentExpression:
        return this.visitConcurrentExpression(node);
      case NodeType.BindExpression:
        return this.visitBindExpression(node);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 5 new generator tests pass. No existing tests broken.

- [ ] **Step 6: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat(generator): emit Promise.all/race for collect/race expressions"
```

---

### Task 5: Generator — Emit hoard with STATUS enum (tree-shaken)

**Files:**
- Modify: `src/generator.js:62-81` (scanUsedFeatures — detect hoard)
- Modify: `src/generator.js:109-199` (emitRuntimeExtensions — emit STATUS)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for hoard code generation**

Add to `test/test.js`:

```javascript
test('Generate hoard expression', () => {
  const js = compile('async fn main() { dec x = hoard [a, b] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.allSettled([a(), b()])');
  assertContains(js, 'STATUS.OK');
  assertContains(js, 'STATUS.REJECTED');
});

test('Generate hoard emits STATUS enum', () => {
  const js = compile('async fn main() { dec x = hoard [a, b] }', { skipTypeCheck: true });
  assertContains(js, 'const STATUS = Object.freeze({ OK: "OK", REJECTED: "REJECTED" })');
});

test('STATUS enum not emitted without hoard', () => {
  const js = compile('async fn main() { dec x = collect [a, b] }', { skipTypeCheck: true });
  const hasStatus = js.includes('const STATUS');
  assertEqual(hasStatus, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: First two fail (no STATUS in output). Third may pass or fail depending on state.

- [ ] **Step 3: Add hoard detection to scanUsedFeatures**

The existing `scanUsedFeatures` at `src/generator.js:62-81` already scans all node types into the features set via `features.add(node.type)`. Since `ConcurrentExpression` nodes will be in the AST, we need to also detect the `mode`. Modify the scan function inside `scanUsedFeatures` to also track modes:

In the `const scan = (node) => {` function body, after `if (node.type) features.add(node.type);`, add:

```javascript
      if (node.type === 'ConcurrentExpression' && node.mode === 'hoard') features.add('hoard');
```

- [ ] **Step 4: Emit STATUS enum in emitRuntimeExtensions**

In `src/generator.js`, in `emitRuntimeExtensions` (around line 109), add after the last conditional helper emission (after the `_shell` block, around line 199):

```javascript
    // STATUS enum for hoard results
    if (this.usedFeatures && this.usedFeatures.has('hoard')) {
      this.emitLine('const STATUS = Object.freeze({ OK: "OK", REJECTED: "REJECTED" });');
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 3 new hoard tests pass. No existing tests broken.

- [ ] **Step 6: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat(generator): emit hoard with tree-shaken STATUS enum"
```

---

### Task 6: End-to-end tests

**Files:**
- Test: `test/test.js`

- [ ] **Step 1: Write end-to-end compilation tests**

Add to `test/test.js`:

```javascript
test('E2E: collect compiles to working Promise.all', () => {
  const source = `
async fn fetchA() { return 1 }
async fn fetchB() { return 2 }
async fn main() {
  dec [a, b] = collect [fetchA, fetchB]
  print a
  print b
}
main()`;
  const js = compile(source);
  assertContains(js, 'await Promise.all([fetchA(), fetchB()])');
});

test('E2E: hoard compiles with STATUS mapping', () => {
  const source = `
async fn ok() { return "yes" }
async fn fail() { throw error("no") }
async fn main() {
  dec results = hoard [ok, fail]
  print results
}
main()`;
  const js = compile(source);
  assertContains(js, 'await Promise.allSettled([ok(), fail()])');
  assertContains(js, 'STATUS.OK');
  assertContains(js, 'const STATUS = Object.freeze');
});

test('E2E: race compiles to Promise.race', () => {
  const source = `
async fn fast() { return "first" }
async fn slow() { return "second" }
async fn main() {
  dec winner = race [fast, slow]
  print winner
}
main()`;
  const js = compile(source);
  assertContains(js, 'await Promise.race([fast(), slow()])');
});

test('E2E: bind expression with args in collect', () => {
  const source = `
async fn fetch(id) { return id }
async fn main() {
  dec [a, b] = collect [fetch.(1), fetch.(2)]
  print a
  print b
}
main()`;
  const js = compile(source);
  assertContains(js, 'await Promise.all([fetch(1), fetch(2)])');
});

test('E2E: bind expression standalone compiles to arrow', () => {
  const js = compile('async fn main() { dec f = fetch.(1, 2) }', { skipTypeCheck: true });
  assertContains(js, '() => fetch(1, 2)');
});

test('E2E: collect outside async fn produces type error', () => {
  const source = 'fn main() { dec x = collect [a, b] }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length >= 1, true);
  assertContains(errors[0].message, 'must be inside an async function');
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 6 end-to-end tests pass.

- [ ] **Step 3: Commit**

```bash
git add test/test.js
git commit -m "test: add end-to-end tests for concurrency primitives"
```

---

### Task 7: Update ROADMAP.md

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Mark concurrency items as done**

In `ROADMAP.md`, update the Concurrency (I/O) section (lines 37-41) to:

```markdown
## Concurrency (I/O)

- [x] ~~`collect [callable1, callable2]` — concurrent I/O, fail fast (`Promise.all`). Returns array of results. Destructurable: `dec [a, b] = collect [fn1, fn2]`~~
- [x] ~~`hoard [callable1, callable2]` — concurrent I/O, get everything even failures (`Promise.allSettled`). Returns array of `{ status, value/reason }`.~~
- [x] ~~`race [callable1, callable2]` — concurrent I/O, first to finish wins (`Promise.race`). Returns single result.~~
```

- [ ] **Step 2: Run full test suite**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All tests pass, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: mark concurrency I/O primitives as done"
```
