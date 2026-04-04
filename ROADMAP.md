# KimchiLang Roadmap

## Module System

- [x] ~~Remove index file fallback from CLI's `modulePathToFilePath`~~ — removed, files are modules, directories are just organization

### Default Module Function Exporting

Current limitations of the async factory pattern (`export default async function(_args)`):

- **No module caching** — every `dep` import calls the factory again, creating a new instance. Stateful services (e.g., database pools) get duplicated instead of shared.
- **No lifecycle hooks** — modules can't declare setup/teardown. No way to close resources on shutdown.
- **No compile-time validation of module args** — the factory accepts any object. Required args (`!arg`) throw at runtime, but callers aren't checked at compile time.
- **Everything is async** — the factory is always `async function` even for pure synchronous modules, adding unnecessary Promise wrapping.

Planned improvements:

- [x] ~~`module singleton` — module directive that caches the factory result. First call creates the instance, subsequent imports return cached. Overrides bypass cache for testing. Producer declares, consumer unaware.~~
- [x] ~~`lazy dep` — consumer-side modifier on dep imports. Defers factory call until after module init. Orthogonal to singleton.~~
- [x] ~~`module pure` — compile-time check that module is side-effect-free (no env, shell, spawn, sleep, print, module-level mut). Mutually exclusive with singleton.~~
- [ ] `@annotations` — reserved syntax for function-level annotations (future feature, not module directives)
- [x] ~~Graceful shutdown — `expose fn _shutdown()` convention that `kimchi run` calls on SIGTERM/SIGINT~~
- [x] ~~Expose type declarations~~ — static files export type aliases via `type Name = {shape}`, registered in type checker on import

## Language Design

- [x] ~~Require all-implicit or all-explicit enum values~~ — mixed is now a parse error
- [ ] Algebraic data types / tagged unions for richer domain modeling
- [x] ~~Exhaustiveness checking on match patterns~~ — implemented for enum variant matching
- [x] ~~Union types (`string | null`)~~ — supported in extern and KMDocs, one-way compatibility, guard-based narrowing
- [x] ~~Generic/parameterized types~~ — type aliases (`type Result<T> = ...`), generic functions in extern/KMDocs, inference at call sites
- [x] ~~Compound assignment operators for mut (`+=`, `-=`, `*=`, `/=`)~~ — already supported
- [x] ~~`Foo.new(args)` constructor syntax — `new` as a static method on the base object/function, compiles to `new Foo(args)`. Enables chaining without variable assignment: `Date.new().toISOString()`. Replaces broken `new Foo()` keyword form.~~
- [x] ~~`extern` declarations — typed contracts for JS modules (`extern "node:fs" { fn readFileSync(path: string): string }`). Compiles to tree-shaken `import` statements. Supports named and default exports.~~
- [x] ~~Remove `js { }` interop~~ — replaced by extern declarations and `Foo.new()` constructor syntax
- [x] ~~Generator functions~~ — `gen { yield value }` directive blocks returning next-functions, `done` primitive, `is done`/`is Type.Done`/`is Type.Generator`, pipe composition, `for...in` integration, async auto-detection
- [x] ~~Drop `async`/`await`~~ — compiler auto-detects async-ness from call graph. `sleep ms` replaces manual Promise construction.
- [x] ~~Frontend build system — `kimchi build entry.km -o dist/bundle.js`. Compiles with `--target browser`, bundles deps into IIFE, inlines runtime. No factory wrappers. Prerequisite for `.kmx`.~~
- [x] ~~`extern node`/`extern browser` platform annotations~~ — compile error when platform mismatches build target
- [ ] Build config file (`build.static`) — entry, output, target, options
- [ ] Dev server with hot reload — see `kimchi serve` in Tooling section
- [ ] Production build optimizations — minification, tree-shaking (leverages `module pure`), code splitting
- [x] ~~JSX support in `.kmx` files~~ — via compiler plugin system. `<div>{expr}</div>` compiles to React 19 `jsx()`/`jsxs()` from `react/jsx-runtime`. Auto-import, components as functions, `stdlib/kmx/react.km` for full API.
- [x] ~~Regex patterns in match arms~~ — `match str { /^hello/ => "greeting" }` compiles to `.test()` checks
- [x] ~~Nullish equality~~ — `== null` and `!= null` now compile to loose equality (`==`/`!=`), catching both `null` and `undefined`. All other comparisons remain strict (`===`/`!==`).
- [ ] Optional extern parameters — `fn readFile(path: string, encoding?: string)` to allow calling with fewer args. Currently forces `any` type workarounds.
- [ ] Rest parameters in extern — `fn join(...parts: string)` for variadic JS functions. Currently requires declaring fixed arity.
- [ ] `import.meta.url` support — needed for resolving paths relative to the current module. Currently no way to get the module's own file path.
- [ ] `catch` without parens — allow `catch e { }` in addition to `catch(e) { }` for consistency with other KimchiLang blocks
- [x] ~~`@annotations` on type declarations~~ — `@namespace.name({...})` metadata, invisible to type system, read by plugins
- [x] ~~Field modifiers in types~~ — `string?` (optional, skipped in `is` checks), `string!` (required), `string = "default"` (has default)

## Extension System

KimchiLang grows through **directive blocks** — domain-specific syntax that plugins compile to JavaScript. Extensions have two halves: a compile-time plugin (lexer/parser/generator hooks) and a runtime module.

### Four layers

| Layer | Import | Example |
|-------|--------|---------|
| Language | built-in | `shell`, `spawn`, `match`, `guard` |
| KMX | `.kmx` file extension | JSX/React |
| Stdlib | `dep stdlib.X` | postgres driver, http, logging |
| Extensions | `dep @X` | `@db.query`, `@db.sql` — directive-capable packages |

### Three plugin tiers

| Tier | Written in | Access | Trust |
|------|-----------|--------|-------|
| Core | JavaScript | Full compiler API | Ships with KimchiLang |
| Extension | JavaScript | Full API, statically analyzed at install | From pantry, flagged at install |
| Native | KimchiLang | Declarative API only | Sandboxed by design |

### Implemented

- [x] ~~Plugin system~~ — lexer/parser/generator/autoImport hooks (`src/extensions/`)
- [x] ~~SQL plugin~~ — `sql is User { SELECT * FROM users WHERE id = $id }`
- [x] ~~Query plugin~~ — `query User { find 42 }` CRUD with `@query.table` annotations
- [x] ~~Plugin registry~~ — auto-load by file extension (`.kmx`, `.kmsql`, `.kmq`)
- [x] ~~Interpreter plugin loading~~ — `kimchi run` loads plugins for file extension

### Planned

- [ ] `dep @namespace.name` import syntax — extension import that loads plugin + runtime + registers directive keyword
- [ ] `kimchi install @db.query` — install extensions from pantry, separate trust decision from compilation
- [ ] Lockfile (`km-extensions.lock`) — version + integrity hash for deterministic CI installs
- [ ] Static analysis at install — scan `plugin.js` for fs/net/process/eval, flag capabilities, refuse on manifest mismatch
- [ ] Native plugin API — write directive plugins in KimchiLang with declarative pattern/body/generate API, sandboxed by design
- [ ] Pantry registry — package registry for community extensions (beyond GitHub-based deps)
- [ ] Directive name conflict detection — compile error when two extensions declare the same keyword, resolution mechanism TBD

### Extension design spec

Full design at `docs/superpowers/specs/2026-04-02-directive-blocks-and-query-design.md`

## Type Checker

- [ ] Visit `PipeExpression` children — pipe operands are not type-checked (undefined vars, wrong call signatures silently pass)
- [ ] Linter: track variable usage inside `is` expressions and template literal interpolations — currently reports false "unused variable" warnings
- [ ] Fix false-positive unreachable code warnings for conditional blocks — `|cond| => { return ... }` followed by more code always warns

### Pattern-Match-Driven Type System

A type system built on KimchiLang's existing primitives (`type`, `is`, `guard`, `match`) rather than TypeScript-style annotations or Hindley-Milner inference. Types narrow through control flow — the compiler tracks what `is`, `guard`, and `match` prove about values.

Phase 1 — Foundation:
- [x] ~~Fix nullish equality (`!= null` must catch undefined)~~ — `== null`/`!= null` now use loose equality
- [ ] Enforce extern parameter types at call sites — types are already declared, just not checked
- [x] ~~Track `guard x != null` narrowing through the rest of the function scope~~
- [x] ~~Track `is` narrowing in match arms and if blocks~~ — `guard x is Type` narrows, multi-type `is A, B, C` merges shapes

Phase 2 — Inference:
- [x] ~~Infer function return types from return statements~~ — compiler collects return types and infers common shape
- [x] ~~Declared return types~~ — `fn name() is ReturnType` declares return shape, compiler registers for callers
- [ ] Infer variable types from literal assignments — `dec x = 5` means `x` is `number`
- [ ] Propagate types through pipe chains — `5 ~> double ~> addOne` infers each step as `number`
- [ ] Warn on type mismatch in binary expressions — `"hello" + 5` should warn

Phase 3 — Exhaustiveness:
- [ ] Warn on unhandled `is` patterns — if a union type has 3 variants and you match 2, warn about the missing one
- [ ] Prove `_` arm unreachable when all variants are covered
- [ ] Require `_` arm or exhaustive patterns for non-enum match subjects with known union types

Phase 4 — Advanced:
- [ ] Type-check module boundaries — `expose fn` return types validated against callers across `dep` imports
- [ ] Typed module interfaces — declare required exports so `dep` consumers get compile-time checks
- [ ] Effect tracking — functions that `throw`, `print`, or use `shell` could be tagged, preventing accidental side effects in `module pure`

## Tooling

- [ ] REPL — interactive session with state across lines
- [ ] LSP: go-to-definition, hover (show KMDocs + types), find references
- [ ] LSP: autocomplete
- [ ] Debugger integration
- [ ] Source maps for compiled output
- [x] ~~Watch mode (`kimchi run --watch`)~~ — watches source + project .km files, re-runs on change
- [x] ~~`kimchi fmt` formatter~~ — 6 auto-fixable rules: indent, no-tabs, no-trailing-spaces, newline-after-function, newline-after-shebang, no-multiple-empty-lines
- [x] ~~CLI args → module args~~ — `kimchi run app.km --name World` passes `--name` as module arg
- [ ] `kimchi serve` — dev server that bundles `.kmx` frontend, serves static files, and provides hot reload. Eliminates manual server setup for frontend projects.
- [ ] `kimchi init fullstack` — scaffold a fullstack project (server.km + app.kmx + public/ + importmap)
- [ ] Bundler stdlib resolution — `as react dep stdlib.kmx.react` should resolve to the actual stdlib directory, not relative to the entry file
- [x] ~~Binary file support in web server~~ — Buffer response support added to server helper. `readFile(path, null)` returns Buffer for binary files.
- [ ] Interpreter CWD — `process.cwd()` should return the directory where `kimchi run` was invoked, not the script's directory

## Standard Library

- [x] ~~`array.km`~~ — implemented: chunk, zip, groupBy, sortBy, range, compact, partition, intersect, difference
- [ ] Package registry (beyond GitHub-based dependency management)
- [ ] Version resolution and lockfile for dependencies

## Concurrency (I/O)

- [x] ~~`collect [callable1, callable2]` — concurrent I/O, fail fast (`Promise.all`). Returns array of results. Destructurable: `dec [a, b] = collect [fn1, fn2]`~~
- [x] ~~`hoard [callable1, callable2]` — concurrent I/O, get everything even failures (`Promise.allSettled`). Returns array of `{ status, value/reason }`.~~
- [x] ~~`race [callable1, callable2]` — concurrent I/O, first to finish wins (`Promise.race`). Returns single result.~~

## Parallel Computation

- [x] ~~`worker { code }` — run CPU-bound code on a separate thread (`worker_threads`). Data serialized in/out, no shared memory. Returns Promise.~~
- [x] ~~`spawn { command }` — async child process (non-blocking `shell`), returns handle with `stdout`, `stderr`, `pid`, `kill()`~~
- [ ] Channel-based communication between workers
- [x] ~~Cancellable timers — `dec timer = after ms { body }` with `timer.cancel()`. Scheduled async callbacks with cancellation support.~~

## Web Framework

- [x] ~~Built-in minimal web server (`stdlib.web.server`)~~ — single callback, immutable request objects, response helpers, CORS. Routing via match, validation via guard, middleware via pipes. No external dependencies.
- [x] ~~Buffer response support~~ — server helper now handles `Buffer.isBuffer()` bodies for binary responses (images, fonts)
- [ ] Static file serving helper — `server.static("public/")` to serve a directory without manual MIME type handling
- [ ] WebSocket support
- [ ] Server-sent events

## Runtime

- [ ] Publish `kimchilang` to npm for `npm install -g kimchilang`
- [ ] Publish `kimchi-runtime` as a separate npm package (bare import instead of file copy)

## Testing

- [ ] Code coverage reporting
- [ ] Snapshot testing
- [x] ~~Test timeout per test~~ — 5-second default timeout per test via Promise.race
- [x] ~~Multi-file test runner (`kimchi test dir/`)~~ — discovers test files, runs in sequence
