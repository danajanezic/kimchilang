# KimchiLang Roadmap

## Module System

- [ ] Alias-free imports — `dep myapp.lib.http` without `as`, accessible via full path `myapp.lib.http.get()`. The `as` form remains for shorthand. No index files — files are modules, directories are just organization.
- [ ] Remove index file fallback from CLI's `modulePathToFilePath` (currently tries `/index.km` — inconsistent with the explicit-path philosophy)

## Language Design

- [x] ~~Require all-implicit or all-explicit enum values~~ — mixed is now a parse error
- [ ] Algebraic data types / tagged unions for richer domain modeling
- [x] ~~Exhaustiveness checking on match patterns~~ — implemented for enum variant matching
- [x] ~~Union types (`string | null`)~~ — supported in extern and KMDocs, one-way compatibility, guard-based narrowing
- [x] ~~Generic/parameterized types~~ — type aliases (`type Result<T> = ...`), generic functions in extern/KMDocs, inference at call sites
- [x] ~~Compound assignment operators for mut (`+=`, `-=`, `*=`, `/=`)~~ — already supported
- [x] ~~`Foo.new(args)` constructor syntax — `new` as a static method on the base object/function, compiles to `new Foo(args)`. Enables chaining without variable assignment: `Date.new().toISOString()`. Replaces broken `new Foo()` keyword form.~~
- [x] ~~`extern` declarations — typed contracts for JS modules (`extern "node:fs" { fn readFileSync(path: string): string }`). Compiles to tree-shaken `import` statements. Supports named and default exports.~~
- [ ] Remove `js { }` interop — blocked by extern declarations and `Foo.new()` covering all current `js { }` use cases
- [ ] Generator functions — `gen fn range(start, end) { yield start; ... }` with iterator protocol, composable with pipes and `for...in`
- [ ] Drop `async`/`await` — compiler auto-detects async-ness from call graph. Blocked by removing `js { }` (can't detect async across JS boundary). Concurrency primitives (`collect`, `hoard`, `race`, `worker`, `spawn`) already implicit-await.
- [ ] JSX support in `.kmx` files — `<div>{expr}</div>` compiles to `React.createElement`. Components are functions, props are parameters, state via `dec [x, setX] = useState(0)`. No new keywords.

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

## Web Framework

- [ ] Built-in minimal web server — batteries-included like Go's `net/http`, but KimchiLang-native. Immutable request/response objects, pattern-matched routing, guard-based middleware, pipe operator for request pipelines. No external dependencies. Ships with the language.

## Runtime

- [ ] Publish `kimchilang` to npm for `npm install -g kimchilang`
- [ ] Publish `kimchi-runtime` as a separate npm package (bare import instead of file copy)

## Testing

- [ ] Code coverage reporting
- [ ] Snapshot testing
- [ ] Test timeout per test
- [x] ~~Multi-file test runner (`kimchi test dir/`)~~ — discovers test files, runs in sequence
