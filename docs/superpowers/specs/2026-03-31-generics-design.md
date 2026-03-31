# Generics Design

## Overview

Generics add parameterized types to KimchiLang: type aliases with parameters (`type Result<T> = ...`) and generic functions (`fn map<T, U>(...)`). Type parameters are inferred from call-site arguments — no explicit type args at call sites. Supported in `type` declarations, extern declarations, and KMDocs. No constraints on type parameters. Generics are purely a type-checker feature — no effect on generated JavaScript.

## Type aliases

### Syntax

```
type Result<T> = {ok: boolean, value: T}
type Pair<A, B> = {first: A, second: B}
type Optional<T> = T | null
type StringMap<V> = {[key: string]: V}
```

Top-level declarations using the `type` keyword. The name, type parameters in angle brackets, `=`, and the type body.

### Semantics

- Type aliases are registered in the type checker's scope.
- When used (e.g., `Result<string>`), the type parameters are substituted in the body.
- Type aliases are structural — `Result<string>` is equivalent to `{ok: boolean, value: string}`.
- Aliases can reference other aliases: `type SafeResult<T> = Result<T> | null`
- Type aliases produce no runtime code.

### Usage

```
type Result<T> = {ok: boolean, value: T}

extern "pg" {
  fn query<T>(sql: string): Result<T>
}

/** @type {Result<User>} */
dec result = query("SELECT * FROM users")
```

In KMDocs:
```
/** @param {Result<string>} res */
/** @returns {Optional<number>} */
```

## Generic functions

### In extern declarations

```
extern "mod" {
  fn map<T, U>(arr: T[], f: (T) => U): U[]
  fn filter<T>(arr: T[], f: (T) => boolean): T[]
  fn find<T>(arr: T[], f: (T) => boolean): T | null
  fn identity<T>(value: T): T
}
```

Type parameters appear in angle brackets after the function name, before the parameter list.

### In KMDocs

```
/** @param {T[]} items */
/** @returns {T | null} */
fn first(items) {
  guard items.length > 0 else { return null }
  return items[0]
}
```

KMDocs can use type parameters implicitly — any single uppercase letter or PascalCase name not matching a known type is treated as a type parameter in the function's scope.

## Inference

Type parameters are inferred from call-site arguments. There is no explicit `<T>` syntax at call sites.

### How inference works

When calling a generic function, the type checker:

1. Examines each argument's actual type.
2. Matches it against the parameter's declared type.
3. Where the declared type contains a type parameter, binds that parameter to the actual type.
4. Uses the bindings to compute the return type.

### Examples

```
extern "mod" {
  fn identity<T>(value: T): T
  fn map<T, U>(arr: T[], f: (T) => U): U[]
}

dec x = identity("hello")    // T inferred as string → returns string
dec y = identity(42)          // T inferred as number → returns number

dec nums = [1, 2, 3]
dec strs = map(nums, (n) => toString(n))
// T inferred as number (from nums: number[])
// U inferred as string (from callback return)
// Result: string[]
```

### When inference isn't possible

For return-type-only generics where `T` doesn't appear in the arguments, inference can't determine `T`. The user annotates the receiving variable:

```
extern "pg" {
  fn query<T>(sql: string): Result<T>
}

/** @type {Result<User>} */
dec result = query("SELECT * FROM users")
```

Without the annotation, `T` defaults to `any`.

## Internal representation

### Type parameter

```javascript
{ kind: 'typeParam', name: 'T' }
```

A placeholder type that gets substituted during instantiation.

### Type alias registration

Type aliases are stored in a new `this.typeAliases` map in the type checker:

```javascript
// type Result<T> = {ok: boolean, value: T}
this.typeAliases.set('Result', {
  params: ['T'],
  body: { kind: 'object', properties: {
    ok: { kind: 'boolean' },
    value: { kind: 'typeParam', name: 'T' }
  }}
});
```

### Generic function registration

Generic functions store their type parameters alongside the existing function info:

```javascript
this.functions.set('map', {
  typeParams: ['T', 'U'],
  params: [
    { name: 'arr', type: { kind: 'array', elementType: { kind: 'typeParam', name: 'T' } } },
    { name: 'f', type: { kind: 'function', params: [{ kind: 'typeParam', name: 'T' }], returnType: { kind: 'typeParam', name: 'U' } } }
  ],
  returnType: { kind: 'array', elementType: { kind: 'typeParam', name: 'U' } },
});
```

### Instantiation (substitution)

`substituteTypeParams(type, bindings)` recursively walks a type and replaces `typeParam` nodes with their bound types:

```javascript
// bindings = { T: { kind: 'string' }, U: { kind: 'number' } }
// substituteTypeParams({ kind: 'typeParam', name: 'T' }, bindings) → { kind: 'string' }
// substituteTypeParams({ kind: 'array', elementType: { kind: 'typeParam', name: 'T' } }, bindings) → { kind: 'array', elementType: { kind: 'string' } }
```

### Inference algorithm

`inferTypeParams(declaredParams, actualArgs, typeParams)`:

1. Create empty bindings map.
2. For each parameter, unify the declared type with the actual argument type.
3. When a `typeParam` is encountered in the declared type, bind it to the corresponding actual type.
4. Handle nested types: `T[]` matched against `number[]` binds `T = number`.
5. Return the bindings map.

## parseTypeString changes

### Angle bracket syntax

`parseTypeString` is extended to recognize angle brackets:

- `Result<string>` → look up `Result` in type aliases, substitute `T = string`
- `Result<string, number>` → substitute `T = string, U = number`
- `T` (single name not matching a known type) → in a generic context, returns `{ kind: 'typeParam', name: 'T' }`

### Parsing order

After the existing union `|` splitting, add angle-bracket detection:

1. Split on `|` → union handling (existing)
2. Check for `Name<...>` pattern → generic instantiation
3. Primitives, arrays, objects, functions (existing)
4. Unknown name → type param if in generic context, otherwise unknown

### Depth-aware angle bracket parsing

`<` and `>` can also mean less-than/greater-than. In type strings (from extern and KMDocs), they always mean type parameters since comparison operators don't appear in type annotations.

## Compiler pipeline changes

### Lexer

No changes. `<` and `>` are already `LT`/`GT` tokens.

### Parser

- New `type` declaration: `type NAME LT params GT ASSIGN type_body`. Parsed in `parseStatement` when `TYPE` token is encountered. Requires adding `TYPE` keyword token to the lexer (`type` → `TokenType.TYPE`).
- Generic params in extern `fn`: after the function name, check for `LT`. If present, parse comma-separated type param names until `GT`.
- `parseExternType` already handles `<` and `>` — they're `LT`/`GT` tokens that get collected into the type string. No changes needed for type string collection.

### Type checker

- New `this.typeAliases` map for registered type aliases.
- `Type.TypeParam` added to the Type enum.
- `parseTypeString` extended for `Name<args>` and bare type param names.
- `substituteTypeParams(type, bindings)` helper for instantiation.
- `inferTypeParams(declaredParams, actualArgs, typeParams)` helper for call-site inference.
- `visitCallExpression` updated to infer type params and compute return types for generic functions.
- `visitStatement` handles `TypeDeclaration` nodes to register aliases.

### Generator

No changes. Generics are purely a type-checker concept.

### AST node

```
{
  type: "TypeDeclaration",
  name: "Result",
  typeParams: ["T"],
  body: "{ ok: boolean, value: T }"  // raw type string, parsed by type checker
}
```

## Constraints

- Type parameters are unconstrained — effectively `any` until instantiated.
- No explicit type args at call sites.
- `type` declarations must be top-level.
- Type alias names must be unique — duplicate names are a compile error.
- Recursive type aliases are not supported in this initial implementation.
