# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

KimchiLang is a programming language that transpiles to JavaScript. It is purely functional (no classes, no `this`, no global scope), deeply immutable by default, and has compile-time type inference without annotations. Zero external dependencies.

## Prerequisites

This project uses [mise](https://mise.jdx.dev/) for tool version management. Run `mise install` to get Node 22 (configured in `.mise.toml`).

## Commands

```bash
npm test                              # Run full test suite (custom harness, no framework)
node test/test.js                     # Same as above, direct execution
node src/cli.js run <file>            # Compile and run a .km/.kimchi file
node src/cli.js compile <file> -o out # Transpile to JavaScript
node src/cli.js test <file>           # Run embedded tests in a .km file
node src/cli.js lint <file>           # Run linter
node src/cli.js check <file>          # Editor integration error check
node src/cli.js convert <file.js>     # Reverse transpile JS → KimchiLang
node src/cli.js build <dir>           # Compile all .km/.kimchi files in directory
node src/cli.js cache clear           # Clear transpilation cache
echo 'print "hi"' | kimchi            # Execute KimchiLang from stdin
kimchi --version                      # Show version (requires npm link)
```

## Compiler Pipeline

Source flows through five stages in order:

1. **Lexer** (`src/lexer.js`) — tokenizes source into `TokenType` enum values (~60 types)
2. **Parser** (`src/parser.js`) — builds AST with `NodeType` enum (~30 node types)
3. **Type Checker** (`src/typechecker.js`) — scope-stack-based type inference and validation
4. **Linter** (`src/linter.js`) — code quality checks (unused vars, formatting)
5. **Generator** (`src/generator.js`) — emits JavaScript with runtime helpers (`_obj`, optional chaining)

Entry points: `src/index.js` (KimchiCompiler class API), `src/cli.js` (CLI).

## Interpreter

`src/interpreter.js` — `KimchiInterpreter` class that compiles KimchiLang to self-contained JavaScript, caches it by source hash in `.kimchi-cache/`, and executes from cache. Used by `kimchi run`. Supports:

- **Shebang scripts**: `#!/usr/bin/env kimchi` — files run directly after `npm link`
- **stdin**: `echo 'print "hi"' | kimchi`
- **Multi-module resolution**: recursively compiles `dep` imports into the cache directory
- **V8 bytecode caching**: `NODE_COMPILE_CACHE` env var for repeat execution speedup
- **Cache management**: `kimchi cache clear` deletes `.kimchi-cache/`

## Module System

- Module paths map to filesystem: `salesforce.client` → `./salesforce/client.km`
- File extensions: `.km`, `.kimchi`, `.kc` (all equivalent)
- Compiled modules become async factory functions: `export default async function(_args) { ... }`
- `expose` keyword marks functions/values as public API
- `arg`/`!arg` declares module parameters; `as alias dep module.path` declares dependencies

## Key Runtime Patterns

- `dec x = value` compiles to `const x = value` — immutability enforced at compile time, not runtime.
- `obj.a.b.c` compiles to `obj.a.b.c` when shape is known from literal declaration, `obj?.a?.b?.c` otherwise
- `==` compiles to `===` — strict equality only
- `~>` is the pipe operator (eager); `>>` is the flow operator (lazy composition)

## KMDocs (Type Annotations)

JSDoc-style `/** */` comments with `@param {type} name`, `@returns {type}`, and `@type {type}`. The type checker uses KMDoc types first, then falls back to inference. Types: `number`, `string`, `boolean`, `null`, `void`, `any`, `number[]` (arrays), `{key: type}` (object shapes), `(type) => type` (functions), `type1 | type2` (union types), `Name<T>` (generic instantiation), custom type names.

## New Language Features

- `mut x = 0` — mutable variable, compiles to `let`. Block-scoped, visible in child blocks. Cannot be captured by closures or exposed. No `_deepFreeze`. Linter warns if never reassigned.
- `x ?? fallback` — nullish coalescing, compiles to JS `??` directly. Precedence between `||` and `&&`.
- `guard cond else { return/throw }` — precondition check. Compiles to negated `if`. Type checker enforces the else block must exit via return or throw.
- `match subject { pattern => body }` — expression returning a value. Supports literal, `is` type, object/array destructuring, binding, and wildcard (`_`) patterns with optional `when` guards. Compiles to IIFE with if/else chain. Returns `null` if no arm matches.
- `value.if(cond).else(fallback)` — inline conditional expression. Compiles to ternary. `.else()` is optional (returns `null` without it).
- The compiler auto-detects async functions — no `async` or `await` keywords. Functions containing shell, spawn, worker, collect, hoard, race, sleep, or calls to other async functions are automatically compiled as `async` with `await` inserted at call sites.
- `sleep ms` — pauses execution for N milliseconds. Compiles to `await new Promise(resolve => setTimeout(resolve, ms))`.
- `collect [fn1, fn2]` — concurrent I/O, fail fast. Compiles to `await Promise.all(...)`. Returns array of results. Destructurable: `dec [a, b] = collect [fn1, fn2]`.
- `hoard [fn1, fn2]` — concurrent I/O, get everything even failures. Compiles to `await Promise.allSettled(...)` mapped to `{ status: STATUS.OK/REJECTED, value/error }`. Tree-shaken `STATUS` enum emitted when used.
- `race [fn1, fn2]` — concurrent I/O, first to finish wins. Compiles to `await Promise.race(...)`. Returns single result.
- `someFunc.(arg1, arg2)` — bind syntax, creates deferred call. Compiles to `() => someFunc(arg1, arg2)`. Inside `collect`/`hoard`/`race`, inlined as direct call.
- `worker(args) { body }` — run CPU-bound KimchiLang code on a `worker_threads` thread. Data serialized in/out, no shared memory. Returns Promise. Compiles to `await _worker(fn, args)`.
- `spawn { command }` — non-blocking child process (like `shell` but async). Raw shell text, supports `$var` interpolation. Returns Promise resolving to `{ stdout, stderr, exitCode, pid }`.
- `Foo.new(args)` — constructor syntax. Compiles to `new Foo(args)`. Enables chaining: `Date.new().toISOString()`.
- `extern "module" { fn name(p: type): type; dec name: type }` — typed contracts for JS modules. Compiles to tree-shaken static `import` statements. Only used symbols are imported. Supports named and default exports (`extern default "mod" as name: type`).
- `type Name<T> = body` — generic type aliases. `type Result<T> = {ok: boolean, value: T}`, `type Optional<T> = T | null`. Type parameters substituted on instantiation.
- `string | null` — union types in extern declarations and KMDocs. One-way compatibility: `string` fits `string | null`, but not reverse. `guard x != null else { ... }` narrows the type.
- `x is Type.String` — three-tier type checking: primitive check (`Type.String`, `Type.Number`, etc.), duck typing via type alias shapes (`x is Point` checks for keys), instanceof fallback. Works in expressions and `match` patterns. Negated with `is not`.

## Test Structure

Compiler tests are in `test/test.js` using a custom harness with `test(name, fn)`, `assertEqual()`, and `assertContains()`. Stdlib tests are in `test/stdlib_test.js`. Run both with `node test/test.js` and `node test/stdlib_test.js`.

## Built-in Testing Framework

KimchiLang has a built-in test runner invoked with `kimchi test <file>`. Syntax:

- `test "name" { ... }` / `describe "name" { ... }` — test and suite blocks
- `expect(actual).matcher(expected)` — 15 matchers: `toBe`, `toEqual`, `toContain`, `toBeNull`, `toBeTruthy`, `toBeFalsy`, `toBeGreaterThan`, `toBeLessThan`, `toHaveLength`, `toMatch`, `toThrow`, `toBeDefined`, `toBeUndefined`, `toBeCloseTo`, `toBeInstanceOf`
- `expect(x).not.toBe(y)` — `.not` inverts any matcher
- `test.only` / `test.skip` / `describe.only` / `describe.skip` — focus or skip tests (file-scoped)
- `beforeAll { }` / `afterAll { }` / `beforeEach { }` / `afterEach { }` — lifecycle hooks inside `describe`
- `assert condition, "message"` — simple assertion
- Mocking via dependency injection: `as svc dep module({ "dep.path": mock })`

## Validator and LSP

- `src/validator.js` — `KimchiValidator` class with `validate(source)` and `validateAll(files)`. Returns structured diagnostics with line, column, severity, message, and source phase.
- `src/lsp.js` — LSP server over stdio (JSON-RPC 2.0). Launched via `kimchi lsp`. Supports textDocument/didOpen, didChange, didClose, didSave.
- `formatDiagnostics(diagnostics)` — formats diagnostic array as human/LLM-readable string. Used by specscript.
- VS Code extension (`editors/vscode/`) uses vscode-languageclient to connect to `kimchi lsp`.

## Code Generation Optimizations

- **No `_deepFreeze` at runtime** — immutability is compile-time only.
- **Smart optional chaining** — generator tracks known object shapes from literals and `guard` statements. Uses `.` when safe, `?.` otherwise.
- **Match ternary compilation** — simple literal/wildcard match expressions compile to ternary chains instead of IIFEs. Binding+guard patterns avoid nested IIFEs.
- **Tree-shaken runtime** — `_pipe`, `_flow`, `_shell`, `_spawn`, `_worker`, `_Secret`, `STATUS` enum, and the testing framework are only emitted when the AST uses them.
- **Extern imports** — `extern` declarations compile to static `import` statements. Only symbols actually used in the file are imported (tree-shaken). Extern blocks produce zero runtime code.
- **Shared runtime module** — `src/runtime.js` contains stdlib extensions, `_obj`, and `error`. Compiled files import it; interpreter inlines it.

## Other Components

- `src/interpreter.js` — cached transpiler for `kimchi run` and shebang scripts
- `src/js2km.js` — reverse transpiler (JavaScript → KimchiLang). Emits `extern` declarations for JS imports, `Foo.new()` for constructors.
- `src/static-parser.js` — parses `.static` config files (like `project.static`)
- `src/package-manager.js` — GitHub-based dependency management
- `stdlib/` — standard library modules (array, string, object, math, http, etc.)
- `editors/` — VS Code and Sublime Text syntax extensions
- `create-kimchi-app/` and `install-kimchilang/` — separate npm packages for scaffolding/installation
