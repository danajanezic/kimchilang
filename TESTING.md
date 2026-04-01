# Testing & Verification Checklist

Run this checklist after making changes to the language, compiler, stdlib, or interpreter.

## Quick check (after any change)

```bash
node test/test.js          # Compiler tests (327+)
node test/stdlib_test.js   # Stdlib tests (138+)
```

Both must pass with 0 failures.

## Full verification (after language/compiler changes)

### 1. Compiler tests

```bash
node test/test.js
```

Covers: lexer, parser, type checker, generator, concurrency, generics, union types, extern, sleep, auto-async, module singleton.

### 2. Stdlib tests

```bash
node test/stdlib_test.js
```

Covers: compilation of every stdlib module (math, string, array, object, date, json, console, promise, http, logger, bitwise, function, index).

### 3. Example apps

```bash
# Core examples
kimchi run examples/hello.kimchi
kimchi run examples/fibonacci.kimchi
kimchi run examples/memo_fibonacci.km
kimchi run examples/pipe_flow.km
kimchi run examples/reduce_pattern_match.km
kimchi run examples/shell_example.km
kimchi run examples/readme_examples.km

# Web server (requires port 3000 free)
kimchi run examples/web/app.km
# In another terminal: curl http://localhost:3000/health
```

### 4. Built-in test runner

```bash
kimchi test examples/test_example.km
```

Expected: 18 passed, 1 skipped, 0 failed.

### 5. create-kimchi-app

```bash
cd /tmp
npx create-kimchi-app test-app
cd test-app
kimchi run src/main.km                  # Should print greeting
kimchi test tests/utils.test.km         # Should pass 3 tests
cd -
rm -rf /tmp/test-app
```

### 6. Static file compilation

```bash
kimchi run examples/use_config.km
```

Expected: prints app config values (AppName, Version, Colors, etc).

### 7. Reverse compiler

```bash
kimchi convert examples/shell-example.mjs
```

Should produce KimchiLang output with extern declarations and Foo.new() syntax.

## What to check after specific changes

### Lexer changes (new tokens/keywords)

- [ ] New keyword doesn't conflict with existing function names in stdlib or examples
- [ ] `parseFunctionDeclaration` accepts keywords as function names (line ~619)
- [ ] Run: `node test/test.js`

### Parser changes (new AST nodes)

- [ ] NodeType added to enum
- [ ] Handling in `parseStatement` or `parsePrimary`
- [ ] `visitStatement` or `visitExpression` in type checker handles new node
- [ ] `visitStatement` or `visitExpression` in generator handles new node
- [ ] `parseExternType` stops at new statement-starting keywords if applicable
- [ ] Run: `node test/test.js`

### Type checker changes

- [ ] New node type handled in `visitExpression` or `visitStatement`
- [ ] `isCompatible` updated if new type kind added
- [ ] `parseTypeString` updated if new type syntax
- [ ] `typeToString` updated for display
- [ ] Run: `node test/test.js`

### Generator changes

- [ ] New node type handled in `visitExpression` or `visitStatement`
- [ ] `scanUsedFeatures` detects new node for tree-shaking if runtime helper needed
- [ ] `buildAsyncMap` updated if new node is async marker
- [ ] `visitConcurrentExpression` handles new node if it can appear in collect/hoard/race
- [ ] `visitProgram` filters new node from `otherStatements` if it's a declaration
- [ ] Run: `node test/test.js`

### Stdlib changes

- [ ] Module compiles: `kimchi check stdlib/<module>.km`
- [ ] Extern helpers (if any) exist as `_<name>_helpers.js`
- [ ] Run: `node test/stdlib_test.js`

### Interpreter changes

- [ ] `_resolveDeps` handles new import patterns
- [ ] `_copyExternHelpers` copies JS files for new extern modules
- [ ] Static file compilation works for new dep patterns
- [ ] Run: `kimchi run examples/hello.kimchi` (basic)
- [ ] Run: `kimchi run examples/use_config.km` (static deps)
- [ ] Run: `kimchi run examples/web/app.km` (stdlib deps with extern)

### Web server changes

- [ ] `stdlib/web/_server_helpers.js` is valid: `node -e "import('./stdlib/web/_server_helpers.js')"`
- [ ] `stdlib/web/server.km` compiles: `kimchi check stdlib/web/server.km`
- [ ] Server starts and responds: `kimchi run examples/web/app.km` + `curl localhost:3000/health`

### Documentation changes

- [ ] CLAUDE.md reflects current language features
- [ ] README.md features list is accurate
- [ ] docs/language-guide.md has no outdated syntax
- [ ] docs/concurrency.md has no `async fn` in examples
- [ ] ROADMAP.md completed items are marked with [x]

## Known limitations

- `kimchi run` from subdirectories: dep paths resolve relative to project root, not cwd
- `kimchi compile` overwrites source if output isn't specified with `-o` and file has same name
- `== null` checks: KimchiLang's `==` compiles to `===`, so `undefined !== null`. The web server uses Proxy to normalize this for request objects.
- Linter reports "unreachable code" for pattern matching arms (false positive)
- Linter reports "unused function" for functions only called via pipes or callbacks
