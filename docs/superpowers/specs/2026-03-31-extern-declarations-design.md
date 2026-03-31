# Extern Declarations Design

## Overview

Extern declarations provide typed contracts for JavaScript modules. They tell the compiler that external symbols exist with specific type signatures, generating tree-shaken `import` statements in the output. Extern blocks produce zero runtime code — they exist only for the type checker and import generation.

This is the first step toward removing `js { }` interop. Extern handles function calls and value access. `Foo.new()` constructor syntax (separate feature) will handle the remaining `new` use cases.

## Syntax

### Named exports

```
extern "node:fs" {
  fn readFileSync(path: string): string
  fn writeFileSync(path: string, data: string): void
  fn existsSync(path: string): boolean
}

extern "node:process" {
  dec env: any
  dec argv: string[]
  dec pid: number
}
```

Declares named exports from a JS module. Each `fn` declares a function with parameter types and return type. Each `dec` declares a value with its type.

### Default exports

```
extern default "express" as express: any
extern default "pg" as pg: any
```

Declares the default export of a JS module, binding it to a local name with a type.

## Type annotations

Reuse existing KMDocs type syntax inline:

- Primitives: `string`, `number`, `boolean`, `null`, `void`, `any`
- Arrays: `number[]`, `string[]`, `any[]`
- Objects: `{key: type, key: type}`
- Functions: `(string, number) => boolean`

The type checker validates call sites against declared signatures. For example, calling `readFileSync(123)` when the param is declared `string` produces a type error.

Since union types and generics are not yet implemented, use `any` for complex types that can't be expressed yet. As those features are added, extern declarations can be updated with richer types.

## Compilation

### Tree-shaken imports

Extern blocks produce zero runtime code. The generator collects all extern symbols that are actually used in the file and emits static `import` statements for them only.

```
// KimchiLang
extern "node:fs" {
  fn readFileSync(path: string): string
  fn writeFileSync(path: string, data: string): void
}

dec content = readFileSync("file.txt")
// writeFileSync is declared but not used

// JavaScript — only readFileSync imported
import { readFileSync } from 'node:fs';
// ... module wrapper ...
const content = readFileSync("file.txt");
```

### Default export compilation

```
// KimchiLang
extern default "express" as express: any
dec app = express()

// JavaScript
import express from 'express';
// ... module wrapper ...
const app = express();
```

### Import placement

Extern imports are emitted at the top of the generated file, before the runtime import and module wrapper. This matches standard JS module conventions and ensures extern symbols are available throughout the module.

```js
import { readFileSync } from 'node:fs';       // extern imports first
import express from 'express';                  // default extern imports
import { _obj, error } from './kimchi-runtime.js';  // runtime import

export default async function(_opts = {}) {
  // ... module code using readFileSync, express ...
}
```

## AST nodes

### ExternDeclaration

```
{
  type: "ExternDeclaration",
  source: "node:fs",
  isDefault: false,
  declarations: [
    {
      kind: "function",
      name: "readFileSync",
      params: [{ name: "path", typeAnnotation: "string" }],
      returnType: "string"
    },
    {
      kind: "value",
      name: "env",
      valueType: "any"
    }
  ]
}
```

### ExternDefaultDeclaration

```
{
  type: "ExternDefaultDeclaration",
  source: "express",
  alias: "express",
  aliasType: "any"
}
```

Using separate node types for named and default keeps the parser and generator simpler than overloading a single node type with conditional fields.

## Constraints

- Extern declarations must be at the **top level** of a file. Using `extern` inside a function, block, or other scope is a parse error.
- Extern symbols are **immutable** — they behave like `dec`. Attempting to reassign an extern symbol is a type error.
- **Duplicate symbol names** are a compile error — declaring the same name in two extern blocks, or an extern name that shadows a local `dec`/`fn`, is rejected by the type checker.
- The **module path string** is passed through verbatim to the JS `import` statement. `"node:fs"`, `"pg"`, `"./local.js"`, `"@scope/pkg"` all work.
- Extern functions are called like normal KimchiLang functions — no special call syntax.
- Extern values are accessed like normal KimchiLang variables — `process.env.HOME` just works via member access.

## Compiler pipeline changes

### Lexer

Add one keyword token: `EXTERN: 'EXTERN'` with `'extern': TokenType.EXTERN`.

The `default` keyword is not a new token — it will be recognized as an identifier and checked by the parser.

### Parser

Parse two forms in `parseStatement()` when `EXTERN` token is encountered:

1. **Named:** `extern STRING_LITERAL LBRACE (fn_decl | dec_decl)* RBRACE`
   - `fn` declarations: `fn NAME LPAREN param_list RPAREN COLON type`
   - `dec` declarations: `dec NAME COLON type`
   - Parameter: `NAME COLON type`
   - Types parsed as strings using existing KMDocs type syntax

2. **Default:** `extern default STRING_LITERAL as NAME COLON type`
   - `default` matched as an identifier with value `"default"`

Both forms produce top-level AST nodes. The parser validates that extern appears at the top level.

### Type checker

- When visiting `ExternDeclaration`: register each declared function/value in the current scope with its declared type. Functions are registered in `this.functions` map with param types and return type (same as KMDoc-annotated functions). Values are registered via `this.defineVariable`.
- When visiting `ExternDefaultDeclaration`: register the alias as a variable with the declared type.
- No special handling needed for call sites — they're already validated against registered function signatures.

### Generator

- During `visitProgram`, collect all extern declarations and track which symbols are actually used in the AST.
- Before emitting the runtime import, emit tree-shaken `import` statements:
  - Named: `import { sym1, sym2 } from 'module';` (only used symbols)
  - Default: `import alias from 'module';` (only if alias is used)
- Extern declarations themselves produce no other output — skip them in statement generation.

### Linter

No new rules needed.

## Interaction with existing features

### Module system (dep)

`extern` and `dep` are orthogonal:
- `dep` imports KimchiLang modules (`.km` files) via the factory function pattern
- `extern` imports JS modules via static `import`

Both can coexist in the same file.

### js { } blocks

`extern` does not replace `js { }` yet. Both can coexist. `js { }` removal is a separate future step that depends on both extern and `Foo.new()` being available.

### Concurrency primitives

Extern functions that return Promises work naturally with `collect`/`hoard`/`race` and `await`:

```
extern "node:fs/promises" {
  fn readFile(path: string): any
  fn writeFile(path: string, data: string): any
}

async fn main() {
  dec [a, b] = collect [readFile.("a.txt"), readFile.("b.txt")]
}
```
