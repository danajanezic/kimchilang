# Union Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add union types (`string | null`) to the type checker, supported in extern declarations and KMDocs, with one-way compatibility and guard-based narrowing.

**Architecture:** A new `Type.Union` kind in the type system, `parseTypeString` extended to split on `|`, `isCompatible` updated with union-aware logic, and `visitGuardStatement` enhanced to narrow union types after null checks. No lexer, parser, or generator changes needed — unions are purely a type-checker feature. The parser's `parseExternType` already passes `|` through in type strings.

**Tech Stack:** Pure JavaScript, zero dependencies. Only `src/typechecker.js` is modified.

---

### Task 1: Add Type.Union and parseTypeString support

**Files:**
- Modify: `src/typechecker.js:4-17` (Type enum)
- Modify: `src/typechecker.js:132-193` (parseTypeString)
- Modify: `src/typechecker.js:195-211` (typeToString)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for parsing union types**

Add to `test/test.js` after the type checker tests:

```javascript
test('Type checker: parseTypeString parses union type', () => {
  const tc = new TypeChecker();
  const type = tc.parseTypeString('string | null');
  assertEqual(type.kind, 'union');
  assertEqual(type.members.length, 2);
  assertEqual(type.members[0].kind, 'string');
  assertEqual(type.members[1].kind, 'null');
});

test('Type checker: parseTypeString parses union without spaces', () => {
  const tc = new TypeChecker();
  const type = tc.parseTypeString('string|null');
  assertEqual(type.kind, 'union');
  assertEqual(type.members.length, 2);
});

test('Type checker: parseTypeString parses triple union', () => {
  const tc = new TypeChecker();
  const type = tc.parseTypeString('string | number | boolean');
  assertEqual(type.kind, 'union');
  assertEqual(type.members.length, 3);
});

test('Type checker: parseTypeString deduplicates union members', () => {
  const tc = new TypeChecker();
  const type = tc.parseTypeString('string | string');
  // Deduplicates to just string (not a union)
  assertEqual(type.kind, 'string');
});

test('Type checker: parseTypeString absorbs any in union', () => {
  const tc = new TypeChecker();
  const type = tc.parseTypeString('string | any');
  assertEqual(type.kind, 'any');
});

test('Type checker: parseTypeString handles array union', () => {
  const tc = new TypeChecker();
  const type = tc.parseTypeString('string[] | null');
  assertEqual(type.kind, 'union');
  assertEqual(type.members[0].kind, 'array');
  assertEqual(type.members[1].kind, 'null');
});

test('Type checker: typeToString formats union', () => {
  const tc = new TypeChecker();
  const type = tc.parseTypeString('string | null');
  const str = tc.typeToString(type);
  assertEqual(str, 'string | null');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failures — `parseTypeString` doesn't understand `|`.

- [ ] **Step 3: Add Type.Union to the Type enum**

In `src/typechecker.js`, add after `Module: 'module',` (line 16):

```javascript
  Union: 'union',
```

- [ ] **Step 4: Add createUnionType helper**

In `src/typechecker.js`, add after `createFunctionType` (around line 130):

```javascript
  createUnionType(members) {
    // Flatten nested unions
    const flat = [];
    for (const m of members) {
      if (m.kind === Type.Union) {
        flat.push(...m.members);
      } else {
        flat.push(m);
      }
    }
    
    // Absorb any
    if (flat.some(m => m.kind === Type.Any)) {
      return this.createType(Type.Any);
    }
    
    // Deduplicate by kind (simple dedup for primitives)
    const seen = new Set();
    const unique = [];
    for (const m of flat) {
      const key = this.typeToString(m);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(m);
      }
    }
    
    // Single member — unwrap
    if (unique.length === 1) return unique[0];
    
    return { kind: Type.Union, members: unique };
  }
```

- [ ] **Step 5: Update parseTypeString to handle `|`**

In `src/typechecker.js`, in `parseTypeString` (line 132), add at the very top of the method, BEFORE the primitives check:

```javascript
    // Union type: split on | at top level
    if (str.includes('|')) {
      let depth = 0;
      const parts = [];
      let current = '';
      for (const char of str) {
        if (char === '(' || char === '{') depth++;
        else if (char === ')' || char === '}') depth--;
        else if (char === '|' && depth === 0) {
          parts.push(current.trim());
          current = '';
          continue;
        }
        current += char;
      }
      parts.push(current.trim());
      
      if (parts.length > 1) {
        const members = parts.filter(p => p).map(p => this.parseTypeString(p));
        return this.createUnionType(members);
      }
    }
```

- [ ] **Step 6: Update typeToString to handle Union**

In `src/typechecker.js`, in `typeToString` (around line 195), add before the `return type.kind || 'unknown'` fallback:

```javascript
    if (type.kind === Type.Union) {
      return type.members.map(m => this.typeToString(m)).join(' | ');
    }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 7 new tests pass. No existing tests broken.

- [ ] **Step 8: Commit**

```bash
git add src/typechecker.js test/test.js
git commit -m "feat(typechecker): add Type.Union and parseTypeString union support"
```

---

### Task 2: Update isCompatible for union types

**Files:**
- Modify: `src/typechecker.js:213-235` (isCompatible)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for union compatibility**

Add to `test/test.js`:

```javascript
test('Type checker: string is compatible with string | null', () => {
  const tc = new TypeChecker();
  const union = tc.parseTypeString('string | null');
  const str = tc.parseTypeString('string');
  assertEqual(tc.isCompatible(union, str), true);
});

test('Type checker: null is compatible with string | null', () => {
  const tc = new TypeChecker();
  const union = tc.parseTypeString('string | null');
  const nul = tc.parseTypeString('null');
  assertEqual(tc.isCompatible(union, nul), true);
});

test('Type checker: number is NOT compatible with string | null', () => {
  const tc = new TypeChecker();
  const union = tc.parseTypeString('string | null');
  const num = tc.parseTypeString('number');
  assertEqual(tc.isCompatible(union, num), false);
});

test('Type checker: string | null is NOT compatible with string (no narrowing)', () => {
  const tc = new TypeChecker();
  const str = tc.parseTypeString('string');
  const union = tc.parseTypeString('string | null');
  assertEqual(tc.isCompatible(str, union), false);
});

test('Type checker: string | null is compatible with string | null', () => {
  const tc = new TypeChecker();
  const union1 = tc.parseTypeString('string | null');
  const union2 = tc.parseTypeString('string | null');
  assertEqual(tc.isCompatible(union1, union2), true);
});

test('Type checker: string is compatible with string | number (member matches)', () => {
  const tc = new TypeChecker();
  const union = tc.parseTypeString('string | number');
  const str = tc.parseTypeString('string');
  assertEqual(tc.isCompatible(union, str), true);
});

test('Type checker: string | null NOT compatible with string | number', () => {
  const tc = new TypeChecker();
  const expected = tc.parseTypeString('string | number');
  const actual = tc.parseTypeString('string | null');
  // null is not in string | number
  assertEqual(tc.isCompatible(expected, actual), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failures — `isCompatible` doesn't handle unions.

- [ ] **Step 3: Update isCompatible with union logic**

In `src/typechecker.js`, replace the entire `isCompatible` method (lines 213-235) with:

```javascript
  isCompatible(expected, actual) {
    if (!expected || !actual) return true;
    if (expected.kind === Type.Any || actual.kind === Type.Any) return true;
    if (expected.kind === Type.Unknown || actual.kind === Type.Unknown) return true;
    
    // When expected is a union: actual must match at least one member
    if (expected.kind === Type.Union) {
      if (actual.kind === Type.Union) {
        // Every member of actual must match at least one member of expected
        return actual.members.every(am => 
          expected.members.some(em => this.isCompatible(em, am))
        );
      }
      // Non-union actual: must match at least one member of expected
      return expected.members.some(em => this.isCompatible(em, actual));
    }
    
    // When actual is a union but expected is not: every member must fit expected
    if (actual.kind === Type.Union) {
      return actual.members.every(am => this.isCompatible(expected, am));
    }
    
    // Both non-union: exact kind match
    if (expected.kind === actual.kind) {
      if (expected.kind === Type.Object) {
        if (expected.properties && actual.properties) {
          for (const [key, expectedType] of Object.entries(expected.properties)) {
            if (!(key in actual.properties)) {
              return false;
            }
            if (!this.isCompatible(expectedType, actual.properties[key])) {
              return false;
            }
          }
        }
      }
      return true;
    }
    return false;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 7 new compatibility tests pass. No existing tests broken.

- [ ] **Step 5: Commit**

```bash
git add src/typechecker.js test/test.js
git commit -m "feat(typechecker): union-aware isCompatible"
```

---

### Task 3: Union types in extern declarations

**Files:**
- Test: `test/test.js`

- [ ] **Step 1: Write tests for extern with union types**

Add to `test/test.js`:

```javascript
test('Type checker: extern fn with union param validates correctly', () => {
  const source = 'extern "mod" {\n  fn read(path: string | null): string\n}\ndec x = read("file")';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  // string is compatible with string | null — no error
  const readErrors = errors.filter(e => e.message.includes('read'));
  assertEqual(readErrors.length, 0);
});

test('Type checker: extern fn with union param rejects wrong type', () => {
  const source = 'extern "mod" {\n  fn read(path: string | null): string\n}\ndec x = read(123)';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  // number is NOT compatible with string | null
  const typeErrors = errors.filter(e => e.message.includes('Expected'));
  assertEqual(typeErrors.length, 1);
});

test('Type checker: extern fn with union return type', () => {
  const source = 'extern "mod" {\n  fn find(id: number): string | null\n}\ndec x = find(1)';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length, 0);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 3 tests pass. The extern and type checker plumbing from Tasks 1-2 should handle these automatically.

- [ ] **Step 3: If any tests fail, debug and fix. If all pass, commit**

```bash
git add test/test.js
git commit -m "test: add extern union type validation tests"
```

---

### Task 4: Union types in KMDocs

**Files:**
- Test: `test/test.js`

- [ ] **Step 1: Write tests for KMDocs with union types**

Add to `test/test.js`:

```javascript
test('Type checker: KMDoc union param validates correctly', () => {
  const source = '/** @param {string | null} name */\nfn greet(name) { return name }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length, 0);
});

test('Type checker: KMDoc union param rejects wrong type at call site', () => {
  const source = '/** @param {string | null} name */\nfn greet(name) { return name }\ndec x = greet(123)';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const typeErrors = errors.filter(e => e.message.includes('Expected'));
  assertEqual(typeErrors.length, 1);
});

test('Type checker: KMDoc union return type', () => {
  const source = '/** @returns {string | null} */\nfn find(id) { return null }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length, 0);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 3 tests pass. KMDocs pass type strings through `parseTypeString` which already handles `|` from Task 1.

- [ ] **Step 3: Commit**

```bash
git add test/test.js
git commit -m "test: add KMDoc union type validation tests"
```

---

### Task 5: Guard-based type narrowing

**Files:**
- Modify: `src/typechecker.js:397-410` (visitGuardStatement)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for guard narrowing**

Add to `test/test.js`:

```javascript
test('Type checker: guard narrows string | null to string', () => {
  const source = `
extern "mod" {
  fn find(id: number): string | null
}
fn main() {
  dec x = find(1)
  guard x != null else { return null }
  dec y = x
}`;
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  // x should be narrowed to string after guard — no errors
  assertEqual(errors.length, 0);
});

test('Type checker: without guard, union stays wide', () => {
  const source = `
/** @param {string | null} name */
fn greet(name) {
  return name
}`;
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  // No error — returning string | null from a function is fine
  assertEqual(errors.length, 0);
});

test('Type checker: guard narrows object | null to object', () => {
  const source = `
extern "mod" {
  fn findUser(id: number): {name: string} | null
}
fn main() {
  dec user = findUser(1)
  guard user != null else { return null }
  print user.name
}`;
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length, 0);
});
```

- [ ] **Step 2: Run tests to verify they pass or fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: These may already pass since the type checker is permissive with Unknown types. If they pass, good — the narrowing is a refinement. If they fail, we need the narrowing logic.

- [ ] **Step 3: Add narrowing logic to visitGuardStatement**

In `src/typechecker.js`, replace `visitGuardStatement` (lines 397-410) with:

```javascript
  visitGuardStatement(node) {
    this.visitExpression(node.test);

    const hasExit = this.blockHasExit(node.alternate);
    if (!hasExit) {
      this.addError('guard else block must contain a return or throw statement', node);
    }

    this.pushScope();
    for (const stmt of node.alternate.body) {
      this.visitStatement(stmt);
    }
    this.popScope();
    
    // Type narrowing: guard x != null else { ... }
    // After the guard, narrow x by removing null from its union type
    if (node.test && node.test.type === 'BinaryExpression' && node.test.operator === '!=') {
      const { left, right } = node.test;
      let identifier = null;
      let isNullCheck = false;
      
      if (left.type === 'Identifier' && right.type === 'Literal' && right.value === null) {
        identifier = left.name;
        isNullCheck = true;
      } else if (right.type === 'Identifier' && left.type === 'Literal' && left.value === null) {
        identifier = right.name;
        isNullCheck = true;
      }
      
      if (identifier && isNullCheck) {
        const currentType = this.lookupVariable(identifier);
        if (currentType && currentType.kind === Type.Union) {
          const narrowed = currentType.members.filter(m => m.kind !== Type.Null);
          if (narrowed.length === 1) {
            this.defineVariable(identifier, narrowed[0]);
          } else if (narrowed.length > 1) {
            this.defineVariable(identifier, this.createUnionType(narrowed));
          }
        }
      }
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 3 narrowing tests pass. No existing tests broken.

- [ ] **Step 5: Commit**

```bash
git add src/typechecker.js test/test.js
git commit -m "feat(typechecker): guard-based type narrowing for union types"
```

---

### Task 6: Update argument type error messages for unions

**Files:**
- Modify: `src/typechecker.js` (visitCallExpression — update arg mismatch logic to use isCompatible)
- Test: `test/test.js`

- [ ] **Step 1: Write tests for union arg error messages**

Add to `test/test.js`:

```javascript
test('Type checker: error message includes union type', () => {
  const source = 'extern "mod" {\n  fn read(path: string | null): string\n}\ndec x = read(123)';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length >= 1, true);
  // Error should mention the union type
  assertContains(errors[0].message, 'string | null');
});
```

- [ ] **Step 2: Run test to see current behavior**

Run: `node test/test.js 2>&1 | tail -20`
Expected: May fail if the error message uses `kind` instead of `typeToString`.

- [ ] **Step 3: Update visitCallExpression argument checking to use isCompatible**

In `src/typechecker.js`, find the argument type validation in `visitCallExpression` (around line 985-1000). The current code does a simple `kind !== kind` check:

```javascript
            if (argType.kind !== Type.Unknown && argType.kind !== Type.Any &&
                expectedType.kind !== Type.Any && expectedType.kind !== Type.Unknown &&
                argType.kind !== expectedType.kind) {
```

Replace this entire condition and its error with:

```javascript
            if (argType.kind !== Type.Unknown && argType.kind !== Type.Any &&
                expectedType.kind !== Type.Any && expectedType.kind !== Type.Unknown &&
                !this.isCompatible(expectedType, argType)) {
              this.addError(
                `Argument ${i + 1} of '${node.callee.name}': Expected ${this.typeToString(expectedType)}, got ${this.typeToString(argType)}`,
                node
              );
```

This replaces the simple `kind !== kind` check with the full `isCompatible` check that understands unions.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All tests pass including the new error message test. No existing tests broken.

- [ ] **Step 5: Commit**

```bash
git add src/typechecker.js test/test.js
git commit -m "feat(typechecker): use isCompatible for arg validation, union-aware error messages"
```

---

### Task 7: End-to-end tests

**Files:**
- Test: `test/test.js`

- [ ] **Step 1: Write end-to-end tests**

Add to `test/test.js`:

```javascript
test('E2E: extern with union types compiles', () => {
  const source = `
extern "node:fs" {
  fn readFileSync(path: string, encoding: string | null): string | null
}
fn main() {
  dec content = readFileSync("file.txt", null)
  guard content != null else { return null }
  print content
}
main()`;
  const js = compile(source);
  assertContains(js, "import { readFileSync } from 'node:fs'");
  assertContains(js, 'readFileSync("file.txt", null)');
});

test('E2E: KMDoc union types compile', () => {
  const source = `
/** @param {string | null} name */
fn greet(name) {
  guard name != null else { return "anonymous" }
  return "hello " + name
}
dec result = greet(null)
print result`;
  const js = compile(source);
  assertContains(js, 'function greet(name)');
});

test('E2E: union type error is caught at compile time', () => {
  const source = 'extern "mod" {\n  fn read(path: string | null): string\n}\ndec x = read(123)';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length >= 1, true);
  assertContains(errors[0].message, 'string | null');
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All tests pass, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add test/test.js
git commit -m "test: add end-to-end tests for union types"
```

---

### Task 8: Update ROADMAP.md

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Mark union types as done**

In `ROADMAP.md`, find the union types line:

```markdown
- [ ] Union types (`string | null`)
```

Replace with:

```markdown
- [x] ~~Union types (`string | null`)~~ — supported in extern declarations and KMDocs, one-way compatibility, guard-based narrowing
```

- [ ] **Step 2: Run full test suite**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All tests pass, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: mark union types as done"
```
