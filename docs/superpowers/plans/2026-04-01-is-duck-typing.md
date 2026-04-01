# `is` Operator Duck Typing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken `_id`-based `is` operator with duck typing — resolving type names to structural shape checks, primitive `typeof` checks, or `instanceof` fallback.

**Architecture:** The type checker resolves `is` right-hand type names and annotates AST nodes with `{ isKind, ... }` metadata. The generator reads annotations to emit the correct JS. A built-in `Type` enum provides namespaced primitive checks without conflicting with variable names.

**Tech Stack:** Node.js, KimchiLang compiler pipeline (lexer → parser → typechecker → generator)

---

### Task 1: Parser — Accept Dotted Names in `IsPattern`

The match pattern parser (`IsPattern`) currently only accepts a single identifier. It needs to also accept `Type.String` style dotted names.

**Files:**
- Modify: `src/parser.js:875-883`
- Test: `test/test.js`

- [ ] **Step 1: Write the failing test**

Add after the existing `'Parse match with is pattern'` test (around line 851):

```javascript
test('Parse match with is Type.String pattern', () => {
  const source = 'dec r = match val {\nis Type.String => "string"\n_ => "other"\n}';
  const ast = parse(tokenize(source));
  const matchExpr = ast.body[0].init;
  assertEqual(matchExpr.arms[0].pattern.type, 'IsPattern');
  assertEqual(matchExpr.arms[0].pattern.typeName, 'Type.String');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/test.js 2>&1 | grep -A 1 'Parse match with is Type.String'`
Expected: FAIL — parser errors because it expects a single identifier after `is`, but encounters `Type` then `.`

- [ ] **Step 3: Update `IsPattern` parsing to accept dotted names**

In `src/parser.js`, replace the `IsPattern` parsing block (lines 875-883):

```javascript
    // is TypeCheck
    if (this.check(TokenType.IS)) {
      this.advance();
      let typeName = this.expect(TokenType.IDENTIFIER, 'Expected type name after is').value;
      // Accept dotted names like Type.String
      if (this.match(TokenType.DOT)) {
        const member = this.expect(TokenType.IDENTIFIER, 'Expected member name after .').value;
        typeName = `${typeName}.${member}`;
      }
      return {
        type: 'IsPattern',
        typeName,
      };
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/test.js 2>&1 | grep -A 1 'Parse match with is Type.String'`
Expected: `✓ Parse match with is Type.String pattern`

- [ ] **Step 5: Run full test suite**

Run: `node test/test.js`
Expected: All existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/parser.js test/test.js
git commit -m "feat(parser): accept dotted names in IsPattern for Type.String"
```

---

### Task 2: Type Checker — Register Built-in `Type` Enum and Resolve `is` in Binary Expressions

Register the `Type` enum as a known identifier and annotate `is`/`is not` binary expression nodes with resolution metadata.

**Files:**
- Modify: `src/typechecker.js:36-65` (constructor), `src/typechecker.js:1223-1241` (visitBinaryExpression)
- Test: `test/test.js`

- [ ] **Step 1: Write the failing tests**

Add a new test section after the existing type checker tests:

```javascript
console.log('\n--- Is Operator Type Resolution Tests ---\n');

test('Type checker annotates is Type.String as primitive', () => {
  const source = 'dec x = "hello"\ndec r = x is Type.String';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  checker.check(ast);
  // Find the binary expression node
  const binExpr = ast.body[1].init;
  assertEqual(binExpr.isKind, 'primitive');
  assertEqual(binExpr.isPrimitive, 'string');
});

test('Type checker annotates is with type alias as shape', () => {
  const source = 'type Point = {x: number, y: number}\ndec p = {x: 1, y: 2}\ndec r = p is Point';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  checker.check(ast);
  const binExpr = ast.body[2].init;
  assertEqual(binExpr.isKind, 'shape');
  assertEqual(binExpr.isKeys.join(','), 'x,y');
});

test('Type checker annotates is with unknown name as instanceof', () => {
  const source = 'dec e = error("oops")\ndec r = e is TypeError';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  checker.check(ast);
  const binExpr = ast.body[1].init;
  assertEqual(binExpr.isKind, 'instanceof');
});

test('Type checker annotates is not as negated', () => {
  const source = 'dec x = 42\ndec r = x is not Type.Number';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  checker.check(ast);
  const binExpr = ast.body[1].init;
  assertEqual(binExpr.isKind, 'primitive');
  assertEqual(binExpr.isPrimitive, 'number');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | grep -A 1 'Type checker annotates is'`
Expected: FAIL — `isKind` is `undefined` on all nodes.

- [ ] **Step 3: Register the built-in `Type` enum in the constructor**

In `src/typechecker.js`, add after the existing `defineVariable` calls in the constructor (around line 64):

```javascript
    // Built-in Type enum for is operator
    this.builtinTypeEnum = new Map([
      ['String', 'string'],
      ['Number', 'number'],
      ['Boolean', 'boolean'],
      ['Null', 'null'],
      ['Array', 'array'],
      ['Object', 'object'],
      ['Function', 'function'],
    ]);
    this.defineVariable('Type', this.createType(Type.Object));
```

- [ ] **Step 4: Add `is` resolution logic to `visitBinaryExpression`**

In `src/typechecker.js`, replace the `is`/`is not` handling inside `visitBinaryExpression` (the block at line 1239 that just returns Boolean):

```javascript
    // Comparison operators
    if (['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(op)) {
      return this.createType(Type.Boolean);
    }

    // is / is not operator — resolve right-hand type and annotate AST
    if (op === 'is' || op === 'is not') {
      this.resolveIsOperator(node);
      return this.createType(Type.Boolean);
    }
```

- [ ] **Step 5: Implement the `resolveIsOperator` method**

Add this method to the `TypeChecker` class:

```javascript
  resolveIsOperator(node) {
    const right = node.right;

    // Tier 1: Type.Member — built-in primitive check
    if (right.type === NodeType.MemberExpression && right.object?.name === 'Type') {
      const member = right.property;
      const primitive = this.builtinTypeEnum.get(member);
      if (primitive) {
        node.isKind = 'primitive';
        node.isPrimitive = primitive;
        return;
      }
      this.addError(`Unknown Type member '${member}'`, node);
      node.isKind = 'instanceof';
      return;
    }

    // Get the type name (identifier)
    const typeName = right.type === NodeType.Identifier ? right.name : null;
    if (!typeName) {
      node.isKind = 'instanceof';
      return;
    }

    // Tier 2: type alias with object shape — duck typing
    const alias = this.typeAliases.get(typeName);
    if (alias) {
      const resolved = alias.params.length === 0 ? alias.body : this.substituteTypeParams(alias.body, new Map());
      if (resolved.kind === Type.Object && resolved.properties) {
        node.isKind = 'shape';
        node.isKeys = Object.keys(resolved.properties);
        return;
      }
    }

    // Tier 3: unknown name — instanceof fallback
    node.isKind = 'instanceof';
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | grep -A 1 'Type checker annotates is'`
Expected: All four `✓` pass.

- [ ] **Step 7: Run full test suite**

Run: `node test/test.js`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/typechecker.js test/test.js
git commit -m "feat(typechecker): resolve is operator — Type enum, duck typing, instanceof"
```

---

### Task 3: Type Checker — Resolve `is` in Match `IsPattern` Nodes

Annotate `IsPattern` nodes inside match expressions with the same resolution metadata.

**Files:**
- Modify: `src/typechecker.js:1414-1457` (visitMatchBlock)
- Test: `test/test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
test('Type checker annotates IsPattern with type alias as shape', () => {
  const source = 'type Resp = {status: number, body: any}\ndec r = match val {\nis Resp => "response"\n_ => "other"\n}';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  checker.check(ast);
  const pattern = ast.body[1].init.arms[0].pattern;
  assertEqual(pattern.isKind, 'shape');
  assertEqual(pattern.isKeys.join(','), 'status,body');
});

test('Type checker annotates IsPattern Type.String as primitive', () => {
  const source = 'dec r = match val {\nis Type.String => "string"\n_ => "other"\n}';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  checker.check(ast);
  const pattern = ast.body[0].init.arms[0].pattern;
  assertEqual(pattern.isKind, 'primitive');
  assertEqual(pattern.isPrimitive, 'string');
});

test('Type checker annotates IsPattern with unknown name as instanceof', () => {
  const source = 'dec r = match err {\nis TypeError => "type error"\n_ => "other"\n}';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  checker.check(ast);
  const pattern = ast.body[0].init.arms[0].pattern;
  assertEqual(pattern.isKind, 'instanceof');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | grep -A 1 'Type checker annotates IsPattern'`
Expected: FAIL — `isKind` is `undefined`.

- [ ] **Step 3: Add `IsPattern` resolution to `visitMatchBlock`**

In `src/typechecker.js`, inside the `visitMatchBlock` method, add pattern resolution inside the `for (const arm of node.arms)` loop, after the `this.pushScope()` call and before the existing pattern-binding code:

```javascript
      // Resolve IsPattern type names
      if (arm.pattern.type === 'IsPattern') {
        this.resolveIsPattern(arm.pattern);
      }
```

- [ ] **Step 4: Implement the `resolveIsPattern` method**

Add this method to the `TypeChecker` class:

```javascript
  resolveIsPattern(pattern) {
    const typeName = pattern.typeName;

    // Tier 1: Type.Member — built-in primitive check
    if (typeName.includes('.')) {
      const [obj, member] = typeName.split('.');
      if (obj === 'Type') {
        const primitive = this.builtinTypeEnum.get(member);
        if (primitive) {
          pattern.isKind = 'primitive';
          pattern.isPrimitive = primitive;
          return;
        }
        this.addError(`Unknown Type member '${member}'`, pattern);
      }
      pattern.isKind = 'instanceof';
      return;
    }

    // Tier 2: type alias with object shape — duck typing
    const alias = this.typeAliases.get(typeName);
    if (alias) {
      const resolved = alias.params.length === 0 ? alias.body : this.substituteTypeParams(alias.body, new Map());
      if (resolved.kind === Type.Object && resolved.properties) {
        pattern.isKind = 'shape';
        pattern.isKeys = Object.keys(resolved.properties);
        return;
      }
    }

    // Tier 3: unknown name — instanceof fallback
    pattern.isKind = 'instanceof';
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | grep -A 1 'Type checker annotates IsPattern'`
Expected: All three `✓` pass.

- [ ] **Step 6: Run full test suite**

Run: `node test/test.js`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/typechecker.js test/test.js
git commit -m "feat(typechecker): resolve IsPattern in match — shape, primitive, instanceof"
```

---

### Task 4: Generator — Emit Duck Typing for `is` Binary Expressions

Replace the `_id` comparison in the generator with annotation-driven emission.

**Files:**
- Modify: `src/generator.js:1891-1898` (visitBinaryExpression)
- Test: `test/test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
console.log('\n--- Is Operator Generator Tests ---\n');

test('Generate is Type.String as typeof check', () => {
  const source = 'type Dummy = {a: number}\ndec x = "hi"\ndec r = x is Type.String';
  const js = compile(source);
  assertContains(js, "typeof x === 'string'");
});

test('Generate is Type.Array as Array.isArray', () => {
  const source = 'dec x = [1, 2]\ndec r = x is Type.Array';
  const js = compile(source);
  assertContains(js, 'Array.isArray(x)');
});

test('Generate is Type.Null as null check', () => {
  const source = 'dec x = null\ndec r = x is Type.Null';
  const js = compile(source);
  assertContains(js, 'x === null');
});

test('Generate is Type.Object as typeof object check', () => {
  const source = 'dec x = {a: 1}\ndec r = x is Type.Object';
  const js = compile(source);
  assertContains(js, "typeof x === 'object'");
  assertContains(js, '!Array.isArray(x)');
});

test('Generate is with type alias as key-in checks', () => {
  const source = 'type Point = {x: number, y: number}\ndec p = {x: 1, y: 2}\ndec r = p is Point';
  const js = compile(source);
  assertContains(js, "typeof p === 'object'");
  assertContains(js, "'x' in p");
  assertContains(js, "'y' in p");
});

test('Generate is with unknown name as instanceof', () => {
  const source = 'dec e = error("oops")\ndec r = e is TypeError';
  const js = compile(source);
  assertContains(js, 'e instanceof TypeError');
});

test('Generate is not negates the check', () => {
  const source = 'dec x = "hi"\ndec r = x is not Type.String';
  const js = compile(source);
  assertContains(js, "typeof x !== 'string'");
});

test('Generate is not with type alias negates shape check', () => {
  const source = 'type Point = {x: number, y: number}\ndec p = {x: 1}\ndec r = p is not Point';
  const js = compile(source);
  assertContains(js, '!(');
});

test('Generate is not with unknown name as negated instanceof', () => {
  const source = 'dec e = error("oops")\ndec r = e is not TypeError';
  const js = compile(source);
  assertContains(js, '!(e instanceof TypeError)');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | grep -A 1 'Generate is'`
Expected: FAIL — still emitting `_id` comparisons.

- [ ] **Step 3: Add a helper method for emitting `is` checks**

Add this method to the generator class:

```javascript
  emitIsCheck(subject, node) {
    const kind = node.isKind;
    const negated = node.operator === 'is not';

    if (kind === 'primitive') {
      const p = node.isPrimitive;
      if (p === 'null') {
        return negated ? `(${subject} !== null)` : `(${subject} === null)`;
      }
      if (p === 'array') {
        return negated ? `(!Array.isArray(${subject}))` : `(Array.isArray(${subject}))`;
      }
      if (p === 'object') {
        const check = `typeof ${subject} === 'object' && ${subject} !== null && !Array.isArray(${subject})`;
        return negated ? `(!(${check}))` : `(${check})`;
      }
      // string, number, boolean, function
      return negated ? `(typeof ${subject} !== '${p}')` : `(typeof ${subject} === '${p}')`;
    }

    if (kind === 'shape') {
      const keys = node.isKeys;
      const keyChecks = keys.map(k => `'${k}' in ${subject}`).join(' && ');
      const check = keys.length > 0
        ? `typeof ${subject} === 'object' && ${subject} !== null && ${keyChecks}`
        : `typeof ${subject} === 'object' && ${subject} !== null`;
      return negated ? `(!(${check}))` : `(${check})`;
    }

    // instanceof fallback
    const right = this.visitExpression(node.right);
    return negated ? `(!(${subject} instanceof ${right}))` : `(${subject} instanceof ${right})`;
  }
```

- [ ] **Step 4: Replace `_id` comparison in `visitBinaryExpression`**

In `src/generator.js`, replace the `is` and `is not` handling (lines 1895-1898):

```javascript
    // Handle 'is' operator - duck typing checks
    if (node.operator === 'is' || node.operator === 'is not') {
      return this.emitIsCheck(left, node);
    }
```

Remove the old separate `is not` block (lines 1892-1895) as well — both cases are now handled by the single block above.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | grep -A 1 'Generate is'`
Expected: All nine `✓` pass.

- [ ] **Step 6: Run full test suite**

Run: `node test/test.js`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat(generator): emit duck typing for is operator in binary expressions"
```

---

### Task 5: Generator — Emit Duck Typing for `IsPattern` in Match

Replace the `_id` comparison in match pattern generation with annotation-driven emission.

**Files:**
- Modify: `src/generator.js:1825-1832` (IsPattern case in match arm generation)
- Test: `test/test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
test('Generate match is Type.String pattern', () => {
  const source = 'dec r = match val {\nis Type.String => "string"\n_ => "other"\n}';
  const js = compile(source);
  assertContains(js, "typeof _subject === 'string'");
});

test('Generate match is type alias pattern', () => {
  const source = 'type Point = {x: number, y: number}\ndec r = match val {\nis Point => "point"\n_ => "other"\n}';
  const js = compile(source);
  assertContains(js, "'x' in _subject");
  assertContains(js, "'y' in _subject");
});

test('Generate match is unknown name pattern as instanceof', () => {
  const source = 'dec r = match err {\nis TypeError => "type error"\n_ => "other"\n}';
  const js = compile(source);
  assertContains(js, '_subject instanceof TypeError');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | grep -A 1 'Generate match is'`
Expected: FAIL — still emitting `_id` comparisons.

- [ ] **Step 3: Add a helper method for emitting `IsPattern` match conditions**

Add this method to the generator class:

```javascript
  emitIsPatternCondition(pattern) {
    const kind = pattern.isKind;

    if (kind === 'primitive') {
      const p = pattern.isPrimitive;
      if (p === 'null') return '_subject === null';
      if (p === 'array') return 'Array.isArray(_subject)';
      if (p === 'object') return "typeof _subject === 'object' && _subject !== null && !Array.isArray(_subject)";
      return `typeof _subject === '${p}'`;
    }

    if (kind === 'shape') {
      const keys = pattern.isKeys;
      const keyChecks = keys.map(k => `'${k}' in _subject`).join(' && ');
      return keys.length > 0
        ? `typeof _subject === 'object' && _subject !== null && ${keyChecks}`
        : `typeof _subject === 'object' && _subject !== null`;
    }

    // instanceof fallback
    return `_subject instanceof ${pattern.typeName}`;
  }
```

- [ ] **Step 4: Replace `IsPattern` case in match arm generation**

In `src/generator.js`, replace the `IsPattern` case (lines 1825-1832):

```javascript
      case 'IsPattern': {
        condition = this.emitIsPatternCondition(pattern);
        if (guard) {
          const guardExpr = this.visitExpression(guard);
          condition += ` && (${guardExpr})`;
        }
        break;
      }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | grep -A 1 'Generate match is'`
Expected: All three `✓` pass.

- [ ] **Step 6: Run full test suite**

Run: `node test/test.js`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat(generator): emit duck typing for IsPattern in match expressions"
```

---

### Task 6: End-to-End Tests and Edge Cases

Verify the full pipeline works with compile-and-eval tests, and cover edge cases from the spec.

**Files:**
- Modify: `test/test.js`

- [ ] **Step 1: Write end-to-end tests**

```javascript
console.log('\n--- Is Operator End-to-End Tests ---\n');

test('is Type.String returns true for strings', () => {
  const source = 'dec x = "hello"\ndec r = x is Type.String\nprint r';
  const js = compile(source);
  assertContains(js, "typeof x === 'string'");
});

test('is with type alias duck types correctly', () => {
  const source = 'type Dog = {name: string, bark: string}\ndec d = {name: "Rex", bark: "woof"}\ndec r = d is Dog';
  const js = compile(source);
  assertContains(js, "'name' in d");
  assertContains(js, "'bark' in d");
});

test('is with empty object type checks typeof only', () => {
  const source = 'type Empty = {}\ndec x = {}\ndec r = x is Empty';
  const js = compile(source);
  assertContains(js, "typeof x === 'object'");
  assertContains(js, 'x !== null');
});

test('is with generic type alias checks keys only', () => {
  const source = 'type Result<T> = {ok: boolean, value: T}\ndec r = match val {\nis Result => "result"\n_ => "other"\n}';
  const js = compile(source);
  assertContains(js, "'ok' in _subject");
  assertContains(js, "'value' in _subject");
});

test('is in catch pattern works with instanceof', () => {
  const source = `fn doSomething() {
  try {
    throw "oops"
  } catch(e) {
    |e is TypeError| => { return "type error" }
    |true| => { return "other" }
  }
}`;
  const js = compile(source);
  assertContains(js, 'instanceof TypeError');
});

test('is not Type.Number negates typeof check', () => {
  const source = 'dec x = "hi"\ndec r = x is not Type.Number';
  const js = compile(source);
  assertContains(js, "typeof x !== 'number'");
});

test('is not with type alias negates shape check', () => {
  const source = 'type Point = {x: number, y: number}\ndec p = 42\ndec r = p is not Point';
  const js = compile(source);
  assertContains(js, '!(');
  assertContains(js, "'x' in p");
});
```

- [ ] **Step 2: Run all tests**

Run: `node test/test.js`
Expected: All tests pass, including all new `is` operator tests.

- [ ] **Step 3: Commit**

```bash
git add test/test.js
git commit -m "test: add end-to-end tests for is operator duck typing"
```

---

### Task 7: Update Example

Update the `readme_examples.km` catch block to work with the new `instanceof`-based `is`.

**Files:**
- Modify: `examples/readme_examples.km:245-266`

- [ ] **Step 1: Verify the existing example compiles without error**

Run: `node src/cli.js compile examples/readme_examples.km -o /tmp/readme_test.js 2>&1`

Check that the output contains `instanceof` instead of `_id` for the `e is NotFoundError` and `e is ValidationError` patterns.

- [ ] **Step 2: Update the example if needed**

The existing code already uses `e is NotFoundError` which will now compile to `instanceof`. No syntax changes should be needed — just verify the output is correct.

If the example defines custom error types that need a `type` declaration for duck typing instead, add those. But since these are error types (constructor-based), they should fall through to `instanceof` and work as-is.

- [ ] **Step 3: Commit if changes were made**

```bash
git add examples/readme_examples.km
git commit -m "docs: verify readme_examples.km works with new is operator"
```
