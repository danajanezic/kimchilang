# SQL Plugin

[Back to README](../README.md)

The SQL plugin adds inline SQL queries to KimchiLang with compile-time parameterization and type annotations. SQL injection is impossible — `$var` references always compile to parameterized query placeholders.

## Setup

SQL files use the `.kmsql` extension, which auto-loads the plugin. Connect to a database using the stdlib postgres module:

```
as db dep stdlib.db.postgres({url: "postgres://localhost/mydb"})
```

Then write queries with `sql(db)`:

```
dec users = sql(db) is User { SELECT * FROM users }
```

The connection variable in `sql(db)` tells the plugin which variable has the `.query()` method. If omitted, it defaults to `db`.

## Basic Queries

```
dec users = sql { SELECT * FROM users }
dec count = sql { SELECT COUNT(*) as total FROM orders }
```

Compiles to:

```js
const users = await db.query("SELECT * FROM users");
const count = await db.query("SELECT COUNT(*) as total FROM orders");
```

## Parameterized Queries

Use `$varName` to reference KimchiLang variables. Each becomes a numbered placeholder (`$1`, `$2`, ...) with the variable passed in a parameter array:

```
dec minAge = 21
dec status = "active"

dec users = sql { SELECT * FROM users WHERE age > $minAge AND status = $status }
```

Compiles to:

```js
const users = await db.query(
  "SELECT * FROM users WHERE age > $1 AND status = $2",
  [minAge, status]
);
```

SQL injection is impossible — `$varName` never becomes string concatenation.

## Typed Queries

### `sql is Type` — result rows match this shape

```
type User = {id: number, name: string, email: string}

dec users = sql is User { SELECT id, name, email FROM users }
// Compiler knows: users is User[]
// users[0].name uses . not ?.
```

### `sql is A, B` — intersection (rows have ALL shapes)

```
type HasTimestamps = {created_at: string, updated_at: string}
type HasAuthor = {author_id: number}

dec records = sql is HasTimestamps, HasAuthor {
  SELECT * FROM documents WHERE published = true
}
// records[0].created_at and records[0].author_id both known
```

### `sql in A, B` — union (rows are ONE OF these shapes)

```
type Admin = {role: string, permissions: string}
type User = {role: string, email: string}

dec accounts = sql in Admin, User {
  SELECT * FROM accounts WHERE active = true
}
// accounts[0] is Admin | User — use match...is to narrow
```

## Connection Variable

By default, `sql { ... }` calls `db.query(...)`. To use a different variable, pass it in parentheses:

```
as pg dep stdlib.db.postgres({url: "postgres://localhost/mydb"})
as mysql dep stdlib.db.mysql({url: "mysql://localhost/mydb"})

// Each query uses its own connection
dec users = sql(pg) is User { SELECT * FROM users }
dec orders = sql(mysql) is Order { SELECT * FROM orders }
```

## Full Example

```
as db dep stdlib.db.postgres({url: "postgres://localhost/mydb"})

type User = {id: number, name: string, email: string}
type CreateResult = {id: number}

fn getUsers(minAge) is User {
  return sql(db) is User { SELECT * FROM users WHERE age > $minAge }
}

fn createUser(name, email) is CreateResult {
  return sql(db) is CreateResult {
    INSERT INTO users (name, email) VALUES ($name, $email)
    RETURNING id
  }
}

fn findByNameOrEmail(search) is User {
  return sql(db) is User {
    SELECT * FROM users
    WHERE name ILIKE $search OR email ILIKE $search
  }
}
```

## How It Works

The SQL plugin hooks into three compiler stages:

1. **Lexer**: recognizes `sql` followed by optional `is`/`in` + type names + `{ ... }`. Extracts `$var` references and replaces them with `$1`, `$2`, etc.
2. **Parser**: creates a `SqlQuery` AST node with the SQL string, parameter list, and type annotations.
3. **Generator**: emits `await db.query(sql, [params])` calls.

The plugin assumes a `db` object with a `.query(sql, params)` method is available — compatible with `pg` (PostgreSQL), `mysql2`, `better-sqlite3`, and most Node.js database drivers.
