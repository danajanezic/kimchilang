# Generators Design

## Overview

Generators are lazy, pausable sequences. A `gen` block returns a next-function — a plain callable that yields one value per call, suspending between calls. When exhausted, it returns `done`, a new primitive type.

No iterator protocol, no `.next()`, no `{ value, done }` wrapper objects. Just a function you call.

## Design Decisions

- **`gen` is a directive block** — like `worker` or `spawn`, not a function modifier
- **`yield` is a keyword** — explicit suspension point, not inferred. Kept because it carries real intent (unlike `async` which was redundant)
- **`yield` is an expression** — receives values from the caller on resume, enabling coroutines and state machines
- **`done` is a new primitive keyword** — like `null`, `true`, `false`. Checked with `is Type.Done`. Solves the null ambiguity (generators can yield `null` without confusion)
- **Lazy evaluation** — each `yield` suspends execution until the next call. Memory-efficient for large/infinite sequences
- **Args bind at creation** — `gen (args) { }` returns a next-function directly, not a factory. Reusable generators wrap in `fn`
- **Pipes return lazy generators** — `next ~> double ~> toString` builds a lazy transform chain, not eager collection
- **Async auto-detected** — if the body yields async expressions, compiles to `async function*` transparently

## Syntax

### Basic generator

```
dec pull = gen {
  yield 1
  yield 2
  yield 3
}

pull()  // 1
pull()  // 2
pull()  // 3
pull()  // done
```

### Generator with arguments

Arguments bind at creation. The block returns a next-function directly.

```
dec pull = gen (max) {
  mut i = 0
  while i < max {
    yield i
    i += 1
  }
}

pull()  // 0
pull()  // 1
pull()  // ...
pull()  // done
```

### Yield as expression (receiving values)

`yield` returns what the caller passes in on the next call.

```
dec pull = gen {
  mut val = yield "ready"
  val = yield val + 1
  yield val + 1
}

pull()    // "ready"
pull(10)  // 11
pull(20)  // 21
pull()    // done
```

### Reusable generator (wrap in function)

```
fn range(start, end) {
  return gen {
    mut i = start
    while i < end {
      yield i
      i += 1
    }
  }
}

dec pull = range(0, 5)
pull()  // 0
pull()  // 1
```

## The `done` Primitive

A new primitive type representing generator exhaustion. Part of the language alongside `null`, `true`, `false`.

### Type checking

```
// Generator type
pull is Type.Generator  // true

// Done — both forms work
dec val = pull()
val is done             // shorthand (keyword)
val is Type.Done        // explicit (enum)
val is not done         // negated
```

### Composes with existing primitives

**guard:**
```
dec val = pull()
guard val is not done else { return }
```

**match:**
```
match pull() {
  v is done => "exhausted"
  v => "got " + v
}
```

**for...in:**
```
for val in pull {
  print val
}
```

`for...in` calls the next-function until `done`. No manual checking needed.

### Compilation

`done` compiles to a unique frozen sentinel:

```javascript
const DONE = Object.freeze(Symbol("done"));
```

Tree-shaken — only emitted when the program uses `gen` or `done`.

`is Type.Done` compiles to `=== DONE`.

## Pipe Composition

Piping a generator through functions returns a new lazy generator. Each transform is applied per-value, on demand.

```
dec pull = gen { yield 1; yield 2; yield 3 }
dec doubled = pull ~> double

doubled()  // 2
doubled()  // 4
doubled()  // 6
doubled()  // done
```

Pipes chain further:

```
dec pull = gen { yield 1; yield 2; yield 3 }
dec strs = pull ~> double ~> toString

strs()  // "2"
strs()  // "4"
```

Under the hood, `_pipe` detects when the first argument is a generator (next-function) and returns a new next-function that applies the remaining transforms lazily:

```javascript
// When first arg is a generator next-function:
function _pipe(gen, ...fns) {
  return function(sendValue) {
    let result = gen(sendValue);
    if (result === DONE) return DONE;
    for (const fn of fns) {
      result = fn(result);
    }
    return result;
  };
}
```

The pipe result is itself a next-function, so it composes further and works with `for...in`.

## for...in Integration

`for...in` already compiles to `for...of`. Generator next-functions need to be iterable. The compiled next-function has `Symbol.iterator` attached:

```javascript
function makeGenerator(genFn) {
  const iter = genFn();
  const next = function(sendValue) {
    const result = iter.next(sendValue);
    return result.done ? DONE : result.value;
  };
  next[Symbol.iterator] = function() {
    return {
      next() {
        const value = next();
        return value === DONE
          ? { value: undefined, done: true }
          : { value, done: false };
      }
    };
  };
  return next;
}
```

This means `for val in pull` works naturally — the `for...of` loop consumes the iterator protocol under the hood, but the user never sees it.

## Async Generators

Async is auto-detected, consistent with how KimchiLang handles all async code. If the generator body contains async operations (`sleep`, `shell`, `spawn`, `collect`, calls to async functions), it compiles to `async function*`.

```
fn fetchPages(url) {
  return gen {
    mut page = 1
    mut hasMore = true
    while hasMore {
      dec result = fetch(url + "?page=" + page)
      hasMore = result.hasNext
      page += 1
      yield result.data
    }
  }
}

dec pull = fetchPages("/api/users")
```

The consumer doesn't need to know it's async. The next-function returns values (the runtime `await`s internally). `for...in` works the same way — the compiled output uses `for await...of` when the generator is async.

### Async detection rules

A `gen` block is async if its body contains:
- `sleep`
- `shell` / `spawn`
- `collect` / `hoard` / `race`
- Calls to functions known to be async
- `yield` of an async expression

Added to the existing `buildAsyncMap()` propagation pass in the generator.

## Compilation

### Source

```
dec pull = gen (max) {
  mut i = 0
  while i < max {
    yield i
    i += 1
  }
}
```

### Compiled output

```javascript
const DONE = Object.freeze(Symbol("done"));

const pull = (() => {
  const _gen = function* (_max) {
    let i = 0;
    while (i < _max) {
      yield i;
      i += 1;
    }
  };
  const _iter = _gen(max);
  const _next = function (_sendValue) {
    const _result = _iter.next(_sendValue);
    return _result.done ? DONE : _result.value;
  };
  _next[Symbol.iterator] = function () {
    return {
      next() {
        const value = _next();
        return value === DONE
          ? { value: undefined, done: true }
          : { value, done: false };
      }
    };
  };
  return _next;
})();
```

### Async variant

If async is detected, `function*` becomes `async function*`, `_iter.next()` becomes `await _iter.next()`, and the next-function becomes async. `Symbol.asyncIterator` is attached instead of `Symbol.iterator`.

## Compiler Changes

### Lexer

New tokens:
- `TokenType.GEN` — keyword `gen`
- `TokenType.YIELD` — keyword `yield`
- `TokenType.DONE` — keyword `done`

### Parser

New AST nodes:
- `NodeType.GeneratorExpression` — `{ params, body }`, the `gen (args) { }` block
- `NodeType.YieldExpression` — `{ argument }`, the `yield expr` expression. `argument` is null for bare `yield`

`yield` is parsed as a unary-prefix expression with low precedence (below assignment).

`done` is parsed as a literal, similar to `null`.

### Type Checker

- `gen` block inferred as type `generator` — a new primitive type alongside `string`, `number`, etc.
- `is Type.Generator` check detects generator next-functions
- `yield` expression type is `any` (the received value from caller)
- `done` literal has type `Done`
- `is Type.Done` check supported alongside existing `is Type.String`, etc.

### Generator (Code Emitter)

- `GeneratorExpression` compiles to the IIFE wrapper shown above
- `YieldExpression` compiles to `yield` inside the inner `function*`
- `done` literal compiles to `DONE` sentinel reference
- `DONE` sentinel emitted (tree-shaken) when AST contains `GeneratorExpression` or `done` literal
- Async detection extended to recognize `gen` blocks and propagate async through yield expressions
- `_pipe` runtime helper extended to detect generator next-functions and return lazy wrappers

### Linter

- Warn if `yield` appears outside a `gen` block
- Warn if `gen` block contains no `yield` (probably meant to be a plain function)

## Precedent

**Lua** — `for...in` consumes a plain function, `nil` means done. KimchiLang's design is similar but adds `yield` syntax (Lua requires manual closure state) and `done` instead of `nil` (avoids null ambiguity).

## Not Included

- `yield*` delegation — may be added later if needed, but not in initial implementation
- Channel-based communication between generators — separate roadmap item for workers
- Generator return values (`return expr` inside gen) — generators yield sequences, `return` just ends the generator (becomes `done`)
