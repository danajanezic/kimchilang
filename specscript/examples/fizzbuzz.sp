## spec

# FizzBuzz

**intent:** Generate FizzBuzz sequence up to n
**reason:** Classic programming exercise for testing divisibility

### requires

- Generate sequence from 1 to n
- Replace multiples of 3 with "Fizz"
- Replace multiples of 5 with "Buzz"
- Replace multiples of both 3 and 5 with "FizzBuzz"
- Return array of strings

### expose fizzbuzz :: (Number) -> [String]

**intent:** Generate FizzBuzz sequence up to n

## test

<!-- spec-hash: sha256:f846977144145534a30711bff1e5054fa3be04211794d61898c367be71a71320 -->

```
test "generates sequence from 1 to n" {
  dec result = fizzbuzz(5)
  expect(result).toHaveLength(5)
}

test "replaces multiples of 3 with Fizz" {
  dec result = fizzbuzz(3)
  expect(result[2]).toBe("Fizz")
}

test "replaces multiples of 5 with Buzz" {
  dec result = fizzbuzz(5)
  expect(result[4]).toBe("Buzz")
}

test "replaces multiples of both 3 and 5 with FizzBuzz" {
  dec result = fizzbuzz(15)
  expect(result[14]).toBe("FizzBuzz")
}

test "returns array of strings" {
  dec result = fizzbuzz(5)
  expect(result).toEqual(["1", "2", "Fizz", "4", "Buzz"])
}

test "handles n of 1" {
  dec result = fizzbuzz(1)
  expect(result).toEqual(["1"])
}

test "handles n of 15" {
  dec result = fizzbuzz(15)
  expect(result).toEqual(["1", "2", "Fizz", "4", "Buzz", "Fizz", "7", "8", "Fizz", "Buzz", "11", "Fizz", "13", "14", "FizzBuzz"])
}
```

## impl

<!-- spec-hash: sha256:f846977144145534a30711bff1e5054fa3be04211794d61898c367be71a71320 -->

```
fn fizzbuzz(n) {
  return Array.from({length: n}, (_, i) => {
    dec num = i + 1
    return match [num % 3, num % 5] {
      [0, 0] => "FizzBuzz"
      [0, _] => "Fizz"
      [_, 0] => "Buzz"
      _ => String(num)
    }
  })
}
```
