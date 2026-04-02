# Directive Blocks & Query Database Abstraction

## Overview

Two designs in one: (1) a formalized convention for **directive blocks** — KimchiLang's pattern for domain-specific syntax extensions, and (2) the **query directive** — a CRUD database abstraction built on that convention.

## Part 1: Directive Block Convention

### What it is

A directive block is domain-specific syntax enclosed in `{ }` that a compiler plugin compiles to JavaScript. The pattern already exists in KimchiLang (`shell`, `spawn`, `sql`). This spec formalizes the convention so future extensions follow a consistent shape.

### Syntax

```
directiveName [(override)] [TypeAnnotation] { domain-specific body }
```

- **directiveName** — hardcoded by the plugin, registered in the extension registry
- **(override)** — optional, plugin-defined. Passes context to the compiled output. Each plugin decides what the parens mean (connection override, input variables, etc.)
- **TypeAnnotation** — optional `is Type` / `in Type1, Type2` / bare `Type`, depending on the directive. Same semantics as everywhere else in KimchiLang.
- **{ body }** — lexed and parsed by the plugin, not the core language

### Runtime/Compile-time split

Each directive has two halves:

| Half | What | Where |
|------|------|-------|
| **Compile-time** | Plugin (JS) — lexer, parser, generator hooks | `src/extensions/<name>.js` |
| **Runtime** | Stdlib module (KimchiLang) — exposes functions the compiled code calls | `stdlib/db/<name>.km` or similar |

The plugin compiles directive syntax into function calls on the runtime module. The module takes dependencies as `arg` declarations and validates them with contracts.

### Connection pattern

Directive-capable modules register a default connection via `dep`. The directive uses it automatically. Parens override the default with a specific connection:

```
as db dep stdlib.db.postgres({url: "postgres://localhost/app"})
as analytics dep stdlib.db.postgres({url: "postgres://localhost/analytics"})

// Register default connection
as sql dep stdlib.db.sql({db: db})

// Uses default (db)
dec users = sql is User { SELECT * FROM users }

// Override with specific connection
dec events = sql(analytics) is Event { SELECT * FROM events }
```

No parens = default. Parens = override. Plugin defines the rules for what goes in the parens.

### How the compiler links directives to modules

The plugin registers which `dep` module path it pairs with. When the compiler encounters a `dep` import for that module path, it stores the internal variable name. When the directive is used, the compiled output calls methods on that internal variable. If parens provide an override, the compiled output uses the override variable instead.

Example: the `sql` plugin registers that `stdlib.db.sql` is its runtime module. When the compiler sees `as sql dep stdlib.db.sql({db: db})`, it knows `_dep_sql` provides the runtime. `sql is User { SELECT * }` compiles to `await _dep_sql.query("SELECT *")`. `sql(analytics) is User { SELECT * }` compiles to `await analytics.query("SELECT *")`.

### Existing directives (unchanged)

| Directive | Plugin | Runtime | Parens meaning |
|-----------|--------|---------|---------------|
| `shell` | built-in | built-in `_shell` | input variables for interpolation |
| `spawn` | built-in | built-in `_spawn` | — |
| `sql` | `src/extensions/sql.js` | `stdlib/db/sql.km` | connection override |
| `query` | `src/extensions/query.js` (new) | `stdlib/db/query.km` (new) | connection override |

### Contract for database modules

All database directive modules accept a `db` arg that must satisfy:

```
type Queryable = {query: (sql: string, params: any) => any}
```

The `guard db is Queryable` check runs at module initialization. Any driver that exposes `query(sql, params)` works — postgres, mysql, sqlite.

---

## Part 2: Query Directive

### Purpose

A CRUD database abstraction where types are the schema. No ORM classes, no migration DSL — just KimchiLang `type` declarations that map to tables, and a directive block for reads/writes.

### Setup

```
as db dep stdlib.db.postgres({url: "postgres://localhost/mydb"})
as query dep stdlib.db.query({db: db})
```

### Types as schema

```
type User = {id: number, name: string, email: string, role: string, active: boolean}
type Post = {id: number, title: string, body: string, user_id: number}
type Profile = {id: number, bio: string, user_id: number}
```

The type name maps to a table: `User` → `users` (lowercase, pluralized with `s` suffix). The type's properties are the columns. The contract system (`guard x is User`) validates that query results match the shape.

### CRUD Operations

#### Find by ID

```
dec user = query User { find 42 }
```

Compiles to: `await query.find("users", 42)`
SQL: `SELECT * FROM users WHERE id = $1`
Returns: `User` or `null`

#### All rows

```
dec users = query User { all }
```

Compiles to: `await query.all("users")`
SQL: `SELECT * FROM users`
Returns: `User[]`

#### First / Last

```
dec first = query User { first }
dec last = query User { last }
```

SQL: `SELECT * FROM users ORDER BY id ASC LIMIT 1` / `... DESC LIMIT 1`
Returns: `User` or `null`

#### Count

```
dec total = query User { count }
```

SQL: `SELECT COUNT(*) FROM users`
Returns: `number`

#### Where (filtering)

```
dec admins = query User { where {role: "admin", active: true} }
```

SQL: `SELECT * FROM users WHERE role = $1 AND active = $2`
Returns: `User[]`

Multiple conditions in one `where` are AND'd. Multiple `where` clauses are also AND'd:

```
dec result = query User {
  where {role: "admin"}
  where {active: true}
}
```

#### Sorting

```
dec sorted = query User {
  where {active: true}
  sortBy "name" asc
}
```

`asc` and `desc` are keywords inside the query body. Default is `asc`.

#### Pagination

```
dec page2 = query User {
  where {active: true}
  sortBy "name" asc
  limit 10
  offset 10
}
```

#### Create

```
dec newUser = query User { create {name: "Alice", email: "a@test.com", role: "user", active: true} }
```

SQL: `INSERT INTO users (name, email, role, active) VALUES ($1, $2, $3, $4) RETURNING *`
Returns: `User` (the created row)

#### Update

```
query User { update 42 {name: "Bob", email: "bob@test.com"} }
```

SQL: `UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING *`
Returns: `User` (the updated row)

#### Remove

```
query User { remove 42 }
```

SQL: `DELETE FROM users WHERE id = $1`
Returns: `void`

### Relationships

#### Include (eager loading)

```
dec userWithPosts = query User {
  find 42
  include Post
  include Profile
}
```

Foreign key convention: `Post` has `user_id` (singular type name + `_id`). The result type is extended with the included relation:

```
// Return type: User & {posts: Post[], profile: Profile[]}
print userWithPosts.name
print userWithPosts.posts.length
```

Implementation: separate queries joined in the runtime. First query fetches the user, subsequent queries fetch related rows by foreign key.

```js
// Compiled:
const _user = await query.find("users", 42);
if (_user) {
  _user.posts = await query._include("posts", "user_id", _user.id);
  _user.profile = await query._include("profiles", "user_id", _user.id);
}
```

#### Include with where

```
dec userWithRecentPosts = query User {
  find 42
  include Post {
    where {published: true}
    sortBy "created_at" desc
    limit 5
  }
}
```

Include takes an optional block that filters/sorts the related rows.

### Connection override

```
as main dep stdlib.db.postgres({url: "postgres://localhost/app"})
as analytics dep stdlib.db.postgres({url: "postgres://localhost/analytics"})
as query dep stdlib.db.query({db: main})

// Default connection (main)
dec user = query User { find 42 }

// Override with analytics
dec events = query(analytics) Event { where {type: "click"} }
```

### Composing with contracts

The query directive returns typed data. Contracts validate it:

```
type ActiveAdmin = {id: number, name: string, role: string, active: boolean}

fn getActiveAdmins() is ActiveAdmin {
  dec admins = query User {
    where {role: "admin", active: true}
    sortBy "name" asc
  }
  return admins
}

// Caller gets typed result
dec admins = getActiveAdmins()
guard admins.length > 0 else { throw "no admins found" }
print admins[0].name  // compiler knows .name exists
```

### Composing with sql

For complex queries that exceed the CRUD abstraction, drop to `sql`:

```
as sql dep stdlib.db.sql({db: db})

type UserReport = {name: string, post_count: number, last_post: string}

dec report = sql is UserReport {
  SELECT u.name, COUNT(p.id) as post_count, MAX(p.created_at) as last_post
  FROM users u
  LEFT JOIN posts p ON p.user_id = u.id
  GROUP BY u.name
  HAVING COUNT(p.id) > 5
  ORDER BY post_count DESC
}
```

Simple CRUD uses `query`. Complex reporting/analytics uses `sql`. Both share the same `db` connection and type contracts.

---

## Implementation plan

### Plugin: `src/extensions/query.js`

**Lexer:** Recognize `query` keyword followed by an identifier (type name) and `{`. Capture the body. Handle optional `(override)` before the type name.

**Parser:** Parse body operations: `find`, `all`, `first`, `last`, `count`, `where`, `sortBy`, `limit`, `offset`, `create`, `update`, `remove`, `include`. Build a `QueryBlock` AST node.

**Generator:** Compile to `await _dep_query.find(...)`, `await _dep_query.where(...)`, etc. Chain operations into a single SQL query where possible.

### Runtime: `stdlib/db/query.km`

Exposes: `find`, `all`, `first`, `last`, `count`, `where`, `create`, `update`, `remove`, `_include`.

Each function builds SQL from the table name, conditions, and options, then calls `db.query(sql, params)`.

Type-to-table mapping: `User` → `users` (lowercase + `s`). Done in the plugin at compile time — the runtime receives table name strings.

### Update to SQL plugin

Remove `(connection)` syntax from the sql plugin. Replace with module-arg pattern matching query. Update `stdlib/db/sql.km` to accept `{db: db}` arg.

### Migration for existing sql(db) usage

The playground's `server.km` and any `sql(db)` usage needs to update to the new pattern. The `(db)` override syntax still works for non-default connections, but the default case drops the parens.

---

## Out of scope

- Schema migrations / DDL
- Transaction blocks (future directive: `transaction { ... }`)
- Connection pooling config beyond what the driver provides
- Database-specific syntax in the query directive (it generates standard SQL)
- Table name customization (always type name → lowercase + s)
