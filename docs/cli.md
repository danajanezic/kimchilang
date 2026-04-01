# CLI Commands

[Back to README](../README.md)

## Basic Commands

```bash
kimchi run app.km              # Run a file (cached transpilation)
kimchi compile app.km          # Compile to JavaScript
kimchi compile app.km -o out   # Compile with custom output
kimchi test tests.km           # Run embedded tests
kimchi lint app.km             # Run linter
kimchi check app.km            # Editor integration error check
kimchi lsp                     # Start LSP server
kimchi cache clear             # Clear transpilation cache
kimchi --version               # Show version
```

## Module Execution

Run modules using dot-notation paths:

```bash
kimchi salesforce.client          # Run salesforce/client.km
kimchi run salesforce/client.km   # Equivalent
```

**Passing named arguments:**

```bash
kimchi api.client --client-id ABC123 --timeout 10000
# Argument names convert: --client-id -> clientId (camelCase)
```

**Injecting dependencies at runtime:**

```bash
kimchi services.api --dep http=mocks.http
kimchi app.main --dep http=mocks.http --dep db=mocks.db
```

**Module help:**

```bash
kimchi help api.client
```

**Listing modules:**

```bash
kimchi ls                          # List modules in current directory
kimchi ls --verbose                # List with descriptions
kimchi ls ./lib --recursive        # Recursive tree view
```

## Reverse Transpiler (JS -> KimchiLang)

Convert existing JavaScript to KimchiLang:

```bash
kimchi convert app.js
kimchi convert app.js -o src/app.km
```

The reverse transpiler handles:
- `const`/`let`/`var` -> `dec`
- Function declarations -> `fn`
- Classes -> factory functions
- `import` / `require()` -> `extern` declarations
- `new X()` -> `X.new()`
- Named/default exports -> `expose`
- `console.log` -> `print`
- `async`/`await` stripped (compiler auto-detects)

## Build (Frontend Bundle)

```bash
kimchi build src/app.km -o dist/bundle.js
```

Compiles KimchiLang files for the browser. Follows all `dep` imports, bundles everything into a single IIFE JavaScript file. No `import`/`export` in output — works with `<script src="bundle.js">`.

### Platform annotations

```kimchi
extern node "node:fs" { fn readFileSync(path: string): string }    // Node only — error in build
extern browser "react" { dec createElement: any }                    // Browser only
extern "lodash" { fn map(arr: any, callback: any): any }            // Universal
```

Node.js externs (`extern node` and `node:` prefix) produce compile errors in browser builds. Browser externs are assumed to be globals loaded via `<script>` tags.

## NPM Integration

```bash
kimchi npm install lodash        # Install and convert to pantry/
kimchi npm install axios moment  # Multiple packages
```

After installation, packages are available at `pantry/<package>/index.km`:

```kimchi
as lodash dep pantry.lodash
dec result = lodash.map([1, 2, 3], x => x * 2)
```

## Watch Mode

```bash
kimchi run app.km --watch    # Re-runs on file changes
```

## Build

```bash
kimchi build src/            # Compile all .km files in directory
```
