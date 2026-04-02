# Directive Blocks & Query Database Abstraction

## Overview

Two designs in one: (1) a formalized convention for **directive blocks** — KimchiLang's pattern for domain-specific syntax extensions, and (2) the **query directive** — a CRUD database abstraction built on that convention.

## Part 1: Directive Block Convention

### What it is

A directive block is domain-specific syntax enclosed in `{ }` that a compiler plugin compiles to JavaScript. The pattern already exists in KimchiLang (`shell`, `spawn`). This spec formalizes the convention so third-party extensions can add new directive blocks.

### Syntax

```
directiveName [(override)] [TypeAnnotation] { domain-specific body }
```

- **directiveName** — declared by the extension package, registered when imported
- **(override)** — optional, extension-defined. Each extension decides what the parens mean (connection override, input variables, etc.)
- **TypeAnnotation** — optional `is Type` / `in Type1, Type2` / bare `Type`, depending on the directive
- **{ body }** — lexed and parsed by the extension plugin, not the core language

### Four layers of KimchiLang

| Layer | Import syntax | Example | What it is |
|-------|--------------|---------|------------|
| **Language** | none | `shell`, `spawn`, `match`, `guard` | Built-in, always available |
| **KMX** | `.kmx` extension | JSX syntax | Frontend runtime, auto-loaded by file extension |
| **Stdlib** | `dep stdlib.X` | `as db dep stdlib.db.postgres` | Standard library — drivers, utilities, no compiler plugins |
| **Extensions** | `dep @X` | `dep @db.query({db: db})` | Directive-capable packages from the pantry — include compiler plugin + runtime |

### How extensions are imported

Extensions use `dep @namespace.name` with no alias. The import does three things:

1. Imports the runtime module (passes args)
2. Loads the compiler plugin (lexer/parser/generator hooks)
3. Registers the directive keyword (declared by the extension)

```
as db dep stdlib.db.postgres({url: "postgres://localhost/mydb"})
dep @db.query({db: db})
dep @db.sql({db: db})

type User = {id: number, name: string, email: string}

// "query" and "sql" are now directive keywords in this module
dec user = query User { find 42 }
dec report = sql is User { SELECT * FROM users }
```

No alias needed. No `module has` needed. The `dep @` line is the signal.

### Directive name ownership

Each extension package declares its directive name internally. `@db.query` declares `query`. `@db.sql` declares `sql`. The user doesn't choose the name.

If two extensions declare the same directive name, it's a **compile error**:

```
dep @db.query({db: db})
dep @acme.query({db: db})
// Compile Error: directive name "query" declared by both @db.query and @acme.query
```

A resolution mechanism for name conflicts will be designed later.

### Shadowing prevention

The registered directive name becomes a reserved keyword within the module. Any variable, function, or parameter with the same name is a compile error:

```
dep @db.query({db: db})

dec query = "something"  // Compile Error: 'query' is a directive keyword in this module
```

### Connection override pattern

Extensions that need a connection can accept a default via args and allow per-call overrides in parens:

```
as main dep stdlib.db.postgres({url: "postgres://localhost/app"})
as analytics dep stdlib.db.postgres({url: "postgres://localhost/analytics"})

dep @db.query({db: main})

// Default connection (main)
dec user = query User { find 42 }

// Override with specific connection
dec events = query(analytics) Event { where {type: "click"} }
```

No parens = default (from module args). Parens = override. The extension defines what parens mean.

### Extension package structure

An extension package (stored in `.km_extensions/` or the pantry) contains:

```
@db.query/
  plugin.js       # Compiler plugin (lexer/parser/generator hooks)
  runtime.km      # KimchiLang runtime module (exposes functions)
  manifest.json   # Declares directive name, dependencies, version
```

The `manifest.json` declares:

```json
{
  "name": "@db.query",
  "directive": "query",
  "runtime": "runtime.km",
  "plugin": "plugin.js"
}
```

### Contract for database extensions

Database extensions accept a `db` arg that must satisfy:

```
type Queryable = {query: (sql: string, params: any) => any}
```

The extension's runtime validates this at initialization:

```
// @db.query/runtime.km
arg db
guard db is Queryable else { throw "db must have a query function" }
```

### Built-in directives (unchanged)

`shell` and `spawn` remain built-in language constructs — no `dep @` needed. KMX (JSX) remains auto-loaded by `.kmx` file extension. These are not extensions, they're part of the core language and frontend runtime.

---

## Part 2: Query Directive

### Purpose

A CRUD database abstraction where types are the schema. No ORM classes, no migration DSL — just KimchiLang `type` declarations that map to tables, and a directive block for reads/writes.

### Setup

```
as db dep stdlib.db.postgres({url: "postgres://localhost/mydb"})
dep @db.query({db: db})
```

### Types as schema

```
type User = {id: number, name: string, email: string, role: string, active: boolean}
type Post = {id: number, title: string, body: string, user_id: number}
type Profile = {id: number, bio: string, user_id: number}
```

The type name maps to a table: `User` → `users` (lowercase + `s` suffix). The type's properties are the columns.

### CRUD Operations

#### Find by ID

```
dec user = query User { find 42 }
```

SQL: `SELECT * FROM users WHERE id = $1`
Returns: `User` or `null`

#### All rows

```
dec users = query User { all }
```

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

Implementation: separate queries joined in the runtime module.

#### Include with filtering

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

### Variable interpolation

Query bodies can reference KimchiLang variables with `$`:

```
dec minAge = 21
dec role = "admin"

dec users = query User {
  where {age: $minAge, role: $role}
  limit 10
}
```

The `$var` references become parameterized query values, same as the SQL plugin. SQL injection is impossible.

### Connection override

```
as main dep stdlib.db.postgres({url: "postgres://localhost/app"})
as analytics dep stdlib.db.postgres({url: "postgres://localhost/analytics"})

dep @db.query({db: main})

// Default connection (main)
dec user = query User { find 42 }

// Override with analytics
dec events = query(analytics) Event { where {type: "click"} }
```

### Composing with contracts

```
type ActiveAdmin = {id: number, name: string, role: string, active: boolean}

fn getActiveAdmins() is ActiveAdmin {
  return query User {
    where {role: "admin", active: true}
    sortBy "name" asc
  }
}

dec admins = getActiveAdmins()
guard admins.length > 0 else { throw "no admins found" }
print admins[0].name  // compiler knows .name exists
```

### Composing with sql

For complex queries beyond CRUD, drop to raw sql:

```
dep @db.sql({db: db})

type UserReport = {name: string, post_count: number}

dec report = sql is UserReport {
  SELECT u.name, COUNT(p.id) as post_count
  FROM users u
  LEFT JOIN posts p ON p.user_id = u.id
  GROUP BY u.name
  HAVING COUNT(p.id) > 5
}
```

Simple operations use `query`. Complex analytics use `sql`. Both share the same `db` connection and type contracts.

---

## Implementation

### Extension: `@db.query`

**plugin.js (compiler hooks):**
- **Lexer:** Recognize `query` followed by identifier + `{`. Handle optional `(override)` between `query` and the type name. Capture body.
- **Parser:** Parse body operations: `find`, `all`, `first`, `last`, `count`, `where`, `sortBy`, `limit`, `offset`, `create`, `update`, `remove`, `include`. Extract `$var` references. Build `QueryBlock` AST node.
- **Generator:** Compile to function calls on the extension's runtime module. Type name → table name conversion at compile time.

**runtime.km (runtime module):**
- Accepts `{db: Queryable}` arg
- Exposes: `find`, `all`, `first`, `last`, `count`, `where`, `create`, `update`, `remove`, `include`
- Each function builds SQL and calls `db.query(sql, params)`

### Extension: `@db.sql`

Migrate existing `src/extensions/sql.js` to extension package format. Same plugin, new import pattern.

### Migration path

Current `sql(db) is User { ... }` syntax continues to work during transition. The `dep @db.sql` import pattern is the new recommended approach.

---

## Out of scope

- Schema migrations / DDL
- Transaction blocks (future directive)
- Connection pooling configuration
- Database-specific SQL in the query directive
- Table name customization (always type name → lowercase + s)
- Directive name conflict resolution mechanism (compile error for now)
- KimchiLang-native extension authoring (noted as future task #128)
