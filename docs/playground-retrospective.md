# KimchiLang Playground Retrospective

Building a fullstack app (React frontend + HTTP server) entirely in KimchiLang. What worked, what didn't, what's missing.

## What Worked Well

**The server was natural to write.** The `server.listen((req) => { ... })` pattern with conditional blocks `|req.path == "/compile" and req.method == "POST"| => { ... }` reads clearly. Guard clauses for validation (`guard req.body != null else { return server.badRequest(...) }`) are genuinely better than nested if/else. The stdlib web server with response helpers (`server.ok()`, `server.html()`, `server.badRequest()`) made routing concise.

**Extern declarations work.** Importing Node.js APIs (`node:fs/promises`, `node:path`) via `extern` was straightforward. The compiler generates clean `import` statements. Tree-shaking means only used symbols are imported.

**KMX compiles to correct React code.** JSX components, hooks, event handlers — the generated `jsx()`/`jsxs()` output is correct React 19. The auto-import of `react/jsx-runtime` is seamless.

**Pattern matching is expressive.** The new regex match patterns (`match str { /^hello/ => "greeting" }`) were implemented during this project and immediately used in the CodeMirror tokenizer. Match expressions for routing, data transformation, and control flow feel idiomatic.

**The pipe operator is a signature feature.** `5 ~> double ~> addOne ~> square` is immediately readable. The flow operator `transform >> double addTen` for creating reusable pipelines is clean.

**Immutability defaults are sane.** `dec` for constants, `mut` for mutable — having immutability as the default caught several accidental mutations during development.

## Rough Points

**`dec` deep immutability vs DOM/React refs.** `dec` prevents ALL property assignment, not just rebinding. This means `dec iframe = document.createElement("iframe"); iframe.sandbox = "..."` fails. You must use `mut` for any object whose properties you'll set. This is correct by design but means `mut` is needed more often than expected in browser code where DOM mutation is the norm.

**`==` compiles to `===`, and `!= null` doesn't catch `undefined`.** JavaScript's `undefined !== null` is `true`, so `result.error != null` evaluates to `true` when `error` is `undefined`. This caused the output pane to always show "error: undefined" instead of results. The fix was using truthiness checks (`result.error` instead of `result.error != null`). This is a significant footgun — developers coming from JavaScript expect `!= null` to catch both null and undefined.

**Optional chaining on everything unknown.** The generator uses `?.` for any member access on variables not in `knownShapes`. This caused: (1) `EditorView?.lineWrapping` returning `undefined` instead of the extension; (2) `iframe.style?.display = "none"` — invalid JS (can't assign to optional chain LHS). We fixed assignment LHS and extern declarations, but `props?.code` still appears throughout compiled React code, which is harmless but noisy.

**Shell variable interpolation requires explicit declaration.** `shell { node $projectRoot/... }` doesn't interpolate `$projectRoot` unless you declare it as an input: `shell(projectRoot) { node $projectRoot/... }`. This is by design but not obvious.

**The interpreter sets CWD to the script directory.** `process.cwd()` returns the script's directory, not where you ran the command. This made path resolution tricky — we had to pass the project root as a CLI arg.

**No way to call `readFile` without encoding.** The extern system requires all declared parameters. Node's `readFile(path)` (no encoding = returns Buffer) couldn't be expressed because the extern declared encoding as `string`. Workaround: declare it as `any` and pass `null`.

**KMX expression children are captured as raw text.** The JSX lexer captures `{expression}` content as a raw string. If that expression contains JSX (like `.map(() => <div>...</div>)`), the nested JSX wasn't compiled. We fixed this during the project by re-parsing expression sources through the full compiler pipeline, but it was a significant gap.

## What's Missing from the Language

**Nullish equality operator.** Need `== null` to mean `=== null || === undefined` (like JavaScript's `==`). Or a dedicated `is null` / `is defined` check. The current `!= null` compiling to `!== null` is a trap.

**Optional extern parameters.** Can't declare `fn readFile(path: string, encoding?: string)` to allow calling with or without encoding. Forces workarounds like `any` types or wrapper functions.

**`import.meta.url` support.** No way to get the current module's file path. Needed for resolving relative paths in server code. Had to use CLI args as workaround.

**Rest parameters in extern.** `fn join(...parts: string)` isn't supported. Had to declare `fn join(a: string, b: string)` with a fixed arity.

**Binary data handling.** No Buffer type, no way to work with binary data natively. Serving images required modifying the server helper's response handling to support `Buffer.isBuffer()`.

**`try`/`catch` without parens.** Writing `catch(e)` with parens is required by the parser but not documented clearly. `catch e { }` (no parens) fails.

## What's Missing from Tooling

**`kimchi build` doesn't serve.** Had to write a full static file server in KimchiLang. A `kimchi serve` command that bundles + serves with hot reload would make frontend development much faster.

**No `kimchi init` for fullstack projects.** Setting up a project with server.km + app.kmx + public/ + importmaps is manual. A scaffold command would help.

**The bundler doesn't resolve stdlib deps.** `as react dep stdlib.kmx.react` fails because the bundler resolves relative to the entry file. Had to use `extern browser` directly instead.

**No source maps.** Debugging compiled code maps back to generated JS, not KimchiLang source. Source map support in the compiler and bundler would help.

**The linter reports unreachable code for conditional blocks.** Every `|cond| => { return ... }` generates an unreachable code warning because the compiled `if (cond) { ...; return; }` is followed by more code. This produced 8-10 warnings for the server, all false positives.

## What Future LLMs Should Know About Writing KimchiLang

1. **No semicolons.** Ever. Newlines are statement terminators.

2. **`dec` is deeply immutable.** Can't reassign the variable OR its properties. Use `mut` for DOM elements, React refs, or anything you'll mutate. `mut` can be read in closures but not reassigned in them.

3. **`==` is `===`.** There is no loose equality. `x != null` does NOT catch `undefined`. Use truthiness checks or `x ?? fallback` for null/undefined handling.

4. **Flow operator syntax is `name >> fn1 fn2 fn3`**, not `dec name = >> fn1 fn2 fn3`. The name comes first.

5. **`memo fib(n) { }` not `memo fn fib(n) { }`.** The `memo` keyword replaces `fn`, it doesn't precede it.

6. **`describe` and `test` are keywords** (for the testing framework). Don't use them as function/variable names.

7. **`fn` is a keyword.** Don't use it as a parameter name in extern declarations.

8. **Shell interpolation requires input declaration.** `shell { echo $x }` won't interpolate `x`. Use `shell(x) { echo $x }`.

9. **Conditional blocks `|cond| => { }` are pattern-style syntax** used primarily in server route handlers and callbacks. Inside regular functions, use `if cond { }`.

10. **The compiler auto-detects async.** Don't write `async` or `await`. Functions containing `shell`, `spawn`, `worker`, `sleep`, `collect`, `hoard`, `race`, or calls to other async functions are automatically compiled as async.

11. **Extern browser declarations need importmap or bundled JS.** The compiler emits `import { X } from 'module'` — the browser needs to resolve these via `<script type="importmap">` or pre-bundled files.

12. **The bundler uses `target: 'browser'`.** This rejects `shell`, `spawn`, `worker`, `arg`, `env`, and `extern node` declarations. Server-side code can't be bundled for browser.

13. **KMX files (`.kmx`) enable JSX syntax.** Regular `.km` files don't support JSX. The plugin is auto-loaded based on file extension.

14. **All examples and apps should be written in KimchiLang.** Don't create JavaScript helper files alongside `.km` files — use `extern` to access JS APIs, `shell`/`spawn` for system operations. The only acceptable non-KimchiLang files are static assets (HTML, CSS, images) and compiler internals (`src/`).

15. **`catch` requires parentheses.** Write `catch(e) { }`, not `catch e { }`.

16. **String interpolation uses `${expr}` inside double quotes.** To include a literal `$` before `{`, escape it: `\${`.

17. **Constructor syntax is `Foo.new(args)`**, which compiles to `new Foo(args)`. Don't write `new Foo(args)` directly.
