# HTTP Module

A promise-based HTTP client wrapper for Node.js http/https modules.

## Import

```kimchi
as http dep stdlib.http
```

## Functions

### `get(url, options)`

Make an HTTP GET request.

```kimchi
dec response = await http.get("https://api.example.com/users")
print response.body
```

**Parameters:**
- `url` - The URL to request
- `options` - Optional request options (headers, timeout)

**Returns:** Response object

---

### `post(url, body, options)`

Make an HTTP POST request.

```kimchi
dec response = await http.post("https://api.example.com/users", {
  name: "Alice",
  email: "alice@example.com"
})
print response.body
```

**Parameters:**
- `url` - The URL to request
- `body` - Request body (automatically JSON stringified if object)
- `options` - Optional request options

**Returns:** Response object

---

### `put(url, body, options)`

Make an HTTP PUT request.

```kimchi
dec response = await http.put("https://api.example.com/users/123", {
  name: "Alice Updated"
})
```

**Parameters:**
- `url` - The URL to request
- `body` - Request body
- `options` - Optional request options

**Returns:** Response object

---

### `patch(url, body, options)`

Make an HTTP PATCH request.

```kimchi
dec response = await http.patch("https://api.example.com/users/123", {
  email: "newemail@example.com"
})
```

**Parameters:**
- `url` - The URL to request
- `body` - Request body
- `options` - Optional request options

**Returns:** Response object

---

### `del(url, options)`

Make an HTTP DELETE request.

```kimchi
dec response = await http.del("https://api.example.com/users/123")
if response.ok {
  print "User deleted"
}
```

**Parameters:**
- `url` - The URL to request
- `options` - Optional request options

**Returns:** Response object

---

### `request(url, options)`

Generic HTTP request function. All other methods use this internally.

```kimchi
dec response = await http.request("https://api.example.com/data", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer token123"
  },
  body: { key: "value" },
  timeout: 5000
})
```

**Parameters:**
- `url` - The URL to request
- `options` - Request options:
  - `method` - HTTP method (GET, POST, PUT, PATCH, DELETE)
  - `headers` - Request headers object
  - `body` - Request body
  - `timeout` - Request timeout in milliseconds (default: 30000)

**Returns:** Response object

---

### `queryString(params)`

Build a URL query string from an object.

```kimchi
dec qs = http.queryString({ page: 1, limit: 10, search: "hello world" })
// Returns: "page=1&limit=10&search=hello%20world"
```

**Parameters:**
- `params` - Object with key-value pairs

**Returns:** URL-encoded query string

---

### `buildUrl(baseUrl, params)`

Build a complete URL with query parameters.

```kimchi
dec url = http.buildUrl("https://api.example.com/search", {
  q: "kimchi",
  page: 1
})
// Returns: "https://api.example.com/search?q=kimchi&page=1"
```

**Parameters:**
- `baseUrl` - Base URL
- `params` - Query parameters object

**Returns:** Complete URL with query string

---

### `createClient(baseOptions)`

Create a reusable HTTP client with default options.

```kimchi
dec api = http.createClient({
  baseUrl: "https://api.example.com",
  headers: {
    "Authorization": "Bearer token123",
    "Accept": "application/json"
  },
  timeout: 10000
})

// Now use the client - paths are relative to baseUrl
dec users = await api.get("/users")
dec user = await api.post("/users", { name: "Bob" })
dec updated = await api.put("/users/123", { name: "Bob Updated" })
dec patched = await api.patch("/users/123", { email: "bob@new.com" })
dec deleted = await api.del("/users/123")
```

**Parameters:**
- `baseOptions` - Client configuration:
  - `baseUrl` - Base URL prepended to all requests
  - `headers` - Default headers for all requests
  - `timeout` - Default timeout for all requests

**Returns:** Client object with `get`, `post`, `put`, `patch`, `del` methods

---

## Response Object

All request functions return a response object with the following properties:

```kimchi
{
  status: 200,           // HTTP status code
  statusText: "OK",      // HTTP status message
  headers: {...},        // Response headers
  body: {...},           // Response body (auto-parsed if JSON)
  ok: true               // true if status is 200-299
}
```

### Checking Response Status

```kimchi
dec response = await http.get("https://api.example.com/users")

if response.ok {
  print "Success: ${response.body}"
} else {
  print "Error ${response.status}: ${response.statusText}"
}
```

---

## Examples

### Simple GET Request

```kimchi
as http dep stdlib.http

dec response = await http.get("https://jsonplaceholder.typicode.com/posts/1")
print "Title: ${response.body.title}"
```

### POST with JSON Body

```kimchi
as http dep stdlib.http

dec response = await http.post("https://jsonplaceholder.typicode.com/posts", {
  title: "My Post",
  body: "This is the content",
  userId: 1
})

print "Created post with ID: ${response.body.id}"
```

### Using Custom Headers

```kimchi
as http dep stdlib.http

dec response = await http.get("https://api.example.com/protected", {
  headers: {
    "Authorization": "Bearer my-token",
    "X-Custom-Header": "custom-value"
  }
})
```

### Creating an API Client

```kimchi
as http dep stdlib.http

// Create a client for a specific API
dec github = http.createClient({
  baseUrl: "https://api.github.com",
  headers: {
    "Accept": "application/vnd.github.v3+json",
    "Authorization": "token ghp_xxxxxxxxxxxx"
  }
})

// Fetch user info
dec user = await github.get("/user")
print "Logged in as: ${user.body.login}"

// List repositories
dec repos = await github.get("/user/repos")
for repo in repos.body {
  print "- ${repo.name}"
}
```

### Error Handling

```kimchi
as http dep stdlib.http

try {
  dec response = await http.get("https://api.example.com/users/999")
  
  |response.status == 404| => {
    print "User not found"
  }
  |response.status == 401| => {
    print "Unauthorized - please log in"
  }
  |response.ok| => {
    print "User: ${response.body.name}"
  }
  |true| => {
    print "Unexpected error: ${response.status}"
  }
} catch(e) {
  print "Network error: ${e.message}"
}
```

### Building URLs with Query Parameters

```kimchi
as http dep stdlib.http

dec url = http.buildUrl("https://api.example.com/search", {
  q: "kimchi lang",
  page: 1,
  limit: 20
})

dec results = await http.get(url)
print "Found ${results.body.total} results"
```
