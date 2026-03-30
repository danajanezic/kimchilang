# KMDocs — Type Annotations for KimchiLang

JSDoc-style documentation comments with type annotations. The type checker uses KMDoc types first, then falls back to inference for unannotated code. Gradual typing — fully opt-in, zero breakage for existing code.

## Syntax

### Function documentation

```kimchi
/**
 * Adds two numbers together.
 * @param {number} a - The first number
 * @param {number} b - The second number
 * @returns {number} The sum
 */
fn add(a, b) { return a + b }
```

### Variable typing

```kimchi
/** @type {string[]} */
dec names = ["Alice", "Bob"]

/** @type {{host: string, port: number}} */
dec config = { host: "localhost", port: 3000 }
```

### Partial annotation

Annotate some params and not others. Type checker uses KMDoc where present, infers the rest:

```kimchi
/**
 * @param {string} name
 */
fn greet(name, excited) {
  // name is string (KMDoc), excited is inferred
}
```

## Supported Tags

- `@param {type} name` — parameter type. Optional `- description` after name.
- `@returns {type}` — return type. Optional description after.
- `@type {type}` — type of a `dec`/`mut` variable. Placed before the declaration.

## Type Expressions

| Syntax | Meaning |
|--------|---------|
| `number`, `string`, `boolean`, `null`, `void`, `any` | Primitives |
| `number[]`, `User[]` | Array of type |
| `{name: string, age: number}` | Object shape |
| `(number, string) => boolean` | Function type |
| `User`, `NotFoundError`, `HttpResponse` | Custom types — resolved by name against declarations in scope |

## Compiler Pipeline

### Lexer

When the lexer encounters `/**`, it reads until `*/` and produces a `DOC_COMMENT` token (not filtered out). Regular `/* */` comments (single star) remain filtered. `//` comments unchanged.

### Parser

When `parseStatement()` encounters a `DOC_COMMENT` token before a `fn`/`dec`/`mut`/`expose` declaration, it parses the doc text and attaches a `kmdoc` property to the AST node:

```javascript
// For functions:
node.kmdoc = {
  description: "Adds two numbers together.",
  params: [
    { name: "a", type: "number", description: "The first number" },
    { name: "b", type: "number", description: "The second number" },
  ],
  returns: { type: "number", description: "The sum" },
}

// For variables:
node.kmdoc = {
  type: "string[]",
}
```

Doc comment parsing is a helper function in the parser. It splits the comment into lines, strips `*` prefixes, and extracts tagged lines via regex. If a `DOC_COMMENT` isn't followed by a declaration, it's ignored.

### Type Checker

**Priority rule:** KMDoc annotations checked first, inference fills the rest.

**For functions:**
1. Register `@param` types in the function scope. Params without `@param` get `Type.Any` (inferred during body analysis).
2. If `@returns` present, validate the inferred return type is compatible. Error if not: `"Function 'add' returns number but KMDoc declares string"`.
3. At call sites, validate arguments against declared param types: `"Argument 1 of 'add' expects number but got string"`.

**For variables:**
1. Check `@type` compatibility with the init expression. Error if mismatch: `"Variable 'x' declared as string[] but initialized with number"`.
2. Store the declared type in scope — used for downstream type checking instead of the inferred type.

**Compatibility:** Same kind, or declared is `any`, or inferred is `unknown`. Object shapes check property existence. Arrays check element type.

### Type String Parser

A `parseTypeString(str)` function in the type checker (~50 lines). Converts KMDoc type strings to internal type format:

| Input | Output |
|-------|--------|
| `"number"` | `{ kind: 'number' }` |
| `"string[]"` | `{ kind: 'array', elementType: { kind: 'string' } }` |
| `"{name: string}"` | `{ kind: 'object', properties: { name: { kind: 'string' } } }` |
| `"(number) => string"` | `{ kind: 'function', params: [{ kind: 'number' }], returnType: { kind: 'string' } }` |
| `"User"` | Looked up in scope via `lookupVariable()`. If found, uses its inferred type. If not found, `{ kind: 'unknown', name: 'User' }` |

### Custom Type Resolution

When `parseTypeString` encounters a non-primitive name, it looks it up in the current scope chain. If the name resolves to a `dec`/`enum` declaration, its inferred type is used. If not found, an `unknown` type with the name attached is created — still usable for structural comparisons.

## What Does NOT Change

- Existing code without KMDocs — pure inference, no regressions
- Generator — untouched, KMDoc types are compile-time only
- Linter — untouched in v1
- LSP — automatically gets richer diagnostics from the type checker
- Runtime behavior — KMDocs are erased at compile time
- Existing `/** */` comments not before declarations — ignored by parser
