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
kimchi --version                      # Show version (requires npm link)
```

## Compiler Pipeline

Source flows through five stages in order:

1. **Lexer** (`src/lexer.js`) — tokenizes source into `TokenType` enum values (~60 types)
2. **Parser** (`src/parser.js`) — builds AST with `NodeType` enum (~30 node types)
3. **Type Checker** (`src/typechecker.js`) — scope-stack-based type inference and validation
4. **Linter** (`src/linter.js`) — code quality checks (unused vars, formatting)
5. **Generator** (`src/generator.js`) — emits JavaScript with runtime helpers (`_deepFreeze`, `_obj`, optional chaining)

Entry points: `src/index.js` (KimchiCompiler class API), `src/cli.js` (CLI).

## Module System

- Module paths map to filesystem: `salesforce.client` → `./salesforce/client.km`
- File extensions: `.km`, `.kimchi`, `.kc` (all equivalent)
- Compiled modules become async factory functions: `export default async function(_args) { ... }`
- `expose` keyword marks functions/values as public API
- `arg`/`!arg` declares module parameters; `as alias dep module.path` declares dependencies

## Key Runtime Patterns

- `dec x = value` compiles to `const x = _deepFreeze(value)` — all values deeply frozen
- `obj.a.b.c` compiles to `obj?.a?.b?.c` — all member access is null-safe
- `==` compiles to `===` — strict equality only
- `~>` is the pipe operator (eager); `>>` is the flow operator (lazy composition)

## New Language Features

- `mut x = 0` — mutable variable, compiles to `let`. Block-scoped, visible in child blocks. Cannot be captured by closures or exposed. No `_deepFreeze`. Linter warns if never reassigned.
- `x ?? fallback` — nullish coalescing, compiles to JS `??` directly. Precedence between `||` and `&&`.
- `guard cond else { return/throw }` — precondition check. Compiles to negated `if`. Type checker enforces the else block must exit via return or throw.
- `match subject { pattern => body }` — expression returning a value. Supports literal, `is` type, object/array destructuring, binding, and wildcard (`_`) patterns with optional `when` guards. Compiles to IIFE with if/else chain. Returns `null` if no arm matches.
- `value.if(cond).else(fallback)` — inline conditional expression. Compiles to ternary. `.else()` is optional (returns `null` without it).

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

## Other Components

- `src/js2km.js` — reverse transpiler (JavaScript → KimchiLang)
- `src/static-parser.js` — parses `.static` config files (like `project.static`)
- `src/package-manager.js` — GitHub-based dependency management
- `stdlib/` — standard library modules (array, string, object, math, http, etc.)
- `editors/` — VS Code and Sublime Text syntax extensions
- `create-kimchi-app/` and `install-kimchilang/` — separate npm packages for scaffolding/installation
