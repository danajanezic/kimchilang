# `is` Operator Redesign: Duck Typing

## Problem

The `is` operator currently compiles to `x?._id === y?._id`, comparing a magic `_id` property that nothing in the language ever sets. It is effectively dead code — no `.km` file uses `_id`, and the only example usage (`e is NotFoundError` in `readme_examples.km`) doesn't work at runtime.

Meanwhile, KimchiLang now has `type` declarations with full object shapes, and the type checker already resolves them. The `is` operator should use this information to perform structural (duck typing) checks instead.

## Design

The `is` operator resolves the right-hand type name through three tiers, checked in order:

### Tier 1: Built-in `Type` Enum (Primitives)

A compiler-built-in `Type` enum provides namespaced primitive checks. It is always in scope and never emitted as runtime code.

```kimchi
x is Type.String     // → typeof x === 'string'
x is Type.Number     // → typeof x === 'number'
x is Type.Boolean    // → typeof x === 'boolean'
x is Type.Null       // → x === null
x is Type.Array      // → Array.isArray(x)
x is Type.Object     // → typeof x === 'object' && x !== null && !Array.isArray(x)
x is Type.Function   // → typeof x === 'function'
```

`is not` produces the negated form of each check.

### Tier 2: User-Defined `type` Aliases (Duck Typing)

When the right-hand side is a `type` alias with an object shape, emit key-existence checks for all top-level properties.

```kimchi
type HttpResponse = {status: number, body: any, ok: boolean}

x is HttpResponse
// → typeof x === 'object' && x !== null && 'status' in x && 'body' in x && 'ok' in x
```

Only top-level keys are checked. Nested shapes and value types are not validated at runtime — the type checker handles those at compile time.

### Tier 3: Unknown Name (`instanceof` Fallback)

When the name is not a primitive and not a known `type` alias, emit `instanceof`. This covers JavaScript built-in error types and any constructor-based types from extern modules.

```kimchi
e is TypeError           // → e instanceof TypeError
e is NotFoundError       // → e instanceof NotFoundError
```

### Resolution Order

For a given `is` expression `x is Foo`:

1. If `Foo` is `Type.<member>` → Tier 1 (primitive check)
2. If `Foo` is in `typeAliases` and resolves to an object shape → Tier 2 (duck typing)
3. Otherwise → Tier 3 (`instanceof`)

## Contexts

The `is` operator works in three syntactic positions. All three follow the same resolution logic.

### Binary Expression

```kimchi
if x is HttpResponse { ... }
if e is not TypeError { ... }
```

### Match Pattern

```kimchi
match val {
  is Type.String => "string"
  is HttpResponse => handleResponse(val)
  is TypeError => handleError(val)
  _ => "unknown"
}
```

### Catch Pattern

```kimchi
try {
  fetchUser(id)
} catch(e) {
  |e is NotFoundError| => { print "not found" }
  |e is ValidationError| => { print "invalid" }
  |true| => { throw e }
}
```

## Architecture

### Type Checker (Resolution)

The type checker resolves `is` type names and annotates the AST node with resolution metadata. This happens in two places:

**Binary expressions** (`x is Foo`): When visiting a `BinaryExpression` with operator `is` or `is not`, resolve the right-hand identifier:
- If it's a `MemberExpression` on `Type` → annotate with `{ isKind: 'primitive', primitive: 'string' }`
- If it's in `typeAliases` with object shape → annotate with `{ isKind: 'shape', keys: ['status', 'body', 'ok'] }`
- Otherwise → annotate with `{ isKind: 'instanceof' }`

**Match `IsPattern` nodes** (`is Foo`): Same resolution, annotate the `IsPattern` node.

### Generator (Emission)

The generator reads the annotation and emits the appropriate JavaScript:

- `primitive` → `typeof` check (or `Array.isArray`, or `=== null`)
- `shape` → `typeof x === 'object' && x !== null && 'key1' in x && 'key2' in x`
- `instanceof` → `x instanceof Foo`

### Built-in `Type` Enum

The `Type` enum is registered in the type checker's constructor as a known identifier. It is not a real enum declaration — the compiler recognizes `Type.String`, `Type.Number`, etc. as special forms. No runtime code is emitted for it.

## Edge Cases

- **`is` with non-object type alias**: If a `type` alias resolves to a primitive, union, or function type (not an object shape), fall back to Tier 3 (`instanceof`). Only object shapes support duck typing.
- **Empty object type**: `type Empty = {}` → `typeof x === 'object' && x !== null` (no key checks).
- **Generic type aliases**: `type Result<T> = {ok: boolean, value: T}` → check keys `ok` and `value`. Type parameters don't affect runtime key checks.
- **`is not`**: Negate the entire expression. For shapes: `!(typeof x === 'object' && x !== null && ...)`.

## What Changes

| File | Change |
|------|--------|
| `src/typechecker.js` | Register built-in `Type` identifier. Resolve `is`/`is not` right-hand side and annotate AST nodes with `isKind` + metadata. Resolve `IsPattern` nodes in match. |
| `src/generator.js` | Read `isKind` annotation and emit `typeof`, key-in checks, or `instanceof` instead of `_id` comparison. |
| `test/test.js` | Add tests for all three tiers, all three contexts, `is not`, and edge cases. |
| `examples/readme_examples.km` | Update `e is NotFoundError` example (now works via instanceof). |

No changes needed to the lexer. The parser needs a small update: `IsPattern` in match currently only accepts a single identifier (`typeName`). It must also accept `Type.Member` (a dotted name) so that `is Type.String` works in match patterns. The binary expression path already handles member expressions on the right-hand side, so only match pattern parsing needs this fix.

| `src/parser.js` | Update `IsPattern` parsing to accept dotted names (`Type.String`) in addition to plain identifiers. |
