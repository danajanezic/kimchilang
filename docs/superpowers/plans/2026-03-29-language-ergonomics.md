# Language Ergonomics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six language features (`mut`, `??`, `guard...else`, `match` expression, `.if().else()`) to KimchiLang to improve writability and reduce nested control flow.

**Architecture:** Each feature touches the same five compiler files (lexer, parser, typechecker, linter, generator) plus tests. Features are independent — each task produces a working, testable increment. The implementation order is chosen so later features can build on earlier ones: `mut` first (foundational), `??` (simple operator), `guard` (simple statement), `match` expression (complex), `.if().else()` (depends on parser patterns from match).

**Tech Stack:** Node.js ES modules, zero dependencies. Custom test harness.

**Spec:** `docs/superpowers/specs/2026-03-29-language-ergonomics-design.md`

---

## File Map

| File | Changes |
|------|---------|
| `src/lexer.js` | Add tokens: `MUT`, `GUARD`, `NULLISH`, `WHEN`, `MATCH_KEYWORD` |
| `src/parser.js` | Add node types: `MutDeclaration`, `GuardStatement`, `MatchBlock`, `MatchArm`, `ConditionalMethodExpression`. Add parsing methods for each. Modify `parseStatement()`, `parseAssignment()`, expression chain. |
| `src/typechecker.js` | Add `MutDeclaration` visitor, mut-in-closure detection, `GuardStatement` exit validation, `MatchBlock` visitor, `NullishExpression` visitor, `ConditionalMethodExpression` visitor. |
| `src/linter.js` | Add `MutDeclaration` to declaration collection and analysis. Add `mut-never-reassigned` lint rule. Add `GuardStatement`, `MatchBlock`, `ConditionalMethodExpression` analysis. |
| `src/generator.js` | Add code generation for all six features. |
| `test/test.js` | Add test sections for each feature. |

---

### Task 1: `mut` — Lexer and Parser

**Files:**
- Modify: `src/lexer.js:3-99` (TokenType enum), `src/lexer.js:101-141` (KEYWORDS map)
- Modify: `src/parser.js:6-68` (NodeType enum), `src/parser.js:164-256` (parseStatement), `src/parser.js:342-399` (parseDecDeclaration as reference), `src/parser.js:1143-1171` (parseAssignment / checkDecImmutability)
- Test: `test/test.js`

- [ ] **Step 1: Write failing lexer test**

Add at the end of test/test.js (before the summary output):

```javascript
// --- Mut Tests ---
console.log('\n--- Mut Tests ---\n');

test('Tokenize mut keyword', () => {
  const tokens = tokenize('mut x = 5');
  assertEqual(tokens[0].type, 'MUT');
  assertEqual(tokens[1].type, 'IDENTIFIER');
  assertEqual(tokens[1].value, 'x');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL — `'MUT'` is not a recognized token type

- [ ] **Step 3: Add MUT token to lexer**

In `src/lexer.js`, add to TokenType enum (after line 46, the ASSERT entry):

```javascript
  MUT: 'MUT',
```

Add to KEYWORDS map (after line 133, the `'assert'` entry):

```javascript
  'mut': TokenType.MUT,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/test.js 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 5: Write failing parser test**

```javascript
test('Parse mut declaration', () => {
  const ast = parse(tokenize('mut x = 42'));
  assertEqual(ast.body[0].type, 'MutDeclaration');
  assertEqual(ast.body[0].name, 'x');
  assertEqual(ast.body[0].init.value, 42);
});

test('Parse mut with destructuring', () => {
  const ast = parse(tokenize('mut { a, b } = obj'));
  assertEqual(ast.body[0].type, 'MutDeclaration');
  assertEqual(ast.body[0].destructuring, true);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL — parser doesn't recognize MUT token

- [ ] **Step 7: Add MutDeclaration to parser**

In `src/parser.js`, add to NodeType enum (after `DecDeclaration` on line 10):

```javascript
  MutDeclaration: 'MutDeclaration',
```

In `parseStatement()`, after the `if (this.check(TokenType.DEC))` block (after line 191), add:

```javascript
    if (this.check(TokenType.MUT)) {
      const decl = this.parseMutDeclaration();
      return decl;
    }
```

Add the `parseMutDeclaration()` method after `parseDecDeclaration()` (after line 399):

```javascript
  parseMutDeclaration() {
    this.expect(TokenType.MUT, 'Expected mut');

    // Check for destructuring pattern
    if (this.check(TokenType.LBRACE)) {
      const pattern = this.parseObjectPattern();
      this.expect(TokenType.ASSIGN, 'mut requires initialization');
      const init = this.parseExpression();

      return {
        type: NodeType.MutDeclaration,
        pattern,
        init,
        destructuring: true,
        line: this.tokens[this.pos - 1].line,
        column: this.tokens[this.pos - 1].column,
      };
    }

    if (this.check(TokenType.LBRACKET)) {
      const pattern = this.parseArrayPattern();
      this.expect(TokenType.ASSIGN, 'mut requires initialization');
      const init = this.parseExpression();

      return {
        type: NodeType.MutDeclaration,
        pattern,
        init,
        destructuring: true,
        line: this.tokens[this.pos - 1].line,
        column: this.tokens[this.pos - 1].column,
      };
    }

    const name = this.expect(TokenType.IDENTIFIER, 'Expected variable name').value;

    this.expect(TokenType.ASSIGN, 'mut requires initialization');
    const init = this.parseExpression();

    return {
      type: NodeType.MutDeclaration,
      name,
      init,
      line: this.tokens[this.pos - 1].line,
      column: this.tokens[this.pos - 1].column,
    };
  }
```

- [ ] **Step 8: Make mut variables exempt from immutability check**

In `parseAssignment()` at `src/parser.js:1143-1163`, the `checkDecImmutability` call on line 1151 checks `this.decVariables`. Since `mut` variables are NOT added to `this.decVariables`, reassignment will be allowed by default. No change needed here — but add a test to verify:

```javascript
test('Mut allows reassignment (parser does not error)', () => {
  // This should NOT throw — mut variables are reassignable
  const ast = parse(tokenize('mut x = 0\nx = x + 1'));
  assertEqual(ast.body[0].type, 'MutDeclaration');
  assertEqual(ast.body[1].type, 'ExpressionStatement');
  assertEqual(ast.body[1].expression.type, 'AssignmentExpression');
});

test('Dec still blocks reassignment', () => {
  let threw = false;
  try {
    parse(tokenize('dec x = 0\nx = 1'));
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'dec reassignment should throw parse error');
});
```

- [ ] **Step 9: Run all tests**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 10: Commit**

```bash
git add src/lexer.js src/parser.js test/test.js
git commit -m "feat: add mut keyword to lexer and parser

Adds MUT token, MutDeclaration node type, and parseMutDeclaration().
Mut variables are not added to decVariables set, so reassignment
is allowed by the parser's immutability check."
```

---

### Task 2: `mut` — Generator

**Files:**
- Modify: `src/generator.js:430-507` (visitStatement switch), `src/generator.js:509-540` (visitDecDeclaration as reference)
- Test: `test/test.js`

- [ ] **Step 1: Write failing generator test**

```javascript
test('Generate mut declaration', () => {
  const js = compile('mut x = 42');
  assertContains(js, 'let x = 42;');
  // Should NOT contain _deepFreeze for mut
});

test('Generate mut does not deepFreeze', () => {
  const js = compile('mut x = { a: 1 }');
  assertContains(js, 'let x = {');
  // Verify no _deepFreeze wrapper
  assertEqual(js.includes('_deepFreeze') && js.includes('let x = _deepFreeze'), false);
});

test('Generate mut reassignment', () => {
  const js = compile('mut x = 0\nx = x + 1');
  assertContains(js, 'let x = 0;');
  assertContains(js, 'x = x + 1;');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL — generator doesn't handle MutDeclaration

- [ ] **Step 3: Add MutDeclaration to generator**

In `src/generator.js`, add to the `visitStatement` switch (after the `case NodeType.DecDeclaration:` block around line 432):

```javascript
      case NodeType.MutDeclaration:
        this.visitMutDeclaration(node);
        break;
```

Add the `visitMutDeclaration` method after `visitDecDeclaration` (after line 540):

```javascript
  visitMutDeclaration(node) {
    // mut creates mutable variables — no _deepFreeze, uses let
    let init = this.visitExpression(node.init);

    if (node.destructuring) {
      if (node.pattern.type === NodeType.ObjectPattern) {
        const props = node.pattern.properties.map(p => {
          if (p.key === p.value) {
            return p.key;
          }
          return `${p.key}: ${p.value}`;
        }).join(', ');
        this.emitLine(`let { ${props} } = ${init};`);
      } else if (node.pattern.type === NodeType.ArrayPattern) {
        const elems = node.pattern.elements.map(e => {
          if (e === null) return '';
          return e.name;
        }).join(', ');
        this.emitLine(`let [${elems}] = ${init};`);
      }
    } else {
      this.emitLine(`let ${node.name} = ${init};`);
    }
  }
```

- [ ] **Step 4: Run all tests**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat: add mut code generation

Mut declarations emit 'let' instead of 'const' and skip _deepFreeze wrapping."
```

---

### Task 3: `mut` — Type Checker (scope tracking and closure capture prevention)

**Files:**
- Modify: `src/typechecker.js:34-48` (constructor), `src/typechecker.js:76-95` (scope management), `src/typechecker.js:204-280` (visitStatement switch), `src/typechecker.js:348-388` (visitDecDeclaration as reference), `src/typechecker.js:910-935` (visitArrowFunctionExpression)
- Test: `test/test.js`

- [ ] **Step 1: Write failing test for mut closure capture**

```javascript
test('Type checker: mut variable closure capture error', () => {
  const source = `
    fn bad() {
      mut x = 0
      dec inc = () => { x = x + 1 }
    }
  `;
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  const errors = checker.check(ast);
  assertEqual(errors.length > 0, true, 'Should have error for mut capture in closure');
  assertEqual(errors[0].message.includes('capture') || errors[0].message.includes('mut'), true, 'Error should mention mut/capture');
});

test('Type checker: mut variable without closure is fine', () => {
  const source = `
    fn good() {
      mut x = 0
      x = x + 1
      return x
    }
  `;
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  const errors = checker.check(ast);
  assertEqual(errors.length, 0, 'No errors for simple mut usage');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL — type checker doesn't know about MutDeclaration

- [ ] **Step 3: Add mut tracking to type checker**

In `src/typechecker.js`, modify the constructor (around line 34) to add a set for tracking mut variables:

```javascript
    this.mutVariables = new Set(); // Track mut variable names for closure capture check
```

In `visitStatement` switch (around line 204), add a case for MutDeclaration:

```javascript
      case NodeType.MutDeclaration:
        this.visitMutDeclaration(node);
        break;
```

Add the `visitMutDeclaration` method after `visitDecDeclaration` (after line 388):

```javascript
  visitMutDeclaration(node) {
    const initType = this.visitExpression(node.init);

    if (node.destructuring) {
      if (node.pattern.type === NodeType.ObjectPattern) {
        for (const prop of node.pattern.properties) {
          this.defineVariable(prop.value, initType);
          this.mutVariables.add(prop.value);
        }
      } else if (node.pattern.type === NodeType.ArrayPattern) {
        for (const elem of node.pattern.elements) {
          if (elem) {
            this.defineVariable(elem.name, initType);
            this.mutVariables.add(elem.name);
          }
        }
      }
    } else {
      this.defineVariable(node.name, initType);
      this.mutVariables.add(node.name);
    }
  }
```

- [ ] **Step 4: Add closure capture check to arrow functions**

In `visitArrowFunctionExpression` (around line 910), after pushing scope and before visiting the body, add a check. Replace the method:

```javascript
  visitArrowFunctionExpression(node) {
    // Save current mut variables to check for capture
    const outerMutVars = new Set(this.mutVariables);

    this.pushScope();

    // Define parameters
    for (const param of node.params) {
      const name = param.name || param.argument || param;
      this.defineVariable(name, this.createType(Type.Any));
    }

    // Visit body — collect any identifiers that reference outer mut vars
    const prevMutCaptureCheck = this._checkingClosureCapture;
    this._closureMutVars = outerMutVars;
    this._checkingClosureCapture = true;

    let returnType = this.createType(Type.Void);
    if (node.body.type === NodeType.BlockStatement) {
      for (const stmt of node.body.body) {
        this.visitStatement(stmt);
      }
    } else {
      returnType = this.visitExpression(node.body);
    }

    this._checkingClosureCapture = prevMutCaptureCheck;

    this.popScope();

    return this.createFunctionType(
      node.params.map(() => this.createType(Type.Any)),
      returnType
    );
  }
```

In `visitExpression`, for the `Identifier` case (around line 916), the current code just returns `node.name` for the generator but in the typechecker it goes through `visitIdentifier`. Find where identifiers are resolved and add the capture check. Look at how `visitExpression` handles identifiers:

In the typechecker's `visitExpression` method, find the `Identifier` case and add capture detection:

```javascript
      case NodeType.Identifier:
        // Check for mut variable capture in closures
        if (this._checkingClosureCapture && this._closureMutVars && this._closureMutVars.has(node.name)) {
          this.addError(`Cannot capture mut variable '${node.name}' in closure`, node);
        }
        return this.lookupVariable(node.name) || this.createType(Type.Unknown);
```

- [ ] **Step 5: Run all tests**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/typechecker.js test/test.js
git commit -m "feat: add mut type checking with closure capture prevention

Type checker tracks mut variables and errors when they are referenced
inside arrow functions/closures."
```

---

### Task 4: `mut` — Linter

**Files:**
- Modify: `src/linter.js:29-65` (rules config), `src/linter.js:300-319` (collectDeclarations), `src/linter.js:342-360` (analyzeStatement)
- Test: `test/test.js`

- [ ] **Step 1: Write failing linter test**

```javascript
test('Linter: warns on mut never reassigned', () => {
  const source = 'mut x = 5\nprint x';
  const compiler = new KimchiCompiler({ lintOptions: { rules: { 'mut-never-reassigned': true } } });
  const result = compiler.compileWithDiagnostics(source);
  // The linter should warn that x was declared mut but never reassigned
  const hasMutWarning = result.lintMessages.some(m => m.rule === 'mut-never-reassigned');
  assertEqual(hasMutWarning, true, 'Should warn about mut variable never reassigned');
});
```

Note: If `compileWithDiagnostics` doesn't exist, use the linter directly:

```javascript
test('Linter: warns on mut never reassigned', () => {
  const source = 'mut x = 5\nprint x';
  const ast = parse(tokenize(source));
  const { Linter } = await import('../src/linter.js');
  const linter = new Linter({ rules: { 'mut-never-reassigned': true } });
  const messages = linter.lint(ast, source);
  const hasMutWarning = messages.some(m => m.rule === 'mut-never-reassigned');
  assertEqual(hasMutWarning, true, 'Should warn about mut variable never reassigned');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Add mut linting**

In `src/linter.js`, add to the rules config (around line 48):

```javascript
        'mut-never-reassigned': true,  // Warn when mut is never reassigned (should be dec)
```

Add severity (around line 60):

```javascript
        'mut-never-reassigned': Severity.Warning,
```

In `collectDeclarations` (around line 301), add handling for MutDeclaration:

```javascript
      } else if (stmt.type === NodeType.MutDeclaration) {
        if (stmt.destructuring) {
          this.collectDestructuringNames(stmt.pattern, stmt);
        } else {
          this.defineVariable(stmt.name, stmt);
        }
        // Mark as mut for reassignment tracking
        if (stmt.name) {
          const scope = this.currentScope();
          const varInfo = scope.variables.get(stmt.name);
          if (varInfo) varInfo.isMut = true;
        }
      }
```

In `analyzeStatement` switch (around line 345), add MutDeclaration case:

```javascript
      case NodeType.MutDeclaration:
        this.analyzeExpression(node.init);
        // Track the mut declaration in current scope for nested scopes
        if (!node.destructuring && node.name) {
          this.defineVariable(node.name, node);
          const scope = this.currentScope();
          const varInfo = scope.variables.get(node.name);
          if (varInfo) {
            varInfo.isMut = true;
            varInfo.reassigned = false;
          }
        }
        return { returns: false, breaks: false };
```

In `analyzeExpression`, where `AssignmentExpression` is handled, mark the variable as reassigned. Find the assignment expression handler and add:

```javascript
      // Inside the AssignmentExpression handler:
      // Mark variable as reassigned for mut-never-reassigned check
      if (node.left.type === NodeType.Identifier) {
        for (let i = this.scopes.length - 1; i >= 0; i--) {
          const varInfo = this.scopes[i].variables.get(node.left.name);
          if (varInfo && varInfo.isMut) {
            varInfo.reassigned = true;
            break;
          }
        }
      }
```

In `popScope` (around line 234), after checking unused variables, add mut-never-reassigned check:

```javascript
    // Check for mut variables that were never reassigned
    if (this.isRuleEnabled('mut-never-reassigned')) {
      for (const [name, info] of scope.variables) {
        if (info.isMut && !info.reassigned && !name.startsWith('_')) {
          this.addMessage('mut-never-reassigned', `Variable '${name}' is declared as mut but never reassigned. Use 'dec' instead.`, info.node);
        }
      }
    }
```

- [ ] **Step 4: Run all tests**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/linter.js test/test.js
git commit -m "feat: add mut-never-reassigned lint rule

Warns when a mut variable is declared but never reassigned,
suggesting dec instead."
```

---

### Task 5: `??` Nullish Coalescing Operator

**Files:**
- Modify: `src/lexer.js:3-99` (TokenType), `src/lexer.js` (tokenize switch for `?`)
- Modify: `src/parser.js:6-68` (NodeType — not needed, uses BinaryExpression), `src/parser.js` (expression precedence chain, between parseOr and parseAnd)
- Modify: `src/generator.js` (visitBinaryExpression)
- Modify: `src/typechecker.js` (visitBinaryExpression)
- Test: `test/test.js`

- [ ] **Step 1: Write failing test**

```javascript
// --- Nullish Coalescing Tests ---
console.log('\n--- Nullish Coalescing Tests ---\n');

test('Tokenize ?? operator', () => {
  const tokens = tokenize('a ?? b');
  assertEqual(tokens[1].type, 'NULLISH');
});

test('Parse ?? expression', () => {
  const ast = parse(tokenize('dec x = a ?? b'));
  const init = ast.body[0].init;
  assertEqual(init.type, 'BinaryExpression');
  assertEqual(init.operator, '??');
});

test('Generate ?? operator', () => {
  const js = compile('dec x = a ?? "default"');
  assertContains(js, '??');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL — `??` is not tokenized

- [ ] **Step 3: Add NULLISH token to lexer**

In `src/lexer.js`, add to TokenType enum (after `QUESTION` on line 75):

```javascript
  NULLISH: 'NULLISH',
```

In the tokenize function, find where `?` is handled (the QUESTION token case). It should be in the switch statement around line 664+. Modify the `?` handling to check for `??`:

Find the case that handles `?` and change it to:

```javascript
        case '?':
          if (this.peek() === '?') {
            this.advance();
            this.addToken(TokenType.NULLISH, '??');
          } else {
            this.addToken(TokenType.QUESTION, '?');
          }
          break;
```

- [ ] **Step 4: Add ?? to parser expression chain**

In `src/parser.js`, the current precedence chain goes: `parsePipe` → `parseMatch` → `parseOr` → `parseAnd`. Insert `parseNullish` between `parseOr` and `parseAnd`:

Modify `parseOr` to call `parseNullish` instead of `parseAnd`:

```javascript
  parseOr() {
    let left = this.parseNullish();

    while (this.match(TokenType.OR)) {
      const right = this.parseNullish();
      left = {
        type: NodeType.BinaryExpression,
        operator: '||',
        left,
        right,
      };
    }

    return left;
  }

  parseNullish() {
    let left = this.parseAnd();

    while (this.match(TokenType.NULLISH)) {
      const right = this.parseAnd();
      left = {
        type: NodeType.BinaryExpression,
        operator: '??',
        left,
        right,
      };
    }

    return left;
  }
```

- [ ] **Step 5: Ensure generator handles ?? in BinaryExpression**

In `src/generator.js`, the `visitBinaryExpression` method likely handles operators generically. Verify it passes through `??` correctly. If it does a switch on operator, add `??`. If it just emits `left operator right`, no change needed. Check and add if needed:

```javascript
      // In visitBinaryExpression, if there's an operator mapping:
      case '??': return `${left} ?? ${right}`;
```

- [ ] **Step 6: Run all tests**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/lexer.js src/parser.js src/generator.js test/test.js
git commit -m "feat: add ?? nullish coalescing operator

Adds NULLISH token, parses as BinaryExpression with ?? operator,
emits JavaScript ?? directly. Precedence: between || and &&."
```

---

### Task 6: `guard...else`

**Files:**
- Modify: `src/lexer.js:3-99` (TokenType), `src/lexer.js:101-141` (KEYWORDS)
- Modify: `src/parser.js:6-68` (NodeType), `src/parser.js:164-340` (parseStatement)
- Modify: `src/generator.js:430-507` (visitStatement)
- Modify: `src/typechecker.js:204-280` (visitStatement)
- Modify: `src/linter.js:342-360` (analyzeStatement)
- Test: `test/test.js`

- [ ] **Step 1: Write failing test**

```javascript
// --- Guard Tests ---
console.log('\n--- Guard Tests ---\n');

test('Tokenize guard keyword', () => {
  const tokens = tokenize('guard x != null else { return null }');
  assertEqual(tokens[0].type, 'GUARD');
});

test('Parse guard statement', () => {
  const ast = parse(tokenize('guard x != null else { return null }'));
  assertEqual(ast.body[0].type, 'GuardStatement');
  assertEqual(ast.body[0].test.type, 'BinaryExpression');
  assertEqual(ast.body[0].alternate.type, 'BlockStatement');
});

test('Generate guard statement', () => {
  const js = compile('guard x != null else { return null }');
  assertContains(js, 'if (!(');
  assertContains(js, 'return null');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Add GUARD token**

In `src/lexer.js`, add to TokenType enum (after MUT):

```javascript
  GUARD: 'GUARD',
```

Add to KEYWORDS map:

```javascript
  'guard': TokenType.GUARD,
```

- [ ] **Step 4: Add GuardStatement to parser**

In `src/parser.js`, add to NodeType enum (after `PatternMatch` on line 25):

```javascript
  GuardStatement: 'GuardStatement',
```

In `parseStatement()`, in the control flow section (around line 258, after the IF check), add:

```javascript
    if (this.check(TokenType.GUARD)) {
      return this.parseGuardStatement();
    }
```

Add the `parseGuardStatement` method (after `parseIfStatement`):

```javascript
  parseGuardStatement() {
    const guardToken = this.expect(TokenType.GUARD, 'Expected guard');
    const test = this.parseExpression();

    // Require 'else' keyword — guard without else is invalid
    if (!this.match(TokenType.ELSE)) {
      this.error('guard requires an else block');
    }

    const alternate = this.parseBlock();

    return {
      type: NodeType.GuardStatement,
      test,
      alternate,
      line: guardToken.line,
      column: guardToken.column,
    };
  }
```

- [ ] **Step 5: Add guard to generator**

In `src/generator.js`, add to `visitStatement` switch:

```javascript
      case NodeType.GuardStatement:
        this.visitGuardStatement(node);
        break;
```

Add the method:

```javascript
  visitGuardStatement(node) {
    const test = this.visitExpression(node.test);
    this.emitLine(`if (!(${test})) {`);
    this.pushIndent();
    for (const stmt of node.alternate.body) {
      this.visitStatement(stmt);
    }
    this.popIndent();
    this.emitLine('}');
  }
```

- [ ] **Step 6: Add guard to type checker**

In `src/typechecker.js`, add to `visitStatement` switch:

```javascript
      case NodeType.GuardStatement:
        this.visitGuardStatement(node);
        break;
```

Add the method:

```javascript
  visitGuardStatement(node) {
    this.visitExpression(node.test);

    // Verify the else block contains a return or throw
    const hasExit = this.blockHasExit(node.alternate);
    if (!hasExit) {
      this.addError('guard else block must contain a return or throw statement', node);
    }

    // Visit the alternate block
    this.pushScope();
    for (const stmt of node.alternate.body) {
      this.visitStatement(stmt);
    }
    this.popScope();
  }

  blockHasExit(block) {
    if (!block || !block.body) return false;
    for (const stmt of block.body) {
      if (stmt.type === NodeType.ReturnStatement || stmt.type === NodeType.ThrowStatement) {
        return true;
      }
    }
    return false;
  }
```

- [ ] **Step 7: Add guard to linter**

In `src/linter.js`, add to `analyzeStatement` switch:

```javascript
      case NodeType.GuardStatement:
        this.analyzeExpression(node.test);
        return this.analyzeBlock(node.alternate);
```

Also add to `collectDeclarations` if needed (guard doesn't declare variables, so likely no change).

- [ ] **Step 8: Run all tests**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 9: Write test for type checker exit enforcement**

```javascript
test('Type checker: guard else must have return or throw', () => {
  const source = 'guard x != null else { print "oops" }';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  const errors = checker.check(ast);
  assertEqual(errors.length > 0, true, 'Should error when guard else has no exit');
});
```

- [ ] **Step 10: Run all tests**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 11: Commit**

```bash
git add src/lexer.js src/parser.js src/generator.js src/typechecker.js src/linter.js test/test.js
git commit -m "feat: add guard...else statement

Guard checks a condition and requires the else block to exit via
return or throw. Compiles to negated if statement."
```

---

### Task 7: `match` Expression — Lexer and Parser

**Files:**
- Modify: `src/lexer.js:3-99` (TokenType), `src/lexer.js:101-141` (KEYWORDS)
- Modify: `src/parser.js:6-68` (NodeType), `src/parser.js:164-340` (parseStatement), `src/parser.js:1552+` (parsePrimary)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// --- Match Expression Tests ---
console.log('\n--- Match Expression Tests ---\n');

test('Tokenize match keyword', () => {
  const tokens = tokenize('match x { 1 => "one" }');
  assertEqual(tokens[0].type, 'MATCH_KEYWORD');
});

test('Parse match with literal patterns', () => {
  const source = 'dec result = match status { 200 => "OK"\n404 => "Not Found"\n_ => "Unknown" }';
  const ast = parse(tokenize(source));
  const matchExpr = ast.body[0].init;
  assertEqual(matchExpr.type, 'MatchBlock');
  assertEqual(matchExpr.arms.length, 3);
});

test('Parse match with when guard', () => {
  const source = 'dec tier = match score { n when n >= 90 => "A"\n_ => "F" }';
  const ast = parse(tokenize(source));
  const matchExpr = ast.body[0].init;
  assertEqual(matchExpr.arms[0].guard !== null, true, 'First arm should have a guard');
});

test('Parse match with object destructuring', () => {
  const source = 'dec r = match obj { { status: 200, data } => data\n_ => null }';
  const ast = parse(tokenize(source));
  const matchExpr = ast.body[0].init;
  assertEqual(matchExpr.arms[0].pattern.type, 'ObjectPattern');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Add MATCH_KEYWORD and WHEN tokens**

In `src/lexer.js`, add to TokenType enum:

```javascript
  MATCH_KEYWORD: 'MATCH_KEYWORD',
  WHEN: 'WHEN',
```

Add to KEYWORDS map:

```javascript
  'match': TokenType.MATCH_KEYWORD,
  'when': TokenType.WHEN,
```

- [ ] **Step 4: Add MatchBlock and MatchArm to parser NodeType**

In `src/parser.js`, add to NodeType enum:

```javascript
  MatchBlock: 'MatchBlock',
  MatchArm: 'MatchArm',
  WildcardPattern: 'WildcardPattern',
```

- [ ] **Step 5: Add match expression parsing**

Since `match` can appear as an expression (in `dec x = match ...`), add it to `parsePrimary()` in `src/parser.js`. Find `parsePrimary` (around line 1552) and add at the beginning:

```javascript
    // Match expression
    if (this.check(TokenType.MATCH_KEYWORD)) {
      return this.parseMatchBlock();
    }
```

Add the `parseMatchBlock` method:

```javascript
  parseMatchBlock() {
    this.expect(TokenType.MATCH_KEYWORD, 'Expected match');
    const subject = this.parseExpression();
    this.expect(TokenType.LBRACE, 'Expected { after match subject');

    const arms = [];
    this.skipNewlines();

    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      const arm = this.parseMatchArm();
      arms.push(arm);
      this.skipNewlines();
    }

    this.expect(TokenType.RBRACE, 'Expected } to close match');

    return {
      type: NodeType.MatchBlock,
      subject,
      arms,
      line: this.tokens[this.pos - 1].line,
      column: this.tokens[this.pos - 1].column,
    };
  }

  parseMatchArm() {
    const pattern = this.parseMatchPattern();

    // Optional when guard
    let guard = null;
    if (this.check(TokenType.WHEN)) {
      this.advance();
      guard = this.parseExpression();
    }

    this.expect(TokenType.FAT_ARROW, 'Expected => after pattern');

    // Body: either a block or a single expression
    let body;
    if (this.check(TokenType.LBRACE)) {
      body = this.parseBlock();
    } else {
      body = this.parseExpression();
    }

    return {
      type: NodeType.MatchArm,
      pattern,
      guard,
      body,
      line: this.tokens[this.pos - 1].line,
      column: this.tokens[this.pos - 1].column,
    };
  }

  parseMatchPattern() {
    // Wildcard: _
    if (this.check(TokenType.IDENTIFIER) && this.tokens[this.pos].value === '_') {
      this.advance();
      return { type: NodeType.WildcardPattern };
    }

    // is TypeCheck
    if (this.check(TokenType.IS)) {
      this.advance();
      const typeName = this.expect(TokenType.IDENTIFIER, 'Expected type name after is').value;
      return {
        type: 'IsPattern',
        typeName,
      };
    }

    // Object destructuring pattern: { key: value, key2 }
    if (this.check(TokenType.LBRACE)) {
      return this.parseMatchObjectPattern();
    }

    // Array destructuring pattern: [a, b, c]
    if (this.check(TokenType.LBRACKET)) {
      return this.parseMatchArrayPattern();
    }

    // Literal value or binding variable
    // If it's a number, string, boolean, null — it's a literal pattern
    if (this.check(TokenType.NUMBER) || this.check(TokenType.STRING) ||
        this.check(TokenType.BOOLEAN) || this.check(TokenType.NULL)) {
      const token = this.advance();
      let value = token.value;
      if (token.type === TokenType.NUMBER) {
        value = parseFloat(value);
      } else if (token.type === TokenType.BOOLEAN) {
        value = token.value === 'true';
      } else if (token.type === TokenType.NULL) {
        value = null;
      }
      return {
        type: 'LiteralPattern',
        value,
        raw: token.value,
      };
    }

    // Identifier — binding variable (like n in: n when n >= 90)
    if (this.check(TokenType.IDENTIFIER)) {
      const name = this.advance().value;
      return {
        type: 'BindingPattern',
        name,
      };
    }

    this.error('Expected match pattern');
  }

  parseMatchObjectPattern() {
    this.expect(TokenType.LBRACE, 'Expected {');
    const properties = [];

    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      this.skipNewlines();
      if (this.check(TokenType.RBRACE)) break;

      const key = this.expect(TokenType.IDENTIFIER, 'Expected property name').value;

      let value = null;
      if (this.match(TokenType.COLON)) {
        // { key: pattern } — value is a literal or sub-pattern
        if (this.check(TokenType.NUMBER) || this.check(TokenType.STRING) ||
            this.check(TokenType.BOOLEAN) || this.check(TokenType.NULL)) {
          const token = this.advance();
          let val = token.value;
          if (token.type === TokenType.NUMBER) val = parseFloat(val);
          else if (token.type === TokenType.BOOLEAN) val = token.value === 'true';
          else if (token.type === TokenType.NULL) val = null;
          value = { type: 'LiteralPattern', value: val, raw: token.value };
        } else if (this.check(TokenType.IDENTIFIER)) {
          value = { type: 'BindingPattern', name: this.advance().value };
        }
      }
      // If no colon, key is both the property name and binding name: { data } => binds data

      properties.push({ key, value });

      if (!this.check(TokenType.RBRACE)) {
        this.match(TokenType.COMMA); // optional comma
      }
    }

    this.expect(TokenType.RBRACE, 'Expected }');

    return {
      type: 'ObjectDestructurePattern',
      properties,
    };
  }

  parseMatchArrayPattern() {
    this.expect(TokenType.LBRACKET, 'Expected [');
    const elements = [];

    while (!this.check(TokenType.RBRACKET) && !this.check(TokenType.EOF)) {
      this.skipNewlines();
      if (this.check(TokenType.RBRACKET)) break;

      if (this.check(TokenType.NUMBER) || this.check(TokenType.STRING) ||
          this.check(TokenType.BOOLEAN) || this.check(TokenType.NULL)) {
        const token = this.advance();
        let value = token.value;
        if (token.type === TokenType.NUMBER) value = parseFloat(value);
        else if (token.type === TokenType.BOOLEAN) value = token.value === 'true';
        else if (token.type === TokenType.NULL) value = null;
        elements.push({ type: 'LiteralPattern', value, raw: token.value });
      } else if (this.check(TokenType.IDENTIFIER)) {
        const name = this.advance().value;
        if (name === '_') {
          elements.push({ type: NodeType.WildcardPattern });
        } else {
          elements.push({ type: 'BindingPattern', name });
        }
      }

      if (!this.check(TokenType.RBRACKET)) {
        this.match(TokenType.COMMA); // optional comma
      }
    }

    this.expect(TokenType.RBRACKET, 'Expected ]');

    return {
      type: 'ArrayDestructurePattern',
      elements,
    };
  }
```

- [ ] **Step 6: Run all tests**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/lexer.js src/parser.js test/test.js
git commit -m "feat: add match expression lexing and parsing

Adds MATCH_KEYWORD, WHEN tokens. Parses match blocks with literal,
is, object destructuring, array destructuring, binding, and wildcard
patterns. Supports when guards on arms."
```

---

### Task 8: `match` Expression — Generator

**Files:**
- Modify: `src/generator.js:912-958` (visitExpression switch)
- Test: `test/test.js`

- [ ] **Step 1: Write failing test**

```javascript
test('Generate match with literal patterns', () => {
  const js = compile('dec msg = match status { 200 => "OK"\n404 => "Not Found"\n_ => "Unknown" }');
  assertContains(js, 'const _subject');
  assertContains(js, '_subject === 200');
  assertContains(js, '"OK"');
  assertContains(js, '"Not Found"');
  assertContains(js, '"Unknown"');
});

test('Generate match with when guard', () => {
  const js = compile('dec tier = match score { n when n >= 90 => "A"\n_ => "F" }');
  assertContains(js, '_subject >= 90');
  assertContains(js, '"A"');
});

test('Generate match with object destructuring', () => {
  const js = compile('dec r = match obj { { status: 200, data } => data\n_ => null }');
  assertContains(js, 'status');
  assertContains(js, '=== 200');
  assertContains(js, 'data');
});

test('Generate match with is pattern', () => {
  const js = compile('dec r = match err { is NotFoundError => "not found"\n_ => "other" }');
  assertContains(js, '_id');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL — generator doesn't know about MatchBlock

- [ ] **Step 3: Add MatchBlock to generator's visitExpression**

In `src/generator.js`, add to `visitExpression` switch (around line 954):

```javascript
      case NodeType.MatchBlock:
        return this.visitMatchBlock(node);
```

Add the `visitMatchBlock` method:

```javascript
  visitMatchBlock(node) {
    const subject = this.visitExpression(node.subject);

    // Build IIFE for match expression
    let code = '(() => {\n';
    const indent = this.getIndent() + this.indentStr;
    const indent2 = indent + this.indentStr;

    code += `${indent}const _subject = ${subject};\n`;

    for (let i = 0; i < node.arms.length; i++) {
      const arm = node.arms[i];
      const keyword = i === 0 ? 'if' : 'else if';

      const { condition, bindings } = this.compileMatchPattern(arm.pattern, arm.guard);

      if (arm.pattern.type === NodeType.WildcardPattern || arm.pattern.type === 'WildcardPattern') {
        code += `${indent}else {\n`;
      } else {
        code += `${indent}${keyword} (${condition}) {\n`;
      }

      // Emit bindings
      for (const [name, expr] of bindings) {
        code += `${indent2}const ${name} = ${expr};\n`;
      }

      // Emit body
      if (arm.body.type === NodeType.BlockStatement) {
        for (const stmt of arm.body.body) {
          const prevOutput = this.output;
          this.output = '';
          const prevIndent = this.indent;
          this.indent = 0;
          this.visitStatement(stmt);
          const stmtCode = this.output;
          this.output = prevOutput;
          this.indent = prevIndent;
          code += `${indent2}${stmtCode.trim()}\n`;
        }
      } else {
        const prevOutput = this.output;
        this.output = '';
        const bodyExpr = this.visitExpression(arm.body);
        this.output = prevOutput;
        code += `${indent2}return ${bodyExpr};\n`;
      }

      code += `${indent}}\n`;
    }

    // If no wildcard/default arm, return null
    const hasDefault = node.arms.some(a =>
      a.pattern.type === NodeType.WildcardPattern || a.pattern.type === 'WildcardPattern'
    );
    if (!hasDefault) {
      code += `${indent}return null;\n`;
    }

    code += `${this.getIndent()}})()`;
    return code;
  }

  compileMatchPattern(pattern, guard) {
    const bindings = []; // Array of [name, expression]
    let condition = '';

    switch (pattern.type) {
      case 'LiteralPattern': {
        condition = `_subject === ${typeof pattern.value === 'string' ? `"${pattern.value}"` : pattern.value}`;
        break;
      }

      case 'BindingPattern': {
        // Binding always matches — but may have a when guard
        bindings.push([pattern.name, '_subject']);
        if (guard) {
          // We need to evaluate the guard with the binding in scope
          // Use a temp approach: replace the binding name in the guard expression
          const prevOutput = this.output;
          this.output = '';
          const guardExpr = this.visitExpression(guard);
          this.output = prevOutput;
          condition = `(() => { const ${pattern.name} = _subject; return ${guardExpr}; })()`;
        } else {
          condition = 'true';
        }
        break;
      }

      case 'IsPattern': {
        condition = `_subject?._id === ${pattern.typeName}?._id`;
        if (guard) {
          const prevOutput = this.output;
          this.output = '';
          const guardExpr = this.visitExpression(guard);
          this.output = prevOutput;
          condition += ` && (${guardExpr})`;
        }
        break;
      }

      case 'ObjectDestructurePattern': {
        const checks = [];
        for (const prop of pattern.properties) {
          if (prop.value && prop.value.type === 'LiteralPattern') {
            // { status: 200 } — check value
            const val = typeof prop.value.value === 'string' ? `"${prop.value.value}"` : prop.value.value;
            checks.push(`_subject?.${prop.key} === ${val}`);
          } else if (prop.value && prop.value.type === 'BindingPattern') {
            // { status: code } — check key exists, bind value
            checks.push(`'${prop.key}' in (_subject || {})`);
            bindings.push([prop.value.name, `_subject.${prop.key}`]);
          } else {
            // { data } — shorthand, check key exists, bind
            checks.push(`'${prop.key}' in (_subject || {})`);
            bindings.push([prop.key, `_subject.${prop.key}`]);
          }
        }
        condition = checks.join(' && ');
        if (guard) {
          const prevOutput = this.output;
          this.output = '';
          const guardExpr = this.visitExpression(guard);
          this.output = prevOutput;
          condition += ` && (${guardExpr})`;
        }
        break;
      }

      case 'ArrayDestructurePattern': {
        const checks = [];
        checks.push(`Array.isArray(_subject)`);
        for (let i = 0; i < pattern.elements.length; i++) {
          const elem = pattern.elements[i];
          if (elem.type === 'LiteralPattern') {
            const val = typeof elem.value === 'string' ? `"${elem.value}"` : elem.value;
            checks.push(`_subject[${i}] === ${val}`);
          } else if (elem.type === 'BindingPattern') {
            bindings.push([elem.name, `_subject[${i}]`]);
          }
          // WildcardPattern — skip, no check or binding
        }
        condition = checks.join(' && ');
        if (guard) {
          const prevOutput = this.output;
          this.output = '';
          const guardExpr = this.visitExpression(guard);
          this.output = prevOutput;
          condition += ` && (${guardExpr})`;
        }
        break;
      }

      case 'WildcardPattern':
      case NodeType.WildcardPattern: {
        condition = 'true'; // Always matches — handled as else branch
        break;
      }

      default:
        condition = 'true';
    }

    return { condition, bindings };
  }
```

- [ ] **Step 4: Run all tests**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat: add match expression code generation

Compiles match blocks to IIFE with if/else if chain. Supports
literal, binding, is, object destructure, array destructure, and
wildcard patterns. Bindings become const declarations in each arm."
```

---

### Task 9: `match` Expression — Type Checker and Linter

**Files:**
- Modify: `src/typechecker.js` (visitExpression switch, add visitMatchBlock)
- Modify: `src/linter.js` (analyzeStatement and analyzeExpression)
- Test: `test/test.js`

- [ ] **Step 1: Write failing test**

```javascript
test('Type checker: match expression accepted', () => {
  const source = 'dec x = match 1 { 1 => "one"\n_ => "other" }';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  const errors = checker.check(ast);
  assertEqual(errors.length, 0, 'match expression should type check without errors');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL — unknown expression type

- [ ] **Step 3: Add MatchBlock to type checker**

In `src/typechecker.js`, in the `visitExpression` switch, add:

```javascript
      case NodeType.MatchBlock:
        return this.visitMatchBlock(node);
```

Add the method:

```javascript
  visitMatchBlock(node) {
    this.visitExpression(node.subject);

    let resultType = this.createType(Type.Unknown);

    for (const arm of node.arms) {
      this.pushScope();

      // Define bindings from pattern
      if (arm.pattern.type === 'BindingPattern') {
        this.defineVariable(arm.pattern.name, this.createType(Type.Any));
      } else if (arm.pattern.type === 'ObjectDestructurePattern') {
        for (const prop of arm.pattern.properties) {
          if (prop.value && prop.value.type === 'BindingPattern') {
            this.defineVariable(prop.value.name, this.createType(Type.Any));
          } else if (!prop.value) {
            this.defineVariable(prop.key, this.createType(Type.Any));
          }
        }
      } else if (arm.pattern.type === 'ArrayDestructurePattern') {
        for (const elem of arm.pattern.elements) {
          if (elem && elem.type === 'BindingPattern') {
            this.defineVariable(elem.name, this.createType(Type.Any));
          }
        }
      }

      // Visit guard if present
      if (arm.guard) {
        this.visitExpression(arm.guard);
      }

      // Visit body
      if (arm.body.type === NodeType.BlockStatement) {
        for (const stmt of arm.body.body) {
          this.visitStatement(stmt);
        }
      } else {
        resultType = this.visitExpression(arm.body);
      }

      this.popScope();
    }

    return resultType;
  }
```

- [ ] **Step 4: Add MatchBlock to linter**

In `src/linter.js`, in `analyzeExpression` (or wherever expressions are analyzed), add handling for MatchBlock. If expressions are analyzed through `analyzeExpression`, add:

```javascript
      case NodeType.MatchBlock:
        this.analyzeExpression(node.subject);
        for (const arm of node.arms) {
          if (arm.guard) this.analyzeExpression(arm.guard);
          if (arm.body.type === NodeType.BlockStatement) {
            this.pushScope();
            for (const stmt of arm.body.body) {
              this.analyzeStatement(stmt);
            }
            this.popScope();
          } else {
            this.analyzeExpression(arm.body);
          }
        }
        return { returns: false, breaks: false };
```

- [ ] **Step 5: Run all tests**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/typechecker.js src/linter.js test/test.js
git commit -m "feat: add match expression type checking and linting

Type checker visits match arms with scoped bindings. Linter
analyzes match expressions for unused variables and other rules."
```

---

### Task 10: `.if().else()` Expressions

**Files:**
- Modify: `src/parser.js:6-68` (NodeType), `src/parser.js:1503-1538` (parseCall)
- Modify: `src/generator.js:912-958` (visitExpression)
- Modify: `src/typechecker.js` (visitExpression)
- Test: `test/test.js`

- [ ] **Step 1: Write failing test**

```javascript
// --- Conditional Method Tests ---
console.log('\n--- Conditional Method (.if/.else) Tests ---\n');

test('Parse .if() expression', () => {
  const ast = parse(tokenize('dec x = 5.if(true)'));
  assertEqual(ast.body[0].init.type, 'ConditionalMethodExpression');
  assertEqual(ast.body[0].init.fallback, null);
});

test('Parse .if().else() expression', () => {
  const ast = parse(tokenize('dec x = "yes".if(true).else("no")'));
  const expr = ast.body[0].init;
  assertEqual(expr.type, 'ConditionalMethodExpression');
  assertEqual(expr.fallback.value, 'no');
});

test('Generate .if().else()', () => {
  const js = compile('dec x = "premium".if(vip).else("standard")');
  assertContains(js, '?');
  assertContains(js, ':');
  assertContains(js, '"premium"');
  assertContains(js, '"standard"');
});

test('Generate .if() without else returns null', () => {
  const js = compile('dec x = 500.if(isManager)');
  assertContains(js, '?');
  assertContains(js, 'null');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Add ConditionalMethodExpression to parser**

In `src/parser.js`, add to NodeType enum:

```javascript
  ConditionalMethodExpression: 'ConditionalMethodExpression',
```

In `parseCall()` (around line 1503), modify the `DOT` handling (line 1515). Currently when a DOT is followed by an identifier, it creates a MemberExpression. We need to intercept `.if(`:

Replace the `else if (this.match(TokenType.DOT))` block with:

```javascript
      } else if (this.match(TokenType.DOT)) {
        // Check for .if() conditional method
        if (this.check(TokenType.IF)) {
          this.advance(); // consume 'if'
          this.expect(TokenType.LPAREN, 'Expected ( after .if');
          const condition = this.parseExpression();
          this.expect(TokenType.RPAREN, 'Expected ) after .if condition');

          // Check for optional .else()
          let fallback = null;
          if (this.check(TokenType.DOT) && this.peek(1) && this.peek(1).type === TokenType.ELSE) {
            this.advance(); // consume '.'
            this.advance(); // consume 'else'
            this.expect(TokenType.LPAREN, 'Expected ( after .else');
            fallback = this.parseExpression();
            this.expect(TokenType.RPAREN, 'Expected ) after .else value');
          }

          expr = {
            type: NodeType.ConditionalMethodExpression,
            receiver: expr,
            condition,
            fallback,
            line: this.tokens[this.pos - 1].line,
            column: this.tokens[this.pos - 1].column,
          };
        } else {
          const property = this.expect(TokenType.IDENTIFIER, 'Expected property name').value;
          expr = {
            type: NodeType.MemberExpression,
            object: expr,
            property,
            computed: false,
          };
        }
```

Note: `this.peek(1)` may need to be adjusted based on how `peek` works in the parser. Check the existing `peek` implementation — if `peek(1)` peeks one token ahead of current position, this is correct. If it's relative to `this.pos`, adjust accordingly.

- [ ] **Step 4: Add ConditionalMethodExpression to generator**

In `src/generator.js`, add to `visitExpression` switch:

```javascript
      case NodeType.ConditionalMethodExpression:
        return this.visitConditionalMethodExpression(node);
```

Add the method:

```javascript
  visitConditionalMethodExpression(node) {
    const receiver = this.visitExpression(node.receiver);
    const condition = this.visitExpression(node.condition);
    const fallback = node.fallback ? this.visitExpression(node.fallback) : 'null';
    return `((${condition}) ? ${receiver} : ${fallback})`;
  }
```

- [ ] **Step 5: Add to type checker**

In `src/typechecker.js`, add to `visitExpression` switch:

```javascript
      case NodeType.ConditionalMethodExpression:
        this.visitExpression(node.condition);
        const receiverType = this.visitExpression(node.receiver);
        if (node.fallback) this.visitExpression(node.fallback);
        return receiverType;
```

- [ ] **Step 6: Run all tests**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/parser.js src/generator.js src/typechecker.js test/test.js
git commit -m "feat: add .if().else() conditional method expressions

value.if(cond) returns value or null. value.if(cond).else(fallback)
returns value or fallback. Compiles to ternary expression."
```

---

### Task 11: Integration Tests

**Files:**
- Test: `test/test.js`

- [ ] **Step 1: Write integration tests that combine multiple features**

```javascript
// --- Integration Tests for New Features ---
console.log('\n--- Integration Tests (New Features) ---\n');

test('Mut with for loop accumulator', () => {
  const js = compile(`
    fn sum(numbers) {
      mut total = 0
      for n in numbers {
        total = total + n
      }
      return total
    }
  `);
  assertContains(js, 'let total = 0');
  assertContains(js, 'total = total + n');
});

test('Guard with nullish coalescing', () => {
  const js = compile(`
    fn process(input) {
      guard input != null else { return null }
      dec name = input.name ?? "Anonymous"
      return name
    }
  `);
  assertContains(js, 'if (!(');
  assertContains(js, '??');
});

test('Match with .if().else()', () => {
  const js = compile(`
    dec role = match user {
      { isAdmin: true } => "admin"
      _ => "viewer"
    }
    dec label = "VIP".if(role == "admin").else("Regular")
  `);
  assertContains(js, '_subject');
  assertContains(js, '?');
  assertContains(js, '"VIP"');
});

test('All features combined', () => {
  const js = compile(`
    fn processUsers(rawUsers) {
      guard rawUsers != null else { return null }
      dec defaultRole = config.defaultRole ?? "viewer"
      mut results = []
      for user in rawUsers {
        dec role = match user {
          { isAdmin: true } => "admin"
          _ => defaultRole
        }
        results = [...results, { name: user.name, role: role }]
      }
      return results
    }
  `);
  assertContains(js, 'if (!(');
  assertContains(js, '??');
  assertContains(js, 'let results');
  assertContains(js, '_subject');
});
```

- [ ] **Step 2: Run all tests**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add test/test.js
git commit -m "test: add integration tests for new language features

Tests combining mut, guard, ??, match expressions, and .if().else()
in realistic usage patterns."
```

---

### Task 12: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add new features to CLAUDE.md**

Add the following section to CLAUDE.md after "Key Runtime Patterns":

```markdown
## New Language Features (v2)

- `mut x = 0` — mutable variable, compiles to `let`. Block-scoped, visible in child blocks. Cannot be captured by closures or exposed. No `_deepFreeze`.
- `x ?? fallback` — nullish coalescing, compiles to JS `??` directly.
- `guard cond else { return/throw }` — precondition check. Compiles to negated `if`. Else block must exit.
- `match subject { pattern => body }` — expression returning a value. Supports literal, `is`, object/array destructuring, binding, and wildcard patterns with optional `when` guards. Compiles to IIFE with if/else chain.
- `value.if(cond).else(fallback)` — inline conditional expression. Compiles to ternary. `.else()` is optional (returns null without it).
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with new language features"
```
