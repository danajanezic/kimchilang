# KimchiLang Roadmap

## Language Design

- [ ] Require all-implicit or all-explicit enum values (disallow mixed auto-increment like `Low, Medium, High = 10, Critical`)
- [ ] Algebraic data types / tagged unions for richer domain modeling
- [ ] Exhaustiveness checking on match patterns
- [ ] Union types (`string | null`)
- [ ] Generic/parameterized types
- [ ] Compound assignment operators for mut (`+=`, `-=`, `++`, `--`)
- [ ] Remove `js { }` interop in favor of native bindings / extern declarations

## Tooling

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

## Runtime

- [ ] Publish `kimchilang` to npm for `npm install -g kimchilang`
- [ ] Publish `kimchi-runtime` as a separate npm package (bare import instead of file copy)

## Testing

- [ ] Code coverage reporting
- [ ] Snapshot testing
- [ ] Test timeout per test
- [ ] Multi-file test runner (`kimchi test dir/`)
