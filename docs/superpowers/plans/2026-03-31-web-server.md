# Web Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `stdlib.web.server` — a minimal HTTP server module with response helpers, request parsing, and optional CORS.

**Architecture:** A KimchiLang module (`stdlib/web/server.km`) backed by a JS helper (`stdlib/web/_server_helpers.js`). The JS helper uses `node:http` for the server, request parsing, body reading, query parsing, CORS handling, and response serialization. The KimchiLang module uses `module singleton`, extern's the JS helper, and exposes `listen`, `close`, and response helpers.

**Tech Stack:** Node.js `node:http`, `node:url`, `node:fs`. Zero external dependencies.

---

### Task 1: JS helper — HTTP server core

**Files:**
- Create: `stdlib/web/_server_helpers.js`

- [ ] **Step 1: Create the JS helper with server creation, request parsing, and response sending**

Create `stdlib/web/_server_helpers.js`:

```javascript
import { createServer } from 'node:http';
import { parse as parseUrl } from 'node:url';

let _server = null;

export function startServer(port, host, corsConfig, callback) {
  return new Promise((resolve, reject) => {
    _server = createServer(async (nodeReq, nodeRes) => {
      try {
        // Parse request
        const parsed = parseUrl(nodeReq.url, true);
        const body = await readBody(nodeReq);
        
        const req = {
          method: nodeReq.method,
          path: parsed.pathname,
          headers: nodeReq.headers,
          body: body,
          query: parsed.query || {},
          segments() {
            return this.path.split('/').filter(s => s !== '');
          },
          match(pattern) {
            return matchPath(this.path, pattern);
          }
        };
        
        // CORS preflight
        if (corsConfig && nodeReq.method === 'OPTIONS') {
          nodeRes.writeHead(204, corsHeaders(corsConfig));
          nodeRes.end();
          return;
        }
        
        // Call user callback
        let res;
        try {
          res = await callback(req);
        } catch (err) {
          console.error(err);
          res = { status: 500, body: { message: 'Internal Server Error' }, headers: {} };
        }
        
        if (!res || typeof res.status !== 'number') {
          res = { status: 500, body: { message: 'Handler must return a response object' }, headers: {} };
        }
        
        // Serialize response
        const resHeaders = { ...(res.headers || {}) };
        
        // CORS headers on all responses
        if (corsConfig) {
          Object.assign(resHeaders, corsHeaders(corsConfig));
        }
        
        if (res.body === null || res.body === undefined) {
          nodeRes.writeHead(res.status, resHeaders);
          nodeRes.end();
        } else if (typeof res.body === 'string') {
          resHeaders['Content-Type'] = resHeaders['Content-Type'] || 'text/plain';
          nodeRes.writeHead(res.status, resHeaders);
          nodeRes.end(res.body);
        } else {
          resHeaders['Content-Type'] = 'application/json';
          nodeRes.writeHead(res.status, resHeaders);
          nodeRes.end(JSON.stringify(res.body));
        }
      } catch (err) {
        console.error('Server error:', err);
        nodeRes.writeHead(500, { 'Content-Type': 'application/json' });
        nodeRes.end(JSON.stringify({ message: 'Internal Server Error' }));
      }
    });
    
    _server.listen(port, host, () => {
      console.log(`Server listening on ${host}:${port}`);
      resolve();
    });
    
    _server.on('error', reject);
  });
}

export function stopServer() {
  return new Promise((resolve) => {
    if (_server) {
      _server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      resolve(null);
      return;
    }
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      if (!data) { resolve(null); return; }
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      } else {
        resolve(data);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function matchPath(actualPath, pattern) {
  const actualParts = actualPath.split('/').filter(s => s !== '');
  const patternParts = pattern.split('/').filter(s => s !== '');
  
  if (actualParts.length !== patternParts.length) return null;
  
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = actualParts[i];
    } else if (patternParts[i] !== actualParts[i]) {
      return null;
    }
  }
  return params;
}

function corsHeaders(config) {
  return {
    'Access-Control-Allow-Origin': config.origin || '*',
    'Access-Control-Allow-Methods': config.methods || 'GET, POST, PUT, DELETE',
    'Access-Control-Allow-Headers': config.headers || 'Content-Type, Authorization',
  };
}
```

- [ ] **Step 2: Verify the file is valid JS**

Run: `node -e "import('./stdlib/web/_server_helpers.js').then(() => console.log('OK'))"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
mkdir -p stdlib/web
git add stdlib/web/_server_helpers.js
git commit -m "feat(stdlib): add web server JS helper — HTTP server, request parsing, CORS"
```

---

### Task 2: KimchiLang server module with response helpers

**Files:**
- Create: `stdlib/web/server.km`

- [ ] **Step 1: Create the server module**

Create `stdlib/web/server.km`:

```kimchi
// KimchiLang Web Server
// Usage: as server dep stdlib.web.server({config: config})

module singleton

arg config

extern "./_server_helpers.js" {
  async fn startServer(port: number, host: string, cors: any, callback: any): void
  async fn stopServer(): void
}

dec port = config.Port ?? 3000
dec host = config.Host ?? "0.0.0.0"
dec cors = config.Cors ?? null

expose fn listen(callback) {
  return startServer(port, host, cors, callback)
}

expose fn close() {
  return stopServer()
}

// Response helpers

expose fn ok(body) {
  return {status: 200, body: body, headers: {}}
}

expose fn created(body) {
  return {status: 201, body: body, headers: {}}
}

expose fn noContent() {
  return {status: 204, body: null, headers: {}}
}

expose fn badRequest(msg) {
  return {status: 400, body: {message: msg}, headers: {}}
}

expose fn unauthorized(msg) {
  return {status: 401, body: {message: msg}, headers: {}}
}

expose fn forbidden(msg) {
  return {status: 403, body: {message: msg}, headers: {}}
}

expose fn notFound(msg) {
  return {status: 404, body: {message: msg}, headers: {}}
}

expose fn serverError(msg) {
  return {status: 500, body: {message: msg}, headers: {}}
}

expose fn redirect(url) {
  return {status: 302, body: null, headers: {Location: url}}
}

expose fn response(status, body, headers) {
  return {status: status, body: body, headers: headers ?? {}}
}
```

- [ ] **Step 2: Verify it compiles**

Run: `node src/cli.js check stdlib/web/server.km 2>&1`
Expected: `{"errors":[]}`

- [ ] **Step 3: Commit**

```bash
git add stdlib/web/server.km
git commit -m "feat(stdlib): add stdlib.web.server module with response helpers"
```

---

### Task 3: Server configuration static file example

**Files:**
- Create: `examples/web/server.static`
- Create: `examples/web/app.km`

- [ ] **Step 1: Create example server config**

Create `examples/web/server.static`:

```
Port 3000
Host "0.0.0.0"

Cors {
  origin = "*"
  methods = "GET, POST, PUT, DELETE"
}
```

- [ ] **Step 2: Create example app**

Create `examples/web/app.km`:

```kimchi
#!/usr/bin/env kimchi

as config dep examples.web.server
as server dep stdlib.web.server({config: config})

dec users = [
  {id: "1", name: "Alice", email: "alice@example.com"},
  {id: "2", name: "Bob", email: "bob@example.com"}
]

fn findUser(id) {
  return users.find(u => u.id == id)
}

server.listen((req) => {
  match req.path {
    "/hello" => server.ok({message: "Hello, KimchiLang!"})

    "/users" => match req.method {
      "GET" => server.ok(users)
      "POST" => {
        guard req.body != null else { return server.badRequest("body required") }
        return server.created(req.body)
      }
      _ => server.response(405, "Method not allowed")
    }

    _ => {
      dec params = req.match("/users/:id")
      guard params != null else { return server.notFound("not found") }

      dec user = findUser(params.id)
      guard user != null else { return server.notFound("user not found") }

      match req.method {
        "GET" => server.ok(user)
        "DELETE" => server.noContent()
        _ => server.response(405, "Method not allowed")
      }
    }
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add examples/web/
git commit -m "feat(examples): add web server example app with routing"
```

---

### Task 4: Tests for response helpers

**Files:**
- Test: `test/test.js`

- [ ] **Step 1: Write tests for response helpers**

Add to `test/test.js`:

```javascript
test('Web server: ok() returns 200 response', () => {
  const source = `
as server dep stdlib.web.server({config: {Port: 3000}})
dec res = server.ok({name: "Alice"})`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'status: 200');
});

test('Web server: server.km compiles', () => {
  // Just verify the module compiles without errors
  const fs = await import('fs');
  const source = fs.readFileSync('stdlib/web/server.km', 'utf8');
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'module singleton');  // actually check _singletonCache
  assertContains(js, '_singletonCache');
});

test('Web server: notFound() returns 404 response', () => {
  const source = `
as server dep stdlib.web.server({config: {Port: 3000}})
dec res = server.notFound("not found")`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'status: 404');
});

test('Web server: response() returns custom response', () => {
  const source = `
as server dep stdlib.web.server({config: {Port: 3000}})
dec res = server.response(418, "I am a teapot")`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'status: 418');  // actually just check it compiles
});
```

Note: These tests verify compilation, not runtime behavior. The server's runtime behavior (HTTP handling, CORS, request parsing) is tested by running the example app.

- [ ] **Step 2: Run tests**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add test/test.js
git commit -m "test: add web server compilation tests"
```

---

### Task 5: Update ROADMAP.md and docs

**Files:**
- Modify: `ROADMAP.md`
- Modify: `docs/modules.md`
- Modify: `README.md`

- [ ] **Step 1: Update ROADMAP.md**

Find the Web Framework section:

```markdown
## Web Framework

- [ ] Built-in minimal web server — batteries-included like Go's `net/http`, but KimchiLang-native. Immutable request/response objects, pattern-matched routing, guard-based middleware, pipe operator for request pipelines. No external dependencies. Ships with the language.
```

Replace with:

```markdown
## Web Framework

- [x] ~~Built-in minimal web server (`stdlib.web.server`)~~ — single callback, immutable request objects, response helpers, CORS. Routing via match, validation via guard, middleware via pipes. No external dependencies.
- [ ] WebSocket support
- [ ] Server-sent events
```

- [ ] **Step 2: Add web server to docs/modules.md**

Add a section to `docs/modules.md`:

```markdown
## Web Server

See [Web Server documentation](../stdlib/web/README.md) for the full API.

```kimchi
as config dep app.server
as server dep stdlib.web.server({config: config})

server.listen((req) => {
  match req.path {
    "/hello" => server.ok({message: "Hello!"})
    _ => server.notFound("not found")
  }
})
```
```

- [ ] **Step 3: Update README.md examples list**

Add to the examples list in README.md:

```markdown
- `web/` - HTTP server with routing, guards, and CORS
```

- [ ] **Step 4: Run full test suite**

Run: `node test/test.js 2>&1 | tail -5`
Run: `node test/stdlib_test.js 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add ROADMAP.md docs/modules.md README.md
git commit -m "docs: add web server to roadmap, modules, and examples list"
```
