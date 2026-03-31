# Module Singleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `module singleton` directive — modules marked singleton are instantiated once, with subsequent imports returning the cached instance.

**Architecture:** New `MODULE` keyword token, `ModuleDirective` AST node parsed at the top of files, and generator changes to wrap singleton module factories with a cache check. The cache lives in a module-level `let _singletonCache` variable. Overrides bypass the cache for testing.

**Tech Stack:** Pure JavaScript, zero dependencies.

---

### Task 1: Lexer + Parser — `module` keyword and `ModuleDirective` node

**Files:**
- Modify: `src/lexer.js`
- Modify: `src/parser.js`
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/test.js`:

```javascript
test('Tokenize module keyword', () => {
  const tokens = tokenize('module singleton');
  assertEqual(tokens[0].type, 'MODULE');
  assertEqual(tokens[0].value, 'module');
});

test('Parse module singleton directive', () => {
  const ast = parse(tokenize('module singleton\nfn main() { return 1 }'));
  assertEqual(ast.body[0].type, 'ModuleDirective');
  assertEqual(ast.body[0].directive, 'singleton');
});

test('Parse module with unknown directive errors', () => {
  let threw = false;
  try {
    parse(tokenize('module foobar'));
  } catch(e) {
    threw = true;
  }
  assertEqual(threw, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`

- [ ] **Step 3: Add MODULE token to lexer**

In `src/lexer.js`, add to TokenType enum after `TYPE`:

```javascript
  MODULE: 'MODULE',
```

Add to KEYWORDS map after `'type'`:

```javascript
  'module': TokenType.MODULE,
```

- [ ] **Step 4: Add ModuleDirective to parser**

In `src/parser.js`, add to NodeType enum after `TypeDeclaration`:

```javascript
  ModuleDirective: 'ModuleDirective',
```

Add `parseModuleDirective` method:

```javascript
  parseModuleDirective() {
    this.expect(TokenType.MODULE, 'Expected module');
    const directiveToken = this.expect(TokenType.IDENTIFIER, 'Expected directive name after module');
    const directive = directiveToken.value;
    
    const validDirectives = ['singleton'];
    if (!validDirectives.includes(directive)) {
      this.error(`Unknown module directive '${directive}'. Valid directives: ${validDirectives.join(', ')}`);
    }
    
    return {
      type: NodeType.ModuleDirective,
      directive,
    };
  }
```

Hook into `parseStatement()`. Add before the `type` check:

```javascript
    if (this.check(TokenType.MODULE)) {
      return this.parseModuleDirective();
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`

- [ ] **Step 6: Commit**

```bash
git add src/lexer.js src/parser.js test/test.js
git commit -m "feat(lexer,parser): add module directive with singleton support"
```

---

### Task 2: Generator — singleton caching in module factory

**Files:**
- Modify: `src/generator.js`
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/test.js`:

```javascript
test('Generate module singleton has cache variable', () => {
  const source = 'module singleton\nexpose fn hello() { return "hi" }';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'let _singletonCache;');
});

test('Generate module singleton has cache check', () => {
  const source = 'module singleton\nexpose fn hello() { return "hi" }';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '_singletonCache');
  assertContains(js, 'return _singletonCache');
});

test('Generate module singleton caches result', () => {
  const source = 'module singleton\nexpose fn hello() { return "hi" }';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '_singletonCache =');
});

test('Generate module singleton bypasses cache with overrides', () => {
  const source = 'module singleton\nexpose fn hello() { return "hi" }';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '_hasOverrides');
});

test('Generate non-singleton module has no cache', () => {
  const source = 'expose fn hello() { return "hi" }';
  const js = compile(source, { skipTypeCheck: true });
  const hasCache = js.includes('_singletonCache');
  assertEqual(hasCache, false);
});

test('Generate module singleton with deps', () => {
  const source = 'module singleton\nas db dep myapp.db\nexpose fn query() { return db.run() }';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '_singletonCache');
  assertContains(js, '_dep_db');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`

- [ ] **Step 3: Update visitProgram for singleton**

In `src/generator.js`, in `visitProgram` (line ~547), add detection for the singleton directive. Right after the statement filtering block (after `otherStatements` is defined, around line 560), add:

```javascript
    // Detect module directives
    const moduleDirectives = node.body.filter(stmt => stmt.type === NodeType.ModuleDirective);
    const isSingleton = moduleDirectives.some(d => d.directive === 'singleton');
```

Also add `ModuleDirective` to the `otherStatements` filter:

```javascript
      stmt.type !== NodeType.TypeDeclaration &&
      stmt.type !== NodeType.ModuleDirective
```

Before the `export default async function` line (line ~643), add the singleton cache variable if needed:

```javascript
    // Singleton cache
    if (isSingleton) {
      this.emitLine('let _singletonCache;');
    }
```

Right after the `export default async function(_opts = {}) {` line and the `this.pushIndent()`, add the singleton cache check:

```javascript
    // Singleton: return cached instance if no overrides
    if (isSingleton) {
      this.emitLine('const _hasOverrides = Object.keys(_opts).length > 0;');
      this.emitLine('if (_singletonCache && !_hasOverrides) return _singletonCache;');
      this.emitLine();
    }
```

Before the `return { exports }` line (around line 721), add the singleton cache store:

```javascript
    if (isSingleton && exports.length > 0) {
      this.emitLine();
      this.emitLine(`if (!_hasOverrides) _singletonCache = { ${exports.join(', ')} };`);
    }
```

- [ ] **Step 4: Add ModuleDirective no-op to visitStatement**

In `visitStatement`, add:

```javascript
      case NodeType.ModuleDirective:
        // Module directives are handled in visitProgram
        break;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 6 new tests pass. No existing tests broken.

- [ ] **Step 6: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat(generator): singleton caching for module factories"
```

---

### Task 3: End-to-end tests

**Files:**
- Test: `test/test.js`

- [ ] **Step 1: Write end-to-end tests**

Add to `test/test.js`:

```javascript
test('E2E: module singleton compiles with type checking', () => {
  const source = `
module singleton

expose fn greet(name) {
  return "hello " + name
}`;
  const js = compile(source);
  assertContains(js, 'let _singletonCache;');
  assertContains(js, 'if (_singletonCache && !_hasOverrides) return _singletonCache;');
  assertContains(js, 'function greet(name)');
});

test('E2E: module singleton with args compiles', () => {
  const source = `
module singleton

!arg dbUrl

expose fn getUrl() {
  return dbUrl
}`;
  const js = compile(source);
  assertContains(js, '_singletonCache');
  assertContains(js, "Required argument 'dbUrl'");
});

test('E2E: module singleton with extern compiles', () => {
  const source = `
module singleton

extern "pg" {
  dec Pool: any
}

dec pool = Pool.new({host: "localhost"})

expose fn query(sql) {
  return pool
}`;
  const js = compile(source);
  assertContains(js, '_singletonCache');
  assertContains(js, "import { Pool } from 'pg'");
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add test/test.js
git commit -m "test: add end-to-end tests for module singleton"
```

---

### Task 4: Update ROADMAP.md

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Mark module singleton as done**

In `ROADMAP.md`, find:

```markdown
- [ ] `module singleton` — module directive that caches the factory result.
```

Replace with:

```markdown
- [x] ~~`module singleton` — module directive that caches the factory result. First call creates the instance, subsequent imports return cached. Overrides bypass cache for testing. Producer declares, consumer unaware.~~
```

- [ ] **Step 2: Run full test suite**

Run: `node test/test.js 2>&1 | tail -5`
Run: `node test/stdlib_test.js 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: mark module singleton as done"
```
