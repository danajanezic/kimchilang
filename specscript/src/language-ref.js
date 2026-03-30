// Condensed KimchiLang reference for LLM prompts
// This is the actual language used in ## test and ## impl sections

export const LANGUAGE_REF = `## KimchiLang Reference

KimchiLang is a purely functional language that transpiles to JavaScript.
No classes, no \`this\`, no global scope. All values are deeply immutable by default.

### Declarations
- \`dec x = value\` — immutable binding (deeply frozen via Object.freeze)
- \`mut x = value\` — mutable binding (block-scoped, cannot be captured by closures or returned)
- \`fn name(params) { body }\` — function declaration
- \`async fn name(params) { body }\` — async function
- \`expose fn name(params) { body }\` — public function (visible to other modules)
- \`expose name\` — expose an already-declared binding

### Control Flow
- \`if condition { body }\` — no parens around condition
- \`if condition { body } else { body }\`
- \`if condition { body } elif condition { body } else { body }\`
- \`for item in iterable { body }\` — for-in loop
- \`for i in 0..10 { body }\` — range loop
- \`while condition { body }\`
- \`break\` / \`continue\`
- \`return expression\`

### Guard Statements
Early-exit precondition checks. The else block must return or throw.
\`\`\`
guard isValid(input) else { return null }
guard user != null else { throw ValidationError("User required") }
// continues here only if guard passed
\`\`\`

### Pattern Matching (inline)
\`\`\`
|x > 0| => "positive"
|x < 0| => "negative"
|true| => "zero"
\`\`\`

### Match Expression (structured)
\`\`\`
match status {
  "open" => handleOpen()
  "closed" => handleClosed()
  { type: "error", message } => handleError(message)
  [first, second] => handlePair(first, second)
  is NotFoundError => handleNotFound(status)
  _ when status.length > 10 => handleLong(status)
  _ => handleDefault()
}
\`\`\`
Patterns: literal values, object destructuring, array destructuring, \`is ErrorType\` checks (compares \`._id\`), \`_\` wildcard, binding variables (\`n when n > 0\`).
Optional \`when\` guard on any arm. Returns \`null\` if no arm matches.

### Conditional Method Expression
Chain conditionals on any value — returns the receiver if condition is true, else the fallback:
\`\`\`
dec label = "none".if(count == 0).else("some")
dec name = user.name.if(user.name.length > 0).else("Anonymous")
\`\`\`
\`.if(condition)\` returns the receiver if condition is truthy. \`.else(fallback)\` provides the alternative.

### Error Handling
- \`try { body } catch (e) { body }\` — parens around catch parameter required
- \`try { body } catch (e) { body } finally { body }\`
- \`throw expression\`

### Enums
\`\`\`
enum Status { Open, InProgress, Done }
enum HttpStatus { OK = 200, NotFound = 404, Error = 500 }
\`\`\`
Enums are numeric constants. Access as \`Status.Open\` (0), \`Status.Done\` (2). Enums are frozen objects.

### Custom Error Types
\`\`\`
dec NotFoundError = error.create("NotFoundError")
dec ValidationError = error.create("ValidationError")
throw NotFoundError("User not found")
\`\`\`
Use \`error.create(name)\` for typed errors. Check with \`e is NotFoundError\`. Errors have \`.message\`, \`._id\`, \`.stack\`.
To carry extra data, pass it as an object: \`throw ValidationError(JSON.stringify({ reason: "too long" }))\` or use a wrapper function:
\`\`\`
fn invalidTitle(reason) { return { error: "InvalidTitle", reason: reason } }
\`\`\`

### Functions and Arrows
- \`fn add(a, b) { return a + b }\`
- \`x => x * 2\` — single-param arrow
- \`(a, b) => a + b\` — multi-param arrow
- \`fn greet(name = "World") { ... }\` — default parameters
- \`fn sum(...nums) { ... }\` — rest parameters
- \`async memo fn fetch(url) { ... }\` — memoized async function

### Operators
- \`==\` / \`!=\` — strict equality (compiles to === / !==)
- \`and\` / \`or\` / \`not\` — logical operators
- \`??\` — nullish coalescing: \`value ?? defaultValue\`
- \`~>\` — pipe operator (eager): \`items ~> filter(fn) ~> map(fn)\`
- \`>>\` — flow operator (lazy composition): \`dec process = validate >> transform >> save\`
- \`..\` — range: \`0..5\` produces [0, 1, 2, 3, 4]
- \`...\` — spread: \`[...arr1, ...arr2]\`

### Data
- \`[1, 2, 3]\` — array literal
- \`{ key: value }\` — object literal (keys unquoted)
- \`{ name }\` — shorthand for \`{ name: name }\`
- \`obj.property\` — null-safe member access (compiles to \`obj?.property\`)
- \`dec { a, b } = obj\` — object destructuring
- \`dec [a, b] = arr\` — array destructuring

### Pipes and Flows
Pipes (\`~>\`) chain transformations eagerly:
\`\`\`
dec result = data
  ~> filter(x => x.active)
  ~> map(x => x.name)
  ~> sort((a, b) => a.localeCompare(b))
\`\`\`

Flows (\`>>\`) compose functions lazily (returns a new function):
\`\`\`
dec process = validate >> transform >> format
dec output = process(input)
\`\`\`

### Testing
\`\`\`
describe "Module" {
  beforeEach { /* runs before each test */ }
  afterEach { /* runs after each test */ }
  beforeAll { /* runs once before all tests */ }
  afterAll { /* runs once after all tests */ }

  test "description" {
    expect(expression).toBe(expected)
    expect(expression).toEqual(expected)
    expect(expression).toBeTruthy()
    expect(expression).toBeFalsy()
    expect(expression).toContain(item)
    expect(expression).toHaveLength(n)
    expect(expression).toBeGreaterThan(n)
    expect(expression).toBeLessThan(n)
    expect(expression).toBeNull()
    expect(expression).toBeDefined()
    expect(expression).toBeUndefined()
    expect(expression).toBeCloseTo(number)
    expect(expression).toBeInstanceOf(errorType)
    expect(expression).toMatch(regex)
    expect(fn).toThrow(message)
    expect(expression).not.toBe(unexpected)
    assert condition, "message"
  }

  test.skip "not yet implemented" { }
  test.only "run only this" { }
}
describe.skip "disabled suite" { }
\`\`\`

### JS Interop
- \`js { /* raw JavaScript */ }\` — inline JavaScript block
- Standard JS built-ins are available: \`Math\`, \`Date\`, \`JSON\`, \`Object\`, \`Array\`, \`String\`, \`parseInt\`, \`typeof\`, etc.
- String methods: \`.trim()\`, \`.toLowerCase()\`, \`.includes()\`, \`.split()\`, \`.replace()\`, etc.
- Array methods: \`.filter()\`, \`.map()\`, \`.reduce()\`, \`.sort()\`, \`.find()\`, \`.length\`, etc.

### SpecScript File Structure
SpecScript files (.sp) have three sections delimited by markdown headings:
1. \`## spec\` — human-written specification
2. \`## test\` — tests (KimchiLang code)
3. \`## impl\` — implementation (KimchiLang code)

Both ## test and ## impl must start with a hash comment:
\`<!-- spec-hash: sha256:HASH_VALUE -->\`

### Important Notes
- All \`dec\` bindings are deeply frozen — you cannot mutate objects or arrays
- Use \`mut\` when you need a mutable loop counter or accumulator
- \`expose\` marks functions/values as public API
- Member access is always null-safe (\`obj.a.b.c\` compiles to \`obj?.a?.b?.c\`)
- Parentheses are required around catch parameters: \`catch (e)\` not \`catch e\`
`;

export const STYLE_GUIDANCE = `## KimchiLang Style

Write idiomatic KimchiLang. Prefer these patterns over verbose alternatives:

**Use pipes for data transformation chains:**
\`\`\`
// Good
dec result = items ~> filter(x => x.active) ~> map(x => x.name)

// Avoid
dec filtered = items.filter(x => x.active)
dec result = filtered.map(x => x.name)
\`\`\`

**Use match for multi-branch logic:**
\`\`\`
// Good
match role {
  "admin" => fullAccess()
  "member" => limitedAccess()
  _ => readOnly()
}

// Avoid
if role == "admin" { fullAccess() }
elif role == "member" { limitedAccess() }
else { readOnly() }
\`\`\`

**Use guard for preconditions:**
\`\`\`
// Good
guard user.isActive else { return null }
guard items.length > 0 else { throw ValidationError("No items") }

// Avoid
if not user.isActive { return null }
if items.length == 0 { throw ValidationError("No items") }
\`\`\`

**Use .if().else() for inline conditionals:**
\`\`\`
// Good
dec label = "empty".if(count == 0).else("has items")

// Avoid
dec label = if count == 0 { "empty" } else { "has items" }
\`\`\`

**Use ?? for defaults:**
\`\`\`
// Good
dec name = user.name ?? "Anonymous"

// Avoid
dec name = if user.name != null { user.name } else { "Anonymous" }
\`\`\`

**Use flows for reusable pipelines:**
\`\`\`
// Good
dec processUser = validate >> normalize >> save
dec result = processUser(input)

// Avoid
fn processUser(input) {
  dec validated = validate(input)
  dec normalized = normalize(validated)
  return save(normalized)
}
\`\`\`

**Use pattern matching for destructuring results:**
\`\`\`
// Good
|result.success| => handleSuccess(result.data)
|true| => handleError(result.error)

// Avoid
if result.success { handleSuccess(result.data) } else { handleError(result.error) }
\`\`\`
`;
