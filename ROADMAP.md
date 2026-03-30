# KimchiLang Roadmap

## Module System

- [ ] Alias-free imports — `dep myapp.lib.http` without `as`, accessible via full path `myapp.lib.http.get()`. The `as` form remains for shorthand. No index files — files are modules, directories are just organization.
- [ ] Remove index file fallback from CLI's `modulePathToFilePath` (currently tries `/index.km` — inconsistent with the explicit-path philosophy)

## Language Design

- [ ] Require all-implicit or all-explicit enum values (disallow mixed auto-increment like `Low, Medium, High = 10, Critical`)
- [ ] Algebraic data types / tagged unions for richer domain modeling
- [ ] Exhaustiveness checking on match patterns
- [ ] Union types (`string | null`)
- [ ] Generic/parameterized types
- [ ] Compound assignment operators for mut (`+=`, `-=`, `++`, `--`)
- [ ] Remove `js { }` interop in favor of native bindings / extern declarations

## Tooling

- [ ] REPL — interactive session with state across lines
- [ ] LSP: go-to-definition, hover (show KMDocs + types), find references
- [ ] LSP: autocomplete
- [ ] Debugger integration
- [ ] Source maps for compiled output
- [ ] Watch mode (`kimchi run --watch`)
- [ ] `kimchi fmt` formatter

## Standard Library

- [ ] `array.km` — currently empty, needs map/filter/reduce wrappers, chunk, zip, groupBy, sortBy, flatten, unique
- [ ] Package registry (beyond GitHub-based dependency management)
- [ ] Version resolution and lockfile for dependencies

## Concurrency (I/O)

- [ ] `collect [callable1, callable2]` — concurrent I/O, fail fast (`Promise.all`). Returns array of results. Destructurable: `dec [a, b] = collect [fn1, fn2]`
- [ ] `hoard [callable1, callable2]` — concurrent I/O, get everything even failures (`Promise.allSettled`). Returns array of `{ status, value/reason }`.
- [ ] `race [callable1, callable2]` — concurrent I/O, first to finish wins (`Promise.race`). Returns single result.

## Parallel Computation

- [ ] `worker { code }` — run CPU-bound code on a separate thread (`worker_threads`). Data serialized in/out, no shared memory. Returns Promise.
- [ ] `spawn { command }` — async child process (non-blocking `shell`), returns handle with `stdout`, `stderr`, `pid`, `kill()`
- [ ] Channel-based communication between workers

## Runtime

- [ ] Publish `kimchilang` to npm for `npm install -g kimchilang`
- [ ] Publish `kimchi-runtime` as a separate npm package (bare import instead of file copy)

## Testing

- [ ] Code coverage reporting
- [ ] Snapshot testing
- [ ] Test timeout per test
- [ ] Multi-file test runner (`kimchi test dir/`)
