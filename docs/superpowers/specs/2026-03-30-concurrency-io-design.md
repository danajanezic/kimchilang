# Concurrency (I/O) Design

## Overview

Three concurrency primitives for concurrent I/O execution, plus a general-purpose bind syntax for deferred function application. All primitives implicitly await and must appear inside `async fn` (enforced at compile time).

## Syntax

### Concurrency expressions

```
collect [callable1, callable2]    // concurrent I/O, fail fast
hoard [callable1, callable2]      // concurrent I/O, get all results even failures
race [callable1, callable2]       // concurrent I/O, first to finish wins
```

Array elements must be **identifiers** (bare function references) or **bind expressions** — never direct calls.

### Bind expression (new syntax)

```
someFunc.(arg1, arg2)
```

Creates a deferred call — bundles a function with its arguments without invoking it. General-purpose syntax, not limited to concurrency.

### Usage examples

```
// Bare references (no args)
dec [users, posts] = collect [fetchUsers, fetchPosts]

// Bound with args
dec [user1, user2] = collect [fetchUser.(1), fetchUser.(2)]

// Mixed
dec [all, one] = collect [fetchUsers, fetchUser.(1)]

// Hoard — get everything even if some fail
dec results = hoard [api1.(url1), api2.(url2)]

// Race — first to resolve wins
dec winner = race [fast.(url1), fast.(url2)]
```

## Semantics

| Keyword   | Compiles to              | Returns                                              |
|-----------|--------------------------|------------------------------------------------------|
| `collect` | `await Promise.all(...)` | Array of resolved values. Rejects on first failure.  |
| `hoard`   | `await Promise.allSettled(...)` with mapping | Array of `{ status, value/error }` objects. |
| `race`    | `await Promise.race(...)` | Single value from the first settled promise.         |

All three implicitly `await` — no `await` keyword needed in KimchiLang source.

## Compilation

### collect

```
// KimchiLang
dec [users, posts] = collect [fetchUsers, fetchPosts]
dec [a, b] = collect [fetchUser.(1), fetchUser.(2)]

// JavaScript
const [users, posts] = await Promise.all([fetchUsers(), fetchPosts()]);
const [a, b] = await Promise.all([fetchUser(1), fetchUser(2)]);
```

### hoard

```
// KimchiLang
dec results = hoard [api1, api2]

// JavaScript
const results = await Promise.allSettled([api1(), api2()]).then(r => r.map(x =>
  x.status === "fulfilled"
    ? { status: STATUS.OK, value: x.value }
    : { status: STATUS.REJECTED, error: x.reason }
));
```

### race

```
// KimchiLang
dec winner = race [fast.(url1), fast.(url2)]

// JavaScript
const winner = await Promise.race([fast(url1), fast(url2)]);
```

### Bind expression

```
// KimchiLang
someFunc.(arg1, arg2)

// JavaScript (standalone context)
() => someFunc(arg1, arg2)

// JavaScript (inside collect/hoard/race — inlined as direct call)
someFunc(arg1, arg2)
```

Inside concurrency expressions, bind expressions are optimized: instead of wrapping in an arrow function and then calling it, the generator directly emits the call. The arrow-wrapper form is used only when bind expressions appear outside concurrency contexts.

## Constraints

- `collect`, `hoard`, and `race` must appear inside an `async fn`. The type checker emits a compile-time error otherwise.
- Array elements must be identifiers or bind expressions. A direct function call like `fetchUser(1)` inside the array is a parse error — use `fetchUser.(1)` instead.

## STATUS enum

A built-in enum auto-emitted in generated JavaScript when `hoard` is used (tree-shaken like `_pipe`, `_flow`):

```js
const STATUS = Object.freeze({ OK: "OK", REJECTED: "REJECTED" });
```

Two variants:
- `STATUS.OK` — the callable resolved successfully. Result object has `value` field.
- `STATUS.REJECTED` — the callable rejected/threw. Result object has `error` field.

Works with match:

```
dec results = hoard [fetchUser.(1), fetchUser.(2)]

match results[0] {
  { status: is STATUS.OK } => print results[0].value
  { status: is STATUS.REJECTED } => print "failed: ${results[0].error}"
}
```

## AST

### ConcurrentExpression

```
{
  type: "ConcurrentExpression",
  mode: "collect" | "hoard" | "race",
  elements: [Expression]    // each is Identifier or BindExpression
}
```

### BindExpression

```
{
  type: "BindExpression",
  callee: Expression,
  arguments: [Expression]
}
```

## Compiler pipeline changes

### Lexer

Add three keywords: `collect`, `hoard`, `race`. Add corresponding token types.

### Parser

- Parse `collect`/`hoard`/`race` followed by `[` as `ConcurrentExpression`. Elements are parsed as expressions but validated to be identifiers or bind expressions.
- Parse `.()` after any expression as `BindExpression` — triggered when a `.` is followed by `(`.

### Type checker

- Validate that `ConcurrentExpression` nodes appear only inside `async fn` scope. Emit error: "collect/hoard/race must be inside an async function".
- Infer return type: `collect` and `hoard` return arrays, `race` returns the element type.

### Generator

- `ConcurrentExpression`: emit `await Promise.all/allSettled/race([...])` with each element invoked (bare identifiers get `()` appended, bind expressions get inlined as direct calls).
- `hoard` mode: wrap in `.then(...)` mapping to STATUS shape.
- `BindExpression` (outside concurrency): emit `() => callee(args)`.
- Tree-shake: emit `STATUS` const only when `hoard` is used (add to `scanUsedFeatures`).

### Linter

No new rules needed.
