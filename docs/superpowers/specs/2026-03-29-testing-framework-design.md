# KimchiLang Testing Framework Enhancements — Design Spec

Four enhancements to the built-in testing framework: lifecycle hooks, `.not` modifier, `.only`/`.skip` modifiers, and new matchers.

## Feature 1: Lifecycle Hooks

### Syntax

```kimchi
describe "Database" {
  beforeAll {
    dec db = connectToDb()
  }
  afterAll {
    db.close()
  }
  beforeEach {
    db.beginTransaction()
  }
  afterEach {
    db.rollback()
  }
  test "insert works" {
    expect(db.count()).toBe(1)
  }
}
```

### Semantics

- `beforeAll` / `afterAll` — run once before/after all tests in the enclosing `describe`.
- `beforeEach` / `afterEach` — run before/after each test in the enclosing `describe`.
- Hooks are scoped to their `describe` block. Nested `describe` blocks inherit parent hooks.
- Multiple hooks of the same type in one describe are allowed — they run in declaration order.
- All hooks are async.
- Hooks outside a `describe` block are a parse error.

### Compiler Changes

- Lexer: add `BEFORE_ALL`, `AFTER_ALL`, `BEFORE_EACH`, `AFTER_EACH` tokens. Keywords: `beforeAll`, `afterAll`, `beforeEach`, `afterEach`.
- Parser: new node types `BeforeAllBlock`, `AfterAllBlock`, `BeforeEachBlock`, `AfterEachBlock`. Each has only a `body` (block statement). Parsed in `parseStatement()`.
- Generator: emit `_beforeAll(async () => { ... })` etc.
- Runtime: `_describe` tracks hooks arrays on the describe context. `_runTests` calls `beforeAll` once before tests, `afterAll` once after, wraps each test in `beforeEach`/`afterEach`. Nested describes inherit parent hooks.

---

## Feature 2: `.not` Modifier

### Syntax

```kimchi
expect(status).not.toBe(404)
expect(name).not.toBeNull()
expect(items).not.toContain("banned")
```

### Semantics

- `.not` inverts any matcher. If the matcher would pass, `.not` makes it fail and vice versa.
- Works with all existing and new matchers.
- Error messages include "not" — e.g., `Expected 404 not to be 404`.

### Compiler Changes

- Parser: in `parseExpectStatement()`, after parsing `expect(value)` and consuming the `.`, check if the next token is an IDENTIFIER with value `not`. If so, consume it, expect another `.`, set `negated: true` on the node, then continue to parse the matcher.
- Generator: when `negated` is true, emit `_expect(actual).not.matcher(expected)`.
- Runtime: `_expect()` gains a `.not` property that returns a mirror object where every matcher's logic is inverted.

---

## Feature 3: `test.skip` / `test.only` / `describe.skip` / `describe.only`

### Syntax

```kimchi
test.only "critical path" {
  expect(login()).toBeTruthy()
}

test.skip "not yet implemented" {
  expect(futureFeature()).toBe(true)
}

describe.only "Auth module" {
  test "login works" { ... }
}

describe.skip "Legacy module" {
  test "old behavior" { ... }
}
```

### Semantics

- `test.skip` / `describe.skip` — registers but doesn't run. Reported as `○ name (skipped)`.
- `test.only` / `describe.only` — if any `.only` exists in the file, only `.only` items run. Everything else is implicitly skipped. File-scoped.
- `.skip` always wins — a skipped `.only` is still skipped.
- Tests inside `describe.only` all run (unless individually `.skip`ped).
- Tests inside `describe.skip` all skip.

### Compiler Changes

- Parser: after consuming `TEST` or `DESCRIBE` token, peek for DOT followed by IDENTIFIER `only` or `skip`. If found, consume both and set `modifier: 'only' | 'skip' | null` on the AST node.
- Generator: pass modifier to runtime — `_test("name", async () => { ... }, "only")`.
- Runtime: `_runTests` does two passes: (1) scan for any `.only` items, (2) run items respecting only/skip logic. Skipped tests print `○` and are counted separately.

### Output

```
Auth module
  ✓ login works
  ✓ logout works
  ○ not yet implemented (skipped)

3 tests, 2 passed, 0 failed, 1 skipped
```

---

## Feature 4: New Matchers

### Syntax

```kimchi
expect(result).toBeDefined()
expect(missing).toBeUndefined()
expect(3.14159).toBeCloseTo(3.14, 2)
expect(err).toBeInstanceOf(NotFoundError)
```

### Semantics

| Matcher | Arguments | Behavior |
|---------|-----------|----------|
| `toBeDefined()` | none | Passes if value is not `undefined` |
| `toBeUndefined()` | none | Passes if value is `undefined` |
| `toBeCloseTo(num, digits)` | number, optional precision (default 2) | Passes if `\|actual - num\| < 10^(-digits) / 2` |
| `toBeInstanceOf(type)` | error type | Passes if `actual._id === type._id` (KimchiLang `is` semantics) |

### Compiler Changes

- No parser or generator changes — these are handled by the existing generic matcher passthrough in `visitExpectStatement`.
- Runtime: add four new methods to the `_expect()` return object. All work with `.not`.

---

## What Does NOT Change

- Existing `test`, `describe`, `expect`, `assert` syntax — fully backward compatible.
- Existing 11 matchers — unchanged.
- `kimchi test` CLI command — unchanged.
- Dependency injection mocking via `dep` — unchanged.
