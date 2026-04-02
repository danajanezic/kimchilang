# Query Directive

[Back to README](../README.md)

A CRUD database abstraction where types are the schema. No ORM classes — just KimchiLang `type` declarations that map to tables, and a `query` directive block for reads and writes.

## Setup

```
as db dep stdlib.db.postgres({url: "postgres://localhost/mydb"})
as query dep stdlib.db.query({db: db})
```

## Types as Schema

Your type declarations map to tables — `User` becomes the `user` table:

```
type User = {id: number, name: string, email: string, role: string, active: boolean}
type Post = {id: number, title: string, body: string, user_id: number}
```

## Read Operations

```
// Find by ID — returns User or null
dec user = query User { find 42 }

// All rows
dec users = query User { all }

// First / last by ID
dec first = query User { first }
dec last = query User { last }

// Count
dec total = query User { count }
```

## Filtering, Sorting, Pagination

```
dec admins = query User {
  where {role: "admin", active: true}
  sortBy "name" asc
  limit 10
  offset 20
}
```

Multiple `where` clauses are AND'd:

```
dec result = query User {
  where {role: "admin"}
  where {active: true}
  sortBy "created_at" desc
}
```

## Variable References

Use `$varName` to reference KimchiLang variables:

```
dec minAge = 21
dec role = "admin"

dec users = query User {
  where {age: $minAge, role: $role}
  limit 10
}
```

## Mutations

```
// Create — returns the new row
dec newUser = query User { create {name: "Alice", email: "a@test.com"} }

// Update — returns the updated row
query User { update 42 {name: "Bob", email: "bob@test.com"} }

// Remove
query User { remove 42 }
```

## Relationships

Use `include` to eager-load related records. Foreign key convention: the related table has a `<type>_id` column.

```
type Post = {id: number, title: string, user_id: number}
type Profile = {id: number, bio: string, user_id: number}

dec user = query User {
  find 42
  include Post
  include Profile
}

// user.post contains Post[]
// user.profile contains Profile[]
```

## Connection Override

Pass a specific connection in parentheses to override the default:

```
as main dep stdlib.db.postgres({url: "postgres://localhost/app"})
as analytics dep stdlib.db.postgres({url: "postgres://localhost/analytics"})
as query dep stdlib.db.query({db: main})

// Uses main (default)
dec user = query User { find 42 }

// Uses analytics (override)
dec events = query(analytics) Event { where {type: "click"} }
```

## Composing with Contracts

The query directive returns typed data. Use contracts to validate:

```
fn getActiveAdmins() is User {
  return query User {
    where {role: "admin", active: true}
    sortBy "name" asc
  }
}

dec admins = getActiveAdmins()
guard admins.length > 0 else { throw "no admins found" }
print admins[0].name
```

## Composing with SQL

For complex queries beyond CRUD, use the [SQL directive](sql.md):

```
as sql dep stdlib.db.sql({db: db})

type UserReport = {name: string, post_count: number}

dec report = sql is UserReport {
  SELECT u.name, COUNT(p.id) as post_count
  FROM user u
  LEFT JOIN post p ON p.user_id = u.id
  GROUP BY u.name
}
```

Simple operations use `query`. Complex analytics use `sql`. Both share the same `db` connection.
