# KimchiLang

*Some will think it stinks, others will love it—no matter what it's spicy and good for you!*

A modern, expressive programming language that transpiles to JavaScript. Purely functional, deeply immutable, with compile-time type inference.

## Features

- **Clean Syntax** - Python-inspired readability with JavaScript power
- **Directly Executable** - `#!/usr/bin/env kimchi` shebang support with cached transpilation
- **Purely Functional** - No classes, no `this`, no global scope
- **Deeply Immutable** - All `dec` values are immutable with compile-time enforcement
- **Pattern Matching** - `match` expressions with literal, `is` type, [regex](docs/regex.md), destructuring, and wildcard patterns
- **Regex** - Match operator (`~`), [regex patterns in match arms](docs/regex.md#regex-patterns-in-match-expressions), capture groups with `$match`
- **Guard Clauses** - `guard cond else { return }` for flat, readable precondition checks
- **Modern Operators** - Pipe (`~>`), flow (`>>`), nullish coalescing (`??`), range (`0..10`), bind (`fn.(args)`)
- **Type System** - Compile-time type inference, [union types](docs/language-guide.md#union-types) (`string | null`), [generics](docs/language-guide.md#generics) (`type Result<T> = ...`)
- **Concurrency** - [`collect`/`hoard`/`race`](docs/concurrency.md) for safe concurrent I/O, [`worker`](docs/concurrency.md#worker--cpu-bound-threads) threads, [`spawn`](docs/concurrency.md#spawn--non-blocking-child-processes) processes — async auto-detected, no `async`/`await` keywords
- **JS Interop** - [`extern` declarations](docs/language-guide.md#extern-declarations) for typed JS module contracts, [`Foo.new()`](docs/language-guide.md#constructor-syntax) constructor syntax
- **Built-in Testing** - `test`/`describe`/`expect` with [15 matchers](docs/testing.md#matchers), `.not`, `.only`/`.skip`, lifecycle hooks
- **Developer Tools** - [LSP server](docs/editors.md#lsp-server), [VS Code extension](docs/editors.md), watch mode, linter, formatter
- **Optimized Output** - Tree-shaken runtime, smart optional chaining, ternary match compilation

## Installation

```bash
git clone https://github.com/danajanezic/kimchilang.git
cd kimchilang
./install.sh
```

After installation:

```bash
kimchi run examples/hello.kimchi      # Run a script
kimchi compile app.km -o app.js       # Compile to JavaScript
kimchi test tests.km                  # Run tests
kimchi lsp                            # Start LSP server
```

**Shebang scripts:**

```bash
#!/usr/bin/env kimchi
print "Hello, World!"
```

## Quick Start

```bash
npx create-kimchi-app my-app
cd my-app
kimchi src.main
```

Or create a single file:

```kimchi
print "Hello, KimchiLang!"

fn greet(name) {
  return "Welcome, " + name + "!"
}

print greet("Developer")
```

```bash
kimchi run hello.kimchi
```

## Documentation

| Guide | Description |
|-------|-------------|
| [Language Guide](docs/language-guide.md) | Variables, functions, types, pattern matching, operators, error handling |
| [Concurrency & Parallel](docs/concurrency.md) | `collect`, `hoard`, `race`, `worker`, `spawn`, bind syntax |
| [Modules & Dependencies](docs/modules.md) | `dep`, `extern`, dependency injection, static files, packages |
| [Testing](docs/testing.md) | Test framework, matchers, mocks, lifecycle hooks |
| [CLI Commands](docs/cli.md) | Running, compiling, converting, watch mode, npm integration |
| [Regex](docs/regex.md) | Match operator (`~`), regex in match arms, capture groups, literals |
| [Editor Extensions](docs/editors.md) | VS Code, Windsurf, Sublime Text, LSP server |
| [Roadmap](ROADMAP.md) | Planned features and progress |

## How It Works

KimchiLang uses a five-stage compilation pipeline:

1. **Lexer** (`src/lexer.js`) - Tokenizes source code
2. **Parser** (`src/parser.js`) - Builds an Abstract Syntax Tree (AST)
3. **Type Checker** (`src/typechecker.js`) - Compile-time type inference and validation
4. **Linter** (`src/linter.js`) - Code quality checks
5. **Generator** (`src/generator.js`) - Emits optimized JavaScript

Additional: interpreter (cached transpiler), validator (structured diagnostics), LSP server, runtime module.

## Examples

All examples have `#!/usr/bin/env kimchi` shebangs and are directly executable:

- `hello.kimchi` - Hello World
- `basic.kimchi` - Core features: match, guard, ??, .if().else(), mut, KMDocs
- `fibonacci.kimchi` - Recursive Fibonacci with KMDocs
- `memo_fibonacci.km` - Memoized Fibonacci
- `async_pipe.km` - Async pipe and flow operators
- `task_runner.km` - Build pipeline
- `reduce_pattern_match.km` - Reducers with pattern matching
- `regex_match.km` - Regex matching with guard and match
- `test_example.km` - Testing framework
- `testing/` - Unit testing with mocks
- `myapp/` - Dependency injection example
- `web/` - HTTP server with routing, guards, and CORS

## File Extensions

- `.km` - Standard extension
- `.kimchi` - Long extension
- `.kc` - Short extension

## License

MIT
