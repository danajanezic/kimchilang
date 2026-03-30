# KimchiLang Interpreter — Design Spec

A cached transpiler that makes KimchiLang scripts directly executable via `#!/usr/bin/env kimchi`. Transpiles on first run, caches the result, executes from cache on subsequent runs. Supports stdin piping.

## How It Works

1. Read source, hash it (SHA-256, first 16 hex chars of raw source)
2. Check `.kimchi-cache/{hash}.js` — if exists, skip to step 5
3. Transpile source → JavaScript (existing compiler pipeline)
4. Wrap the JS (inline runtime, replace `export default` with callable), write to `.kimchi-cache/{hash}.js`
5. Load cached JS via `vm.Script`, execute with V8 bytecode caching

## Shebang Support

```kimchi
#!/usr/bin/env kimchi
print "Hello, World!"
```

The OS strips the shebang line before passing the file to `kimchi`. The CLI sees a file path as the first argument and runs it.

## stdin Support

```bash
echo 'print "hello"' | kimchi
cat script.km | kimchi
kimchi <<EOF
dec x = 42
print x
EOF
```

When no command and no file argument, and stdin is not a TTY (piped), read all stdin and execute. No caching for stdin — it's ephemeral.

If stdin IS a TTY with no arguments, show help (existing behavior).

## Implementation

### New file: `src/interpreter.js`

~100 lines. A `KimchiInterpreter` class with `run(source, options)` and `runStdin(source)`.

**`run(source, options)`:**
- Hash raw source (no normalization — hashing is ~0.1ms, not worth optimizing)
- Cache miss: compile via existing `compile()`, wrap (inline runtime, replace export), write to `.kimchi-cache/{hash}.js`
- Execute via `vm.Script` with V8 bytecode caching (`cachedData` option)
- The cached file is self-contained — runtime is inlined, no external imports

**`runStdin(source)`:**
- Compile and execute in-memory, no caching

**`vm.Script` context:** Node.js globals are provided: `console`, `process`, `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `Buffer`, `URL`, `fetch`, `Error`, `Promise`, `JSON`, `Math`, `Date`, `Object`, `Array`, `String`, `Number`, `Boolean`, `RegExp`, `Map`, `Set`, `Symbol`, `parseInt`, `parseFloat`, `isNaN`, `isFinite`, `require`.

### CLI changes: `src/cli.js`

- `kimchi run file.km` → uses `KimchiInterpreter.run()`
- `kimchi file.km` → same (default command when given a file)
- Piped stdin with no args → uses `KimchiInterpreter.runStdin()`
- `kimchi cache clear` → deletes `.kimchi-cache/` directory

### Cache details

**Location:** `.kimchi-cache/` in the project root (found by walking up to `project.static` or `package.json`).

**Invalidation:** Hash-based. Changed source = new hash = new cache entry. Old entries are orphaned.

**Cache files are self-contained:** Runtime (`_obj`, `error`, prototype extensions) is inlined. No dependency on `kimchi-runtime.js`. This means cached scripts work standalone.

## What Does NOT Change

- `kimchi compile` — still transpiles to `.js` files with runtime import (for projects that want compiled output)
- `kimchi test` — unchanged
- `kimchi lsp` — unchanged
- The compiler pipeline (lexer, parser, typechecker, linter, generator) — unchanged
