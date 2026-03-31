# Union Types Design

## Overview

Union types allow a value to be one of several types, written as `type1 | type2`. They are supported in extern declarations and KMDocs. The type checker enforces one-way compatibility (a member fits into a union, but a union does not fit into a narrower type) and supports automatic narrowing via `guard` statements.

## Syntax

### In extern declarations

```
extern "node:fs" {
  fn readFileSync(path: string, encoding: string | null): string | null
  dec env: {HOME: string | null, PATH: string}
}
```

### In KMDocs

```
/** @param {string | null} name */
/** @returns {number | string} */
/** @type {string | number | boolean} */
```

Union types are not available as inline annotations on `dec`/`fn` — they only appear where type annotations already exist (extern and KMDocs).

## Internal representation

A new `Type.Union` kind is added to the `Type` enum:

```javascript
Union: 'union'
```

Union types are represented as:

```javascript
{ kind: 'union', members: [{ kind: 'string' }, { kind: 'null' }] }
```

### Normalization rules

- **Flattening:** Nested unions are flattened. `(string | null) | number` becomes `{ members: [string, null, number] }`, not a nested union.
- **Deduplication:** Duplicate types are removed. `string | string` becomes just `string` (not a union at all).
- **Single member:** A union with one member after deduplication is unwrapped to the member itself.
- **Any absorption:** If any member is `any`, the entire union collapses to `any`.

## Compatibility rules

The `isCompatible(expected, actual)` method is updated with these rules:

### When expected is a union

A value is compatible with a union if it is compatible with **at least one** member of the union.

```
expected: string | null
actual: string          → compatible (string matches string member)
actual: null            → compatible (null matches null member)
actual: number          → NOT compatible (no member matches)
actual: string | null   → compatible (each member of actual matches a member of expected)
```

### When actual is a union

A union value is compatible with a non-union expected type only if **every** member of the union is compatible with the expected type.

```
expected: string
actual: string | null   → NOT compatible (null doesn't fit string)

expected: any
actual: string | null   → compatible (any accepts everything)
```

### When both are unions

Each member of the actual union must be compatible with at least one member of the expected union.

```
expected: string | number
actual: string | null       → NOT compatible (null has no match in expected)
actual: string              → compatible
actual: string | number     → compatible
```

### Summary table

| Expected | Actual | Compatible? | Reason |
|----------|--------|-------------|--------|
| `string \| null` | `string` | Yes | Member satisfies union |
| `string \| null` | `null` | Yes | Member satisfies union |
| `string \| null` | `number` | No | No member matches |
| `string` | `string \| null` | No | Union doesn't narrow |
| `string \| null` | `string \| null` | Yes | All members match |
| `string \| number` | `string` | Yes | Member satisfies union |
| `any` | `string \| null` | Yes | Any accepts everything |
| `string \| null` | `any` | Yes | Any is compatible with anything |

## Type narrowing via guard

When the type checker encounters a `guard` statement with a null check on an identifier, it narrows the type of that identifier for the remainder of the current scope.

### Supported patterns

```
guard x != null else { return ... }
guard x != null else { throw ... }
```

After this guard, if `x` was typed as `string | null`, it becomes `string` in the current scope.

### Implementation

When visiting a `guard` statement:
1. Check if the condition is `identifier != null` (a `BinaryExpression` with `!=` operator, one side is an `Identifier`, the other is a `Literal` with `null` value).
2. If so, look up the identifier's type. If it's a union containing `null`, create a new type with `null` removed from the members.
3. Re-define the variable in the current scope with the narrowed type.

### Example

```
extern "mod" {
  fn findUser(id: number): {name: string} | null
}

/** @param {number} id */
fn greet(id) {
  dec user = findUser(id)
  // user is {name: string} | null here

  guard user != null else { return "not found" }
  // user is {name: string} here

  return "hello " + user.name
}
```

### Limitations

- Only `guard` narrows types. `if` statements do not narrow (may be added later).
- Only `!= null` checks are recognized. Other patterns (`== null`, type checks via `is`, truthy checks) are not supported in this initial implementation.
- Narrowing only applies to simple identifiers, not member expressions (`obj.prop != null` does not narrow).

## parseTypeString changes

The `|` operator is parsed with the **lowest precedence** in `parseTypeString`. Before any other parsing, the string is split on `|` at the top level (respecting nested braces and parentheses).

```
"string | null"           → split into ["string", "null"] → Union(String, Null)
"string[] | null"         → split into ["string[]", "null"] → Union(String[], Null)
"{name: string} | null"   → split into ["{name: string}", "null"] → Union(Object, Null)
"(string) => void | null" → split into ["(string) => void", "null"] → Union(Function, Null)
```

The splitting respects depth — `|` inside `{}` or `()` is not a union separator. For example, `{a: string | null}` has the pipe inside braces, so it's an object with a union-typed property, not a union of two types.

## typeToString changes

For `Type.Union`:

```javascript
if (type.kind === Type.Union) {
  return type.members.map(m => this.typeToString(m)).join(' | ');
}
```

## Compiler pipeline changes

### Lexer

No changes. The `|` character inside type strings (in extern declarations and KMDocs) is handled by `parseTypeString` and `parseExternType`, not the lexer.

### Parser

The parser's `parseExternType` method already collects type strings as raw text. The `|` character will be included naturally since it's not a delimiter that `parseExternType` stops at. However, `parseExternType` currently treats `BITOR` token (`|`) as a stop character — this needs to be fixed to allow `|` inside extern type annotations.

### Type checker

- Add `Type.Union` to the `Type` enum.
- Update `parseTypeString` to split on `|` at the top level.
- Update `isCompatible` with union-aware logic.
- Update `typeToString` to format unions.
- Add guard narrowing in `visitGuardStatement` (or wherever guard statements are visited).
- Add a `narrowType(type, excludeKind)` helper that removes a member from a union.

### Generator

No changes. Union types are purely a type-checker concept — they don't affect the generated JavaScript.

### Linter

No changes.
