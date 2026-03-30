## spec

# Calculator

**intent:** Provide basic arithmetic operations
**reason:** Foundation for math-dependent modules

### requires

- Support addition of two numbers
- Support subtraction of two numbers
- Support multiplication of two numbers
- Return numeric results for all operations

### types

- Operation :: Add | Subtract | Multiply

### expose add :: (Number, Number) -> Number

**intent:** Add two numbers together

### expose subtract :: (Number, Number) -> Number

**intent:** Subtract second number from first

### expose multiply :: (Number, Number) -> Number

**intent:** Multiply two numbers together

## test

<!-- spec-hash: sha256:b58d4d530ef1febfa0c7a5de8eefa5d99a55e753f3696ad506b63c4f290c2b4f -->

test "add returns sum" {
  expect(add(2, 3)).toBe(5)
}

test "add handles negatives" {
  expect(add(-1, 1)).toBe(0)
}

test "subtract returns difference" {
  expect(subtract(10, 4)).toBe(6)
}

test "multiply returns product" {
  expect(multiply(3, 4)).toBe(12)
}

test "multiply by zero returns zero" {
  expect(multiply(5, 0)).toBe(0)
}

## impl

<!-- spec-hash: sha256:b58d4d530ef1febfa0c7a5de8eefa5d99a55e753f3696ad506b63c4f290c2b4f -->

fn add(a, b) {
  return a + b
}

fn subtract(a, b) {
  return a - b
}

fn multiply(a, b) {
  return a * b
}
