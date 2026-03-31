# Extern Declarations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `extern` declarations that provide typed contracts for JS modules, compiling to tree-shaken static `import` statements.

**Architecture:** A new `EXTERN` keyword token, two AST node types (`ExternDeclaration` for named exports, `ExternDefaultDeclaration` for default exports), type checker integration reusing the existing `parseTypeString` method for type annotations, and generator changes to emit tree-shaken `import` statements before the runtime import.

**Tech Stack:** Pure JavaScript, zero dependencies. Modifies lexer, parser, type checker, and generator.

---

### Task 1: Lexer — Add `extern` keyword token

**Files:**
- Modify: `src/lexer.js:3-112` (TokenType enum)
- Modify: `src/lexer.js:114-165` (KEYWORDS map)
- Test: `test/test.js`

- [ ] **Step 1: Write failing test**

Add to `test/test.js` after the existing lexer tests:

```javascript
test('Tokenize extern keyword', () => {
  const tokens = tokenize('extern "node:fs" { }');
  assertEqual(tokens[0].type, 'EXTERN');
  assertEqual(tokens[0].value, 'extern');
});
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failure — `extern` tokenized as `IDENTIFIER`.

- [ ] **Step 3: Add EXTERN token type**

In `src/lexer.js`, add after `RACE: 'RACE',` in the Keywords section:

```javascript
  EXTERN: 'EXTERN',
```

- [ ] **Step 4: Add extern to KEYWORDS map**

In `src/lexer.js`, add after `'race': TokenType.RACE,`:

```javascript
  'extern': TokenType.EXTERN,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lexer.js test/test.js
git commit -m "feat(lexer): add extern keyword token"
```

---

### Task 2: Parser — Parse named extern declarations

**Files:**
- Modify: `src/parser.js:5-81` (NodeType enum)
- Modify: `src/parser.js` (add parseExternDeclaration method)
- Modify: `src/parser.js:329+` (parseStatement — add extern handling)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for named extern**

Add to `test/test.js` after the parser tests:

```javascript
test('Parse named extern with functions', () => {
  const source = 'extern "node:fs" {\n  fn readFileSync(path: string): string\n  fn existsSync(path: string): boolean\n}';
  const ast = parse(tokenize(source));
  const ext = ast.body[0];
  assertEqual(ext.type, 'ExternDeclaration');
  assertEqual(ext.source, 'node:fs');
  assertEqual(ext.declarations.length, 2);
  assertEqual(ext.declarations[0].kind, 'function');
  assertEqual(ext.declarations[0].name, 'readFileSync');
  assertEqual(ext.declarations[0].params.length, 1);
  assertEqual(ext.declarations[0].params[0].name, 'path');
  assertEqual(ext.declarations[0].params[0].typeAnnotation, 'string');
  assertEqual(ext.declarations[0].returnType, 'string');
  assertEqual(ext.declarations[1].name, 'existsSync');
});

test('Parse named extern with values', () => {
  const source = 'extern "node:process" {\n  dec env: any\n  dec pid: number\n}';
  const ast = parse(tokenize(source));
  const ext = ast.body[0];
  assertEqual(ext.type, 'ExternDeclaration');
  assertEqual(ext.source, 'node:process');
  assertEqual(ext.declarations.length, 2);
  assertEqual(ext.declarations[0].kind, 'value');
  assertEqual(ext.declarations[0].name, 'env');
  assertEqual(ext.declarations[0].valueType, 'any');
  assertEqual(ext.declarations[1].name, 'pid');
  assertEqual(ext.declarations[1].valueType, 'number');
});

test('Parse named extern with mixed fn and dec', () => {
  const source = 'extern "pg" {\n  fn query(sql: string): any\n  dec Pool: any\n}';
  const ast = parse(tokenize(source));
  const ext = ast.body[0];
  assertEqual(ext.declarations.length, 2);
  assertEqual(ext.declarations[0].kind, 'function');
  assertEqual(ext.declarations[1].kind, 'value');
});

test('Parse extern fn with no params', () => {
  const source = 'extern "mod" {\n  fn now(): number\n}';
  const ast = parse(tokenize(source));
  assertEqual(ast.body[0].declarations[0].params.length, 0);
  assertEqual(ast.body[0].declarations[0].returnType, 'number');
});

test('Parse extern fn with multiple params', () => {
  const source = 'extern "mod" {\n  fn write(path: string, data: string, enc: string): void\n}';
  const ast = parse(tokenize(source));
  const fn = ast.body[0].declarations[0];
  assertEqual(fn.params.length, 3);
  assertEqual(fn.params[2].name, 'enc');
  assertEqual(fn.params[2].typeAnnotation, 'string');
  assertEqual(fn.returnType, 'void');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failures — parser doesn't recognize `extern`.

- [ ] **Step 3: Add node types to NodeType enum**

In `src/parser.js`, add after `SpawnBlock: 'SpawnBlock',`:

```javascript
  ExternDeclaration: 'ExternDeclaration',
  ExternDefaultDeclaration: 'ExternDefaultDeclaration',
```

- [ ] **Step 4: Implement parseExternDeclaration**

Add a new method to the `Parser` class:

```javascript
  parseExternDeclaration() {
    this.expect(TokenType.EXTERN, 'Expected extern');
    
    // Check for default: extern default "module" as name: type
    if (this.check(TokenType.IDENTIFIER) && this.peek().value === 'default') {
      return this.parseExternDefaultDeclaration();
    }
    
    // Named: extern "module" { fn/dec declarations }
    const sourceToken = this.expect(TokenType.STRING, 'Expected module path string after extern');
    const source = sourceToken.value;
    
    this.skipNewlines();
    this.expect(TokenType.LBRACE, 'Expected { after extern module path');
    
    const declarations = [];
    
    this.skipNewlines();
    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      if (this.check(TokenType.FN)) {
        this.advance(); // consume fn
        const name = this.expect(TokenType.IDENTIFIER, 'Expected function name').value;
        this.expect(TokenType.LPAREN, 'Expected ( after function name');
        
        const params = [];
        if (!this.check(TokenType.RPAREN)) {
          do {
            const paramName = this.expect(TokenType.IDENTIFIER, 'Expected parameter name').value;
            this.expect(TokenType.COLON, 'Expected : after parameter name');
            const typeAnnotation = this.parseExternType();
            params.push({ name: paramName, typeAnnotation });
          } while (this.match(TokenType.COMMA));
        }
        this.expect(TokenType.RPAREN, 'Expected )');
        
        this.expect(TokenType.COLON, 'Expected : before return type');
        const returnType = this.parseExternType();
        
        declarations.push({ kind: 'function', name, params, returnType });
      } else if (this.check(TokenType.DEC)) {
        this.advance(); // consume dec
        const name = this.expect(TokenType.IDENTIFIER, 'Expected value name').value;
        this.expect(TokenType.COLON, 'Expected : after value name');
        const valueType = this.parseExternType();
        
        declarations.push({ kind: 'value', name, valueType });
      } else {
        this.error('Expected fn or dec in extern block');
      }
      this.skipNewlines();
    }
    
    this.expect(TokenType.RBRACE, 'Expected } to close extern block');
    
    return {
      type: NodeType.ExternDeclaration,
      source,
      declarations,
    };
  }

  parseExternType() {
    // Collect type tokens until we hit a delimiter (comma, rparen, newline, rbrace)
    // Types can be: string, number, boolean, null, void, any, type[], {key: type}, (type) => type
    let type = '';
    let depth = 0;
    
    while (!this.check(TokenType.EOF)) {
      // Stop at delimiters when not inside nested braces/parens
      if (depth === 0) {
        if (this.check(TokenType.COMMA) || this.check(TokenType.RPAREN) || this.check(TokenType.RBRACE) || this.check(TokenType.NEWLINE)) {
          break;
        }
      }
      
      const token = this.peek();
      if (token.type === TokenType.LPAREN) depth++;
      else if (token.type === TokenType.RPAREN) depth--;
      else if (token.type === TokenType.LBRACE) depth++;
      else if (token.type === TokenType.RBRACE) depth--;
      
      type += token.value;
      this.advance();
    }
    
    return type.trim();
  }
```

- [ ] **Step 5: Hook into parseStatement**

In `parseStatement()`, add before the `async` check (around line 260):

```javascript
    if (this.check(TokenType.EXTERN)) {
      return this.parseExternDeclaration();
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 5 new parser tests pass. No existing tests broken.

- [ ] **Step 7: Commit**

```bash
git add src/parser.js test/test.js
git commit -m "feat(parser): parse named extern declarations"
```

---

### Task 3: Parser — Parse default extern declarations

**Files:**
- Modify: `src/parser.js` (add parseExternDefaultDeclaration method)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for default extern**

Add to `test/test.js`:

```javascript
test('Parse extern default declaration', () => {
  const source = 'extern default "express" as express: any';
  const ast = parse(tokenize(source));
  const ext = ast.body[0];
  assertEqual(ext.type, 'ExternDefaultDeclaration');
  assertEqual(ext.source, 'express');
  assertEqual(ext.alias, 'express');
  assertEqual(ext.aliasType, 'any');
});

test('Parse extern default with complex type', () => {
  const source = 'extern default "pg" as pg: {Pool: any, Client: any}';
  const ast = parse(tokenize(source));
  const ext = ast.body[0];
  assertEqual(ext.type, 'ExternDefaultDeclaration');
  assertEqual(ext.source, 'pg');
  assertEqual(ext.alias, 'pg');
  assertEqual(ext.aliasType, '{Pool: any, Client: any}');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failures — parseExternDefaultDeclaration not yet implemented.

- [ ] **Step 3: Implement parseExternDefaultDeclaration**

Add to the `Parser` class:

```javascript
  parseExternDefaultDeclaration() {
    // Already consumed 'extern', now at 'default'
    this.advance(); // consume 'default'
    
    const sourceToken = this.expect(TokenType.STRING, 'Expected module path string after extern default');
    const source = sourceToken.value;
    
    // Expect 'as' keyword
    if (!this.check(TokenType.AS)) {
      this.error('Expected as after extern default module path');
    }
    this.advance(); // consume 'as'
    
    const alias = this.expect(TokenType.IDENTIFIER, 'Expected alias name after as').value;
    this.expect(TokenType.COLON, 'Expected : after alias name');
    const aliasType = this.parseExternType();
    
    return {
      type: NodeType.ExternDefaultDeclaration,
      source,
      alias,
      aliasType,
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All tests pass including the 2 new default extern tests.

- [ ] **Step 5: Commit**

```bash
git add src/parser.js test/test.js
git commit -m "feat(parser): parse extern default declarations"
```

---

### Task 4: Type checker — Register extern symbols and validate usage

**Files:**
- Modify: `src/typechecker.js:280-350` (visitStatement — add ExternDeclaration and ExternDefaultDeclaration cases)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for type checking**

Add to `test/test.js`:

```javascript
test('Type checker: extern fn registers in scope', () => {
  const source = 'extern "mod" {\n  fn greet(name: string): string\n}\ndec x = greet("hi")';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  // greet should be recognized — no "undefined variable" errors for greet
  const greetErrors = errors.filter(e => e.message.includes('greet'));
  assertEqual(greetErrors.length, 0);
});

test('Type checker: extern dec registers in scope', () => {
  const source = 'extern "mod" {\n  dec config: any\n}\ndec x = config';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const configErrors = errors.filter(e => e.message.includes('config'));
  assertEqual(configErrors.length, 0);
});

test('Type checker: extern default registers in scope', () => {
  const source = 'extern default "express" as express: any\ndec app = express()';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const expressErrors = errors.filter(e => e.message.includes('express'));
  assertEqual(expressErrors.length, 0);
});

test('Type checker: extern fn validates param types', () => {
  const source = 'extern "mod" {\n  fn readFile(path: string): string\n}\ndec x = readFile(123)';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  // Should have a type error — passing number where string expected
  const typeErrors = errors.filter(e => e.message.includes('Expected string'));
  assertEqual(typeErrors.length, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failures — type checker doesn't know about extern nodes.

- [ ] **Step 3: Add ExternDeclaration handling to visitStatement**

In `src/typechecker.js`, in `visitStatement`, add cases:

```javascript
      case NodeType.ExternDeclaration: {
        for (const decl of node.declarations) {
          if (decl.kind === 'function') {
            const paramTypes = decl.params.map(p => ({
              name: p.name,
              type: this.parseTypeString(p.typeAnnotation),
            }));
            const returnType = this.parseTypeString(decl.returnType);
            this.defineVariable(decl.name, this.createFunctionType(
              paramTypes.map(p => p.type),
              returnType
            ));
            this.functions.set(decl.name, {
              params: paramTypes,
              returnType,
              kmdocParams: new Map(paramTypes.map(p => [p.name, p.type])),
            });
          } else if (decl.kind === 'value') {
            this.defineVariable(decl.name, this.parseTypeString(decl.valueType));
          }
        }
        break;
      }
      case NodeType.ExternDefaultDeclaration: {
        this.defineVariable(node.alias, this.parseTypeString(node.aliasType));
        break;
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 4 new type checker tests pass. No existing tests broken.

- [ ] **Step 5: Commit**

```bash
git add src/typechecker.js test/test.js
git commit -m "feat(typechecker): register extern symbols and validate call sites"
```

---

### Task 5: Generator — Emit tree-shaken imports for extern declarations

**Files:**
- Modify: `src/generator.js:434+` (visitProgram — collect externs and emit imports)
- Modify: `src/generator.js:560+` (visitStatement — skip extern nodes)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for extern code generation**

Add to `test/test.js`:

```javascript
test('Generate extern named import for used symbol', () => {
  const source = 'extern "node:fs" {\n  fn readFileSync(path: string): string\n}\ndec x = readFileSync("file.txt")';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, "import { readFileSync } from 'node:fs'");
});

test('Generate extern does not import unused symbols', () => {
  const source = 'extern "node:fs" {\n  fn readFileSync(path: string): string\n  fn writeFileSync(path: string, data: string): void\n}\ndec x = readFileSync("file.txt")';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, "import { readFileSync } from 'node:fs'");
  const hasWrite = js.includes('writeFileSync');
  // writeFileSync should only appear in the extern block comment, not in an import
  const importLine = js.split('\n').find(l => l.includes('import') && l.includes('node:fs'));
  assertEqual(importLine.includes('writeFileSync'), false);
});

test('Generate extern default import', () => {
  const source = 'extern default "express" as express: any\ndec app = express()';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, "import express from 'express'");
});

test('Generate extern default not imported if unused', () => {
  const source = 'extern default "express" as express: any\ndec x = 1';
  const js = compile(source, { skipTypeCheck: true });
  const hasImport = js.includes("import express from");
  assertEqual(hasImport, false);
});

test('Generate extern imports before runtime import', () => {
  const source = 'extern "node:fs" {\n  fn readFileSync(path: string): string\n}\ndec x = readFileSync("f")';
  const js = compile(source, { skipTypeCheck: true });
  const fsImportIdx = js.indexOf("import { readFileSync }");
  const runtimeImportIdx = js.indexOf("import { _obj, error }");
  assertEqual(fsImportIdx < runtimeImportIdx, true);
});

test('Generate extern produces no runtime code for the block itself', () => {
  const source = 'extern "node:fs" {\n  fn readFileSync(path: string): string\n}';
  const js = compile(source, { skipTypeCheck: true });
  // Should not contain readFileSync anywhere (not used, not imported)
  const hasRead = js.includes('readFileSync');
  assertEqual(hasRead, false);
});

test('Generate multiple extern blocks from same module', () => {
  const source = 'extern "node:fs" {\n  fn readFileSync(path: string): string\n}\nextern "node:fs" {\n  fn existsSync(path: string): boolean\n}\ndec a = readFileSync("f")\ndec b = existsSync("f")';
  const js = compile(source, { skipTypeCheck: true });
  // Both should be in a single import
  assertContains(js, 'readFileSync');
  assertContains(js, 'existsSync');
  assertContains(js, "from 'node:fs'");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failures — extern nodes cause `Unknown node type` errors.

- [ ] **Step 3: Collect used identifiers from AST**

Add a helper method to the generator class in `src/generator.js`:

```javascript
  collectUsedIdentifiers(node) {
    const used = new Set();
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (n.type === 'Identifier' && n.name) used.add(n.name);
      if (n.type === 'CallExpression' && n.callee && n.callee.type === 'Identifier') used.add(n.callee.name);
      if (n.type === 'CallExpression' && n.callee && n.callee.type === 'MemberExpression' && n.callee.object && n.callee.object.type === 'Identifier') used.add(n.callee.object.name);
      if (n.type === 'MemberExpression' && n.object && n.object.type === 'Identifier') used.add(n.object.name);
      for (const key of Object.keys(n)) {
        if (key === 'type') continue;
        const val = n[key];
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item === 'object') walk(item);
          }
        } else if (val && typeof val === 'object' && val.type) {
          walk(val);
        }
      }
    };
    walk(node);
    return used;
  }
```

- [ ] **Step 4: Update visitProgram to emit extern imports**

In `src/generator.js`, in `visitProgram` (line 434), add extern import emission. Insert BEFORE the dep statement loop (before line 448 `// First, emit the raw imports for all dependencies`):

```javascript
    // Collect extern declarations and emit tree-shaken imports
    const externDeclarations = node.body.filter(stmt => stmt.type === NodeType.ExternDeclaration);
    const externDefaults = node.body.filter(stmt => stmt.type === NodeType.ExternDefaultDeclaration);
    const usedIdentifiers = this.collectUsedIdentifiers(node);
    
    // Group named externs by source module
    const namedByModule = new Map();
    for (const ext of externDeclarations) {
      const usedNames = ext.declarations
        .map(d => d.name)
        .filter(name => usedIdentifiers.has(name));
      if (usedNames.length > 0) {
        if (!namedByModule.has(ext.source)) {
          namedByModule.set(ext.source, []);
        }
        namedByModule.get(ext.source).push(...usedNames);
      }
    }
    
    // Emit named extern imports
    for (const [source, names] of namedByModule) {
      const uniqueNames = [...new Set(names)];
      this.emitLine(`import { ${uniqueNames.join(', ')} } from '${source}';`);
    }
    
    // Emit default extern imports (only if alias is used)
    for (const ext of externDefaults) {
      if (usedIdentifiers.has(ext.alias)) {
        this.emitLine(`import ${ext.alias} from '${ext.source}';`);
      }
    }
    
    if (namedByModule.size > 0 || externDefaults.some(e => usedIdentifiers.has(e.alias))) {
      this.emitLine();
    }
```

- [ ] **Step 5: Filter extern nodes out of otherStatements**

In `visitProgram`, update the `otherStatements` filter (around line 440) to also exclude extern declarations:

```javascript
    const otherStatements = node.body.filter(stmt => 
      stmt.type !== NodeType.DepStatement && 
      stmt.type !== NodeType.ArgDeclaration && 
      stmt.type !== NodeType.EnvDeclaration &&
      stmt.type !== NodeType.ExternDeclaration &&
      stmt.type !== NodeType.ExternDefaultDeclaration
    );
```

- [ ] **Step 6: Add extern cases to visitStatement (no-op)**

In `visitStatement` in `src/generator.js`, add cases that do nothing (extern blocks produce no runtime code):

```javascript
      case NodeType.ExternDeclaration:
      case NodeType.ExternDefaultDeclaration:
        // Extern declarations produce no runtime code — imports handled in visitProgram
        break;
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 7 new generator tests pass. No existing tests broken.

- [ ] **Step 8: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat(generator): emit tree-shaken imports for extern declarations"
```

---

### Task 6: End-to-end tests

**Files:**
- Test: `test/test.js`

- [ ] **Step 1: Write end-to-end compilation tests**

Add to `test/test.js`:

```javascript
test('E2E: extern named fn compiles with type checking', () => {
  const source = `
extern "node:fs" {
  fn readFileSync(path: string): string
  fn existsSync(path: string): boolean
}

fn main() {
  dec content = readFileSync("file.txt")
  dec exists = existsSync("file.txt")
  print content
}
main()`;
  const js = compile(source);
  assertContains(js, "import { readFileSync, existsSync } from 'node:fs'");
  assertContains(js, 'readFileSync("file.txt")');
  assertContains(js, 'existsSync("file.txt")');
});

test('E2E: extern default compiles with type checking', () => {
  const source = `
extern default "express" as express: any

fn main() {
  dec app = express()
  print app
}
main()`;
  const js = compile(source);
  assertContains(js, "import express from 'express'");
  assertContains(js, 'express()');
});

test('E2E: extern dec value compiles with type checking', () => {
  const source = `
extern "node:process" {
  dec env: any
}

fn main() {
  dec home = env.HOME
  print home
}
main()`;
  const js = compile(source);
  assertContains(js, "import { env } from 'node:process'");
});

test('E2E: extern with async and collect', () => {
  const source = `
extern "node:fs/promises" {
  fn readFile(path: string): any
}

async fn main() {
  dec [a, b] = collect [readFile.("a.txt"), readFile.("b.txt")]
  print a
}
main()`;
  const js = compile(source);
  assertContains(js, "import { readFile } from 'node:fs/promises'");
  assertContains(js, 'Promise.all([readFile("a.txt"), readFile("b.txt")])');
});

test('E2E: extern unused symbols not imported', () => {
  const source = `
extern "node:fs" {
  fn readFileSync(path: string): string
  fn writeFileSync(path: string, data: string): void
}

fn main() {
  dec x = readFileSync("f")
}
main()`;
  const js = compile(source);
  assertContains(js, "import { readFileSync } from 'node:fs'");
  const importLine = js.split('\n').find(l => l.includes("from 'node:fs'"));
  assertEqual(importLine.includes('writeFileSync'), false);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All tests pass, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add test/test.js
git commit -m "test: add end-to-end tests for extern declarations"
```

---

### Task 7: Update ROADMAP.md

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Mark extern declarations as done**

In `ROADMAP.md`, update the extern line to:

```markdown
- [x] ~~`extern` declarations — typed contracts for JS modules (`extern "node:fs" { fn readFileSync(path: string): string }`). Compiles to tree-shaken `import` statements. Supports named and default exports.~~
```

- [ ] **Step 2: Run full test suite**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All tests pass, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: mark extern declarations as done"
```
