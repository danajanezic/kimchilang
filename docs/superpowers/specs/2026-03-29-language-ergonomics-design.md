# KimchiLang Ergonomics Features — Design Spec

Six language features to improve writability, reduce nesting, and allow controlled mutation.

## Feature 1: `mut` Variables

### Syntax

```kimchi
mut x = 0
x = x + 1
```

### Scoping Rules

- Block-scoped — exists from declaration to end of enclosing `{ }`.
- Visible in all child blocks (for bodies, if bodies, match arms, etc.).
- **Cannot be captured by closures** — compile error if an arrow function or callback references a `mut` variable.
- **Cannot be returned** — the value is copied/frozen on return, not the binding.
- **Cannot be `expose`d** — module boundaries only see immutable values.

### Compiler Changes

- Lexer: new `MUT` token.
- Parser: new `MutDeclaration` node type (similar to `DecDeclaration` but flagged mutable).
- Type checker: tracks mutability in scope, enforces no-closure-capture rule.
- Linter: warns on `mut` variables that are never reassigned ("use `dec` instead").
- Generator: emits `let` instead of `const`, no `_deepFreeze` wrapper on assignment. Value is deep-frozen when it crosses a boundary (return, passed to a function that stores it).

### Reassignment

- `x = newValue` — plain reassignment only.
- No compound operators (`+=`, `-=`, `++`, `--`) in v1.
- Reassignment to a different type is allowed (dynamic typing, same as `dec`).

### Examples

Accumulator pattern:

```kimchi
fn sum(numbers) {
  mut total = 0
  for n in numbers {
    total = total + n
  }
  return total  // total is frozen on return
}
```

Closure capture is blocked:

```kimchi
fn bad() {
  mut count = 0
  dec increment = () => {
    count = count + 1  // COMPILE ERROR: cannot capture mut variable 'count' in closure
  }
}
```

---

## Feature 2: `??` Nullish Coalescing Operator

### Syntax

```kimchi
dec name = user.name ?? "Anonymous"
dec timeout = config.timeout ?? 5000
dec items = response.data ?? []
```

### Semantics

- `a ?? b` returns `a` if `a` is not `null` and not `undefined`, otherwise returns `b`.
- Short-circuit evaluation — `b` is not evaluated if `a` is non-nullish.
- Right-associative: `a ?? b ?? c` means `a ?? (b ?? c)`.

### Precedence

- Lower than comparison operators, higher than assignment.
- Same precedence level as JavaScript's `??`.
- Parentheses required when mixing with `&&` or `||` (compile error without them, matching JS behavior).

### Compiler Changes

- Lexer: new `NULLISH` token for `??`.
- Parser: parsed as `BinaryExpression` with `??` operator.
- Generator: emits JavaScript `??` directly — zero runtime overhead.

---

## Feature 3: `guard...else`

### Syntax

```kimchi
guard condition else { exit-statement }
```

### Rules

- The `else` block **must** contain a `return` or `throw` — the compiler enforces this. If the block doesn't exit the function, it's a compile error.
- `guard` is a statement, not an expression — it doesn't produce a value.
- Can appear anywhere inside a function body (not just at the top).

### Compiler Changes

- Lexer: new `GUARD` token.
- Parser: new `GuardStatement` node with `test` (condition) and `alternate` (the else block).
- Type checker: verifies the else block contains a `return` or `throw` on all paths.
- Generator: emits `if (!condition) { ...alternate }`.

### Examples

```kimchi
fn processOrder(order) {
  guard order != null else { return error("No order") }
  guard order.items.length > 0 else { return error("No items") }
  guard order.total > 0 else { throw ValidationError("Invalid total") }

  return submitOrder(order)
}
```

### What `guard` Does NOT Do

- No implicit variable binding (unlike Swift's `guard let x = ...`). KimchiLang has null-safe access and `??`, so optional unwrapping isn't needed.
- No `guard` without `else` — the `else` block is mandatory.

---

## Feature 4: `match` Expression

### Syntax

```kimchi
dec result = match subject {
  pattern => expression
  pattern => { block }
  _ => fallback
}
```

### Pattern Types

**1. Literal values** — numbers, strings, booleans:

```kimchi
dec msg = match status {
  200 => "OK"
  404 => "Not Found"
  500 => "Server Error"
  _ => "Unknown"
}
```

**2. `is` type matching** — uses existing `is` keyword:

```kimchi
dec response = match err {
  is NotFoundError => { status: 404, body: err.message }
  is AuthError => { status: 401, body: "Unauthorized" }
  _ => { status: 500, body: "Internal error" }
}
```

**3. Object destructuring** — matches shape and binds variables:

```kimchi
dec result = match response {
  { status: 200, data } => processData(data)
  { status: 404 } => handleNotFound()
  { error } => handleError(error)
  _ => defaultHandler()
}
```

**4. Array destructuring** — matches structure and binds elements:

```kimchi
dec label = match point {
  [0, 0] => "origin"
  [0, y] => "y-axis at ${y}"
  [x, 0] => "x-axis at ${x}"
  [x, y] => "point at ${x}, ${y}"
}
```

**5. Condition guards on arms** — `when` clause for additional filtering:

```kimchi
dec tier = match score {
  n when n >= 90 => "A"
  n when n >= 80 => "B"
  n when n >= 70 => "C"
  _ => "F"
}
```

### Semantics

- `match` is an **expression** — it returns the value of the matched arm.
- Arms are evaluated top-to-bottom, first match wins.
- `_` is the wildcard/default pattern.
- If no arm matches and there's no `_`, the expression evaluates to `null`.
- Variables bound in destructuring patterns are scoped to that arm only.
- `mut` variables from parent scopes are accessible and reassignable inside match arms.

### Compiler Changes

- Lexer: add keyword-level `MATCH_KEYWORD` token for `match` (distinct from the existing `MATCH` token used for the `~` regex operator). Add `WHEN` token for guard clauses.
- Parser: new `MatchBlock` node type (distinct from existing `MatchExpression` used for `~` regex matching). Contains `subject` and array of `MatchArm` nodes. Each arm has `pattern` (literal, `is` check, destructuring, or wildcard), optional `guard` (when clause), and `body`.
- Generator: compiles to an IIFE containing an `if`/`else if` chain. Destructuring patterns emit runtime shape-checking code. Bound variables become `const` declarations inside each arm.

### Example Compilation

```kimchi
dec result = match response {
  { status: 200, data } => processData(data)
  { status: 404 } => handleNotFound()
  _ => defaultHandler()
}
```

Compiles to:

```javascript
const result = _deepFreeze((() => {
  const _subject = response;
  if (_subject?.status === 200 && 'data' in _subject) {
    const data = _subject.data;
    return processData(data);
  } else if (_subject?.status === 404) {
    return handleNotFound();
  } else {
    return defaultHandler();
  }
})());
```

### Relationship to Existing `|cond| => {}` Syntax

- Existing pattern matching remains valid and unchanged.
- Conceptually, `|cond| => { body }` is equivalent to `match true { _ when cond => body }`.
- No deprecation — `|cond| => {}` is the right tool for quick conditional dispatch; `match` is the right tool for value-returning structural matching.

---

## Feature 5: `.if().else()` Expressions

### Syntax

```kimchi
value.if(condition)                    // returns value or null
value.if(condition).else(fallback)     // returns value or fallback
```

### Semantics

- `.if(condition)` — if condition is truthy, returns the receiver value. Otherwise returns `null`.
- `.else(fallback)` — chained after `.if()`, provides a fallback when condition was falsy.
- Works on any value type: numbers, strings, booleans, objects, arrays, function return values.

### Examples

```kimchi
dec bonus = 500.if(isManager)                          // 500 or null
dec label = "premium".if(vip).else("standard")         // "premium" or "standard"
dec discount = (price * 0.2).if(hasCoupon).else(0)     // expression as receiver
dec config = defaultConfig.if(useDefaults).else(customConfig)
```

### Composability

```kimchi
// With ??
dec timeout = savedTimeout.if(hasConfig) ?? 3000

// With pipes
dec result = data ~> transform ~> validate.if(shouldValidate)

// With match
dec tier = match score {
  n when n >= 90 => "gold"
  n when n >= 70 => "silver"
  _ => null
}
dec badge = "VIP".if(tier == "gold").else(tier)
```

### Compiler Changes

- Parser: `.if()` is parsed as a method call on any expression. When the parser sees `.if(`, it creates a `ConditionalMethodExpression` node with `receiver`, `condition`, and optional `fallback` (from `.else()`).
- Generator: `value.if(cond).else(fallback)` compiles to `(cond) ? value : fallback`. `value.if(cond)` alone compiles to `(cond) ? value : null`.
- Type checker: validates that the condition is an expression. No special type constraints on receiver or fallback.

### Limitations

- No `.elif()` chaining — use `match` for multi-branch value selection.
- No block bodies — both the receiver and fallback are single expressions.

---

## Feature Interaction: How They Work Together

### Decision Guide

| "I need to..." | Use |
|---|---|
| Check a precondition and bail out | `guard x else { return }` |
| Pick between two values on one line | `a.if(cond).else(b)` |
| Provide a default for a null value | `x ?? fallback` |
| Branch on the shape/type of a value | `match val { pattern => result }` |
| Quick conditional dispatch in a function | `\|cond\| => { body }` (existing) |
| Multi-line branching with side effects | `if`/`elif`/`else` (existing) |
| Accumulate or iterate with state | `mut x = 0; for ... { x = ... }` |

### Combined Example

```kimchi
fn processUsers(rawUsers) {
  guard rawUsers != null else { return [] }

  dec defaultRole = config.defaultRole ?? "viewer"

  mut results = []
  for user in rawUsers {
    dec role = match user {
      { isAdmin: true } => "admin"
      { department } => department.if(department == "eng").else(defaultRole)
      _ => defaultRole
    }
    results = [...results, { name: user.name, role: role }]
  }
  return results
}
```

### Out of Scope for v1

- No new looping constructs.
- No `Result`/`Option` types.
- No compound assignment (`+=`, `++`) for `mut`.
