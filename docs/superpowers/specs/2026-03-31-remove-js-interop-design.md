# Remove js { } Interop Design

## Overview

Hard removal of `js { }` blocks from KimchiLang. All `js { }` usage is replaced with `extern` declarations, `Foo.new()` constructor syntax, or rewritten in pure KimchiLang. After removal, `js { }` in source code produces a parse error with a helpful migration message.

This is a prerequisite for dropping `async`/`await` — the compiler can't auto-detect async-ness across a `js { }` boundary.

## Migration: Files that use js { }

### stdlib/bitwise.km

7 functions wrapping JS bitwise operators. Extract to a JS helper file and extern.

**Before:**
```kimchi
expose fn band(a, b) {
  return js(a, b) { return a & b; }
}
```

**After:**
```kimchi
extern "./_bitwise_helpers.js" {
  fn band(a: number, b: number): number
  fn bor(a: number, b: number): number
  fn bxor(a: number, b: number): number
  fn bnot(a: number): number
  fn lshift(a: number, b: number): number
  fn rshift(a: number, b: number): number
  fn urshift(a: number, b: number): number
}
```

New file `stdlib/_bitwise_helpers.js`:
```javascript
export function band(a, b) { return a & b; }
export function bor(a, b) { return a | b; }
export function bxor(a, b) { return a ^ b; }
export function bnot(a) { return ~a; }
export function lshift(a, b) { return a << b; }
export function rshift(a, b) { return a >> b; }
export function urshift(a, b) { return a >>> b; }
```

### examples/testing/math.km

**`new Error(...)` calls:** Replace with `Error.new(...)`.

**`isPrime` JS loop:** Rewrite in KimchiLang using `while` and `mut`.

### examples/js_interop.km

Delete entirely. The file is a `js { }` showcase with no other purpose. References to it in docs should be removed.

### examples/readme_examples.km

Remove the JS interop section (the `js { }` examples). Keep all other sections.

## Compiler removal

### Lexer (src/lexer.js)

- Remove `JS: 'JS'` and `JS_CONTENT: 'JS_CONTENT'` from TokenType enum.
- Remove `'js': TokenType.JS` from KEYWORDS map.
- Remove the raw JS content capture block (the `if (type === TokenType.JS)` block that mirrors the shell capture pattern).
- When `js` is encountered as an identifier, it will now just be a regular identifier (no special handling).

### Parser (src/parser.js)

- Remove `JSBlock: 'JSBlock'` from NodeType enum.
- Remove `parseJSBlock()` and `parseJSBlockExpression()` methods.
- Remove `js { }` handling from `parseStatement()` and `parsePrimary()`.
- Add a helpful error: when the parser encounters what looks like `js {` (identifier `js` followed by `{`), emit: `"js { } blocks have been removed. Use extern declarations for JavaScript interop."`.

### Type checker (src/typechecker.js)

- Remove `JSBlock` case from `visitStatement`.
- Remove any `JSBlock` references in `visitExpression`.

### Generator (src/generator.js)

- Remove `visitJSBlock()` and `visitJSBlockExpression()` methods.
- Remove `JSBlock` cases from `visitStatement` and `visitExpression` switches.

### Linter (src/linter.js)

- Remove secret-in-console-log checks that were specific to `js { }` blocks (the linter checks if a secret variable is passed to console.log inside a js block).

### js2km.js (reverse compiler)

- Remove any logic that generates `js { }` blocks. The `NewExpression` handler currently emits `js { return new X(); }` — change to emit `X.new()` instead.

## Tests

- Remove all tests that test `js { }` compilation.
- Add a test that `js { }` produces a parse error with the migration message.
- Update any tests that incidentally use `js { }` in their source strings.

## Documentation

- Remove `js { }` references from CLAUDE.md, language guide, and other docs.
- Update the "JavaScript Interop" section to point to `extern` declarations instead.
