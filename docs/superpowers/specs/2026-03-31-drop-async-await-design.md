# Drop async/await Design

## Overview

Remove `async` and `await` keywords from KimchiLang syntax. The compiler auto-detects which functions are async via call-graph analysis and inserts `async`/`await` in the generated JavaScript automatically. The user writes plain functions and plain calls — the compiler figures out the rest.

This is the final step in the async simplification journey. The concurrency primitives (`collect`, `hoard`, `race`, `worker`, `spawn`) already use implicit await. Now all async operations become implicit.

## Before and after

### Before

```kimchi
async fn fetchUser(id) {
  dec response = await http.get("/users/${id}")
  return response.body
}

async fn main() {
  dec user = await fetchUser(1)
  dec [a, b] = collect [fetchUser.(1), fetchUser.(2)]
  print user.name
}
```

### After

```kimchi
fn fetchUser(id) {
  dec response = http.get("/users/${id}")
  return response.body
}

fn main() {
  dec user = fetchUser(1)
  dec [a, b] = collect [fetchUser.(1), fetchUser.(2)]
  print user.name
}
```

Both produce identical JavaScript output — the compiler inserts `async` and `await` automatically.

## Auto-detection algorithm

### Two-pass approach in the generator

**Pass 1 — Mark async functions (bottom-up, fixed-point):**

1. **Seed pass:** Mark functions that directly contain async operations:
   - `shell { }` blocks
   - `spawn { }` blocks
   - `worker(args) { }` expressions
   - `collect [...]` / `hoard [...]` / `race [...]` expressions
   - Calls to extern functions marked `async fn`

2. **Propagation pass:** Mark functions that call any async-marked function. A function is async if it calls another async function.

3. **Repeat** propagation until no new functions are marked (fixed-point iteration). In practice this converges in 2-3 passes for typical programs.

**Pass 2 — Generate code:**

1. Functions marked async emit `async function`.
2. Calls to async-marked functions emit `await fn(...)`.
3. `collect`/`hoard`/`race`/`shell`/`spawn`/`worker` emit `await` as before.
4. Arrow functions that contain or call async operations emit `async` prefix.

### What counts as "calling an async function"

- Direct call: `fetchUser(1)` where `fetchUser` is async-marked
- Method-style call on a dep: `http.get(url)` where `get` is async-marked in the dep's exports
- Pipe operator: `1 ~> fetchUser ~> enrichUser` — if any function in the chain is async, the pipe result needs await
- Flow operator: `processUser >> fetchUser enrichUser` — if any composed function is async, the flow function is async

### Limitations

- **Callbacks:** If you pass an async function as a callback to a sync function (e.g., `arr.map(asyncFn)`), the compiler cannot auto-await inside the callback. The user would need to use `collect` for parallel execution or restructure the code.
- **Dynamic calls:** If a function is stored in a variable and called dynamically, the compiler may not know it's async. It will be treated as sync unless the variable's type is known to be an async function.
- **Cross-module calls:** For dep imports, the compiler needs to know which exposed functions are async. This is determined by compiling the dependency first (which the module system already does).

## Extern async modifier

Extern declarations need a way to indicate which functions return Promises:

```kimchi
extern "pg" {
  async fn query(sql: string): any       // async — calls will be awaited
  async fn connect(): any                 // async
  fn escape(str: string): string          // sync — no await
  dec Pool: any                           // value — not callable
}

extern "node:fs" {
  fn readFileSync(path: string): string   // sync
}

extern "node:fs/promises" {
  async fn readFile(path: string): any    // async
}
```

The `async` modifier on extern `fn` tells the compiler that calling this function returns a Promise and the call site needs `await`.

### Parser changes for extern async

In `parseExternDeclaration`, when parsing a function inside an extern block, check for `ASYNC` before `FN`:

```
extern "mod" {
  async fn query(sql: string): any    // decl.async = true
  fn escape(str: string): string      // decl.async = false
}
```

Wait — we're removing the `ASYNC` token. Instead, recognize `async` as an identifier with value `"async"` before `fn` in extern blocks. Or: keep `ASYNC` as a token but only allow it in extern declarations, not in regular function declarations.

**Decision:** Keep the `ASYNC` token in the lexer but only allow it in extern blocks. Attempting `async fn` at the top level or inside a function produces a parse error: `"async/await keywords have been removed. The compiler auto-detects async functions."`. This gives a clear migration message while still supporting `async fn` in extern declarations where it's needed.

## What gets removed

### Lexer
- Keep `ASYNC` token (needed for extern `async fn`)
- Remove `AWAIT` token and `'await'` keyword mapping

### Parser
- Remove `AwaitExpression` from NodeType enum
- Remove the `if (this.check(TokenType.ASYNC))` block in `parseStatement` that handles `async fn` declarations. Replace with a parse error: `"async/await keywords have been removed. The compiler auto-detects async functions."`
- Remove await expression parsing from `parsePrimary`
- Add `async fn` support in extern declarations (decl.async field)

### Type checker
- Remove `_insideAsync` flag entirely
- Remove all `_insideAsync` checks for collect/hoard/race/worker/spawn — these no longer need the constraint since the compiler auto-detects async
- Remove `_insideAsync` save/restore in `visitFunctionDeclaration`

### Generator
- Replace `containsAsyncBlock()` with the two-pass auto-detection algorithm
- Remove `AwaitExpression` case from `visitExpression`
- Auto-insert `await` for calls to async-marked functions
- Auto-insert `async` on functions that are determined to be async
- Update arrow function generation with same auto-detection

### js2km reverse compiler
- Remove `async` prefix from function/arrow declarations
- Remove `await` expression handling

## Migration

### stdlib/http.km
Remove `async fn` and `await` from all functions:

```kimchi
// Before
expose async fn get(url, options) {
  return await request(url, { ...options, method: "GET" })
}

// After
expose fn get(url, options) {
  return request(url, { ...options, method: "GET" })
}
```

The `httpRequest` extern already doesn't use `async fn` (it's in a JS helper that returns a Promise). The compiler will detect that `request` calls `httpRequest` (async extern) → `request` is async → `get` calls `request` → `get` is async.

Wait — `httpRequest` is extern'd but not marked `async fn`. It needs to be:

```kimchi
extern "./_http_helpers.js" {
  async fn httpRequest(url: string, method: string, headers: any, body: any, timeout: number): HttpResponse
}
```

### examples/async_pipe.km
Remove all `async fn` and `await`:

```kimchi
fn fetchUser(id) {
  return { id: id, name: "User" + id }
}

fn main() {
  dec userInfo = 1 ~> fetchUser ~> enrichUser ~> formatUser
  print userInfo
}
```

Note: since `fetchUser`/`enrichUser`/`formatUser` in this example are actually synchronous (they don't do real I/O), they'll compile as sync functions. The pipe operator handles both sync and async seamlessly via the `_pipe` helper.

### Tests
- Remove all tests that check for `async fn` syntax acceptance
- Remove tests that check for `_insideAsync` enforcement
- Add tests verifying auto-detection:
  - Function containing `shell {}` compiles to `async function`
  - Function calling an async function compiles to `async function` with `await`
  - Function with no async operations compiles to regular `function`
  - Extern `async fn` calls are awaited
  - Transitive propagation works (A calls B calls shell → both A and B are async)

## Implementation order

1. Add `async fn` support to extern declaration parsing (parser)
2. Update extern `httpRequest` in stdlib to be `async fn`
3. Build the two-pass auto-detection in the generator
4. Remove `await` keyword and `AwaitExpression` from lexer/parser
5. Remove `async fn` from regular function declarations (keep in extern only)
6. Remove `_insideAsync` from type checker
7. Migrate stdlib and examples
8. Update tests
9. Update docs and roadmap
