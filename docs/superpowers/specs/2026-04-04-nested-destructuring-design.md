# Nested Destructuring Design

## Overview

Make destructuring patterns recursive with defaults at any level. Today `dec { a, b } = obj` and `dec [x, y] = arr` work, but nesting (`{ user: { name } }`) and defaults (`{ role = "viewer" }`) don't. After this change, arbitrary-depth mixed patterns with defaults work everywhere destructuring appears.

## Design Decisions

- **Arbitrary depth** — `parseObjectPattern()` and `parseArrayPattern()` call each other recursively. No artificial depth limit.
- **Defaults at any level** — `{ name = "anon", address: { city = "unknown" } }` via `= expr` after any binding position.
- **Works everywhere** — `dec`, `mut`, function parameters, match patterns.
- **Near-1:1 JS compilation** — JS destructuring is already fully recursive with defaults. The generator emits the parsed pattern structure directly.

## Syntax

### Object patterns

```
// Flat (already works)
dec { a, b } = obj

// Nested object
dec { user: { name, age } } = response

// Nested array inside object
dec { scores: [first, second] } = data

// Defaults
dec { role = "viewer" } = user
dec { address: { city = "unknown" } } = user

// Mixed
dec { user: { name, role = "viewer" }, tags: [first] } = response
```

### Array patterns

```
// Flat (already works)
dec [a, b] = arr

// Nested array
dec [first, [nested1, nested2]] = matrix

// Nested object inside array
dec [{ name }, { name: name2 }] = users

// Defaults
dec [a = 0, b = 0] = arr
dec [first, [x = 1, y = 2]] = matrix

// Holes with nesting
dec [, { name }] = arr
```

### Function parameters

```
fn processUser({ name, address: { city, zip = "00000" } }) {
  print "${name} lives in ${city}"
}

fn first([head]) {
  return head
}
```

### Match patterns

```
match response {
  { status: 200, body: { data } } => handleData(data)
  { status: 404, body: { message = "Not found" } } => print message
  _ => handleError()
}
```

## Compilation

KimchiLang destructuring compiles 1:1 to JS destructuring:

```
// KimchiLang
dec { user: { name, role = "viewer" }, tags: [first] } = response

// JavaScript
const { user: { name, role = "viewer" }, tags: [first] } = response;
```

```
// KimchiLang
fn greet({ name, address: { city = "unknown" } }) {
  print "${name} from ${city}"
}

// JavaScript
function greet({ name, address: { city = "unknown" } }) {
  console.log(`${name} from ${city}`);
}
```

Match patterns compile to nested property access checks, following the existing match compilation strategy.

## Parser Changes

### `parseObjectPattern()` (~line 580)

Currently each property value must be an `IDENTIFIER`. Change to:

After parsing `key:`, check the next token:
- `{` → recurse into `parseObjectPattern()` (nested object)
- `[` → recurse into `parseArrayPattern()` (nested array)
- `IDENTIFIER` → simple binding (existing behavior)

After any binding position (identifier or nested pattern), check for `= expr` to parse a default value.

Property structure becomes:
```javascript
{
  key: string,              // the property name
  value: string | Pattern,  // identifier name OR nested pattern
  defaultValue: Node | null // default expression if present
}
```

### `parseArrayPattern()` (~line 610)

Currently each element must be an `IDENTIFIER`. Change to:

For each element, check the next token:
- `{` → recurse into `parseObjectPattern()`
- `[` → recurse into `parseArrayPattern()`
- `IDENTIFIER` → simple binding (existing behavior)
- `,` or `]` with no token → hole (null element, existing behavior)

After any binding position, check for `= expr` to parse a default value.

Element structure becomes:
```javascript
{
  type: 'Identifier',
  name: string,
  defaultValue: Node | null
}
// OR
{
  type: 'ObjectPattern' | 'ArrayPattern',
  ...pattern,
  defaultValue: Node | null
}
// OR
null  // hole
```

### Function parameter destructuring (~line 768)

Already calls `parseObjectPattern()` / `parseArrayPattern()`. Once those are recursive, function params get nesting for free. Default handling at the pattern level is separate from function parameter defaults.

### Match pattern destructuring

Match patterns use their own destructuring parsing. These need the same recursive treatment — nested `{` and `[` patterns inside match object/array patterns.

## Generator Changes

### `visitDecDeclaration()` / `visitMutDeclaration()`

Add a recursive `generatePattern(pattern)` helper that:
- For `ObjectPattern`: emits `{ key: generatePattern(value), ... }` with `= defaultExpr` when present
- For `ArrayPattern`: emits `[generatePattern(elem), ...]` with `= defaultExpr` when present
- For `Identifier`: emits the name

Replace the current flat property/element mapping with calls to `generatePattern()`.

### Function parameter generation

Already calls into pattern generation. Once the pattern generator is recursive, params get nesting for free.

### Match pattern generation

Match pattern compilation builds property access checks. Nested patterns need recursive check generation — `{ user: { name } }` checks `subject.user` exists, then checks `subject.user.name` exists and binds it.

## Type Checker Changes

### Declaration type checking

Walk nested patterns recursively. For each level, extract the property/element type from the parent type and use it for the nested pattern. Defaults are type-checked as expressions.

### Function parameter type checking

Nested destructured params get `Type.Any` at each level (consistent with current flat behavior).

### Match pattern type checking

Nested patterns in match arms need recursive shape validation.

## Linter Changes

None expected — the linter doesn't have destructuring-specific rules today.

## Not Included

- Rest elements in patterns (`{ a, ...rest }`, `[first, ...rest]`) — separate feature, can be added later
- Computed property keys (`{ [expr]: value }`) — not needed
- Destructured reassignment (`{ a, b } = newObj` as a statement on existing `mut` vars) — separate feature
