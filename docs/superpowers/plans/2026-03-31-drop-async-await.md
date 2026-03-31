# Drop async/await Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `async`/`await` keywords from KimchiLang syntax, add `sleep` statement, and implement call-graph-based auto-detection of async functions in the generator.

**Architecture:** Three phases: (1) Add `sleep` statement and `async fn` in extern blocks, (2) Build the two-pass auto-detection algorithm in the generator that replaces explicit `async`/`await`, (3) Remove the keywords from regular code and migrate stdlib/examples. The auto-detection seeds from async markers (shell, spawn, worker, collect, hoard, race, sleep, extern async fn) and propagates transitively through the call graph.

**Tech Stack:** Pure JavaScript, zero dependencies.

---

### Task 1: Add `sleep` statement

**Files:**
- Modify: `src/lexer.js` (add SLEEP token)
- Modify: `src/parser.js` (add SleepStatement node, parsing)
- Modify: `src/typechecker.js` (visit SleepStatement)
- Modify: `src/generator.js` (emit await new Promise setTimeout)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/test.js`:

```javascript
test('Tokenize sleep keyword', () => {
  const tokens = tokenize('sleep 1000');
  assertEqual(tokens[0].type, 'SLEEP');
});

test('Parse sleep statement', () => {
  const ast = parse(tokenize('fn main() { sleep 1000 }'));
  const stmt = ast.body[0].body.body[0];
  assertEqual(stmt.type, 'SleepStatement');
  assertEqual(stmt.duration.value, 1000);
});

test('Parse sleep with expression', () => {
  const ast = parse(tokenize('fn main() { sleep x * 1000 }'));
  const stmt = ast.body[0].body.body[0];
  assertEqual(stmt.type, 'SleepStatement');
  assertEqual(stmt.duration.type, 'BinaryExpression');
});

test('Generate sleep statement', () => {
  const js = compile('async fn main() { sleep 1000 }', { skipTypeCheck: true });
  assertContains(js, 'await new Promise(resolve => setTimeout(resolve, 1000))');
});

test('Generate sleep with expression', () => {
  const js = compile('async fn main() { sleep x * 1000 }', { skipTypeCheck: true });
  assertContains(js, 'await new Promise(resolve => setTimeout(resolve, (x * 1000)))');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`

- [ ] **Step 3: Add SLEEP token to lexer**

In `src/lexer.js`, add to TokenType enum after `RACE`:

```javascript
  SLEEP: 'SLEEP',
```

Add to KEYWORDS map after `'race'`:

```javascript
  'sleep': TokenType.SLEEP,
```

- [ ] **Step 4: Add SleepStatement to parser**

In `src/parser.js`, add to NodeType enum after `SpawnBlock`:

```javascript
  SleepStatement: 'SleepStatement',
```

Add `parseSleepStatement` method:

```javascript
  parseSleepStatement() {
    this.expect(TokenType.SLEEP, 'Expected sleep');
    const duration = this.parseExpression();
    return {
      type: NodeType.SleepStatement,
      duration,
    };
  }
```

Hook into `parseStatement()`. Add before the `expose` check:

```javascript
    if (this.check(TokenType.SLEEP)) {
      return this.parseSleepStatement();
    }
```

- [ ] **Step 5: Add SleepStatement to type checker**

In `src/typechecker.js`, in `visitStatement`, add a case:

```javascript
      case NodeType.SleepStatement:
        this.visitExpression(node.duration);
        break;
```

- [ ] **Step 6: Add SleepStatement to generator**

In `src/generator.js`, in `visitStatement`, add:

```javascript
      case NodeType.SleepStatement:
        this.emitLine(`await new Promise(resolve => setTimeout(resolve, ${this.visitExpression(node.duration)}));`);
        break;
```

Update `containsAsyncBlock` (line 8) to also detect SleepStatement:

Replace:
```javascript
  if (node.type === NodeType.ShellBlock || node.type === NodeType.SpawnBlock || node.type === NodeType.WorkerExpression) return true;
```

With:
```javascript
  if (node.type === NodeType.ShellBlock || node.type === NodeType.SpawnBlock || node.type === NodeType.WorkerExpression || node.type === NodeType.SleepStatement) return true;
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`

- [ ] **Step 8: Commit**

```bash
git add src/lexer.js src/parser.js src/typechecker.js src/generator.js test/test.js
git commit -m "feat: add sleep statement"
```

---

### Task 2: Add `async fn` support in extern declarations

**Files:**
- Modify: `src/parser.js` (extern fn parsing — check for ASYNC before FN)
- Modify: `src/typechecker.js` (store async flag on extern function registrations)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/test.js`:

```javascript
test('Parse extern async fn', () => {
  const source = 'extern "pg" {\n  async fn query(sql: string): any\n  fn escape(str: string): string\n}';
  const ast = parse(tokenize(source));
  const decls = ast.body[0].declarations;
  assertEqual(decls[0].async, true);
  assertEqual(decls[0].name, 'query');
  assertEqual(decls[1].async, false);
  assertEqual(decls[1].name, 'escape');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -20`

- [ ] **Step 3: Update extern fn parsing to check for async**

In `src/parser.js`, in `parseExternDeclaration`, find the fn branch inside the while loop (line ~1484):

```javascript
      if (this.check(TokenType.FN)) {
        this.advance(); // consume fn
```

Replace with:

```javascript
      if (this.check(TokenType.FN) || this.check(TokenType.ASYNC)) {
        let isAsync = false;
        if (this.check(TokenType.ASYNC)) {
          this.advance(); // consume async
          isAsync = true;
          if (!this.check(TokenType.FN)) {
            this.error('Expected fn after async in extern block');
          }
        }
        this.advance(); // consume fn
```

Then update the declaration push (line ~1514):

Replace:
```javascript
        declarations.push({ kind: 'function', name, typeParams, params, returnType });
```

With:
```javascript
        declarations.push({ kind: 'function', name, typeParams, params, returnType, async: isAsync });
```

- [ ] **Step 4: Update type checker to store async flag**

In `src/typechecker.js`, in the `ExternDeclaration` case in `visitStatement`, find where `this.functions.set` is called. Add `async` to the stored info:

Replace:
```javascript
            this.functions.set(decl.name, {
              typeParams,
              params: paramTypes,
              returnType,
              kmdocParams: new Map(paramTypes.map(p => [p.name, p.type])),
            });
```

With:
```javascript
            this.functions.set(decl.name, {
              typeParams,
              params: paramTypes,
              returnType,
              kmdocParams: new Map(paramTypes.map(p => [p.name, p.type])),
              async: !!decl.async,
            });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`

- [ ] **Step 6: Commit**

```bash
git add src/parser.js src/typechecker.js test/test.js
git commit -m "feat(parser): support async fn in extern declarations"
```

---

### Task 3: Update stdlib extern to mark httpRequest as async

**Files:**
- Modify: `stdlib/http.km`

- [ ] **Step 1: Update the extern declaration**

In `stdlib/http.km`, change:

```kimchi
extern "./_http_helpers.js" {
  fn httpRequest(url: string, method: string, headers: any, body: any, timeout: number): HttpResponse
}
```

To:

```kimchi
extern "./_http_helpers.js" {
  async fn httpRequest(url: string, method: string, headers: any, body: any, timeout: number): HttpResponse
}
```

- [ ] **Step 2: Verify it compiles**

Run: `node src/cli.js check stdlib/http.km 2>&1`
Expected: `{"errors":[]}`

- [ ] **Step 3: Commit**

```bash
git add stdlib/http.km
git commit -m "refactor(stdlib): mark httpRequest extern as async"
```

---

### Task 4: Build two-pass auto-detection in the generator

This is the core task. Replace `containsAsyncBlock` with a full call-graph analysis.

**Files:**
- Modify: `src/generator.js`
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for auto-detection**

Add to `test/test.js`:

```javascript
test('Auto-async: function with shell is async', () => {
  const js = compile('fn main() { dec x = shell { ls } }', { skipTypeCheck: true });
  assertContains(js, 'async function main()');
});

test('Auto-async: function with sleep is async', () => {
  const js = compile('fn main() { sleep 1000 }', { skipTypeCheck: true });
  assertContains(js, 'async function main()');
});

test('Auto-async: function with collect is async', () => {
  const js = compile('fn main() { dec x = collect [a, b] }', { skipTypeCheck: true });
  assertContains(js, 'async function main()');
});

test('Auto-async: function with spawn is async', () => {
  const js = compile('fn main() { dec x = spawn { ls } }', { skipTypeCheck: true });
  assertContains(js, 'async function main()');
});

test('Auto-async: function with worker is async', () => {
  const js = compile('fn main() { dec x = worker() { return 1 } }', { skipTypeCheck: true });
  assertContains(js, 'async function main()');
});

test('Auto-async: pure function is NOT async', () => {
  const js = compile('fn add(a, b) { return a + b }', { skipTypeCheck: true });
  const hasAsync = js.includes('async function add');
  assertEqual(hasAsync, false);
});

test('Auto-async: transitive — caller of async fn is async', () => {
  const source = 'fn inner() { sleep 1000 }\nfn outer() { inner() }';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'async function inner()');
  assertContains(js, 'async function outer()');
});

test('Auto-async: transitive inserts await on call', () => {
  const source = 'fn inner() { sleep 1000 }\nfn outer() { dec x = inner() }';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'await inner()');
});

test('Auto-async: extern async fn call is awaited', () => {
  const source = 'extern "mod" {\n  async fn fetch(url: string): any\n}\nfn main() { dec x = fetch("url") }';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'async function main()');
  assertContains(js, 'await fetch("url")');
});

test('Auto-async: extern non-async fn call is NOT awaited', () => {
  const source = 'extern "mod" {\n  fn parse(s: string): any\n}\nfn main() { dec x = parse("data") }';
  const js = compile(source, { skipTypeCheck: true });
  const hasAwait = js.includes('await parse(');
  assertEqual(hasAwait, false);
});
```

- [ ] **Step 2: Run tests — some may pass (existing containsAsyncBlock), transitive ones will fail**

Run: `node test/test.js 2>&1 | tail -20`

- [ ] **Step 3: Build the async analysis system**

In `src/generator.js`, add a new method `buildAsyncMap` to the CodeGenerator class. This runs before code generation and builds a Set of function names that are async.

```javascript
  buildAsyncMap(ast) {
    const asyncFunctions = new Set();
    const functionBodies = new Map(); // name -> body node
    const functionCalls = new Map(); // name -> Set of called function names
    
    // Collect all function declarations and their bodies
    const collectFunctions = (nodes) => {
      for (const node of nodes) {
        if (node.type === NodeType.FunctionDeclaration) {
          functionBodies.set(node.name, node.body);
          functionCalls.set(node.name, new Set());
        }
      }
    };
    collectFunctions(ast.body);
    
    // Collect extern async functions
    const externAsyncFns = new Set();
    for (const node of ast.body) {
      if (node.type === NodeType.ExternDeclaration) {
        for (const decl of node.declarations) {
          if (decl.kind === 'function' && decl.async) {
            externAsyncFns.add(decl.name);
          }
        }
      }
    }
    
    // Helper: check if a node or its children contain async markers
    const containsAsyncMarker = (node) => {
      if (!node || typeof node !== 'object') return false;
      if (node.type === NodeType.ShellBlock || 
          node.type === NodeType.SpawnBlock || 
          node.type === NodeType.WorkerExpression || 
          node.type === NodeType.SleepStatement ||
          node.type === NodeType.ConcurrentExpression) return true;
      for (const key of Object.keys(node)) {
        if (key === 'type') continue;
        const val = node[key];
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item === 'object' && containsAsyncMarker(item)) return true;
          }
        } else if (val && typeof val === 'object' && val.type) {
          if (containsAsyncMarker(val)) return true;
        }
      }
      return false;
    };
    
    // Helper: collect function calls from a node tree
    const collectCalls = (node, calls) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'CallExpression' && node.callee && node.callee.type === 'Identifier') {
        calls.add(node.callee.name);
      }
      for (const key of Object.keys(node)) {
        if (key === 'type') continue;
        const val = node[key];
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item === 'object') collectCalls(item, calls);
          }
        } else if (val && typeof val === 'object' && val.type) {
          collectCalls(val, calls);
        }
      }
    };
    
    // Seed pass: mark functions with direct async markers
    for (const [name, body] of functionBodies) {
      if (containsAsyncMarker(body)) {
        asyncFunctions.add(name);
      }
      // Collect calls for propagation
      const calls = functionCalls.get(name);
      collectCalls(body, calls);
    }
    
    // Also seed: functions that call extern async functions
    for (const [name, calls] of functionCalls) {
      for (const calledFn of calls) {
        if (externAsyncFns.has(calledFn)) {
          asyncFunctions.add(name);
        }
      }
    }
    
    // Propagation pass: fixed-point iteration
    let changed = true;
    while (changed) {
      changed = false;
      for (const [name, calls] of functionCalls) {
        if (asyncFunctions.has(name)) continue;
        for (const calledFn of calls) {
          if (asyncFunctions.has(calledFn)) {
            asyncFunctions.add(name);
            changed = true;
            break;
          }
        }
      }
    }
    
    // Also include extern async functions in the set for call-site await insertion
    for (const fn of externAsyncFns) {
      asyncFunctions.add(fn);
    }
    
    return asyncFunctions;
  }
```

- [ ] **Step 4: Integrate buildAsyncMap into visitProgram**

In `visitProgram`, right after `this.usedFeatures = this.scanUsedFeatures(node);` (line ~476), add:

```javascript
    // Build async function map for auto-detection
    this.asyncFunctions = this.buildAsyncMap(node);
```

- [ ] **Step 5: Update visitFunctionDeclaration to use asyncFunctions map**

In `visitFunctionDeclaration` (line ~823), replace:

```javascript
    const hasShellBlock = containsAsyncBlock(node.body);
    const async = (node.async || hasShellBlock) ? 'async ' : '';
```

With:

```javascript
    const isAsync = this.asyncFunctions && this.asyncFunctions.has(node.name);
    const async = isAsync ? 'async ' : '';
```

Also update the memoized function check (line ~840):

Replace: `if (node.async) {`
With: `if (isAsync) {`

- [ ] **Step 6: Update visitCallExpression to auto-insert await**

In `src/generator.js`, find `visitCallExpression` (line ~1732):

```javascript
  visitCallExpression(node) {
    // Foo.new(args) → new Foo(args)
    if (node.callee.type === NodeType.MemberExpression && node.callee.property === 'new' && !node.callee.computed) {
      const object = this.visitExpression(node.callee.object);
      const args = node.arguments.map(a => this.visitExpression(a)).join(', ');
      return `new ${object}(${args})`;
    }
    const callee = this.visitExpression(node.callee);
    const args = node.arguments.map(a => this.visitExpression(a)).join(', ');
    return `${callee}(${args})`;
  }
```

Replace with:

```javascript
  visitCallExpression(node) {
    // Foo.new(args) → new Foo(args)
    if (node.callee.type === NodeType.MemberExpression && node.callee.property === 'new' && !node.callee.computed) {
      const object = this.visitExpression(node.callee.object);
      const args = node.arguments.map(a => this.visitExpression(a)).join(', ');
      return `new ${object}(${args})`;
    }
    const callee = this.visitExpression(node.callee);
    const args = node.arguments.map(a => this.visitExpression(a)).join(', ');
    const call = `${callee}(${args})`;
    
    // Auto-insert await for calls to async functions
    if (this.asyncFunctions && node.callee.type === 'Identifier' && this.asyncFunctions.has(node.callee.name)) {
      // Don't double-await — check if this call is NOT already the direct child of an AwaitExpression
      // (During transition period while AwaitExpression still exists)
      return `await ${call}`;
    }
    
    return call;
  }
```

- [ ] **Step 7: Update arrow function generation**

In `visitArrowFunctionExpression` (line ~1779), replace:

```javascript
    const hasShellBlock = containsAsyncBlock(node.body);
    const asyncPrefix = hasShellBlock ? 'async ' : '';
```

With:

```javascript
    // Arrow functions: check if body contains async markers directly
    // (Arrow functions are anonymous, so they're not in the asyncFunctions map)
    const hasAsyncContent = this._containsAsyncMarker(node.body);
    const asyncPrefix = hasAsyncContent ? 'async ' : '';
```

Add a helper method to the class that mirrors the inline function from buildAsyncMap:

```javascript
  _containsAsyncMarker(node) {
    if (!node || typeof node !== 'object') return false;
    if (node.type === NodeType.ShellBlock || 
        node.type === NodeType.SpawnBlock || 
        node.type === NodeType.WorkerExpression || 
        node.type === NodeType.SleepStatement ||
        node.type === NodeType.ConcurrentExpression) return true;
    // Also check for calls to known async functions
    if (node.type === 'CallExpression' && node.callee && node.callee.type === 'Identifier' && 
        this.asyncFunctions && this.asyncFunctions.has(node.callee.name)) return true;
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && this._containsAsyncMarker(item)) return true;
        }
      } else if (val && typeof val === 'object' && val.type) {
        if (this._containsAsyncMarker(val)) return true;
      }
    }
    return false;
  }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All auto-detection tests pass. Existing tests may break due to double-await (existing `async fn` + new auto-await). Those are fixed in Task 6.

- [ ] **Step 9: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat(generator): two-pass auto-detection of async functions"
```

---

### Task 5: Remove async/await keywords from regular code

**Files:**
- Modify: `src/lexer.js` (remove AWAIT keyword)
- Modify: `src/parser.js` (remove AwaitExpression, error on async fn)
- Modify: `src/typechecker.js` (remove _insideAsync, AwaitExpression case)
- Modify: `src/generator.js` (remove AwaitExpression case, remove containsAsyncBlock)

- [ ] **Step 1: Remove AWAIT from lexer**

In `src/lexer.js`, remove from KEYWORDS map:

```javascript
  'await': TokenType.AWAIT,
```

Keep `AWAIT: 'AWAIT'` in TokenType for now (removing it might break references elsewhere).

- [ ] **Step 2: Update parser — error on async fn, remove await parsing**

In `src/parser.js`, find the `if (this.check(TokenType.ASYNC))` block in `parseStatement` (lines ~274-291). Replace it with an error:

```javascript
    if (this.check(TokenType.ASYNC)) {
      // async is only allowed in extern blocks — error everywhere else
      this.error('async/await keywords have been removed. The compiler auto-detects async functions.');
    }
```

Remove the `AwaitExpression` from NodeType enum (line ~44).

In `parsePrimary`, find the await expression parsing (search for `TokenType.AWAIT`) and remove it. Since `await` is no longer a keyword, it'll be parsed as a regular identifier, which is fine.

- [ ] **Step 3: Remove _insideAsync from type checker**

In `src/typechecker.js`:

Remove `this._insideAsync = false;` from the constructor.

Remove the `_insideAsync` save/restore in `visitFunctionDeclaration`:
```javascript
    const previousAsync = this._insideAsync;
    this._insideAsync = !!node.async;
    // ... body ...
    this._insideAsync = previousAsync;
```

Remove all `if (!this._insideAsync)` checks in `visitExpression` for ConcurrentExpression, WorkerExpression, SpawnBlock. These constraints are no longer needed — the compiler auto-detects.

Remove `case NodeType.AwaitExpression:` from `visitExpression`.

Remove the `if (!this._insideAsync)` check in the SpawnBlock case in `visitStatement`.

- [ ] **Step 4: Remove AwaitExpression and containsAsyncBlock from generator**

In `src/generator.js`:

Remove `case NodeType.AwaitExpression:` from `visitExpression`. Since await expressions no longer exist in the AST, this case is dead code.

Delete the `containsAsyncBlock` function at the top of the file (lines 6-24).

- [ ] **Step 5: Run tests**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Some tests will fail because they use `async fn` syntax. Fixed in Task 6.

- [ ] **Step 6: Commit**

```bash
git add src/lexer.js src/parser.js src/typechecker.js src/generator.js
git commit -m "feat: remove async/await keywords from KimchiLang syntax"
```

---

### Task 6: Migrate stdlib, examples, and tests

**Files:**
- Modify: `stdlib/http.km`
- Modify: `examples/async_pipe.km`
- Modify: `test/test.js`
- Modify: `test/stdlib_test.js`

- [ ] **Step 1: Migrate stdlib/http.km**

Remove `async fn` and `await` from all functions:

Replace `expose async fn get(url, options) {` with `expose fn get(url, options) {`
Replace `return await request(url, { ...options, method: "GET" })` with `return request(url, { ...options, method: "GET" })`

Do the same for `post`, `put`, `patch`, `del`, and `request`. Remove `async` from all 6 function signatures and `await` from all return statements.

- [ ] **Step 2: Migrate examples/async_pipe.km**

Remove all `async fn` and `await` from the file. The functions `fetchUser`, `enrichUser`, `formatUser`, `main` become plain `fn`. All `await` expressions become plain calls.

Also rename the file to reflect it's no longer about async:

```bash
git mv examples/async_pipe.km examples/pipe_flow.km
```

- [ ] **Step 3: Update test/test.js — remove async fn syntax from test sources**

Search for all test source strings containing `async fn` and `await`. Update them:

- Tests that use `async fn main() { ... }` → change to `fn main() { ... }`
- Tests that use `await` → remove the `await` keyword
- Tests that check for `async function` in output → keep those (the generator still emits `async function`, it's just auto-detected now)
- Remove tests that specifically test `async fn` parsing acceptance
- Remove tests for `_insideAsync` enforcement (collect/hoard/race/worker/spawn outside async fn)
- Keep tests that verify auto-detection (added in Task 4)

- [ ] **Step 4: Add test for async fn producing parse error**

```javascript
test('async fn is removed — produces parse error', () => {
  let threw = false;
  try {
    compile('async fn main() { sleep 1000 }');
  } catch(e) {
    threw = true;
  }
  assertEqual(threw, true);
});

test('await is removed — treated as identifier', () => {
  // await is no longer a keyword, just an identifier
  const js = compile('fn main() { dec await = 1 }', { skipTypeCheck: true });
  assertContains(js, 'const await = 1');
});
```

- [ ] **Step 5: Run both test suites**

Run: `node test/test.js 2>&1 | tail -5`
Run: `node test/stdlib_test.js 2>&1 | tail -5`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add stdlib/http.km examples/ test/test.js test/stdlib_test.js
git commit -m "refactor: migrate stdlib, examples, and tests to auto-async"
```

---

### Task 7: Update js2km reverse compiler

**Files:**
- Modify: `src/js2km.js`
- Modify: `test/test.js`

- [ ] **Step 1: Remove async emission from js2km**

In `src/js2km.js`:

Find `visitFunctionDeclaration` (line ~111). Remove the async prefix:

Replace:
```javascript
    const asyncPrefix = node.async ? 'async ' : '';

    this.emit(`${prefix}${asyncPrefix}fn ${name}(${params}) {`);
```

With:
```javascript
    this.emit(`${prefix}fn ${name}(${params}) {`);
```

Find the arrow function case (line ~520). Remove the async prefix:

Replace:
```javascript
        const asyncPrefix = node.async ? 'async ' : '';
```

Remove this line and all uses of `asyncPrefix` in the arrow function emission.

Also find `case 'AwaitExpression':` (line ~531) and change it to just visit the argument without emitting `await`:

Replace:
```javascript
      case 'AwaitExpression':
        return `await ${this.visitExpression(node.argument)}`;
```

With:
```javascript
      case 'AwaitExpression':
        return this.visitExpression(node.argument);
```

- [ ] **Step 2: Update js2km tests**

Find the test `'js2km: async function preserved'`. Remove or update it:

Replace:
```javascript
test('js2km: async function preserved', () => {
  const km = convertJS('async function fetchData(url) { return await fetch(url); }');
  assertContains(km, 'async fn fetchData(url)');
});
```

With:
```javascript
test('js2km: async function converted without async keyword', () => {
  const km = convertJS('async function fetchData(url) { return await fetch(url); }');
  assertContains(km, 'fn fetchData(url)');
  // await is stripped — auto-detected by compiler
  const hasAwait = km.includes('await');
  assertEqual(hasAwait, false);
});
```

Similarly update `'js2km: async arrow function preserved'`:

Replace:
```javascript
test('js2km: async arrow function preserved', () => {
  const km = convertJS('const f = async (x) => { return x; };');
  assertContains(km, 'async fn(x)');
});
```

With:
```javascript
test('js2km: async arrow function converted without async', () => {
  const km = convertJS('const f = async (x) => { return x; };');
  assertContains(km, 'fn(x)');
  const hasAsync = km.includes('async');
  assertEqual(hasAsync, false);
});
```

Also update the Express app test to not check for `async fn`:

Find: `assertContains(km, 'async fn(req, res)');`
Replace: `assertContains(km, 'fn(req, res)');`

- [ ] **Step 3: Run tests**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/js2km.js test/test.js
git commit -m "refactor(js2km): remove async/await from reverse compiler output"
```

---

### Task 8: Update docs and roadmap

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/language-guide.md`
- Modify: `docs/concurrency.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Update CLAUDE.md**

Remove all mentions of `async fn` and `await` as user-facing syntax. Update the new language features section — replace the existing async-related bullets with:

```markdown
- The compiler auto-detects async functions — no `async` or `await` keywords needed. Functions containing shell, spawn, worker, collect, hoard, race, sleep, or calls to other async functions are automatically compiled as `async` with `await` inserted at call sites.
- `sleep ms` — pauses execution for N milliseconds. Compiles to `await new Promise(resolve => setTimeout(resolve, ms))`.
```

Remove `async fn` from function examples.

- [ ] **Step 2: Update docs/language-guide.md**

In the Functions section, remove `async fn` examples. Add a note:

```markdown
The compiler auto-detects which functions are async. No `async` or `await` keywords — just call functions normally and the compiler inserts the right JavaScript.
```

In the Shell Interop section, remove mention of "functions containing shell blocks are automatically made async" — now all async detection is automatic.

- [ ] **Step 3: Update docs/concurrency.md**

Remove "Must be inside `async fn`" from all constraints. Replace with:

```markdown
Functions containing concurrency primitives are automatically compiled as async.
```

Remove all `async fn` from code examples in this file.

- [ ] **Step 4: Update README.md**

Update any feature descriptions that mention async/await syntax.

- [ ] **Step 5: Update ROADMAP.md**

Mark "Drop async/await" as done:

Replace: `- [ ] Drop `async`/`await` — compiler auto-detects async-ness from call graph. Blocked by removing `js { }` (can't detect async across JS boundary). Concurrency primitives (`collect`, `hoard`, `race`, `worker`, `spawn`) already implicit-await.`

With: `- [x] ~~Drop `async`/`await`~~ — compiler auto-detects async-ness from call graph. `sleep ms` replaces manual Promise construction.`

- [ ] **Step 6: Run full test suite**

Run: `node test/test.js 2>&1 | tail -5`
Run: `node test/stdlib_test.js 2>&1 | tail -5`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md README.md docs/language-guide.md docs/concurrency.md ROADMAP.md
git commit -m "docs: update all docs for async/await removal and auto-detection"
```
