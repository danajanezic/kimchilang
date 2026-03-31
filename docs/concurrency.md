# Concurrency & Parallel Computation

[Back to README](../README.md) | [Language Guide](language-guide.md)

## Concurrency (I/O)

Three primitives for concurrent execution. All must be inside `async fn` and implicitly await.

### collect — fail fast (Promise.all)

```kimchi
async fn main() {
  // Bare function references
  dec [users, posts] = collect [fetchUsers, fetchPosts]

  // With arguments using bind syntax
  dec [a, b] = collect [fetchUser.(1), fetchUser.(2)]
}
```

If any callable rejects, `collect` rejects immediately.

### hoard — get everything (Promise.allSettled)

```kimchi
async fn main() {
  dec results = hoard [api1, api2]

  // Each result has { status, value/error }
  // status is STATUS.OK or STATUS.REJECTED
  match results[0] {
    { status: is STATUS.OK } => print results[0].value
    { status: is STATUS.REJECTED } => print results[0].error
  }
}
```

The `STATUS` enum is auto-emitted (tree-shaken) when `hoard` is used.

### race — first to finish wins (Promise.race)

```kimchi
async fn main() {
  dec winner = race [fast.(url1), fast.(url2)]
}
```

### Bind Syntax

`fn.(args)` creates a deferred call — bundles a function with its arguments without invoking it:

```kimchi
dec bound = fetchUser.(1)          // () => fetchUser(1)
dec [a, b] = collect [fetch.(1), fetch.(2)]
```

Inside `collect`/`hoard`/`race`, bind expressions are inlined as direct calls for efficiency.

## Parallel Computation

### worker — CPU-bound threads

Run KimchiLang code on a separate `worker_threads` thread. Data is serialized in/out — no shared memory. Only explicitly passed inputs are available inside the worker body.

```kimchi
async fn main() {
  dec result = worker(data) {
    return expensiveComputation(data)
  }
  print result
}
```

Workers with `collect` for parallel computation:

```kimchi
async fn main() {
  dec [a, b] = collect [
    worker(chunk1) { return process(chunk1) },
    worker(chunk2) { return process(chunk2) }
  ]
}
```

### spawn — non-blocking child processes

Like `shell` but non-blocking. Raw shell text with `$var` interpolation. Returns a Promise resolving to `{ stdout, stderr, exitCode, pid }`.

```kimchi
async fn main() {
  dec result = spawn { ls -la }
  print result.stdout
  print result.pid
}

// With input variables
async fn main() {
  dec result = spawn(dir) { ls $dir }
  print result.stdout
}

// Parallel spawns
async fn main() {
  dec [tests, lint] = collect [
    spawn { npm test },
    spawn { npm run lint }
  ]
}
```

## Constraints

- `collect`, `hoard`, `race`, `worker`, and `spawn` must be inside an `async fn` — compile-time error otherwise.
- All five implicitly `await` — no `await` keyword needed.
- `worker` body: only inputs are in scope. Explicit `return` required.
- `spawn` body: raw shell text, variable interpolation via `$name`.
- Functions containing `worker` or `spawn` are automatically made `async`.
