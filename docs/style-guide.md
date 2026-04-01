# KimchiLang Style Guide

[Back to README](../README.md) | [Language Guide](language-guide.md)

This documents the default linting rules enforced by `kimchi lint` and the formatting conventions that `kimchi fmt` will apply.

## Formatting Rules

### Indentation

- **2 spaces** per indent level. No tabs.
- Each `{` increases indent, each `}` decreases indent.
- Rule: `indent` (warning)

```kimchi
// Good
fn greet(name) {
  if name != null {
    return "hello " + name
  }
  return "hello"
}

// Bad — 4 spaces
fn greet(name) {
    if name != null {
        return "hello " + name
    }
}

// Bad — tabs
fn greet(name) {
	return "hello"
}
```

### No trailing whitespace

- Lines must not end with spaces or tabs.
- Rule: `no-trailing-spaces` (warning)

### No tabs

- Use spaces, not tabs.
- Rule: `no-tabs` (warning)

### Blank line after functions

- A blank line is expected after each function declaration.
- Rule: `newline-after-function` (info)

```kimchi
// Good
fn add(a, b) {
  return a + b
}

fn multiply(a, b) {
  return a * b
}

// Bad — no blank line between functions
fn add(a, b) {
  return a + b
}
fn multiply(a, b) {
  return a * b
}
```

### Blank line after shebang

- If a file starts with `#!/usr/bin/env kimchi`, a blank line must follow it.
- Rule: `newline-after-shebang` (info)

```kimchi
// Good
#!/usr/bin/env kimchi

fn main() { ... }

// Bad — no blank line
#!/usr/bin/env kimchi
fn main() { ... }
```

### No multiple empty lines

- Maximum 1 consecutive empty line.
- Rule: `no-multiple-empty-lines` (info)

### Max line length

- Disabled by default. Can be enabled with a limit (e.g., 120 characters).
- Rule: `max-line-length` (warning, disabled)

## Code Quality Rules

### Unused variables

- Variables declared with `dec` or `mut` that are never read.
- Variables starting with `_` are exempt.
- Rule: `unused-variable` (warning)

```kimchi
// Warning: 'temp' is declared but never used
dec temp = 42
print "hello"

// OK — underscore prefix suppresses warning
dec _unused = 42
```

### Unused functions

- Functions declared but never called.
- Exposed functions and functions starting with `_` are exempt.
- Rule: `unused-function` (warning)

```kimchi
// Warning: 'helper' is declared but never used
fn helper() { return 1 }

// OK — exposed
expose fn api() { return 1 }

// OK — underscore prefix
fn _internal() { return 1 }
```

### Unreachable code

- Code after a `return`, `throw`, or `break` statement.
- Rule: `unreachable-code` (warning)

```kimchi
fn example() {
  return 1
  print "never runs"  // Warning: unreachable code
}
```

### Empty blocks

- Block statements `{ }` with no content.
- Rule: `empty-block` (info)

### Constant conditions

- `if`/`while` conditions that are always true or false.
- Rule: `constant-condition` (warning)

```kimchi
// Warning: condition is always true
if true {
  print "always"
}

// Warning: infinite loop
while true {
  print "forever"
}
```

### Duplicate object keys

- Object literals with the same key declared twice.
- Rule: `duplicate-key` (error)

```kimchi
// Error: duplicate key 'name'
dec obj = {
  name: "Alice",
  age: 30,
  name: "Bob"
}
```

### Variable shadowing

- A variable in an inner scope that has the same name as one in an outer scope.
- Rule: `shadow-variable` (warning)

```kimchi
dec name = "Alice"
fn greet() {
  dec name = "Bob"  // Warning: 'name' shadows outer variable
  return name
}
```

### Mut never reassigned

- A `mut` variable that is never reassigned — should be `dec` instead.
- Rule: `mut-never-reassigned` (warning)

```kimchi
// Warning: 'count' is declared as mut but never reassigned
mut count = 0
print count
```

## Rule Configuration

Rules can be configured via the `Linter` options:

```javascript
new Linter({
  rules: {
    'indent': true,
    'max-line-length': true,
    'missing-return': true,
  },
  severity: {
    'unused-variable': 'error',
  },
  indentSize: 2,
  maxLineLength: 120,
})
```

## Summary

| Rule | Default | Severity | Auto-fixable |
|------|---------|----------|-------------|
| `indent` | on | warning | yes |
| `no-tabs` | on | warning | yes |
| `no-trailing-spaces` | on | warning | yes |
| `newline-after-function` | on | info | yes |
| `newline-after-shebang` | on | info | yes |
| `no-multiple-empty-lines` | on | info | yes |
| `max-line-length` | off | warning | no |
| `unused-variable` | on | warning | no |
| `unused-function` | on | warning | no |
| `unreachable-code` | on | warning | no |
| `empty-block` | on | info | no |
| `constant-condition` | on | warning | no |
| `duplicate-key` | on | error | no |
| `shadow-variable` | on | warning | no |
| `mut-never-reassigned` | on | warning | no |
| `missing-return` | off | info | no |
| `no-console` | off | — | no |

Rules marked "auto-fixable" can be automatically corrected by `kimchi fmt`.
