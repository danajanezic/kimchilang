# Generators

[Back to README](../README.md) | [Language Guide](language-guide.md)

Generators are lazy, pausable sequences. A `gen` block returns a next-function — a plain callable that yields one value per call, suspending between calls. When exhausted, it returns `done`.

## Basic Usage

```kimchi
dec pull = gen {
  yield 1
  yield 2
  yield 3
}

pull()          // 1
pull()          // 2
pull()          // 3
pull()          // done
pull() is done  // true
```

No iterator protocol, no `.next()`, no `{ value, done }` wrappers. Just call the function.

## Parameters

Arguments bind at creation. For reusable generators, wrap in a function:

```kimchi
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

`gen` can also take parameters directly:

```kimchi
dec pull = gen (max) {
  mut i = 0
  while i < max {
    yield i
    i += 1
  }
}
```

## The `done` Primitive

`done` is a keyword like `null` or `true`. Exhausted generators return it. Check with `is done` or `is Type.Done`:

```kimchi
dec val = pull()

// keyword form
val is done
val is not done

// enum form
val is Type.Done

// guard
guard val is not done else { return }

// match
match pull() {
  v is done => "exhausted"
  v => "got: ${v}"
}
```

## for...in

Generators are iterable. `for...in` consumes them automatically:

```kimchi
for val in range(1, 6) {
  print val
}

// inline gen
for val in gen { yield "a"; yield "b" } {
  print val
}
```

## Yield as Expression

`yield` returns what the caller passes in on the next call:

```kimchi
dec pull = gen {
  mut val = yield "ready"
  yield val + 1
}

pull()    // "ready"
pull(10)  // 11
```

## Pipe Composition

Piping a generator through functions returns a new lazy generator:

```kimchi
fn double(x) { return x * 2 }

dec doubled = range(1, 4) ~> double
doubled()  // 2
doubled()  // 4
doubled()  // 6
doubled()  // done
```

Each transform is applied per-value, on demand. The result is itself a generator — composable further and iterable with `for...in`.

## Async Generators

Async is auto-detected. If the gen body contains async operations (`sleep`, `shell`, `spawn`, `collect`), it compiles to `async function*` transparently:

```kimchi
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
```

The consumer doesn't need to know it's async. `for...in` works the same way.

## Type Checking

`is Type.Generator` detects generator next-functions:

```kimchi
dec pull = gen { yield 1 }
pull is Type.Generator  // true
42 is Type.Generator    // false
```

## Constraints

- `yield` can only appear inside a `gen` block (linter error otherwise)
- `gen` blocks without `yield` trigger a linter warning
- Parameterized generators (`gen (args)`) must be called with arguments before `for...in` iteration
- Generators are stateful — each call advances the sequence. Multiple consumers from the same generator share state
