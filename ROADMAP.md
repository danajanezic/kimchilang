# KimchiLang Roadmap

## Module System

- [ ] Alias-free imports — `dep myapp.lib.http` without `as`, accessible via full path `myapp.lib.http.get()`. The `as` form remains for shorthand. No index files — files are modules, directories are just organization.
- [x] ~~Remove index file fallback from CLI's `modulePathToFilePath`~~ — removed, files are modules, directories are just organization

### Default Module Function Exporting

Current limitations of the async factory pattern (`export default async function(_args)`):

- **No module caching** — every `dep` import calls the factory again, creating a new instance. Stateful services (e.g., database pools) get duplicated instead of shared.
- **No lifecycle hooks** — modules can't declare setup/teardown. No way to close resources on shutdown.
- **No compile-time validation of module args** — the factory accepts any object. Required args (`!arg`) throw at runtime, but callers aren't checked at compile time.
- **Everything is async** — the factory is always `async function` even for pure synchronous modules, adding unnecessary Promise wrapping.

Planned improvements:

- [x] ~~`module singleton` — module directive that caches the factory result. First call creates the instance, subsequent imports return cached. Overrides bypass cache for testing. Producer declares, consumer unaware.~~
- [ ] `lazy dep` — consumer-side modifier on dep imports. Defers factory call until first access. Orthogonal to singleton (lazy controls when, singleton controls how many times).
- [ ] `module pure` — compile-time check that module is side-effect-free (no env, shell, spawn, sleep, print, module-level mut). Enables tree-shaking in frontend builds. Mutually exclusive with singleton.
- [ ] `@annotations` — reserved syntax for function-level annotations (future feature, not module directives)
- [ ] Typed module interfaces — use generics/type system to type-check module exports and required args at compile time
- [x] ~~Graceful shutdown — `expose fn _shutdown()` convention that `kimchi run` calls on SIGTERM/SIGINT~~
- [ ] Expose type declarations — let modules export type aliases so consumers can use them (currently types are file-scoped)

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
- [ ] Generator functions — `gen fn range(start, end) { yield start; ... }` with iterator protocol, composable with pipes and `for...in`
- [x] ~~Drop `async`/`await`~~ — compiler auto-detects async-ness from call graph. `sleep ms` replaces manual Promise construction.
- [ ] Frontend build system — bundle `.km` files into browser-ready JS. Dev server with hot reload, production builds with minification/tree-shaking. Prerequisite for `.kmx` frontend development.
- [ ] JSX support in `.kmx` files — `<div>{expr}</div>` compiles to `React.createElement`. Components are functions, props are parameters, state via `dec [x, setX] = useState(0)`. No new keywords. Requires frontend build system.

## Tooling

- [ ] REPL — interactive session with state across lines
- [ ] LSP: go-to-definition, hover (show KMDocs + types), find references
- [ ] LSP: autocomplete
- [ ] Debugger integration
- [ ] Source maps for compiled output
- [x] ~~Watch mode (`kimchi run --watch`)~~ — watches source + project .km files, re-runs on change
- [ ] `kimchi fmt` formatter

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
