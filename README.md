# KimchiLang 🌶️

A modern, expressive programming language that transpiles to JavaScript.

## Features

- **Clean Syntax** - Python-inspired readability with JavaScript power
- **Modern Operators** - Pipe operator (`~>`), flow operator (`>>`), range expressions (`0..10`), spread operator
- **String Interpolation** - Easy string formatting with `"Hello ${name}!"`
- **Purely Functional** - No classes, no `this`, no global scope
- **Deeply Immutable** - All values are immutable with compile-time checking
- **Pattern Matching** - `match`/`when` expressions for elegant control flow
- **Arrow Functions** - Concise lambda syntax
- **Print Statement** - Built-in `print` for quick debugging
- **Strict Equality** - `==` compiles to `===` for safer comparisons
- **Safe Member Access** - All property access is null-safe by default
- **Memoization** - Built-in `memo` keyword for memoized functions
- **Type Inference** - Compile-time type checking without annotations

## Installation

```bash
# Clone the repository
git clone https://github.com/danajanezic/kimchilang.git
cd kimchilang

# Run the installer (installs dependencies and links the 'kimchi' command)
./install.sh
```

After installation, the `kimchi` command is available globally:

```bash
kimchi run examples/hello.kimchi
kimchi compile app.kimchi
kimchi convert input.js
kimchi help
```

**Manual installation** (if you prefer not to use the installer):

```bash
npm install
npm link
```

## Quick Start

Create a file called `hello.kimchi`:

```kimchi
print "Hello, KimchiLang!"

fn greet(name) {
  return "Welcome, " + name + "!"
}

print greet("Developer")
```

Run it:

```bash
kimchi run hello.kimchi
```

## Language Guide

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

At runtime, `dec` values are wrapped with `Object.freeze` recursively for additional protection.

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

// Combined
fn log(prefix, separator = ": ", ...messages) {
  return prefix + separator + messages.join(", ")
}
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

// Mixed (auto-increment continues from last explicit value)
enum Priority {
  Low,       // 0
  Medium,    // 1
  High = 10, // 10
  Critical   // 11
}
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

KimchiLang supports arrow functions for concise anonymous function expressions:

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

**Pattern matching in arrow functions:**

Arrow functions with block bodies support pattern matching:

```kimchi
dec categorize = (item) => {
  |item.type == "fruit"| => { return "produce" }
  |item.type == "meat"| => { return "protein" }
  |true| => { return "other" }
}

// Inline with reduce
dec balance = transactions.reduce((acc, tx) => {
  |tx.type == "credit"| => { return acc + tx.amount }
  |tx.type == "debit"| => { return acc - tx.amount }
  |true| => { return acc }
}, 0)
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

// While loop
while count < 10 {
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
```

### Flow Operator

Create composed functions with the `>>` flow operator:

```kimchi
fn addOne(x) { return x + 1 }
fn double(x) { return x * 2 }
fn square(x) { return x * x }

// Create a composed function
transform >> addOne double square

// Call it later
dec result = transform(5)  // square(double(addOne(5))) = 144
```

The flow syntax `name >> fn1 fn2 fn3` creates a new function `name` that composes `fn1`, `fn2`, and `fn3`. When called, arguments are passed to `fn1`, then the result flows through `fn2`, then `fn3`.

**Difference from pipe operator:**
- `~>` (pipe): Immediately executes — `5 ~> double ~> addOne` returns `11`
- `>>` (flow): Creates a reusable function — `transform >> double addOne` creates a function you call later

### Pattern Matching

Standalone conditional pattern matching that returns from the enclosing function:

```kimchi
fn handleStatus(status) {
  |status == 200| => print "OK"
  |status == 404| => print "Not Found"
  |status == 500| => print "Server Error"
}
```

Each case uses `|condition|` delimiters followed by `=>` and the code to execute. When a condition matches, the code runs and the function returns.

### Arrays & Objects

```kimchi
dec numbers = [1, 2, 3, 4, 5]
dec person = {
  name: "Bob",
  age: 30
}

// Spread operator
dec more = [...numbers, 6, 7, 8]

// Object spread
dec updated = { ...person, age: 31 }
```

### Safe Member Access

All property access in KimchiLang is **null-safe by default**. The dot operator (`.`) compiles to JavaScript's optional chaining (`?.`), so accessing properties on `undefined` or `null` values returns `undefined` instead of throwing an error.

```kimchi
dec obj = { a: { b: { c: 1 } } }

print obj.a.b.c    // 1
print obj.x.y.z    // undefined (no error!)

// Works with arrays too
dec items = [{ name: "first" }]
print items[0].name    // "first"
print items[5].name    // undefined (no error!)
```

This eliminates the need for manual null checks or the `?.` operator - every property access is automatically safe.

### String Interpolation

Use `${expression}` inside strings for easy string interpolation:

```kimchi
dec name = "Alice"
dec age = 30

print "Hello, ${name}!"                    // "Hello, Alice!"
print "${name} is ${age} years old"        // "Alice is 30 years old"

// Expressions work too
dec items = [1, 2, 3]
print "Count: ${items.length}"             // "Count: 3"
print "Sum: ${items.sum()}"                // "Sum: 6"

// Nested expressions
dec user = { name: "Bob", score: 95 }
print "${user.name} scored ${user.score}%" // "Bob scored 95%"
```

To include a literal `$` followed by `{`, escape it with a backslash:

```kimchi
print "Price: \${99.99}"  // "Price: ${99.99}"
```

### Pipe Operator

Chain function calls with the `~>` pipe operator for readable data transformations:

```kimchi
fn double(x) { return x * 2 }
fn addOne(x) { return x + 1 }
fn square(x) { return x * x }

// Without pipe operator
dec result1 = square(addOne(double(5)))  // 121

// With pipe operator - reads left to right!
dec result2 = 5 ~> double ~> addOne ~> square  // 121

// Works great with array methods
dec numbers = [1, 2, 3, 4, 5]
dec processed = numbers
  ~> (arr => arr.map(x => x * 2))
  ~> (arr => arr.filter(x => x > 4))
  ~> (arr => arr.sum())  // 24
```

The pipe operator passes the left-hand value as the argument to the right-hand function: `a ~> f` becomes `f(a)`.

### Memoized Functions

Use the `memo` keyword instead of `fn` to create memoized functions that cache their results:

```kimchi
// Memoized fibonacci - exponentially faster!
memo fib(n) {
  |n <= 1| => { return n }
  |true| => { return fib(n - 1) + fib(n - 2) }
}

print fib(40)  // Instant! (would be very slow without memoization)
```

The cache uses a `Map` keyed by `JSON.stringify` of the arguments, so it works with any serializable arguments.

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

**Creating typed errors with `error.create()`:**

Use `error.create(name)` to define reusable error types:

```kimchi
// Define custom error types
dec NotFoundError = error.create("NotFoundError")
dec ValidationError = error.create("ValidationError")
dec AuthError = error.create("AuthError")

// Throw errors using your custom types
throw NotFoundError("User not found")
throw ValidationError("Email is invalid")
throw AuthError("Token expired")
```

Each error created has:
- **`e.message`** - The error message you provide
- **`e.name`** - The error type for matching
- **`e.stack`** - Full stack trace

**Catching errors by type with `is`:**

Use the `is` keyword to check if an error matches a specific type:

```kimchi
dec NotFoundError = error.create("NotFoundError")
dec ValidationError = error.create("ValidationError")

fn fetchUser(id) {
  if id == 0 {
    throw NotFoundError("User ${id} not found")
  }
  return { id: id, name: "Alice" }
}

fn handleRequest(id) {
  try {
    return fetchUser(id)
  } catch(e) {
    |e is NotFoundError| => {
      print "Not found: ${e.message}"
      return null
    }
    |e is ValidationError| => {
      print "Invalid: ${e.message}"
      return null
    }
    |true| => {
      throw e  // Re-throw unknown errors
    }
  }
}
```

**Using `is not` for negated type checking:**

Use `is not` to check if an error does NOT match a specific type:

```kimchi
dec NetworkError = error.create("NetworkError")

fn handleError(e) {
  |e is not NetworkError| => {
    // Handle all non-network errors
    print "Non-network error: ${e.message}"
    return false
  }
  |true| => {
    // Retry network errors
    print "Network issue, retrying..."
    return true
  }
}
```

The `is` keyword compares the `.name` property of both sides, so `e is NotFoundError` compiles to `e?.name === NotFoundError?.name`.

### Dependency Injection System

KimchiLang has a built-in dependency injection system using the `dep` keyword. Every module is automatically wrapped as a factory function that can accept dependency overrides.

**Basic dependency declaration:**

```kimchi
// Declare a dependency on myapp/lib/http.km
as http dep myapp.lib.http

fn fetchData() {
  return http.get("https://api.example.com/data")
}
```

**Dependency injection for testing:**

```kimchi
// Create a mock
let mockHttp = {
  get: fn(url) { return { data: "mock" } }
}

// Inject the mock when importing
as api dep myapp.services.api({"myapp.lib.http": mockHttp})

// Now api uses the mock http client
api.fetchData()  // Uses mockHttp.get instead of real http.get
```

**How it works:**

1. `as <alias> dep <dotted.path>` - Declares a dependency
2. Dotted paths map to file paths: `myapp.lib.http` → `./myapp/lib/http.km`
3. Every module exports a factory function that accepts an `_opts` object
4. Dependencies check `_opts` first before using the real import

### Module Arguments

Modules can declare arguments using the `arg` keyword. Arguments and dependency overrides share the same options object.

**Argument syntax:**

```kimchi
arg timeout = 5000        // Optional arg with default value
arg clientId              // Optional arg (undefined if not provided)
!arg apiKey               // Required arg (throws error if missing)
```

**Using args when importing:**

```kimchi
// Provide required args and override optional ones
as api dep myapp.services.api({
  apiKey: "my-secret-key",     // Required arg
  version: "v2"                 // Override default
})
```

**Mixing deps and args:**

```kimchi
// Both dependency overrides and args in the same object
as api dep myapp.services.api({
  "myapp.lib.http": mockHttp,   // Dependency override (dotted path)
  apiKey: "test-key",           // Required arg
  timeout: 10000                // Optional arg override
})
```

**Example project structure:**

```
myapp/
├── lib/
│   └── http.km          # Low-level HTTP client
├── services/
│   └── api.km           # API service (depends on http)
├── main.km              # Main app (depends on api)
└── main_with_mock.km    # Main app with mocked dependencies
```

## CLI Commands

### Module Execution

Run modules using dot-notation paths instead of file paths:

```bash
# Run a module by path (salesforce/client.km -> salesforce.client)
kimchi salesforce.client

# Equivalent to:
kimchi run salesforce/client.km
```

**Passing named arguments:**

Modules can declare arguments with `arg` and `!arg` (required). Pass them from the CLI using `--arg-name value`:

```kimchi
// api/client.km
!arg clientId          // Required argument
arg timeout = 5000     // Optional with default

expose fn connect() {
  print "Connecting with ${clientId}, timeout: ${timeout}ms"
}

connect()
```

```bash
# Pass required and optional args
kimchi api.client --client-id ABC123 --timeout 10000

# Argument names convert: --client-id -> clientId (camelCase)
```

**Injecting dependencies:**

Override module dependencies at runtime with `--dep alias=path`:

```kimchi
// services/api.km
as http dep lib.http    // Normal dependency

expose fn fetch(url) {
  return http.get(url)
}
```

```bash
# Inject a mock HTTP module for testing
kimchi services.api --dep http=mocks.http

# Multiple dependency injections
kimchi app.main --dep http=mocks.http --dep db=mocks.db
```

**Module help:**

View a module's description, arguments, and dependencies:

```bash
kimchi help api.client
```

Output:
```
Module: api.client
File: ./api/client.km

Description:
  API client for connecting to external services

Arguments:
  --client-id (required)
  --timeout [default: 5000]

Dependencies:
  http <- lib.http

Usage:
  kimchi api.client --client-id <value>
```

**Listing modules:**

```bash
# List modules in current directory
kimchi ls

# List with descriptions (calls _describe() on each module)
kimchi ls --verbose

# Recursive tree view
kimchi ls ./lib --recursive --verbose
```

### Basic Commands

```bash
# Compile a file to JavaScript
kimchi compile app.kimchi

# Compile with custom output
kimchi compile app.kimchi -o dist/app.js

# Run a file directly
kimchi run app.kimchi

# Start interactive REPL
kimchi repl

# Show help
kimchi help
```

### Reverse Transpiler (JavaScript to KimchiLang)

Convert existing JavaScript code to KimchiLang with the `convert` command:

```bash
# Convert a JavaScript file to KimchiLang
kimchi convert app.js

# Convert with custom output path
kimchi convert app.js -o src/app.km
```

The reverse transpiler handles:
- **Variables** - `const`/`let`/`var` → `dec`
- **Functions** - Function declarations → `fn`
- **Classes** - Converted to factory functions (e.g., `class User` → `fn createUser()`)
- **Imports** - ES modules and `require()` → `dep` statements
- **Exports** - Named/default exports → `expose`
- **console.log** → `print`
- **Conditionals** - `if/else` → pattern matching syntax

**Example:**

```javascript
// input.js
const API_URL = "https://api.example.com";

class UserService {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  
  getUser(id) {
    return fetch(`${API_URL}/users/${id}`);
  }
}

console.log("Ready");
```

```bash
kimchi convert input.js
```

```kimchi
// output.km
dec API_URL = "https://api.example.com"

// Converted from class UserService
fn createUserService(apiKey) {
  return {
    getUser: (id) => {
      return fetch("${API_URL}/users/${id}")
    }
  }
}

print "Ready"
```

### NPM Integration

The `npm` subcommand runs npm and automatically converts installed packages to the `pantry/` directory:

```bash
# Install a package and convert it to pantry/
kimchi npm install lodash

# Install multiple packages
kimchi npm install axios moment

# Any npm command works, but only install triggers conversion
kimchi npm update
```

After installation, packages are available in `pantry/<package>/index.km`:

```kimchi
// Use the converted package
as lodash dep pantry.lodash

dec result = lodash.map([1, 2, 3], x => x * 2)
```

**How it works:**
1. Runs the npm command normally
2. Scans `node_modules/` for installed packages
3. Finds each package's main entry point
4. Converts JavaScript to KimchiLang using the reverse transpiler
5. Saves to `pantry/<package>/index.km`

**Note:** Complex packages with advanced JavaScript features may not convert perfectly. The pantry is best for simple utility libraries.

## Running Tests

```bash
node test/test.js
```

## File Extensions

- `.kimchi` - Standard extension
- `.kc` - Short extension

## How It Works

KimchiLang uses a three-stage compilation process:

1. **Lexer** (`src/lexer.js`) - Tokenizes source code into tokens
2. **Parser** (`src/parser.js`) - Builds an Abstract Syntax Tree (AST)
3. **Generator** (`src/generator.js`) - Converts AST to JavaScript

## Examples

See the `examples/` directory for more code samples:

- `hello.kimchi` - Hello World
- `basic.kimchi` - Core language features
- `fibonacci.kimchi` - Recursive and iterative Fibonacci
- `myapp/` - Dependency injection example with mock testing

## License

MIT
