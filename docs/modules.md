# Modules & Dependencies

[Back to README](../README.md) | [Language Guide](language-guide.md)

## Module System

- Module paths map to filesystem: `salesforce.client` -> `./salesforce/client.km`
- File extensions: `.km`, `.kimchi`, `.kc` (all equivalent)
- Compiled modules become async factory functions
- `expose` keyword marks functions/values as public API

## Dependencies (dep)

```kimchi
// Declare a dependency on myapp/lib/http.km
as http dep myapp.lib.http

fn fetchData() {
  return http.get("https://api.example.com/data")
}
```

## Extern Declarations

Typed contracts for JavaScript modules. See [Language Guide - Extern Declarations](language-guide.md#extern-declarations).

```kimchi
extern "node:fs" {
  fn readFileSync(path: string): string
  fn existsSync(path: string): boolean
}

extern default "express" as express: any
```

## Dependency Injection

Every module is a factory function that can accept dependency overrides:

```kimchi
// Create a mock
dec mockHttp = {
  get: (url) => { return { data: "mock" } }
}

// Inject the mock when importing
as api dep myapp.services.api({"myapp.lib.http": mockHttp})

// Now api uses the mock http client
api.fetchData()
```

## Module Arguments

Modules can declare arguments using the `arg` keyword:

```kimchi
arg timeout = 5000        // Optional arg with default value
arg clientId              // Optional arg (undefined if not provided)
!arg apiKey               // Required arg (throws error if missing)
```

**Using args when importing:**

```kimchi
as api dep myapp.services.api({
  apiKey: "my-secret-key",
  timeout: 10000
})
```

**Mixing deps and args:**

```kimchi
as api dep myapp.services.api({
  "myapp.lib.http": mockHttp,   // Dependency override (dotted path)
  apiKey: "test-key",           // Required arg
  timeout: 10000                // Optional arg override
})
```

## Static Files

Static files (`.static` extension) are data-only files for configuration:

```
AppName "MyApp"
Version "1.0.0"
MaxRetries 3

Colors ["red", "green", "blue"]

AppConfig {
  name = "MyApp"
  version = "1.0.0"
}

HttpStatus `OK = 200, NOT_FOUND = 404, ERROR = 500`
```

Import with: `as config dep myapp.config`

## Package Management

KimchiLang has a built-in package manager for GitHub dependencies.

**project.static:**

```
name "my-app"
version "1.0.0"

depend [
  "github.com/owner/repo",
  "github.com/owner/repo@v1.0.0"
]
```

**Commands:**

```bash
kimchi install    # Install all dependencies
kimchi clean      # Remove installed dependencies
```

**Using installed modules:**

```kimchi
as bar dep @foo.bar    // @ prefix = .km_modules/
bar.doSomething()
```
