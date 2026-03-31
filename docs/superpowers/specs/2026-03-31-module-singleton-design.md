# Module Singleton Caching Design

## Overview

Add a `module` directive system to KimchiLang, starting with `module singleton`. Singleton modules are instantiated once — subsequent `dep` imports return the cached instance. This solves the problem of shared stateful resources (database pools, service connections) being duplicated across modules.

## Module directives

A general-purpose directive system using the `module` keyword at the top of a file:

```kimchi
module singleton

arg connectionString
dep logger stdlib.logger

dec pool = Pool.new({url: connectionString})
expose fn query(sql) { return pool.query(sql) }
```

Directives must appear before any `dep`, `arg`, `env`, or code.

### Directive: singleton (this spec)

`module singleton` — the module factory is called once. All subsequent imports get the cached instance.

### Future directives (not implemented now)

- `module pure` — compile-time check that the module is side-effect-free. Errors on `env`, `shell`, `spawn`, `sleep`, `print`, module-level `mut`, or `module singleton`. Enables tree-shaking in frontend builds.
- `lazy dep` — consumer-side modifier on `dep` imports. Defers factory call until first access. Orthogonal to `singleton` (lazy controls when, singleton controls how many times).
- `@annotations` — reserved for function-level annotations (future feature). Not part of the module directive system.

## Singleton semantics

### Producer declares, consumer is unaware

The module author adds `module singleton`. Consumers use `as db dep myapp.db` as normal — they don't know or care whether the module is singleton.

### Cache mechanism

Currently, `as db dep myapp.db` compiles to:

```javascript
const db = _opts["myapp.db"] || await _dep_db();
```

For singleton modules, the generator emits a cache check on the factory function:

```javascript
const db = _opts["myapp.db"] || _dep_db._cached || (_dep_db._cached = await _dep_db());
```

The cache lives on the factory function object itself. This means:
- First call creates the instance and stores it on `_dep_db._cached`
- Subsequent calls return the cached instance
- No global registry — cache is scoped to the module import
- Each consuming module independently finds the same cache (because they import the same factory function object)

### Dependency injection bypasses cache

```kimchi
// In tests — override always wins
as db dep myapp.db({"myapp.db": mockDb})
```

The `_opts["myapp.db"]` check comes first, so overrides bypass the singleton cache. Testing is unaffected.

### Singleton with args

If a singleton module has `arg` declarations:

```kimchi
module singleton
!arg connectionString
```

The first caller's args "win" — they're used to create the single instance. Subsequent imports ignore their args (the cached instance is returned). This matches how database pools work in practice: one connection string, shared everywhere.

If args differ between callers, this is a configuration error. The module author should document that args are set once.

### What the generator needs to know

When compiling a `dep` statement, the generator must know whether the target module has `module singleton`. Two approaches:

**For single-file compilation:** The generator can't know. Emit the standard factory call. Singleton caching is only active when the dep module itself is compiled with the directive — the cache check is on the factory function.

**Key insight:** The singleton cache doesn't require the *consumer's* generator to change. It requires the *producer's* compiled output to include self-caching logic. When a module declares `module singleton`, its compiled factory function caches its own result:

```javascript
// db.km compiled (with module singleton)
let _singletonCache;
export default async function(_opts = {}) {
  if (_singletonCache) return _singletonCache;
  
  // ... normal module body ...
  const result = { query, connect, disconnect };
  _singletonCache = result;
  return result;
}
```

This is simpler — the consumer's code doesn't change at all. The producer's factory function is idempotent.

Note: `_opts` overrides still need to work for testing. If `_opts` has any dep overrides, skip the cache:

```javascript
let _singletonCache;
export default async function(_opts = {}) {
  const hasOverrides = Object.keys(_opts).length > 0;
  if (_singletonCache && !hasOverrides) return _singletonCache;
  
  // ... normal module body ...
  const result = { query, connect, disconnect };
  if (!hasOverrides) _singletonCache = result;
  return result;
}
```

## AST

```
{
  type: "ModuleDirective",
  directive: "singleton"
}
```

## Compiler pipeline

### Lexer

Add `MODULE` keyword token: `MODULE: 'MODULE'` and `'module': TokenType.MODULE`.

### Parser

Parse `module <identifier>` as `ModuleDirective` in `parseStatement`. Must appear at the top level. The identifier value is the directive name (e.g., `"singleton"`). Unknown directives produce a parse error.

Recognized directives: `singleton`. Others are future.

### Type checker

No changes — singleton is a code generation concern, not a type concern.

### Generator

In `visitProgram`, check if the AST body contains a `ModuleDirective` with `directive === "singleton"`. If so:

1. Emit `let _singletonCache;` before the `export default async function`
2. At the top of the factory function body, emit the cache check:
   ```javascript
   const _hasOverrides = Object.keys(_opts).length > 0;
   if (_singletonCache && !_hasOverrides) return _singletonCache;
   ```
3. At the end of the factory function body (before the return), emit:
   ```javascript
   if (!_hasOverrides) _singletonCache = { ...exports };
   ```

### Linter

No changes.

## Interaction with other features

- **Dependency injection:** Overrides bypass cache (existing `_opts` check takes priority)
- **`module pure` (future):** Mutually exclusive with `module singleton` — singleton implies stateful sharing
- **`lazy dep` (future):** Orthogonal. Lazy controls when the factory is called; singleton controls how many times. A lazy import of a singleton module works correctly.
- **Extern declarations:** Not affected. Extern is for JS modules, not KimchiLang module factories.
