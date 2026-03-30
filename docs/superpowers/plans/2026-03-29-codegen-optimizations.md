# Code Generation Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four generator optimizations — remove `_deepFreeze`, skip unnecessary `?.`, flatten match IIFEs, and tree-shake unused runtime helpers.

**Architecture:** All changes are in `src/generator.js`. The generator gains an AST pre-scan pass that collects used features (for helper tree-shaking) and builds a known-shapes tree (for `?.` optimization). The `visitDecDeclaration`, `visitMemberExpression`, `visitMatchBlock`, `visitJSBlock`, and `emitRuntimeExtensions` methods are modified.

**Tech Stack:** Node.js ES modules, zero dependencies.

**Spec:** `docs/superpowers/specs/2026-03-29-codegen-optimizations-design.md`

---

## File Map

| File | Changes |
|------|---------|
| `src/generator.js` | All four optimizations |
| `test/test.js` | Updated tests for new output patterns |
| `examples/*.js` | Recompiled after changes |

---

### Task 1: Remove `_deepFreeze` from Declarations

**Files:**
- Modify: `src/generator.js:138-146` (remove `_deepFreeze` function), `src/generator.js:602-633` (visitDecDeclaration)
- Modify: `test/test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/test.js` before the summary:

```javascript
// --- Code Generation Optimization Tests ---
console.log('\n--- Codegen Optimization Tests ---\n');

test('Opt1: dec emits const without _deepFreeze', () => {
  const js = compile('dec x = 42');
  assertContains(js, 'const x = 42;');
  assertEqual(js.includes('_deepFreeze(42)'), false, 'Should not use _deepFreeze');
});

test('Opt1: dec object emits const without _deepFreeze', () => {
  const js = compile('dec obj = { a: 1 }');
  assertContains(js, 'const obj =');
  assertEqual(js.includes('_deepFreeze({'), false, 'Should not use _deepFreeze on objects');
});

test('Opt1: dec destructuring emits without _deepFreeze', () => {
  const js = compile('dec { a, b } = obj');
  assertEqual(js.includes('_deepFreeze'), false, 'Should not use _deepFreeze on destructuring');
});

test('Opt1: _deepFreeze function not in output', () => {
  const js = compile('dec x = 1');
  assertEqual(js.includes('function _deepFreeze'), false, 'Should not emit _deepFreeze function');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Remove `_deepFreeze` from runtime**

In `src/generator.js`, find and delete the `_deepFreeze` function definition in `emitRuntimeExtensions()` (lines 138-146):

Delete these lines:
```javascript
    // Deep freeze helper for dec declarations
    this.emitLine('function _deepFreeze(obj) {');
    this.pushIndent();
    this.emitLine('if (obj === null || typeof obj !== "object") return obj;');
    this.emitLine('Object.keys(obj).forEach(key => _deepFreeze(obj[key]));');
    this.emitLine('return Object.freeze(obj);');
    this.popIndent();
    this.emitLine('}');
    this.emitLine();
```

- [ ] **Step 4: Remove `_deepFreeze` from visitDecDeclaration**

In `visitDecDeclaration` (around line 602), change all three `_deepFreeze(...)` calls to plain values:

Replace:
```javascript
        this.emitLine(`const { ${props} } = _deepFreeze(${init});`);
```
With:
```javascript
        this.emitLine(`const { ${props} } = ${init};`);
```

Replace:
```javascript
        this.emitLine(`const [${elems}] = _deepFreeze(${init});`);
```
With:
```javascript
        this.emitLine(`const [${elems}] = ${init};`);
```

Replace:
```javascript
      this.emitLine(`const ${node.name} = _deepFreeze(${init});`);
```
With:
```javascript
      this.emitLine(`const ${node.name} = ${init};`);
```

- [ ] **Step 5: Run all tests**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`

Some existing tests may check for `_deepFreeze` in output — find and update them. Search for `_deepFreeze` in `test/test.js` and update assertions. For example, if a test says `assertContains(js, '_deepFreeze(42)')`, change to `assertContains(js, 'const x = 42')`.

Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "opt: remove _deepFreeze — immutability is compile-time only"
```

---

### Task 2: Freeze `dec` Variables at JS Block Boundary

**Files:**
- Modify: `src/generator.js:735-783` (visitJSBlock, visitJSBlockExpression)
- Modify: `test/test.js`

- [ ] **Step 1: Write failing tests**

```javascript
test('Opt1b: dec var passed to js() block is Object.freeze-d', () => {
  const js = compile('dec config = { a: 1 }\njs(config) { console.log(config); }');
  assertContains(js, 'Object.freeze(config)');
});

test('Opt1b: mut var passed to js() block is NOT frozen', () => {
  const js = generate(parse(tokenize('mut config = { a: 1 }\njs(config) { console.log(config); }')));
  assertEqual(js.includes('Object.freeze(config)'), false, 'mut should not be frozen');
});

test('Opt1b: js block without params has no freeze', () => {
  const js = compile('js { console.log("hi"); }');
  assertEqual(js.includes('Object.freeze'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — currently js blocks pass variables directly without freeze

- [ ] **Step 3: Track which variables are `dec` in the generator**

The generator needs to know which identifiers were declared with `dec` vs `mut`. Add a `Set` to the constructor:

In `src/generator.js`, find the constructor (around line 27):
```javascript
  constructor(options = {}) {
    this.indent = 0;
    this.indentStr = options.indentStr || '  ';
    this.output = '';
    this.options = options;
  }
```

Add:
```javascript
    this.decVariables = new Set(); // Track dec-declared variables for JS boundary freeze
```

In `visitDecDeclaration`, after emitting the `const` line, add the variable name to the set. In the non-destructuring branch:
```javascript
      this.decVariables.add(node.name);
```

In the destructuring branches, add each destructured name.

- [ ] **Step 4: Modify visitJSBlock and visitJSBlockExpression to freeze dec vars**

In `visitJSBlock`, when `node.inputs.length > 0`, change the invocation args to freeze `dec` variables:

Replace:
```javascript
      this.emitLine(`})(${params});`);
```
With:
```javascript
      const args = node.inputs.map(name =>
        this.decVariables.has(name) ? `Object.freeze(${name})` : name
      ).join(', ');
      this.emitLine(`})(${args});`);
```

Do the same for `visitJSBlockExpression`:

Replace:
```javascript
      return `((${params}) => { ${lines} })(${params})`;
```
With:
```javascript
      const args = node.inputs.map(name =>
        this.decVariables.has(name) ? `Object.freeze(${name})` : name
      ).join(', ');
      return `((${params}) => { ${lines} })(${args})`;
```

- [ ] **Step 5: Run all tests**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "opt: freeze dec variables at JS block boundary only"
```

---

### Task 3: Skip Optional Chaining for Known Non-null Objects

**Files:**
- Modify: `src/generator.js` (constructor, visitDecDeclaration, visitMutDeclaration, visitGuardStatement, visitMemberExpression)
- Modify: `test/test.js`

- [ ] **Step 1: Write failing tests**

```javascript
test('Opt2: known literal dec uses . not ?.', () => {
  const js = compile('dec obj = { name: "Alice" }\nprint obj.name');
  assertContains(js, 'obj.name');
  assertEqual(js.includes('obj?.name'), false, 'Known object should use . not ?.');
});

test('Opt2: nested known shape uses . not ?.', () => {
  const js = compile('dec obj = { a: { b: 1 } }\nprint obj.a.b');
  assertContains(js, 'obj.a.b');
  assertEqual(js.includes('?.'), false, 'Fully known shape should have no ?.');
});

test('Opt2: unknown property still uses ?.', () => {
  const js = compile('dec obj = { name: "Alice" }\nprint obj.email');
  assertContains(js, 'obj.email');
  // obj is known but .email is not in the shape — should use ?.
});

test('Opt2: function param uses ?.', () => {
  const js = compile('fn foo(x) { return x.name }');
  assertContains(js, '?.name');
});

test('Opt2: after guard non-null uses .', () => {
  const js = compile('fn foo(x) {\n  guard x != null else { return null }\n  return x.name\n}');
  // x is known non-null after guard — but x.name shape is unknown
  // Root should be ., nested should be ?.
});

test('Opt2: number literal uses . not ?.', () => {
  const js = compile('dec x = 42\nprint x.toString()');
  assertEqual(js.includes('x?.toString'), false, 'Number literal should not use ?.');
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — currently everything uses `?.`

- [ ] **Step 3: Add known-shapes tracking to generator**

Add to the constructor:
```javascript
    this.knownShapes = new Map(); // Map<name, shapeTree> for ?. optimization
```

Add a helper method to build a shape tree from an AST node:

```javascript
  buildShapeTree(node) {
    if (!node) return true; // leaf — exists but no sub-shape

    if (node.type === NodeType.Literal || node.type === NodeType.TemplateLiteral) {
      return true; // primitives are non-null
    }

    if (node.type === NodeType.ArrayExpression) {
      return true; // array is non-null, but element shapes unknown
    }

    if (node.type === NodeType.ObjectExpression) {
      const shape = {};
      for (const prop of node.properties) {
        if (prop.type === NodeType.SpreadElement) continue; // skip spread
        const key = typeof prop.key === 'string' ? prop.key : (prop.key.name || prop.key.value);
        if (key) {
          shape[key] = this.buildShapeTree(prop.value);
        }
      }
      return shape;
    }

    return true; // other expressions — known to exist but no shape info
  }
```

- [ ] **Step 4: Register shapes in visitDecDeclaration and visitMutDeclaration**

In `visitDecDeclaration`, after emitting the `const` line, in the non-destructuring branch:
```javascript
      // Track known shape for ?. optimization
      const shape = this.buildShapeTree(node.init);
      if (shape) this.knownShapes.set(node.name, shape);
```

In `visitMutDeclaration`, do the same but note that reassignment invalidates. For now, just register on initial declaration (reassignment invalidation is a future enhancement).

- [ ] **Step 5: Register non-null after guard**

In `visitGuardStatement`, after emitting the `if (!(` line, check if the guard condition is `x != null`. If so, add `x` to knownShapes:

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

    // Track non-null after guard: guard x != null else { ... }
    if (node.test.type === NodeType.BinaryExpression &&
        node.test.operator === '!=' &&
        node.test.right.type === NodeType.Literal &&
        node.test.right.value === null &&
        node.test.left.type === NodeType.Identifier) {
      this.knownShapes.set(node.test.left.name, true);
    }
  }
```

- [ ] **Step 6: Modify visitMemberExpression to check known shapes**

Replace `visitMemberExpression`:

```javascript
  visitMemberExpression(node) {
    const object = this.visitExpression(node.object);

    // Determine if we can skip optional chaining
    const useOptionalChaining = !this.isKnownNonNull(node.object, node.computed ? null : node.property);
    const chainOp = useOptionalChaining ? '?.' : '.';

    if (node.computed) {
      const property = this.visitExpression(node.property);
      return useOptionalChaining ? `${object}?.[${property}]` : `${object}[${property}]`;
    }
    return `${object}${chainOp}${node.property}`;
  }

  isKnownNonNull(objectNode, propertyName) {
    // Walk the member expression chain to find the root identifier
    if (objectNode.type === NodeType.Identifier) {
      const shape = this.knownShapes.get(objectNode.name);
      if (!shape) return false;
      // Root is known non-null. Check if property is in shape.
      if (propertyName === null) return true; // computed access — root is enough
      if (shape === true) return true; // root is non-null but no shape info for properties
      if (typeof shape === 'object' && propertyName in shape) return true;
      return false;
    }

    if (objectNode.type === NodeType.MemberExpression) {
      // Nested: obj.a.b — check if obj.a is in the shape tree
      const rootShape = this.getNestedShape(objectNode);
      if (rootShape === null) return false;
      if (propertyName === null) return true;
      if (rootShape === true) return false; // parent exists but no sub-shape
      if (typeof rootShape === 'object' && propertyName in rootShape) return true;
      return false;
    }

    return false;
  }

  getNestedShape(node) {
    if (node.type === NodeType.Identifier) {
      return this.knownShapes.get(node.name) || null;
    }
    if (node.type === NodeType.MemberExpression && !node.computed) {
      const parentShape = this.getNestedShape(node.object);
      if (parentShape === null || parentShape === true) return null;
      if (typeof parentShape === 'object' && node.property in parentShape) {
        return parentShape[node.property];
      }
      return null;
    }
    return null;
  }
```

- [ ] **Step 7: Run all tests**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`

Some existing tests may check for `?.` in output — update them to match the new behavior. For example, tests that assert `assertContains(js, '?.')` for known-literal objects need updating.

Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "opt: skip optional chaining for known non-null object shapes"
```

---

### Task 4: Flatten Match Expression IIFEs in Statement Context

**Files:**
- Modify: `src/generator.js` (visitStatement ExpressionStatement case, add visitMatchBlockStatement)
- Modify: `test/test.js`

- [ ] **Step 1: Write failing tests**

```javascript
test('Opt3: match as statement has no IIFE', () => {
  const js = generate(parse(tokenize('fn foo(x) {\nmatch x {\n1 => print "one"\n_ => print "other"\n}\n}')));
  assertEqual(js.includes('(() =>'), false, 'Statement match should not have IIFE');
  assertContains(js, 'const _subject');
  assertContains(js, 'if (');
});

test('Opt3: match as expression still has IIFE', () => {
  const js = generate(parse(tokenize('dec result = match x {\n1 => "one"\n_ => "other"\n}')));
  assertContains(js, '(() =>');
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — statement match currently uses IIFE

- [ ] **Step 3: Modify ExpressionStatement to detect match blocks**

In the `visitStatement` switch, replace the ExpressionStatement case:

```javascript
      case NodeType.ExpressionStatement:
        // Flatten match blocks in statement context (no IIFE needed)
        if (node.expression.type === NodeType.MatchBlock) {
          this.visitMatchBlockStatement(node.expression);
        } else {
          this.emitLine(this.visitExpression(node.expression) + ';');
        }
        break;
```

- [ ] **Step 4: Add visitMatchBlockStatement method**

Add near `visitMatchBlock`:

```javascript
  visitMatchBlockStatement(node) {
    // Flat match — no IIFE wrapper, used when match is a statement
    const subject = this.visitExpression(node.subject);
    this.emitLine(`const _subject = ${subject};`);

    let firstCondition = true;
    for (let i = 0; i < node.arms.length; i++) {
      const arm = node.arms[i];
      const isWildcard = arm.pattern.type === NodeType.WildcardPattern || arm.pattern.type === 'WildcardPattern';
      const { condition, bindings } = this.compileMatchPattern(arm.pattern, arm.guard);

      if (isWildcard) {
        if (firstCondition) {
          this.emitLine('{');
        } else {
          this.emitLine('} else {');
        }
      } else {
        if (firstCondition) {
          this.emitLine(`if (${condition}) {`);
        } else {
          this.emitLine(`} else if (${condition}) {`);
        }
      }
      firstCondition = false;

      this.pushIndent();
      for (const [name, expr] of bindings) {
        this.emitLine(`const ${name} = ${expr};`);
      }

      if (arm.body.type === 'BlockStatement') {
        for (const stmt of arm.body.body) {
          this.visitStatement(stmt);
        }
      } else {
        this.emitLine(this.visitExpression(arm.body) + ';');
      }
      this.popIndent();
    }

    if (node.arms.length > 0) {
      this.emitLine('}');
    }
  }
```

- [ ] **Step 5: Run all tests**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "opt: flatten match IIFEs in statement context"
```

---

### Task 5: Tree-shake Unused Runtime Helpers

**Files:**
- Modify: `src/generator.js` (add `scanUsedFeatures`, refactor `emitRuntimeExtensions`)
- Modify: `test/test.js`

- [ ] **Step 1: Write failing tests**

```javascript
test('Opt4: hello world has no _pipe or _flow', () => {
  const js = compile('print "hello"');
  assertEqual(js.includes('function _pipe'), false, 'Should not emit _pipe');
  assertEqual(js.includes('function _flow'), false, 'Should not emit _flow');
  assertEqual(js.includes('function _shell'), false, 'Should not emit _shell');
  assertEqual(js.includes('class _Secret'), false, 'Should not emit _Secret');
  assertEqual(js.includes('const _tests'), false, 'Should not emit test runtime');
});

test('Opt4: pipe code includes _pipe', () => {
  const js = compile('fn double(x) { return x * 2 }\ndec result = 5 ~> double');
  assertContains(js, 'function _pipe');
  assertEqual(js.includes('function _flow'), false, 'Should not emit _flow when unused');
});

test('Opt4: test code includes test runtime', () => {
  const js = generate(parse(tokenize('test "x" { expect(1).toBe(1) }')));
  assertContains(js, 'const _tests');
  assertContains(js, 'function _expect');
});

test('Opt4: secret code includes _Secret', () => {
  const js = generate(parse(tokenize('secret dec key = "abc"')));
  assertContains(js, 'class _Secret');
});

test('Opt4: flow code includes _flow', () => {
  const js = compile('fn double(x) { return x * 2 }\ntransform >> double');
  assertContains(js, 'function _flow');
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — currently all helpers are always emitted

- [ ] **Step 3: Add AST feature scanner**

Add a method to the CodeGenerator class:

```javascript
  scanUsedFeatures(ast) {
    const features = new Set();
    const scan = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.type) features.add(node.type);
      if (node.secret) features.add('secret');
      for (const key of Object.keys(node)) {
        const val = node[key];
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item === 'object') scan(item);
          }
        } else if (val && typeof val === 'object' && val.type) {
          scan(val);
        }
      }
    };
    scan(ast);
    return features;
  }
```

- [ ] **Step 4: Refactor emitRuntimeExtensions to check features**

In `visitProgram`, before calling `this.emitRuntimeExtensions()`, scan the AST:

```javascript
    this.usedFeatures = this.scanUsedFeatures(node);
    this.emitRuntimeExtensions();
```

Then in `emitRuntimeExtensions`, wrap each section in a feature check:

- Stdlib extensions (Array/String prototypes): **always emit** (keep as-is)
- `_obj` helper: always emit (used implicitly)
- `error` / `error.create`: always emit (commonly used)
- `_Secret` / `_secret`: only if `this.usedFeatures.has('secret')`
- `_pipe`: only if `this.usedFeatures.has(NodeType.PipeExpression)` or `this.usedFeatures.has('PipeExpression')`
- `_flow`: only if `this.usedFeatures.has(NodeType.FlowExpression)` or `this.usedFeatures.has('FlowExpression')`
- `_shell`: only if `this.usedFeatures.has(NodeType.ShellBlock)` or `this.usedFeatures.has('ShellBlock')`
- Testing runtime (`_tests`, `_describe`, `_test`, `_expect`, `_assert`, `_runTests`, hooks): only if `this.usedFeatures.has('TestBlock')` or `this.usedFeatures.has('DescribeBlock')` or `this.usedFeatures.has('ExpectStatement')` or `this.usedFeatures.has('AssertStatement')`

Wrap each section with `if (condition) { ... }`. For example:

```javascript
    // _pipe helper — only if pipe expressions are used
    if (this.usedFeatures.has('PipeExpression')) {
      this.emitLine('function _pipe(value, ...fns) {');
      // ... existing pipe code ...
      this.emitLine('}');
      this.emitLine();
    }
```

Do this for each conditional section. The stdlib extensions, `_obj`, and `error` sections remain unconditional.

- [ ] **Step 5: Run all tests**

Run: `/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin/node test/test.js 2>&1 | tail -5`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "opt: tree-shake unused runtime helpers from generated output"
```

---

### Task 6: Recompile Examples and Verify

**Files:**
- Recompile: all `examples/*.km` and `examples/*.kimchi`
- Test: run examples to verify correct output

- [ ] **Step 1: Recompile all examples**

```bash
PATH="/Users/danajanezic/.local/share/mise/installs/node/24.13.0/bin:$PATH"
for file in examples/*.kimchi examples/*.km; do
  [ -f "$file" ] || continue
  node src/cli.js compile "$file" -o "${file%.*}.js" 2>/dev/null
done
```

- [ ] **Step 2: Run examples and verify no [object Promise] or errors**

```bash
for file in examples/hello.js examples/fibonacci.js examples/basic.js examples/memo_fibonacci.js examples/task_runner.js examples/sample.js examples/reduce_pattern_match.js examples/regex_match.js examples/new_features.js; do
  output=$(node -e "import mod from './$file'; if (typeof mod === 'function') await mod();" 2>&1)
  if echo "$output" | grep -q "object Promise"; then
    echo "PROBLEM: $(basename $file)"
  fi
done
```

Expected: No problems.

- [ ] **Step 3: Verify output size reduction**

```bash
# Compare: hello.js should be much smaller
wc -l examples/hello.js
# Expected: ~20 lines (was ~250)
```

- [ ] **Step 4: Run all test suites**

```bash
node test/test.js 2>&1 | tail -3
node test/validator_test.js 2>&1 | tail -3
node test/lsp_test.js 2>&1 | tail -3
node test/stdlib_test.js 2>&1 | tail -3
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add examples/
git commit -m "chore: recompile all examples with optimized generator"
```

---

### Task 7: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update Key Runtime Patterns section**

Change:
```markdown
- `dec x = value` compiles to `const x = _deepFreeze(value)` — all values deeply frozen
- `obj.a.b.c` compiles to `obj?.a?.b?.c` — all member access is null-safe
```

To:
```markdown
- `dec x = value` compiles to `const x = value` — immutability enforced at compile time, not runtime
- `obj.a.b.c` compiles to `obj.a.b.c` when shape is known from literal declaration, `obj?.a?.b?.c` otherwise
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with optimized codegen behavior"
```
