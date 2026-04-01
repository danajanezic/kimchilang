# Frontend Build System Design

## Overview

A bundler that compiles KimchiLang files to browser-ready JavaScript. Takes an entry file, follows all `dep` imports, compiles with a browser target, and concatenates into a single IIFE bundle. No external dependencies.

## Command

```bash
kimchi build src/app.km -o dist/bundle.js
```

- Entry file: the `.km` file to start from
- `-o` output: path for the bundle (default: `dist/bundle.js`)
- The bundler follows all `dep` imports recursively from the entry

## Output format

A single IIFE (Immediately Invoked Function Expression) that runs when the script loads:

```javascript
(function() {
  // Inlined runtime (stdlib extensions, _obj, error)
  
  // Compiled modules (in dependency order)
  var _mod_lib_utils = (function() {
    function add(a, b) { return a + b; }
    function multiply(a, b) { return a * b; }
    return { add: add, multiply: multiply };
  })();
  
  // Entry point (runs immediately)
  var utils = _mod_lib_utils;
  console.log(utils.add(1, 2));
})();
```

No `export`, no `import`, no `async` wrappers. Compatible with `<script src="bundle.js">` — no `type="module"` needed.

## Browser compilation target

A new mode in the generator activated by `{ target: 'browser' }` that produces different output than the default Node.js target:

### What changes

| Aspect | Node.js target (current) | Browser target |
|--------|--------------------------|----------------|
| Module wrapper | `export default async function(_opts = {}) { ... }` | None — bare statements |
| Dep resolution | `await _dep_alias()` factory call | Direct reference to module variable |
| Runtime | `import { _obj, error } from './kimchi-runtime.js'` | Inlined in bundle |
| Imports | ES module `import` statements | None — everything bundled |
| Async | Auto-detected, `await` inserted | Same auto-detection, but no top-level await |
| `_opts` / `arg` / `env` | Supported | Not supported in browser (compile error) |

### What stays the same

- Expression compilation (operators, match, guard, pipes, etc.)
- Function declarations
- Variable declarations (dec, mut)
- Type checking, linting
- `Foo.new()` constructor syntax
- Concurrency primitives (collect, hoard, race — use Promises which work in browsers)
- sleep, after — use setTimeout which works in browsers

### What's not available in browser target

- `arg` / `!arg` — module arguments don't exist in browser
- `env` — `process.env` doesn't exist in browser
- `shell { }` — `child_process` doesn't exist in browser
- `spawn { }` — same
- `worker { }` — could use Web Workers in future, but not initially
- `extern node "..."` — error
- `module singleton` — no factory pattern in browser, each module is a singleton by default (IIFE runs once)
- `dep` with overrides — no dependency injection in browser builds

Compile errors for unsupported features are clear: `"arg declarations are not available in browser builds"`.

## Extern platform annotations

```kimchi
extern node "node:fs" {
  fn readFileSync(path: string): string
}

extern browser "react" {
  dec createElement: any
  dec useState: any
}

extern "lodash" {
  fn map(arr: any, fn: any): any
}
```

- `extern node` — available in Node.js builds only. Error in browser builds.
- `extern browser` — available in browser builds only. In Node.js builds, ignored (warning).
- `extern` (no annotation) — available in both.

### Browser extern resolution

In browser builds, extern symbols are assumed to be globals. The user loads libraries via `<script>` tags before the bundle:

```html
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="dist/bundle.js"></script>
```

The extern declaration `extern browser "react" { dec createElement: any }` tells the compiler that `createElement` exists as a global. The bundle accesses it directly.

### Auto-rejection of Node.js built-ins

In browser builds, any `extern` with a `node:` prefix is automatically rejected regardless of annotation: `"extern 'node:fs' is not available in browser builds"`.

## Bundling process

1. **Parse entry file** — read and parse the entry `.km` file
2. **Collect deps** — walk all `dep` imports recursively, building a dependency graph
3. **Topological sort** — order modules so deps come before dependents
4. **Compile each module** — compile with `{ target: 'browser' }`, producing module code without wrappers
5. **Wrap each module** — wrap in `var _mod_<name> = (function() { ... return { exports }; })();`
6. **Resolve dep references** — replace dep aliases with `_mod_<name>` references
7. **Inline runtime** — prepend the KimchiLang runtime
8. **Wrap in IIFE** — `(function() { ... })();`
9. **Write output** — write to the output file

### Module naming convention

Dep paths become module variable names: `dep myapp.lib.utils` → `_mod_myapp_lib_utils`. Dots replaced with underscores.

### Handling `expose`

In browser bundles, `expose` controls what a module returns from its IIFE:

```javascript
// Module: lib/utils.km with expose fn add and expose fn multiply
var _mod_lib_utils = (function() {
  function add(a, b) { return a + b; }
  function multiply(a, b) { return a * b; }
  function _internal() { return 42; } // not exposed, not returned
  return { add: add, multiply: multiply };
})();
```

### Circular dependency detection

The bundler detects circular deps during topological sort and errors: `"Circular dependency detected: a.km -> b.km -> a.km"`.

## Parser changes

### Extern platform annotation

In `parseExternDeclaration`, after consuming `extern`, check for `node` or `browser` identifiers before the module string:

```
extern "mod" { ... }                    // platform: null (universal)
extern node "mod" { ... }              // platform: "node"
extern browser "mod" { ... }           // platform: "browser"
extern default "mod" as name: any      // platform: null (unchanged)
extern browser default "mod" as name   // platform: "browser"
```

The platform is stored on the `ExternDeclaration` AST node: `{ ..., platform: "node" | "browser" | null }`.

## Generator changes

A new `target` option: `compile(source, { target: 'browser' })`.

When `target === 'browser'`:
- `visitProgram` skips the `export default async function` wrapper
- `visitProgram` skips `arg`, `env` processing (errors if present)
- Dep statements compile to variable references (`var alias = _mod_<path>`)
- No `import` statements emitted
- No runtime import (runtime inlined by bundler)
- `extern node` declarations produce a compile error
- `extern browser` declarations are included (symbols assumed global)

## CLI changes

New `build` subcommand in `src/cli.js`:

```
kimchi build <entry.km> [-o output.js]
```

- Default output: `dist/bundle.js`
- Creates output directory if it doesn't exist
- Prints bundle size and module count

## Implementation

### New files

- `src/bundler.js` — the bundler: dep graph, topological sort, concatenation
- No changes needed to existing compiler files for the basic bundler — it calls `compile()` with `{ target: 'browser' }`

### Modified files

- `src/generator.js` — add `target: 'browser'` support in `visitProgram`
- `src/parser.js` — add platform annotation to extern declarations
- `src/cli.js` — add `build` subcommand

## Testing

- Compile a simple `.km` file with `--target browser` and verify no `export default`, no `import`
- Bundle a multi-file project and verify the IIFE output
- Verify extern node errors in browser target
- Verify extern browser passes in browser target
- Verify circular dependency detection
- Verify the bundle runs in a Node.js context (IIFE should work in Node too)

## Future (not in this spec)

- Build config file (`build.static`)
- Dev server with hot reload
- Minification
- Tree-shaking (leveraging `module pure`)
- Code splitting
- Source maps
