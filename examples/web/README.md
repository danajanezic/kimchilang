# Task Management API

A REST API built with KimchiLang's built-in web server, demonstrating the language's features in a real application.

## Running

```bash
kimchi run examples/web/app.km
# Server listening on 0.0.0.0:3000
```

## Endpoints

### Public

```
GET /health              Health check with timestamp and counts
```

### Authenticated (pass token via Authorization header)

```
GET    /tasks            List all tasks (filterable by ?status= and ?owner=)
POST   /tasks            Create a task (body: {title, status?, priority?})
GET    /tasks/:id        Get a single task
PUT    /tasks/:id        Update a task (body: {title?, status?, priority?})
DELETE /tasks/:id        Delete a task (owner or admin only)
GET    /dashboard        Task stats and completion rate
```

### Test tokens

```
token-alice    (alice, admin)
token-bob      (bob, user)
```

## Example requests

```bash
# Health check
curl http://localhost:3000/health

# List tasks (requires auth)
curl -H "Authorization: token-alice" http://localhost:3000/tasks

# Filter by status
curl -H "Authorization: token-alice" "http://localhost:3000/tasks?status=done"

# Create a task
curl -X POST -H "Authorization: token-alice" \
  -H "Content-Type: application/json" \
  -d '{"title": "Deploy app", "priority": "high"}' \
  http://localhost:3000/tasks

# Get a task
curl -H "Authorization: token-alice" http://localhost:3000/tasks/1

# Update a task
curl -X PUT -H "Authorization: token-alice" \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}' \
  http://localhost:3000/tasks/1

# Delete a task (must be owner or admin)
curl -X DELETE -H "Authorization: token-alice" http://localhost:3000/tasks/1

# Dashboard
curl -H "Authorization: token-alice" http://localhost:3000/dashboard
```

## KimchiLang features used

| Feature | Where |
|---------|-------|
| Pattern matching | `\|req.path == "/tasks"\| =>` for routing |
| Nested patterns | Route by path, then by method |
| Guard clauses | `guard user != null else { return unauthorized(...) }` |
| Match expressions | Validate status/priority against allowed values |
| Response helpers | `ok()`, `created()`, `noContent()`, `badRequest()`, `unauthorized()`, `forbidden()`, `notFound()` |
| Path parameters | `req.match("/tasks/:id")` returns `{id: "123"}` |
| Query filtering | `req.query.status`, chained `.filter()` |
| Constructor syntax | `Date.new().toISOString()` in health check |
| Nullish coalescing | `req.body.status ?? "todo"` for defaults |
| Spread operator | `{...task, title: req.body.title ?? task.title}` for updates |
| Immutable data | Request objects never mutated, new objects created via spread |
| Module singleton | Server runs as a single shared instance |

## Configuration

Server config is passed inline. For a separate config file, use a `.static` file:

```
// server.static
Port 3000
Host "0.0.0.0"

Cors {
  origin = "*"
  methods = "GET, POST, PUT, DELETE"
}
```

```kimchi
as config dep app.server
as server dep stdlib.web.server({config: config})
```
