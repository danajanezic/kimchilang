# Web Server Design (stdlib.web.server)

## Overview

A built-in HTTP server for KimchiLang — batteries-included like Go's `net/http`. No external dependencies. Uses static files for configuration, supports route schemas with validation, lifecycle hooks for middleware, and composes naturally with KimchiLang features (pattern matching, guards, pipes, immutable data).

This spec covers: HTTP server core, routing with path parameters, request/response handling, lifecycle hooks (before/after), route schemas with validation, CORS, and static file serving.

## Configuration (static file)

```
// server.static
Port 3000
Host "0.0.0.0"
Strict false

Cors {
  origin = "*"
  methods = "GET, POST, PUT, DELETE"
}

Static {
  dir = "./public"
  prefix = "/static"
}

ErrorFormat "structured"
```

- `Port` — listen port (required)
- `Host` — bind address (default `"0.0.0.0"`)
- `Strict` — when `true`, all routes must have schemas (compile error if missing). When `false`, schemas are optional but still validated at runtime when provided. Default `false`.
- `Cors` — CORS configuration. Auto-handled when present.
- `Static` — static file serving configuration. Auto-handled when present.
- `ErrorFormat` — default validation error format: `"structured"` or `"simple"`. Can be overridden by custom formatter.

## Basic usage

```kimchi
as config dep app.server
as server dep stdlib.web.server({config: config})

server.on("/hello", (req) => {
  return ok({message: "Hello!"})
})

server.on("/users/:id", (req) => {
  match req.method {
    "GET" => ok(findUser(req.params.id))
    "PUT" => ok(updateUser(req.params.id, req.body))
    "DELETE" => { deleteUser(req.params.id); return noContent() }
    _ => response(405, "Method not allowed")
  }
})

server.on("*", (req) => notFound("not found"))

server.listen()
```

## Route registration

### server.on(pattern, handler)

Registers a route handler. Pattern supports path parameters and wildcards.

```kimchi
server.on("/exact/path", handler)           // exact match
server.on("/users/:id", handler)            // path parameter
server.on("/files/:path*", handler)         // wildcard suffix
server.on("*", handler)                     // catch-all
```

Routes match in registration order. First match wins.

### server.on(pattern, schema, handler)

Registers a route with a validation schema. The schema validates the request before the handler runs.

```kimchi
server.on("/users", {method: "POST", body: {name: "string", email: "string"}}, (req) => {
  return created(createUser(req.body))
})
```

## Route schemas

Schemas define the expected shape of a request. Validation runs automatically before the handler.

### Type validators

String type names validate the JavaScript type:

```kimchi
server.on("/users", {
  method: "POST",
  body: {
    name: "string",
    age: "number",
    active: "boolean"
  }
}, handler)
```

### Callable validators

Functions for custom validation logic:

```kimchi
server.on("/users", {
  method: "POST",
  body: {
    name: (val) => val.length > 0,
    email: (val) => val.includes("@"),
    age: (val) => val >= 0 and val <= 150
  }
}, handler)
```

### Match pattern validators

Leverage pattern matching for enum-like validation:

```kimchi
server.on("/users", {
  method: "POST",
  body: {
    role: (val) => match val {
      "admin" => true
      "user" => true
      "guest" => true
      _ => false
    }
  }
}, handler)
```

### Schema fields

| Field | Validates | Example |
|-------|-----------|---------|
| `method` | HTTP method string or array | `"GET"` or `["GET", "POST"]` |
| `params` | Path parameter shapes | `{id: "string"}` |
| `query` | Query parameter shapes | `{page: "number"}` |
| `body` | Request body shape | `{name: "string"}` |
| `headers` | Required headers | `{authorization: "string"}` |

### Static file schemas

Schemas can live in `.static` files alongside route files for complex APIs:

```
// routes/users.schema.static
GetUser {
  method = "GET"
  params {
    id = "string"
  }
}

CreateUser {
  method = "POST"
  body {
    name = "string"
    email = "string"
    age = "number"
  }
}
```

Used in code:

```kimchi
as schemas dep routes.users.schema

server.on("/users/:id", schemas.GetUser, (req) => ok(findUser(req.params.id)))
server.on("/users", schemas.CreateUser, (req) => created(createUser(req.body)))
```

### Strict mode

- **`Strict false` (default):** Schemas are optional. Routes without schemas work fine. Routes with schemas are validated at runtime.
- **`Strict true`:** Every `server.on` call must include a schema. Missing schema is a compile error. Enforces API contracts across the entire application.

### Validation error handling

When validation fails, the server returns a 400 response. The format is configurable:

**Default structured format:**
```json
{
  "status": 400,
  "errors": [
    {"field": "email", "message": "validation failed"},
    {"field": "age", "message": "expected number, got string"}
  ]
}
```

**Custom error formatter:**

```kimchi
server.onValidationError((errors, req) => {
  return response(422, {
    message: "Validation failed",
    details: errors,
    path: req.path
  })
})
```

The formatter receives an array of `{field, message}` objects and the request. It returns a response object.

## Lifecycle hooks

### server.before(fn)

Runs before route matching on every request. Takes a request, returns a request (pass through) or a response (short-circuit).

```kimchi
// Logging
server.before((req) => {
  print "${req.method} ${req.path}"
  return req
})

// Authentication
server.before((req) => {
  guard req.path.startsWith("/public") else { return req }
  guard req.headers.authorization != null else { return unauthorized("no token") }
  return { ...req, user: decodeToken(req.headers.authorization) }
})
```

**Short-circuiting:** If a `before` hook returns an object with a `status` field, it's treated as a response. The route handler is skipped. The `after` hooks still run.

Multiple `before` hooks run in registration order, chained — each receives the output of the previous.

### server.after(fn)

Runs after the route handler on every request. Takes request and response, returns response.

```kimchi
// Add headers
server.after((req, res) => {
  return { ...res, headers: { ...res.headers, "X-Request-Id": generateId() } }
})

// Logging
server.after((req, res) => {
  print "-> ${res.status}"
  return res
})
```

Multiple `after` hooks run in registration order, chained.

## Request object

```
{
  method: string,           // "GET", "POST", etc.
  path: string,             // "/users/123"
  params: {id: string},     // path parameters from :param
  query: {key: string},     // query string ?key=value
  headers: {key: string},   // lowercase header names
  body: any                 // auto-parsed JSON or raw string
}
```

Immutable. Middleware creates new objects via spread: `{ ...req, user: decoded }`.

**Auto-parsing:** If `Content-Type` is `application/json`, `req.body` is the parsed object. Otherwise, `req.body` is the raw string (or null if no body).

## Response helpers

| Helper | Status | Returns |
|--------|--------|---------|
| `ok(body)` | 200 | `{status: 200, body, headers: {}}` |
| `created(body)` | 201 | `{status: 201, body, headers: {}}` |
| `noContent()` | 204 | `{status: 204, body: null, headers: {}}` |
| `badRequest(msg)` | 400 | `{status: 400, body: {message: msg}, headers: {}}` |
| `unauthorized(msg)` | 401 | `{status: 401, body: {message: msg}, headers: {}}` |
| `forbidden(msg)` | 403 | `{status: 403, body: {message: msg}, headers: {}}` |
| `notFound(msg)` | 404 | `{status: 404, body: {message: msg}, headers: {}}` |
| `serverError(msg)` | 500 | `{status: 500, body: {message: msg}, headers: {}}` |
| `redirect(url)` | 302 | `{status: 302, body: null, headers: {Location: url}}` |
| `response(status, body, headers)` | any | Full control |

Each returns a plain immutable object. Fully testable without a running server.

**Auto-JSON:** If body is an object, the server serializes to JSON and sets `Content-Type: application/json`. If body is a string, sent as-is with `Content-Type: text/plain`. If body is null, no body.

## CORS (from static config)

When `Cors` is in the config, the server auto-registers:
- A `before` hook that handles `OPTIONS` preflight requests (returns 204 with CORS headers)
- An `after` hook that adds `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers` to all responses

## Static file serving (from static config)

When `Static` is in the config, the server auto-registers a route at `Static.prefix` that:
- Serves files from `Static.dir`
- Sets `Content-Type` based on file extension (`.html`, `.css`, `.js`, `.json`, `.png`, `.jpg`, `.svg`, etc.)
- Returns 404 for missing files
- Registered before user routes (so explicit routes can override static paths)

## Pipes in handlers

Request processing composes naturally with KimchiLang's pipe operator:

```kimchi
fn authenticate(req) {
  guard req.headers.authorization != null else { return unauthorized("no token") }
  return { ...req, user: decodeToken(req.headers.authorization) }
}

fn loadUser(req) {
  dec user = findUser(req.params.id)
  guard user != null else { return notFound("user not found") }
  return ok(user)
}

server.on("/users/:id", {method: "GET"}, (req) => req ~> authenticate ~> loadUser)
```

The pipe short-circuits when a function returns a response (has `status` field) instead of a request.

## Module structure

```
stdlib/
  web/
    server.km           # Main module — exposes on, before, after, listen, response helpers
    _server_helpers.js  # JS helper — node:http server, request parsing, route matching
    _static_helpers.js  # JS helper — static file serving, MIME types
    _cors_helpers.js    # JS helper — CORS preflight and header handling
    _schema_helpers.js  # JS helper — schema validation engine
```

`server.km` uses `module singleton` — one server instance per application. It extern's the JS helpers and exposes the KimchiLang API.

## Implementation notes

### Route matching algorithm

Routes stored as an ordered list of `{pattern, regex, paramNames, schema, handler}`. On request:
1. Run all `before` hooks (chain)
2. If short-circuited, skip to step 5
3. Match path against registered routes (first match wins). Extract params.
4. If schema exists, validate request. On failure, call error formatter.
5. Call handler with populated `req`
6. Run all `after` hooks (chain)
7. Serialize response and send

### Path parameter extraction

`/users/:id/posts/:postId` compiles to regex `/^\/users\/([^\/]+)\/posts\/([^\/]+)$/` with param names `["id", "postId"]`. Matched groups populate `req.params`.

### Strict mode enforcement

When `Strict true` is in the config, the server's `on` method checks at call time (module initialization, before `listen`) whether a schema is provided. If not, it throws an error: `"Strict mode: route '/path' requires a schema"`.

This is a runtime check at module init time, not a compile-time check. True compile-time enforcement would require the pluggable compiler feature (future roadmap item).

## Future roadmap items

- Pluggable compiler — user-defined compile-time rules (would enable true compile-time strict mode enforcement)
- WebSocket support via `server.ws(path, handler)`
- Server-sent events via `server.sse(path, handler)`
- Rate limiting middleware (stdlib)
- Session/cookie middleware (stdlib)
