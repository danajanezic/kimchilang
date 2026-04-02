# Regex

[Back to README](../README.md)

KimchiLang has built-in regex support with three usage patterns: the match operator (`~`), regex patterns in `match` expressions, and regex literals as values.

## Match Operator (`~`)

The `~` operator tests a string against a regex and returns the matched portion, or `undefined` if no match.

```
dec input = "hello world 123"

dec matched = input ~ /hello/
print matched   // "hello"

dec numbers = "Price: $42.99" ~ /\d+\.\d+/
print numbers   // "42.99"

dec nope = input ~ /xyz/
print nope   // undefined
```

### Match with Body

Add `=> { }` after the regex to transform the result. Capture groups are available as `$match`:

```
dec greeting = "Hello, John!" ~ /Hello, (\w+)!/ => {
  return "Welcome, ${$match[1]}!"
}
print greeting   // "Welcome, John!"

dec words = "hello world" ~ /(\w+) (\w+)/ => {
  return "${$match[2]} ${$match[1]}"
}
print words   // "world hello"
```

`$match` is the standard JavaScript match array — `$match[0]` is the full match, `$match[1]` is the first capture group, etc.

If the regex doesn't match, the body is not executed and the expression returns `undefined`.

## Regex Patterns in Match Expressions

Regex literals can be used directly as patterns in `match` arms:

```
dec input = "ERROR: connection failed"

dec severity = match input {
  /^ERROR/ => "critical"
  /^WARN/ => "warning"
  /^INFO/ => "info"
  /^DEBUG/ => "debug"
  _ => "unknown"
}
print severity   // "critical"
```

This compiles to `.test()` checks — the first regex that matches wins. Combine with a wildcard `_` default arm.

Regex patterns work with `when` guards:

```
dec result = match line {
  /^\d+/ when line.length > 5 => "long number"
  /^\d+/ => "short number"
  _ => "not a number"
}
```

Flags are supported:

```
dec result = match input {
  /^hello/i => "greeting"
  _ => "other"
}
```

## Regex Literals as Values

Regex literals can be assigned to variables and used with JavaScript's regex methods:

```
dec emailPattern = /^[\w.-]+@[\w.-]+\.\w+$/
dec phonePattern = /^\d{3}-\d{3}-\d{4}$/

fn validateEmail(email) {
  return emailPattern.test(email)
}

fn validatePhone(phone) {
  return phonePattern.test(phone)
}

print validateEmail("user@example.com")   // true
print validatePhone("555-123-4567")       // true
```

All standard JavaScript regex methods work: `.test()`, and string methods like `.match()`, `.replace()`, `.search()`, `.split()` also accept regex arguments.

## Combining Patterns

The three approaches compose naturally:

```
dec logLine = "2026-04-01 ERROR: disk full"

// Extract the level with ~
dec level = logLine ~ /\b(ERROR|WARN|INFO|DEBUG)\b/

// Decide action with match
dec action = match level {
  /ERROR/ => "page oncall"
  /WARN/ => "log to dashboard"
  _ => "ignore"
}

// Validate format with .test()
dec validFormat = /^\d{4}-\d{2}-\d{2} \w+:/.test(logLine)
```
