# KimchiLang Testing Framework

KimchiLang has a built-in testing framework that makes it easy to write and run tests without any external dependencies.

## Running Tests

```bash
kimchi test myfile.km
```

## Syntax

### `test`

Define a single test case:

```kimchi
test "test name" {
  // test code here
}
```

### `describe`

Group related tests together:

```kimchi
describe "Group name" {
  test "first test" {
    // ...
  }
  
  test "second test" {
    // ...
  }
}
```

Describe blocks can be nested:

```kimchi
describe "Math operations" {
  describe "Addition" {
    test "adds positive numbers" {
      expect(1 + 2).toBe(3)
    }
  }
  
  describe "Subtraction" {
    test "subtracts numbers" {
      expect(5 - 3).toBe(2)
    }
  }
}
```

### `expect`

Make assertions about values:

```kimchi
expect(actual).matcher(expected)
```

### `assert`

Simple assertion with optional message:

```kimchi
assert condition, "Error message if condition is false"
assert 1 + 1 == 2
```

## Matchers

### `toBe(expected)`

Strict equality check (`===`):

```kimchi
expect(5).toBe(5)
expect("hello").toBe("hello")
```

### `toEqual(expected)`

Deep equality check (compares objects/arrays by value):

```kimchi
expect({ a: 1 }).toEqual({ a: 1 })
expect([1, 2, 3]).toEqual([1, 2, 3])
```

### `toContain(item)`

Check if array or string contains an item:

```kimchi
expect([1, 2, 3]).toContain(2)
expect("hello world").toContain("world")
```

### `toBeNull()`

Check if value is null:

```kimchi
expect(null).toBeNull()
```

### `toBeTruthy()`

Check if value is truthy:

```kimchi
expect(true).toBeTruthy()
expect("hello").toBeTruthy()
expect(1).toBeTruthy()
```

### `toBeFalsy()`

Check if value is falsy:

```kimchi
expect(false).toBeFalsy()
expect(null).toBeFalsy()
expect(0).toBeFalsy()
expect("").toBeFalsy()
```

### `toBeGreaterThan(n)`

Check if value is greater than n:

```kimchi
expect(10).toBeGreaterThan(5)
```

### `toBeLessThan(n)`

Check if value is less than n:

```kimchi
expect(3).toBeLessThan(7)
```

### `toHaveLength(n)`

Check array or string length:

```kimchi
expect([1, 2, 3]).toHaveLength(3)
expect("hello").toHaveLength(5)
```

### `toMatch(pattern)`

Check if string matches a regex pattern:

```kimchi
expect("hello@example.com").toMatch(/\w+@\w+\.\w+/)
```

### `toThrow(message?)`

Check if a function throws an error:

```kimchi
dec throwingFn = () => {
  throw error("Something went wrong")
}
expect(throwingFn).toThrow()
expect(throwingFn).toThrow("Something went wrong")
```

## Complete Example

```kimchi
// math.test.km

fn add(a, b) {
  return a + b
}

fn divide(a, b) {
  if b == 0 {
    throw error("Cannot divide by zero")
  }
  return a / b
}

describe "Math functions" {
  describe "add" {
    test "adds two positive numbers" {
      expect(add(2, 3)).toBe(5)
    }
    
    test "adds negative numbers" {
      expect(add(-1, -2)).toBe(-3)
    }
    
    test "adds zero" {
      expect(add(5, 0)).toBe(5)
    }
  }
  
  describe "divide" {
    test "divides two numbers" {
      expect(divide(10, 2)).toBe(5)
    }
    
    test "throws on division by zero" {
      expect(() => divide(10, 0)).toThrow("Cannot divide by zero")
    }
  }
}

// Using assert for simple checks
test "basic assertions" {
  assert 1 + 1 == 2, "Basic math should work"
  assert true
}
```

Run with:

```bash
kimchi test math.test.km
```

Output:

```
Math functions
  add
    ✓ adds two positive numbers
    ✓ adds negative numbers
    ✓ adds zero
  divide
    ✓ divides two numbers
    ✓ throws on division by zero
✓ basic assertions

6 tests, 6 passed, 0 failed
```

## Async Tests

Tests automatically support async operations:

```kimchi
test "async operation" {
  dec result = await fetchData()
  expect(result.status).toBe(200)
}
```

## Best Practices

1. **One assertion per test** - Keep tests focused on a single behavior
2. **Descriptive names** - Use clear, descriptive test names
3. **Group related tests** - Use `describe` blocks to organize tests
4. **Test edge cases** - Include tests for error conditions and boundary values
5. **Keep tests independent** - Each test should be able to run in isolation
