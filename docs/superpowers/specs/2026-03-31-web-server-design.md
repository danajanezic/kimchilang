# Web Server Design (stdlib.web.server)

## Overview

A minimal built-in HTTP server for KimchiLang. The server does three things: listen on a port, parse requests into immutable objects, and send responses. Everything else — routing, middleware, validation, auth — is user code using KimchiLang's `match`, `guard`, pipes, and other language features.

## Configuration (static file)

```
// server.static
Port 3000
Host "0.0.0.0"

Cors {
  origin = "*"
  methods = "GET, POST, PUT, DELETE"
}
```

- `Port` — listen port (required)
- `Host` — bind address (default `"0.0.0.0"`)
- `Cors` — optional. When present, the server auto-handles OPTIONS preflight and adds CORS headers to all responses.

## Usage

```kimchi
as config dep app.server
as server dep stdlib.web.server({config: config})

server.listen((req) => {
  match req.path {
    "/hello" => ok({message: "Hello, World!"})

    "/users" => match req.method {
      "GET" => ok(getAllUsers())
      "POST" => {
        guard req.body != null else { return badRequest("body required") }
        return created(createUser(req.body))
      }
      _ => response(405, "Method not allowed")
    }

    _ => {
      dec params = req.match("/users/:id")
      guard params != null else { return notFound("not found") }

      match req.method {
        "GET" => {
          dec user = findUser(params.id)
          guard user != null else { return notFound("user not found") }
          return ok(user)
        }
        "PUT" => ok(updateUser(params.id, req.body))
        "DELETE" => { deleteUser(params.id); return noContent() }
        _ => response(405, "Method not allowed")
      }
    }
  }
})
```

## API

### server.listen(callback)

Starts the HTTP server. The callback receives every request and must return a response object.

```kimchi
server.listen((req) => {
  return ok({message: "Hello!"})
})
```

The callback is the single entry point for all requests. The user decides how to route, validate, and respond using KimchiLang syntax.

If the callback throws, the server catches it and returns 500.

### server.close()

Stops accepting new connections and closes existing ones gracefully.

```kimchi
server.close()
```

## Request object

```
{
  method: string,           // "GET", "POST", etc.
  path: string,             // "/users/123"
  headers: {key: string},   // lowercase header names
  body: any,                // auto-parsed JSON or raw string or null
  query: {key: string}      // parsed query string ?key=value
}
```

Immutable.

**Auto-parsing:** If `Content-Type` is `application/json`, `req.body` is the parsed object. Otherwise, `req.body` is the raw string (or null if no body).

### Request helpers

**req.segments()** — splits path into an array of segments:

```kimchi
// req.path = "/users/123/posts"
req.segments()  // ["users", "123", "posts"]
```

**req.match(pattern)** — matches path against a pattern with `:param` placeholders. Returns an object of extracted params, or null if no match:

```kimchi
// req.path = "/users/123"
req.match("/users/:id")           // {id: "123"}
req.match("/users/:id/posts/:pid") // null (doesn't match)
req.match("/posts/:id")           // null (doesn't match)

// req.path = "/users/123/posts/456"
req.match("/users/:id/posts/:pid") // {id: "123", pid: "456"}
```

## Response helpers

| Helper | Status | Body |
|--------|--------|------|
| `ok(body)` | 200 | body |
| `created(body)` | 201 | body |
| `noContent()` | 204 | null |
| `badRequest(msg)` | 400 | `{message: msg}` |
| `unauthorized(msg)` | 401 | `{message: msg}` |
| `forbidden(msg)` | 403 | `{message: msg}` |
| `notFound(msg)` | 404 | `{message: msg}` |
| `serverError(msg)` | 500 | `{message: msg}` |
| `redirect(url)` | 302 | null + `Location` header |
| `response(status, body, headers)` | any | Full control |

Each returns `{status: number, body: any, headers: any}`.

**Auto-JSON:** If body is an object, serialized to JSON with `Content-Type: application/json`. If body is a string, sent as `Content-Type: text/plain`. If null, no body.

## CORS

When `Cors` is in the static config, the server automatically:
- Responds to `OPTIONS` requests with 204 and CORS headers
- Adds `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers` to all responses

No user code needed. If `Cors` is absent, no CORS handling.

## Error handling

If the callback throws an exception, the server catches it and returns:
```json
{"status": 500, "body": {"message": "Internal Server Error"}}
```

The thrown error is logged to stderr.

## Module structure

```
stdlib/
  web/
    server.km           # KimchiLang module — module singleton, exposes listen, close, response helpers
    _server_helpers.js  # JS helper — node:http, request parsing, CORS, response serialization
```

`server.km` uses `module singleton`. It extern's `_server_helpers.js` for the Node.js HTTP server internals.

## Patterns enabled by KimchiLang syntax

The server is deliberately minimal. KimchiLang's language features handle everything else:

### Routing via match

```kimchi
match req.path {
  "/users" => handleUsers(req)
  "/posts" => handlePosts(req)
  _ => notFound("not found")
}
```

### Validation via guard

```kimchi
guard req.body != null else { return badRequest("body required") }
guard req.body.email.includes("@") else { return badRequest("invalid email") }
```

### Middleware via pipes

```kimchi
fn authenticate(req) {
  guard req.headers.authorization != null else { return unauthorized("no token") }
  return { ...req, user: decodeToken(req.headers.authorization) }
}

fn requireAdmin(req) {
  guard req.user.role == "admin" else { return forbidden("admin only") }
  return req
}

server.listen((req) => {
  match req.path {
    "/admin" => req ~> authenticate ~> requireAdmin ~> handleAdmin
    "/public" => ok({message: "public"})
    _ => notFound("not found")
  }
})
```

### Concurrent data loading via collect

```kimchi
server.listen((req) => {
  match req.path {
    "/dashboard" => {
      dec [users, posts, stats] = collect [getUsers, getPosts, getStats]
      return ok({users: users, posts: posts, stats: stats})
    }
    _ => notFound("not found")
  }
})
```
