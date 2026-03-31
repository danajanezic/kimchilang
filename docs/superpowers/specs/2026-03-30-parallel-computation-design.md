# Parallel Computation Design

## Overview

Two primitives for parallel execution: `worker` for CPU-bound code on a separate thread, and `spawn` for non-blocking child processes. Both return Promises, work with `collect`/`hoard`/`race`, and must be inside `async fn` (enforced at compile time, implicit await).

## worker

### Syntax

```
dec result = worker(arg1, arg2) {
  // KimchiLang code — compiled to JS, run in worker_thread
  return heavyCompute(arg1, arg2)
}
```

### Semantics

- Inputs passed explicitly via `worker(arg1, arg2) { ... }` — only those variables are accessible inside the body. No outer scope capture.
- Body is compiled KimchiLang code (not raw text like `shell`/`spawn`).
- Explicit `return` for the result value.
- Returns a Promise — resolves with the returned value, rejects on error.
- Data serialized in/out via structured clone. No functions, no shared memory.
- Must be inside `async fn` — compile-time error otherwise.
- Implicit `await` — no `await` keyword needed in KimchiLang source.

### Usage examples

```
// Basic CPU-bound work
async fn main() {
  dec result = worker(data) {
    return expensiveComputation(data)
  }
  print result
}

// With collect for parallel workers
async fn main() {
  dec [a, b] = collect [
    worker(chunk1) { return process(chunk1) },
    worker(chunk2) { return process(chunk2) }
  ]
}

// No inputs
async fn main() {
  dec result = worker() {
    return fibonacci(40)
  }
}
```

### Compilation

```
// KimchiLang
dec result = worker(x, y) {
  return x * y
}

// JavaScript
const result = await _worker(function(x, y) { return x * y; }, [x, y]);
```

The generator compiles the worker body into a function literal. The `_worker` runtime helper serializes the arguments, creates a `worker_threads.Worker` with the function, and returns a Promise.

### Runtime helper: _worker

Tree-shaken — only emitted when `WorkerExpression` is in the AST.

```javascript
async function _worker(fn, args) {
  const { Worker, isMainThread, parentPort, workerData } = await import("worker_threads");
  if (!isMainThread) {
    const result = fn(...workerData.args);
    parentPort.postMessage(result);
    return;
  }
  return new Promise((resolve, reject) => {
    const code = `
      const { parentPort, workerData } = require("worker_threads");
      const fn = ${fn.toString()};
      try {
        const result = fn(...workerData.args);
        parentPort.postMessage({ value: result });
      } catch (e) {
        parentPort.postMessage({ error: e.message });
      }
    `;
    const worker = new Worker(code, { eval: true, workerData: { args } });
    worker.on("message", (msg) => {
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg.value);
    });
    worker.on("error", reject);
    worker.on("exit", (exitCode) => {
      if (exitCode !== 0) reject(new Error(`Worker exited with code ${exitCode}`));
    });
  });
}
```

## spawn

### Syntax

```
dec result = spawn { find . -name "*.km" }
```

With input variables:

```
dec result = spawn(dir, ext) { find $dir -name "*.$ext" }
```

### Semantics

- Raw shell text between braces — same capture mechanism as `shell`.
- Supports input variable interpolation via `$name` — same as `shell`.
- Returns a Promise that resolves to `{ stdout, stderr, exitCode, pid }`.
- Non-blocking — unlike `shell` (which uses `exec` and awaits immediately), `spawn` uses `child_process.spawn` for streaming execution.
- Must be inside `async fn` — compile-time error otherwise.
- Implicit `await` — no `await` keyword needed in KimchiLang source.

### Usage examples

```
// Basic non-blocking process
async fn main() {
  dec result = spawn { ls -la }
  print result.stdout
  print result.pid
}

// With input variables
async fn main() {
  dec result = spawn(pattern) { grep -r "$pattern" src/ }
  print result.stdout
}

// Parallel spawns with collect
async fn main() {
  dec [tests, lint] = collect [
    spawn { npm test },
    spawn { npm run lint }
  ]
}
```

### Compilation

```
// KimchiLang
dec result = spawn { ls -la }
dec result2 = spawn(dir) { ls $dir }

// JavaScript
const result = await _spawn("ls -la");
const result2 = await _spawn("ls $dir", { dir });
```

### Runtime helper: _spawn

Tree-shaken — only emitted when `SpawnBlock` is in the AST.

```javascript
async function _spawn(command, inputs = {}) {
  const { spawn } = await import("child_process");
  let cmd = command;
  for (const [key, value] of Object.entries(inputs)) {
    cmd = cmd.replace(new RegExp("\\$" + key + "\\b", "g"), String(value));
  }
  return new Promise((resolve, reject) => {
    const proc = spawn("sh", ["-c", cmd]);
    let stdout = "", stderr = "";
    proc.stdout.on("data", (d) => stdout += d);
    proc.stderr.on("data", (d) => stderr += d);
    proc.on("error", reject);
    proc.on("close", (exitCode) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: exitCode || 0, pid: proc.pid });
    });
  });
}
```

## AST nodes

### WorkerExpression

```
{
  type: "WorkerExpression",
  inputs: ["x", "y"],         // parameter names
  body: BlockStatement,        // compiled KimchiLang body
  line: number,
  column: number
}
```

### SpawnBlock (reuses shell pattern)

```
{
  type: "SpawnBlock",
  inputs: ["dir"],             // parameter names (optional)
  command: "ls $dir",          // raw shell string
  line: number,
  column: number
}
```

`SpawnBlock` mirrors `ShellBlock` in structure. The only difference is in the generator: `ShellBlock` emits `await _shell(...)`, `SpawnBlock` emits `await _spawn(...)`.

## Compiler pipeline changes

### Lexer

Add two tokens: `SPAWN: 'SPAWN'` and `SPAWN_CONTENT: 'SPAWN_CONTENT'`. The `SPAWN` keyword triggers the same raw-content capture as `SHELL` (brace-matching, preserving shell syntax). No new token needed for `worker` — it reuses the existing `WORKER` keyword token... actually, `worker` is not yet a keyword. Add `WORKER: 'WORKER'` token. Worker body is regular KimchiLang, tokenized normally (no raw capture).

New tokens:
- `WORKER: 'WORKER'` + keyword `'worker': TokenType.WORKER`
- `SPAWN: 'SPAWN'` + keyword `'spawn': TokenType.SPAWN`
- `SPAWN_CONTENT: 'SPAWN_CONTENT'` (raw shell text, like `SHELL_CONTENT`)

### Parser

- Parse `worker(args) { body }` as `WorkerExpression`. Body is parsed as a regular block (like a function body). Inputs parsed like `shell(args)` — optional parenthesized identifier list.
- Parse `spawn { command }` / `spawn(args) { command }` as `SpawnBlock`. Same raw-capture pattern as `ShellBlock`.
- Both can appear as expressions (for `dec x = worker/spawn ...`) and statements.

### Type checker

- `WorkerExpression`: enforce `_insideAsync`. Visit body in an isolated scope containing only the input parameters. Return type: Promise (represented as `Type.Any` since worker return type is dynamic).
- `SpawnBlock`: enforce `_insideAsync`. Opaque like `ShellBlock` — no type analysis of command string.

### Generator

- `WorkerExpression`: compile body to a function literal, emit `await _worker(function(inputs) { body }, [inputs])`.
- `SpawnBlock`: emit `await _spawn("command")` or `await _spawn("command", { inputs })`. Mirrors `visitShellBlock`.
- Tree-shake: emit `_worker` helper only when `WorkerExpression` in AST. Emit `_spawn` helper only when `SpawnBlock` in AST.

### Linter

No new rules needed.

## Interaction with concurrency primitives

Both `worker` and `spawn` return Promises and use implicit await. When used inside `collect`/`hoard`/`race` arrays, they become concurrent operations:

```
// Workers in collect — parsed as expressions inside the array
dec [a, b] = collect [
  worker(chunk1) { return process(chunk1) },
  worker(chunk2) { return process(chunk2) }
]
```

Since `collect`/`hoard`/`race` array elements are parsed with `parseCall()`, and `worker`/`spawn` will be parsed in `parsePrimary()`, they naturally compose. The concurrency generator will invoke them (wrapping in a function call or directly) alongside identifiers and bind expressions.

Note: inside `collect`/`hoard`/`race` arrays, `worker` and `spawn` expressions should NOT be auto-awaited — the concurrency primitive handles the awaiting. The generator should emit `worker`/`spawn` without `await` when they appear as elements of a `ConcurrentExpression`.
