# Contracts

[Back to README](../README.md)

KimchiLang's contract system uses three existing language features together: `type` to declare the shape, `guard...is` to enforce it, and the compiler narrows the type after the guard. No new keywords, no interfaces, no abstract classes.

## Basic Contract

Define a shape with `type`, enforce it with `guard...is`:

```
type Storable = {key: string, save: (any) => void}

fn store(item) {
  guard item is Storable else { return "not storable" }
  // Compiler knows item has .key and .save
  // Uses . not ?. for property access
  print "Storing ${item.key}"
  item.save(item)
}
```

After the guard, the compiler narrows `item`'s type to the `Storable` shape. Property access uses direct `.` instead of optional chaining `?.`. If the guard fails, the else block exits the function.

At runtime, `is` uses duck typing — it checks that the required keys exist on the object, not that it was constructed by a specific class. Any object with `key` and `save` properties satisfies the contract.

## Composing Contracts

Sequential guards merge their shapes:

```
type HasName = {name: string}
type HasEmail = {email: string}
type HasAge = {age: number}

fn createProfile(user) {
  guard user is HasName else { return "missing name" }
  guard user is HasEmail else { return "missing email" }
  // user is now known to have both .name and .email
  return "Profile: ${user.name} <${user.email}>"
}
```

Each guard adds properties to the compiler's knowledge of the variable. After both guards, `user` is known to have `name` and `email`. This is additive — the second guard doesn't erase the first.

## Contracts with Functions

Type aliases can include function signatures:

```
type Serializable = {
  toJSON: () => string,
  fromString: (s: string) => any
}

type Validatable = {
  validate: () => boolean,
  errors: () => string[]
}

fn process(record) {
  guard record is Validatable else { throw "must be validatable" }
  guard record.validate() else { throw record.errors().join(", ") }

  guard record is Serializable else { throw "must be serializable" }
  return record.toJSON()
}
```

## Contracts in Match

The `is` operator works in match arms too:

```
type Circle = {radius: number}
type Rectangle = {width: number, height: number}

fn area(shape) {
  return match shape {
    is Circle => 3.14159 * shape.radius * shape.radius
    is Rectangle => shape.width * shape.height
    _ => 0
  }
}
```

## Why Not Interfaces?

KimchiLang doesn't have interfaces, abstract classes, or `implements` declarations. The contract pattern achieves the same goals without them:

| Traditional OOP | KimchiLang |
|----------------|------------|
| `interface Storable { save(): void }` | `type Storable = {save: () => void}` |
| `class Foo implements Storable` | No declaration needed — duck typing |
| `if (x instanceof Storable)` | `guard x is Storable else { ... }` |
| Compile error: missing method | Runtime check: key not found |

The tradeoff: traditional interfaces catch missing methods at compile time (when you declare `implements`). KimchiLang catches them at runtime (when `is` checks the shape). The guard pattern makes the check explicit and early — the first thing a function does is validate its inputs.

## Patterns

### Validate-then-use

```
type Config = {host: string, port: number, debug: boolean}

fn startServer(opts) {
  guard opts is Config else { throw "invalid config" }
  print "Starting on ${opts.host}:${opts.port}"
}
```

### Progressive narrowing

```
type Base = {id: string}
type WithTimestamps = {createdAt: string, updatedAt: string}
type WithAuthor = {author: string}

fn auditLog(record) {
  guard record is Base else { return null }
  guard record is WithTimestamps else { return null }
  guard record is WithAuthor else { return null }
  // record has id, createdAt, updatedAt, author
  return "${record.author} modified ${record.id} at ${record.updatedAt}"
}
```

### Contract as parameter documentation

Even without enforcement, `type` aliases document what a function expects:

```
type SearchQuery = {
  term: string,
  filters: any,
  page: number,
  limit: number
}

// The type name in the guard tells readers what shape is expected
fn search(query) {
  guard query is SearchQuery else { throw "invalid query" }
  // ...
}
```
