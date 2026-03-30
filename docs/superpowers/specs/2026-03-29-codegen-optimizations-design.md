# Code Generation Optimizations — Design Spec

Four optimizations to the KimchiLang generator that produce cleaner, faster JavaScript output.

## Optimization 1: Remove `_deepFreeze` — Freeze Only at JS Boundary

### Current

`dec x = { a: 1 }` compiles to `const x = _deepFreeze({ a: 1 });`

The `_deepFreeze` function walks the entire object graph at runtime calling `Object.freeze`. This is O(n) per declaration and redundant — the compiler already enforces immutability at compile time via the parser's `checkDecImmutability`.

### New

`dec x = { a: 1 }` compiles to `const x = { a: 1 };`

Plain `const`. No runtime freeze. Immutability is enforced at compile time.

When a `dec` variable is passed to a `js()` block, freeze at the call site:

```javascript
// js(config) { ... }  compiles to:
((config) => {
  ...
})(Object.freeze(config));
```

- `_deepFreeze` function removed from runtime entirely
- `dec` emits plain `const`
- `mut` emits `let` as before
- Only `dec` variables passed to `js()` blocks get `Object.freeze` at the call site
- `mut` variables passed to `js()` blocks are NOT frozen
- `js { }` blocks without parameters — no freeze needed

---

## Optimization 2: Skip Optional Chaining When Object is Known Non-null

### Current

Every `.` access compiles to `?.`:

```javascript
person?.name           // unnecessary — person was just declared as a literal
person?.address?.city  // unnecessary if we know the full shape
```

### New

The generator tracks a property tree of known object shapes from literal declarations. When accessing a property path that exists in the known tree, emit `.` instead of `?.`.

**What populates the known-shape tree:**
- `dec x = { ... }` / `dec x = [...]` / `dec x = "str"` / `dec x = 42` — full literal shape
- `guard x != null else { return/throw }` — `x` is non-null past the guard
- `mut x = <literal>` — tracked until reassignment

**Property tree example:**

```kimchi
dec person = { name: "Alice", address: { city: "NYC" } }
```

Known tree: `person.name` = leaf, `person.address` = object, `person.address.city` = leaf.

```javascript
person.name             // known → .
person.address.city     // known → . .
person.email            // NOT in tree → ?.
```

**Invalidation:**
- `mut` reassignment → remove from tree
- Spread operators — track explicit keys only, not spread source
- Function return values — unknown shape (use `?.`)
- Function parameters — unknown (use `?.`)

---

## Optimization 3: Flatten Match Expression IIFEs

### Current

Every `match` expression compiles to an IIFE:

```javascript
const msg = (() => {
  const _subject = status;
  if (_subject === 200) { return "OK"; }
  else { return "Unknown"; }
})();
```

### New

When `match` is used as a **statement** (standalone `ExpressionStatement`, not assigned to a variable or returned), flatten to plain `if`/`else`:

```javascript
// Statement context — flat
const _subject = status;
if (_subject === 200) {
  console.log("OK");
} else {
  console.log("Unknown");
}
```

When `match` is used as an **expression** (in `dec`, `return`, assignment, argument), keep the IIFE — it's needed to produce a value.

**Implementation:** `visitStatement` detects `ExpressionStatement` containing `MatchBlock` and calls a `visitMatchBlockStatement` method that emits flat code. The expression path keeps the IIFE.

---

## Optimization 4: Don't Emit Unused Runtime Helpers

### Current

Every compiled file includes the full runtime (~200 lines): `_pipe`, `_flow`, `_shell`, `_deepFreeze`, testing framework, `_Secret`, `_obj`, stdlib extensions — even for `print "hello"`.

### New

The generator scans the AST before emitting. Only emit helpers that are actually referenced:

| Helper | Emit when AST contains |
|--------|----------------------|
| `_pipe` | `PipeExpression` |
| `_flow` | `FlowExpression` |
| `_shell` | `ShellBlock` |
| `_obj` | `ObjectExpression` with computed keys |
| `_secret` / `_Secret` | `secret` modifier on any declaration |
| Testing runtime (`_expect`, `_test`, `_describe`, `_runTests`, `_assert`, hooks) | `TestBlock`, `DescribeBlock`, `ExpectStatement`, `AssertStatement`, hook blocks |
| Stdlib prototype extensions | Always emitted |

**Implementation:** Walk AST once before code generation, collecting a `Set<string>` of present node types. Each runtime section is conditionally emitted based on this set.

**Impact:** `print "hello"` goes from ~250 lines to ~20 lines.

---

## What Does NOT Change

- All KimchiLang source code works identically — these are output optimizations only
- Type checker, parser, linter, validator, LSP — all unchanged
- `mut` behavior — unchanged
- `js { }` blocks — unchanged except for the freeze-at-boundary behavior
- Stdlib modules — unchanged (they use `js { }` which triggers boundary freeze)
