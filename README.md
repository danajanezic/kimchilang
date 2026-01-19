# KimchiLang 🌶️

*Some will think it stinks, others will love it—no matter what it's spicy and good for you!*

A modern, expressive programming language that transpiles to JavaScript.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Language Guide](#language-guide)
  - [Scope and Design Philosophy](#scope-and-design-philosophy)
  - [Variables](#variables)
  - [Type Inference](#type-inference)
  - [Module Visibility (expose)](#module-visibility-expose)
  - [Secrets](#secrets)
  - [Functions](#functions)
  - [Enums](#enums)
  - [Anonymous Functions (Arrow Functions)](#anonymous-functions-arrow-functions)
  - [Control Flow](#control-flow)
  - [Flow Operator](#flow-operator)
  - [Pattern Matching](#pattern-matching)
  - [Arrays & Objects](#arrays--objects)
  - [Safe Member Access](#safe-member-access)
  - [String Interpolation](#string-interpolation)
  - [Pipe Operator](#pipe-operator)
  - [Memoized Functions](#memoized-functions)
  - [Error Handling](#error-handling)
  - [JavaScript Interop](#javascript-interop)
  - [Shell Interop](#shell-interop)
  - [Static Files](#static-files)
  - [Dependency Injection System](#dependency-injection-system)
  - [Module Arguments](#module-arguments)
- [CLI Commands](#cli-commands)
  - [Module Execution](#module-execution)
  - [Basic Commands](#basic-commands)
  - [Reverse Transpiler](#reverse-transpiler-javascript-to-kimchilang)
  - [NPM Integration](#npm-integration)
- [Editor Extensions](#editor-extensions)
  - [Windsurf](#windsurf)
  - [VS Code](#vs-code)
  - [Other Editors](#other-editors)
- [Standard Library](#standard-library)
  - [Logger](#logger)
  - [Bitwise](#bitwise)
- [Package Management](#package-management)
- [Testing](#testing)
  - [Test Syntax](#test-syntax)
  - [Matchers](#matchers)
  - [Testing with Mocks](#testing-with-mocks)
- [Running Tests](#running-tests)
- [File Extensions](#file-extensions)
- [How It Works](#how-it-works)
- [Examples](#examples)
- [License](#license)

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
- **JavaScript Interop** - Embed raw JavaScript with `js { }` blocks

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

### Create a New Project

```bash
npx create-kimchi-app my-app
cd my-app
kimchi src.main
```

This creates a new project with:
- `src/main.km` - Main entry point
- `lib/utils.km` - Example utility module
- `tests/utils.test.km` - Example tests
- `project.static` - Project configuration

### Or Create a Single File

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

The compiler checks for `console.log`, `console.error`, `console.warn`, `console.info`, `console.debug`, and `console.trace`.

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

**Best practices:**

- Use `secret` for all sensitive values (API keys, passwords, tokens)
- Use `secret env` for environment variables containing credentials
- Use `secret arg` for sensitive module arguments
- Never log secrets - the compiler will catch attempts in JS blocks
- The `_Secret` wrapper ensures secrets don't accidentally appear in stack traces or error messages

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

// While loop (use with JS interop for mutable state)
js {
  let count = 0;
  while (count < 3) {
    console.log("Count: " + count);
    count++;
  }
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
dec result = await transform(5)  // square(double(addOne(5))) = 144
```

The flow syntax `name >> fn1 fn2 fn3` creates a new function `name` that composes `fn1`, `fn2`, and `fn3`. When called, arguments are passed to `fn1`, then the result flows through `fn2`, then `fn3`.

**Async Support:**

Flow-composed functions are async and handle both sync and async functions:

```kimchi
async fn fetchUser(id) { return { id: id, name: "User" + id } }
async fn enrichUser(user) { return { ...user, role: "admin" } }
fn formatUser(user) { return "${user.name} (${user.role})" }

// Create an async pipeline
processUser >> fetchUser enrichUser formatUser

async fn main() {
  dec result = await processUser(1)  // "User1 (admin)"
  print result
}
```

**Difference from pipe operator:**
- `~>` (pipe): Immediately executes — `5 ~> double ~> addOne` returns a Promise
- `>>` (flow): Creates a reusable async function — `transform >> double addOne` creates a function you call later

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

**Async Support:**

The pipe operator seamlessly handles async functions - each step is awaited automatically:

```kimchi
async fn fetchUser(id) { return { id: id, name: "User" + id } }
async fn enrichUser(user) { return { ...user, email: user.name + "@example.com" } }

async fn main() {
  // Pipe through async functions - use await on the result
  dec user = await (1 ~> fetchUser ~> enrichUser)
  print user.email  // "User1@example.com"
}
```

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
- **`e._id`** - The error type identifier for matching with `is`
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

The `is` keyword compares the `._id` property of both sides, so `e is NotFoundError` compiles to `e?._id === NotFoundError?._id`.

### JavaScript Interop

Embed raw JavaScript code using `js { }` blocks. This provides an escape hatch for advanced JavaScript features or library usage.

**Basic JS block (no inputs):**

```kimchi
js {
  console.log("Hello from raw JavaScript!");
}
```

**JS block with inputs from KimchiLang scope:**

Pass KimchiLang variables into the JS block explicitly:

```kimchi
dec name = "Alice"
dec count = 5

js(name, count) {
  const greeting = `Hello, ${name}! Count: ${count}`;
  console.log(greeting);
}
```

**JS block as expression (returns a value):**

```kimchi
dec numbers = [1, 2, 3, 4, 5]

dec sum = js(numbers) {
  return numbers.reduce((a, b) => a + b, 0);
}

print "Sum: ${sum}"  // Sum: 15
```

**Accessing JavaScript libraries:**

```kimchi
dec timestamp = js {
  return Date.now();
}

dec uuid = js {
  return crypto.randomUUID();
}
```

**How it works:**

JS blocks are compiled to IIFEs (Immediately Invoked Function Expressions):

```kimchi
// KimchiLang
dec result = js(x, y) {
  return x + y;
}

// Compiles to JavaScript
const result = ((x, y) => {
  return x + y;
})(x, y);
```

This ensures:
- **Isolated scope** - JS code can't accidentally modify KimchiLang variables
- **Explicit data flow** - Inputs must be declared, making dependencies clear
- **Return values** - Use `return` to pass data back to KimchiLang

### Shell Interop

Execute shell commands using `shell { }` blocks. Shell blocks are inherently async and functions containing them are automatically made async at compile time.

**Basic shell command:**

```kimchi
fn listFiles() {
  dec result = shell { ls -la }
  print result.stdout
}

listFiles()  // Function is automatically async
```

**Shell block with inputs:**

Pass KimchiLang variables into the shell command using `$variable` syntax:

```kimchi
fn findFiles(pattern) {
  dec result = shell(pattern) { find . -name "$pattern" }
  return result.stdout
}

dec files = findFiles("*.km")
```

**Return value:**

Shell blocks return an object with:
- **`stdout`** - Standard output (trimmed)
- **`stderr`** - Standard error (trimmed)
- **`exitCode`** - Exit code (0 for success)

```kimchi
fn checkGit() {
  dec result = shell { git status }
  
  if result.exitCode == 0 {
    print result.stdout
  } else {
    print "Error: ${result.stderr}"
  }
}
```

**Multi-line commands:**

```kimchi
fn deploy() {
  dec result = shell {
    npm run build
    npm run test
    npm publish
  }
  return result
}
```

**How it works:**

1. Shell blocks are captured as raw text (not tokenized)
2. Functions containing shell blocks are automatically made `async`
3. The shell command is executed using Node.js `child_process.exec`
4. Variables passed as inputs are interpolated into the command string

### Static Files

Static files (`.static` extension) are data-only files for configuration, constants, and enums. They are imported like modules but contain no executable code.

**File extension:** `.static`

**Syntax:**

```
// Primitive strings and numbers
AppName "MyApp"
Version "1.0.0"
MaxRetries 3
Timeout 5000

// Arrays: Name [value1, value2, ...]
Colors ["red", "green", "blue"]

// Objects: Name { key = value, key = value }
AppConfig {
  name = "MyApp"
  version = "1.0.0"
  debug = true
}

// Enums: Name `MEMBER1 = value, MEMBER2 = value`
HttpStatus `OK = 200, NOT_FOUND = 404, ERROR = 500`
```

**Multi-line declarations don't need commas:**

```
Endpoints {
  api = "https://api.example.com"
  auth = "https://auth.example.com"
  cdn = "https://cdn.example.com"
}
```

**Secret values:**

Use the `secret` keyword to protect sensitive values. Secrets are masked when converted to strings:

```
// Secret primitive
secret ApiKey "sk-1234567890abcdef"
secret InternalPort 8443

// Object with secret properties
DatabaseConfig {
  host = "localhost"
  port = 5432
  secret username = "admin"
  secret password = "super-secret-password"
}
```

Secret values:
- Display as `********` when logged or converted to string
- Actual value accessible via `.value` property
- Protected from accidental exposure in logs and error messages

**Importing static files:**

```kimchi
as config dep myapp.config

fn main() {
  print config.AppConfig.name
  print config.Colors
  print config.HttpStatus.OK
}
```

**Key differences from modules:**
- Everything is exported by default (no `expose` keyword)
- No factory function wrapper (cannot be overridden)
- Only data declarations allowed (no functions or executable code)
- Compiles to plain JavaScript exports

**Cross-file references:**

Static files can reference data from other static files using dotted paths:

```
// In shared.static
BaseUrl "https://api.example.com"

// In config.static
Endpoints {
  api = shared.BaseUrl
}
```

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
dec mockHttp = {
  get: (url) => { return { data: "mock" } }
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

## Editor Extensions

KimchiLang provides syntax highlighting extensions for popular editors. Extensions are located in the `editors/` directory.

### Windsurf

The VS Code extension is fully compatible with Windsurf.

**Option 1: Install from VSIX (Recommended)**

A pre-built VSIX file is included in the repository:

```bash
# The extension is already packaged at:
# editors/vscode/kimchilang-1.0.0.vsix

# To install in Windsurf:
# 1. Open Windsurf
# 2. Press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows/Linux)
# 3. Type "Extensions: Install from VSIX..."
# 4. Navigate to editors/vscode/kimchilang-1.0.0.vsix
# 5. Click Install
# 6. Reload Windsurf when prompted
```

**Option 2: Copy to extensions folder**

```bash
# Copy the extension directly to Windsurf's extensions directory
cp -r editors/vscode ~/.windsurf/extensions/kimchilang

# Restart Windsurf to activate the extension
```

**Option 3: Build and install fresh VSIX**

```bash
cd editors/vscode
npm install -g @vscode/vsce
vsce package
# Then install the generated .vsix file using Option 1 steps
```

After installation, KimchiLang syntax highlighting will automatically activate for `.km`, `.kimchi`, and `.kc` files.

### VS Code

Follow the same steps as Windsurf, but use the VS Code extensions directory:

```bash
# Option 1: Install from VSIX (same as Windsurf)

# Option 2: Copy to extensions folder
cp -r editors/vscode ~/.vscode/extensions/kimchilang
```

### Other Editors

See `editors/README.md` for installation instructions for:
- **Sublime Text** - Syntax definition in `editors/sublime/`
- **Vim/Neovim** - Syntax file and configuration
- **Emacs** - Major mode configuration

## Standard Library

KimchiLang includes a standard library in the `stdlib/` directory.

### Logger

Structured JSON logging with log levels.

**Import:**

```kimchi
as log dep stdlib.logger
```

**Usage:**

```kimchi
log.info("Application started")
log.debug("Debug info", { userId: 123 })
log.warn("Warning message")
log.error("Error occurred", { code: "ERR_001" })
```

**Log levels:** `debug`, `info`, `warn`, `error`

**Environment variable:** Set `LOG_LEVEL` to control minimum level (default: `info`)

```bash
LOG_LEVEL=debug kimchi myapp.main
LOG_LEVEL=warn kimchi myapp.main
```

**Output format:** JSON with metadata

```json
{"timestamp":"2024-01-15T10:30:00.000Z","level":"info","module":"main","function":"processOrder","line":42,"message":"Order completed"}
```

**Child loggers:** Add persistent context

```kimchi
dec userLog = log.child({ userId: 456, session: "abc" })
userLog.info("User action")  // Includes userId and session in output
```

### Bitwise

Bitwise operations are provided as functions rather than operators.

**Import:**

```kimchi
as bit dep stdlib.bitwise
```

**Functions:**

```kimchi
bit.band(a, b)     // a & b (bitwise AND)
bit.bor(a, b)      // a | b (bitwise OR)
bit.bxor(a, b)     // a ^ b (bitwise XOR)
bit.bnot(a)        // ~a (bitwise NOT)
bit.lshift(a, b)   // a << b (left shift)
bit.rshift(a, b)   // a >> b (right shift, sign-propagating)
bit.urshift(a, b)  // a >>> b (unsigned right shift)
```

**Examples:**

```kimchi
as bit dep stdlib.bitwise

dec flags = bit.bor(0x01, 0x04)      // 5
dec masked = bit.band(flags, 0x01)   // 1
dec shifted = bit.rshift(16, 2)      // 4
```

## Package Management

KimchiLang has a built-in package manager for fetching external dependencies from GitHub.

### project.static

Create a `project.static` file in your project root to declare dependencies:

```
// project.static
name "my-app"
version "1.0.0"

depend [
  "github.com/owner/repo",
  "github.com/owner/repo@v1.0.0",
  "github.com/owner/repo/path/to/module"
]
```

### Installing Dependencies

```bash
# Install all dependencies from project.static
kimchi install

# Remove installed dependencies
kimchi clean
```

Dependencies are cloned to `.km_modules/` and tracked in `.km_modules/.lock.json`.

### Using Installed Modules

Import external modules using the `@` prefix:

```kimchi
// Module installed at .km_modules/foo/bar.km
as bar dep @foo.bar

// Use the imported module
bar.doSomething()
```

The `@` prefix tells the compiler to look in `.km_modules/` instead of the local project. It also makes it clear to the reader that the module is external.

### Dependency URL Format

| Format | Description |
|--------|-------------|
| `github.com/owner/repo` | Latest from main branch |
| `github.com/owner/repo@tag` | Specific tag or branch |
| `github.com/owner/repo/path` | Subdirectory of repo |

## Testing

KimchiLang includes a built-in testing framework with `test`, `describe`, `expect`, and `assert`.

### Test Syntax

**Basic test:**

```kimchi
test "addition works" {
  expect(add(2, 3)).toBe(5)
}
```

**Grouped tests with describe:**

```kimchi
describe "Math functions" {
  test "add returns correct sum" {
    expect(add(2, 3)).toBe(5)
  }
  
  test "multiply returns correct product" {
    expect(multiply(3, 4)).toBe(12)
  }
}
```

**Assert statement:**

```kimchi
assert condition, "Error message if false"
```

### Matchers

| Matcher | Description |
|---------|-------------|
| `toBe(value)` | Strict equality (`===`) |
| `toEqual(value)` | Deep equality (JSON comparison) |
| `toContain(item)` | Array/string contains item |
| `toBeNull()` | Value is `null` |
| `toBeTruthy()` | Value is truthy |
| `toBeFalsy()` | Value is falsy |
| `toBeGreaterThan(n)` | Value > n |
| `toBeLessThan(n)` | Value < n |
| `toHaveLength(n)` | Array/string length equals n |
| `toMatch(regex)` | String matches regex |
| `toThrow(message)` | Function throws error containing message |

### Testing with Mocks

Use dependency injection to mock dependencies in tests:

```kimchi
// Create a mock
dec mockHttp = {
  get: (url) => { status: 200, data: { id: 1, name: "Test" } }
}

// Inject mock when importing module
as userService dep myapp.user-service({
  "myapp.http-client": mockHttp
})

// Test with mocked dependency
test "getUser returns user data" {
  dec user = userService.getUser(1)
  expect(user.name).toBe("Test")
}
```

**Run tests:**

```bash
kimchi examples.testing.math.test
```

See `examples/testing/` for complete examples.

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
- `logger_example.km` - Structured JSON logging with log levels
- `regex_match.km` - Regex pattern matching expressions
- `testing/` - Unit testing examples with mocks

## License

MIT
