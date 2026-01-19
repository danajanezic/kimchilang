# KimchiLang Testing Examples

This directory demonstrates how to write unit tests in KimchiLang.

## Running Tests

```bash
# Run math tests
kimchi examples.testing.math.test

# Run user service tests (with mocked dependencies)
kimchi examples.testing.user_service.test
```

## Test Syntax

### Basic Test

```kimchi
test "description of test" {
  expect(actual).toBe(expected)
}
```

### Grouped Tests with Describe

```kimchi
describe "Feature Name" {
  test "specific behavior" {
    expect(result).toBe(expected)
  }
  
  test "another behavior" {
    expect(other).toEqual(expected)
  }
}
```

### Available Matchers

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

### Assert Statement

```kimchi
assert condition, "Error message if false"
```

## Testing with Mocks

KimchiLang's dependency injection makes mocking easy:

```kimchi
// Create a mock
dec mockDep = {
  someMethod: (arg) => "mocked result"
}

// Inject mock when importing
as myModule dep path.to.module({
  "path.to.dependency": mockDep
})

// Now myModule uses the mock instead of real dependency
test "uses mock" {
  expect(myModule.doSomething()).toBe("mocked result")
}
```

## Files in This Directory

- `math.km` - Math utility functions
- `math.test.km` - Tests for math module
- `http_client.km` - Simple HTTP client stub
- `user_service.km` - User service that depends on HTTP client
- `user_service.test.km` - Tests with mocked HTTP client
