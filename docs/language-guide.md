# KimchiLang Language Guide

[Back to README](../README.md)

### Scope and Design Philosophy

KimchiLang is a **purely functional language** with these core principles:

- **No global scope** - Everything is always local
- **No `this` keyword** - No object-oriented programming
- **No classes** - Use functions and modules for code organization
- **All values are immutable** - Enforced at compile-time

### Variables

KimchiLang uses `dec` for all variable declarations. All variables are **deeply immutable** - both the variable and any nested properties cannot be reassigned.

```kimchi
dec name = "Alice"
dec PI = 3.14159
dec config = {
  api: {
    url: "https://api.example.com",
    timeout: 5000
  }
}
```

**Destructuring:**

```kimchi
// Object destructuring
dec person = { name: "Alice", age: 30, city: "NYC" }
dec { name, age } = person

// With renaming
dec { name: userName, city: userCity } = person

// Array destructuring
dec numbers = [1, 2, 3, 4, 5]
dec [first, second, third] = numbers

// Skip elements with holes
dec [a, , c] = numbers  // a=1, c=3
```

**Compile-time immutability checking:**

```kimchi
dec obj = { foo: { bar: "baz" } }

obj = {}              // Compile error: Cannot reassign 'obj'
obj.foo = {}          // Compile error: Cannot reassign 'obj.foo'
obj.foo.bar = "new"   // Compile error: Cannot reassign 'obj.foo.bar'
```

Immutability is enforced at compile time. When `dec` values are passed to `js { }` blocks, they are `Object.freeze`d at the boundary to prevent mutation in JavaScript code.

**Mutable variables:**

Use `mut` for variables that need reassignment (accumulators, loop counters):

```kimchi
mut count = 0
while count < 10 {
  count += 1
}
```

`mut` compiles to `let`. It is block-scoped, cannot be captured by closures, and cannot be exposed. The linter warns if a `mut` variable is never reassigned.

### Type Inference

KimchiLang performs compile-time type checking without requiring type annotations. Types are inferred from values and usage:

```kimchi
dec person = { name: "Alice", age: 30 }
print person.email  // Compile error: Property 'email' does not exist on type { name: string, age: number }

dec x = 42
x()  // Compile error: Type 'number' is not callable

enum Color { Red, Green, Blue }
print Color.Yellow  // Compile error: Property 'Yellow' does not exist on enum 'Color'
```

The type checker catches:
- **Property access on non-existent properties** for known object shapes
- **Calling non-functions** (e.g., calling a number or string)
- **Invalid enum member access**
- **Destructuring non-existent properties**
- **Type mismatches in dependency injection** (when overriding module deps)

### Module Visibility (expose)

By default, all declarations are **private**. Use the `expose` keyword to make them available to other modules:

```kimchi
// Private - only accessible within this module
dec internalConfig = { secret: "hidden" }
fn helperFn() { return "internal" }

// Public - accessible by modules that depend on this one
expose dec API_VERSION = "1.0"
expose fn greet(name) { return "Hello, " + name }
```

Attempting to access an unexposed member from a dependency will result in a compile-time error.

### Secrets

KimchiLang provides built-in protection for sensitive values like API keys, tokens, and passwords using the `secret` modifier.

**Declaring secrets:**

```kimchi
// Secret variables
secret dec apiKey = "sk-1234567890"
secret dec dbPassword = "super-secret"

// Secret environment variables
secret env DATABASE_URL

// Secret module arguments
secret arg authToken
secret !arg apiKey  // Required secret argument
```

**How secrets are protected:**

1. **Masked in output** - When converted to a string (e.g., in error messages or logs), secrets display as `********` instead of their actual value:

```kimchi
secret dec apiKey = "sk-1234567890"
print "Key: ${apiKey}"  // Output: "Key: ********"
```

2. **Compile-time protection in JS interop** - Secrets cannot be passed to `console.log` or other console methods inside `js { }` blocks:

```kimchi
secret dec apiKey = "sk-1234567890"

// This will FAIL at compile time:
js(apiKey) {
  console.log(apiKey);  // Error: Cannot pass secret 'apiKey' to console.log
}

// This is allowed (using secret for its intended purpose):
js(apiKey) {
  return fetch(url, { headers: { Authorization: apiKey } });
}
```

3. **Value access** - To get the actual value of a secret (e.g., for API calls), use the `.value` property:

```kimchi
secret dec apiKey = "sk-1234567890"

// In JS interop, the value is accessible normally
dec response = js(apiKey) {
  return fetch("https://api.example.com", {
    headers: { "Authorization": "Bearer " + apiKey }
  });
}
```

### Functions

```kimchi
expose fn add(a, b) {
  return a + b
}

// Async functions
async fn fetchData(url) {
  dec response = await fetch(url)
  dec data = await response.json()
  return data
}

// Async memoized functions
async memo cachedFetch(url) {
  dec response = await fetch(url)
  return await response.json()
}

// Default parameters
fn greet(name = "World") {
  return "Hello, " + name
}

greet()        // "Hello, World"
greet("Alice") // "Hello, Alice"

// Rest parameters
fn sum(...nums) {
  return nums.reduce((acc, n) => acc + n, 0)
}

sum(1, 2, 3, 4, 5)  // 15

// Parameter destructuring - objects
fn greetPerson({ name, age }) {
  print "Hello, " + name + "! You are " + age
}

greetPerson({ name: "Alice", age: 30 })

// Parameter destructuring - arrays
fn swap([a, b]) {
  return [b, a]
}

swap([1, 2])  // [2, 1]
```

### Enums

Enums define a set of named constants with auto-incrementing numeric values:

```kimchi
enum Color {
  Red,    // 0
  Green,  // 1
  Blue    // 2
}

print Color.Red    // 0
print Color.Green  // 1

// Explicit values
enum HttpStatus {
  OK = 200,
  NotFound = 404,
  ServerError = 500
}
```

**Note:** Enums must be all-implicit or all-explicit — mixing is a compile error:

```kimchi
// This is NOT allowed:
enum Bad { A, B, C = 10 }  // Error: mixes implicit and explicit values
```

Enums are frozen objects and can be used with pattern matching:

```kimchi
fn getStatusMessage(status) {
  |status == HttpStatus.OK| => { return "Success" }
  |status == HttpStatus.NotFound| => { return "Not Found" }
  |true| => { return "Unknown" }
}
```

### Anonymous Functions (Arrow Functions)

```kimchi
// Single parameter (no parentheses needed)
dec double = x => x * 2

// Multiple parameters
dec add = (a, b) => a + b

// Block body for multiple statements
dec process = (x) => {
  dec result = x * 2
  return result + 1
}

// As callbacks
dec numbers = [1, 2, 3, 4, 5]
dec doubled = numbers.map(x => x * 2)
dec sum = numbers.reduce((acc, n) => acc + n, 0)
```

### Control Flow

```kimchi
// If/Elif/Else
if score >= 90 {
  print "A"
} elif score >= 80 {
  print "B"
} else {
  print "C"
}

// Guard clauses
guard user != null else { return null }
guard age >= 18 else { throw error("Must be 18+") }

// While loop
mut count = 0
while count < 3 {
  print "Count: ${count}"
  count = count + 1
}

// For loop (for-in)
for item in items {
  print item
}

// Range expressions
for i in 0..5 {
  print i  // 0, 1, 2, 3, 4
}

// Match expressions
dec message = match status {
  200 => "OK"
  404 => "Not Found"
  _ => "Unknown"
}

// Conditional expressions
dec label = value.if(value > 0).else("none")
```

### Operators

```kimchi
// Pipe operator — chain function calls left to right
dec result = 5 ~> double ~> addOne ~> square

// Flow operator — create composed functions
transform >> double addOne square
dec result = transform(5)

// Nullish coalescing
dec name = input ?? "default"

// Bind syntax — deferred function application
dec bound = fetchUser.(1)  // () => fetchUser(1)
```

See also: [Concurrency & Parallel Computation](concurrency.md)

### Type System

#### KMDocs (Type Annotations)

JSDoc-style `/** */` comments for type annotations:

```kimchi
/** @param {string} name */
/** @returns {number} */
/** @type {string[]} */
```

Supported types: `number`, `string`, `boolean`, `null`, `void`, `any`, `number[]`, `{key: type}`, `(type) => type`, `type1 | type2`, `Name<T>`.

#### Union Types

Supported in extern declarations and KMDocs. One-way compatibility with guard-based narrowing.

```kimchi
extern "mod" {
  fn findUser(id: number): {name: string} | null
}

/** @param {string | null} name */
fn greet(name) {
  guard name != null else { return "anonymous" }
  // name is now narrowed to string
  return "hello " + name
}
```

#### Generics

Type aliases with parameters and generic functions. Type parameters inferred from arguments at call sites.

```kimchi
type Result<T> = {ok: boolean, value: T}
type Optional<T> = T | null

extern "mod" {
  fn identity<T>(value: T): T
  fn first<T>(arr: T[]): Optional<T>
  fn query<T>(sql: string): Result<T>
}

dec x = identity("hello")       // T inferred as string
dec nums = [1, 2, 3]
dec n = first(nums)              // T inferred as number, returns number | null
```

### Extern Declarations

Typed contracts for JavaScript modules. Compiles to tree-shaken static `import` statements — only used symbols are imported.

```kimchi
// Named exports
extern "node:fs" {
  fn readFileSync(path: string): string
  fn existsSync(path: string): boolean
}

// Default exports
extern default "express" as express: any

// Use them like normal functions
dec content = readFileSync("file.txt")
dec app = express()
```

### Constructor Syntax

`Foo.new(args)` compiles to `new Foo(args)`. Enables chaining without variable assignment.

```kimchi
dec date = Date.new()
dec isoString = Date.new().toISOString()
dec pool = Pool.new({host: "localhost", port: 5432})
```

### Error Handling

**Basic try/catch/finally:**

```kimchi
try {
  riskyOperation()
} catch(e) {
  print "Error: " + e.message
} finally {
  cleanup()
}
```

**Custom error types with `error.create()`:**

```kimchi
dec NotFoundError = error.create("NotFoundError")
dec ValidationError = error.create("ValidationError")

throw NotFoundError("User not found")
```

**Catching by type with `is`:**

```kimchi
try {
  return fetchUser(id)
} catch(e) {
  |e is NotFoundError| => { return null }
  |e is ValidationError| => { print "Invalid: ${e.message}" }
  |true| => { throw e }
}
```

### JavaScript & Shell Interop

**JavaScript blocks:**

```kimchi
dec result = js(x, y) {
  return x + y;
}
```

**Shell blocks (blocking):**

```kimchi
dec result = shell { ls -la }
print result.stdout
print result.exitCode
```

See also: [Concurrency & Parallel Computation](concurrency.md) for `spawn` (non-blocking shell).

### Modules & Dependency Injection

See [Modules & Dependencies](modules.md).

### Memoized Functions

Use the `memo` keyword for automatic caching:

```kimchi
memo fib(n) {
  |n <= 1| => { return n }
  |true| => { return fib(n - 1) + fib(n - 2) }
}

print fib(40)  // Instant!
```
