# Testing

[Back to README](../README.md) | [Language Guide](language-guide.md)

KimchiLang includes a built-in testing framework.

## Running Tests

```bash
kimchi test myfile.test.km         # Run tests in a file
kimchi test tests/                 # Run all test files in a directory
```

## Test Syntax

```kimchi
test "addition works" {
  expect(add(2, 3)).toBe(5)
}

describe "Math functions" {
  test "add returns correct sum" {
    expect(add(2, 3)).toBe(5)
  }

  test "multiply returns correct product" {
    expect(multiply(3, 4)).toBe(12)
  }
}

// Simple assertions
assert condition, "Error message if false"
```

## Matchers

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
| `toBeDefined()` | Value is not `undefined` |
| `toBeUndefined()` | Value is `undefined` |
| `toBeCloseTo(num)` | Number is close to expected (floating point) |
| `toBeInstanceOf(type)` | Error type matches (via `._id`) |

## Modifiers

```kimchi
// .not — inverts any matcher
expect(1).not.toBe(2)
expect(items).not.toContain("banned")

// .only — only this test/suite runs (file-scoped)
test.only "critical test" { ... }
describe.only "important suite" { ... }

// .skip — skip this test/suite
test.skip "not yet done" { ... }
describe.skip "disabled suite" { ... }
```

## Lifecycle Hooks

```kimchi
describe "Database" {
  beforeAll { /* once before all tests */ }
  afterAll { /* once after all tests */ }
  beforeEach { /* before each test */ }
  afterEach { /* after each test */ }

  test "query works" { ... }
}
```

## Testing with Mocks

Use [dependency injection](modules.md#dependency-injection) to mock dependencies:

```kimchi
dec mockHttp = {
  get: (url) => { status: 200, data: { id: 1, name: "Test" } }
}

// Inject mock when importing module
as userService dep myapp.user-service({
  "myapp.http-client": mockHttp
})

test "getUser returns user data" {
  dec user = userService.getUser(1)
  expect(user.name).toBe("Test")
}
```

## Running the Compiler Test Suite

```bash
node test/test.js          # Compiler tests
node test/stdlib_test.js   # Standard library tests
npm test                   # Both
```
