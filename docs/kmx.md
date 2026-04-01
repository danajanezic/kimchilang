# KMX — JSX for KimchiLang

[Back to README](../README.md) | [Language Guide](language-guide.md) | [Build System](cli.md#build-frontend-bundle)

KMX adds JSX syntax to KimchiLang via `.kmx` files. It compiles to React 19's modern jsx-runtime.

## Quick Start

```kmx
// app.kmx
as react dep stdlib.kmx.react

fn App() {
  dec [count, setCount] = react.useState(0)
  return <div>
    <h1>Counter</h1>
    <p>Count: {count}</p>
    <button onClick={() => setCount(count + 1)}>+1</button>
  </div>
}

dec root = react.createRoot(document.getElementById("root"))
root.render(<App />)
```

Build for browser:

```bash
kimchi build app.kmx -o dist/bundle.js
```

Serve with HTML:

```html
<script src="https://unpkg.com/react@19/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@19/umd/react-dom.production.min.js"></script>
<div id="root"></div>
<script src="dist/bundle.js"></script>
```

## Syntax

### Elements

```kmx
// DOM elements (lowercase)
<div className="container">
  <h1>Title</h1>
  <p>Content</p>
</div>

// Components (uppercase)
<Header title="My App" />
<UserCard user={currentUser} />

// Self-closing
<img src="photo.jpg" alt="A photo" />
```

### Expressions

```kmx
<p>{user.name}</p>
<p>{items.length} items</p>
<button onClick={() => doSomething()}>Click</button>
```

### Fragments

```kmx
<>
  <Header />
  <Main />
  <Footer />
</>
```

### Attributes

```kmx
// String
<div className="active">

// Expression
<div style={{color: "red"}}>

// Boolean (no value = true)
<input disabled />
```

## Components

Components are regular KimchiLang functions that return JSX:

```kmx
fn Greeting(props) {
  return <h1>Hello, {props.name}!</h1>
}

fn App() {
  return <Greeting name="World" />
}
```

## Hooks

Import React via the stdlib module:

```kmx
as react dep stdlib.kmx.react

fn Counter() {
  dec [count, setCount] = react.useState(0)

  react.useEffect(() => {
    print "Count changed to ${count}"
  })

  return <div>
    <p>{count}</p>
    <button onClick={() => setCount(count + 1)}>+1</button>
  </div>
}
```

Available hooks: `useState`, `useEffect`, `useRef`, `useMemo`, `useCallback`, `useContext`, `useReducer`, `useId`, `useTransition`, `useDeferredValue`, and more. See `stdlib/kmx/react.km` for the full list.

## Compilation

KMX uses React 19's modern JSX transform. `jsx()` for single child, `jsxs()` for multiple children:

```kmx
<div className="foo">hello</div>
// → jsx("div", { className: "foo", children: "hello" })

<div><span>a</span><span>b</span></div>
// → jsxs("div", { children: [jsx("span", { children: "a" }), jsx("span", { children: "b" })] })
```

The `import { jsx, jsxs, Fragment } from 'react/jsx-runtime'` is auto-inserted — no manual import needed.

## File Extension

- `.kmx` files enable JSX parsing automatically
- `.km` files cannot contain JSX syntax
- The KMX-React plugin is loaded via the compiler plugin system based on file extension

## Plugin System

KMX is implemented as a compiler extension plugin. The plugin system supports:

- **lexerRules** — custom tokenization
- **parserRules** — custom AST nodes
- **generatorVisitors** — custom code generation
- **autoImports** — automatic import injection

Plugins are loaded by file extension (`.kmx` → `kmx-react` plugin) or via `project.static` config:

```
extensions ["kmx/react"]
```

## Building

```bash
# Bundle a KMX app for the browser
kimchi build src/app.kmx -o dist/bundle.js

# Multi-file projects work — deps are resolved and bundled
kimchi build src/main.kmx -o dist/bundle.js
```

The bundler handles `.kmx` files alongside `.km` files. Dependencies can mix both.
