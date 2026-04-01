# KMX (JSX Support) Design

## Overview

KMX adds JSX syntax to KimchiLang via a compiler extension plugin system. `.kmx` files enable JSX parsing, which compiles to React 19's modern jsx-runtime (`jsx()`/`jsxs()` from `react/jsx-runtime`). The JSX functionality lives in `src/extensions/kmx-react.js` as a plugin, keeping the core compiler clean for projects that don't use frontend features.

## Plugin System

### Plugin interface

Compiler extensions hook into pipeline stages. Plugins live in `src/extensions/` and are loaded based on file extension or `project.static` config.

```javascript
// src/extensions/kmx-react.js
export default {
  name: 'kmx-react',
  fileExtensions: ['.kmx'],
  
  lexerTokens(tokenTypes) { ... },      // Add new token types
  lexerRules(lexer) { ... },             // Add lexing rules for JSX
  parserNodes(nodeTypes) { ... },        // Add JSX AST node types
  parserRules(parser) { ... },           // Add JSX parsing rules
  generatorVisitors(generator) { ... },  // Add JSX code generation
  typecheckerVisitors(tc) { ... },       // Add JSX type checking
}
```

### Plugin loading

1. Compiler checks file extension (e.g., `.kmx`) → finds matching plugin in `src/extensions/`
2. If `project.static` has `extensions ["kmx/react"]`, those are also loaded
3. Plugins are injected into lexer/parser/generator/typechecker constructors
4. Each stage calls the plugin hooks at appropriate points

### Plugin hook points

- **Lexer:** After tokenizing a standard token, check if any plugin wants to handle it. For JSX, when `<` is encountered in expression context (not comparison), the plugin takes over lexing.
- **Parser:** In `parsePrimary()`, before standard expression parsing, check if any plugin wants to handle the current token. For JSX, when `<` (LT) is encountered, the plugin parses the JSX element.
- **Generator:** In `visitExpression()`, for unknown node types, check if a plugin has a visitor. For JSX nodes, the plugin emits `jsx()`/`jsxs()` calls.
- **Type checker:** In `visitExpression()`, for unknown node types, check if a plugin has a visitor.

### File extension auto-loading

`.kmx` files automatically load the `kmx-react` extension. No config needed. Regular `.km` files are unaffected — they never see JSX tokens or nodes.

### project.static config (optional)

```
extensions ["kmx/react"]
```

This is for future use — currently `.kmx` auto-detection covers all cases. Config allows overriding or adding extensions without file extension changes.

## KMX Syntax

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
<br />
```

### Expressions in JSX

```kmx
<div>
  <p>{user.name}</p>
  <p>{items.length} items</p>
  <button onClick={() => setCount(count + 1)}>+1</button>
</div>
```

### Fragments

```kmx
// Short syntax
<>
  <Header />
  <Main />
  <Footer />
</>
```

### Component functions

```kmx
fn Header(props) {
  return <h1 className="title">{props.title}</h1>
}

fn Counter() {
  dec [count, setCount] = useState(0)
  return <div>
    <p>Count: {count}</p>
    <button onClick={() => setCount(count + 1)}>Increment</button>
  </div>
}

fn App() {
  return <div>
    <Header title="My App" />
    <Counter />
  </div>
}
```

## Compilation

### React 19 jsx-runtime

KMX uses the modern JSX transform (`react/jsx-runtime`), not `React.createElement`.

#### Single child → `jsx()`

```kmx
<div className="foo">hello</div>
```
```javascript
jsx("div", { className: "foo", children: "hello" })
```

#### Multiple children → `jsxs()`

```kmx
<div>
  <span>a</span>
  <span>b</span>
</div>
```
```javascript
jsxs("div", { children: [jsx("span", { children: "a" }), jsx("span", { children: "b" })] })
```

#### Component call

```kmx
<Header title="My App" />
```
```javascript
jsx(Header, { title: "My App" })
```

#### Key extraction

```kmx
<li key={item.id}>{item.name}</li>
```
```javascript
jsx("li", { children: item.name }, item.id)
```

Key is extracted from props and passed as the third argument.

#### Fragment

```kmx
<><span>a</span><span>b</span></>
```
```javascript
jsxs(Fragment, { children: [jsx("span", { children: "a" }), jsx("span", { children: "b" })] })
```

### Auto-import

The generator automatically prepends to KMX compiled output:

```javascript
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
```

No user import needed. For browser builds, this import is handled by the bundler (React loaded via `<script>` tag, jsx-runtime available as global).

### Tag conventions

| Tag | Compiled to | Rule |
|-----|------------|------|
| `<div>` | `jsx("div", ...)` | Lowercase → string (DOM element) |
| `<Header>` | `jsx(Header, ...)` | Uppercase → identifier (component) |
| `<img />` | `jsx("img", ...)` | Self-closing → no children |
| `<>...</>` | `jsxs(Fragment, ...)` | Fragment → Fragment import |

## AST Nodes

Added by the KMX plugin:

### JSXElement

```javascript
{
  type: "JSXElement",
  tag: "div" | { type: "Identifier", name: "Header" },
  attributes: [
    { name: "className", value: { type: "Literal", value: "foo" } },
    { name: "onClick", value: { type: "ArrowFunctionExpression", ... } }
  ],
  children: [JSXElement | JSXExpression | JSXText],
  selfClosing: false
}
```

### JSXExpression

```javascript
{
  type: "JSXExpression",
  expression: Expression  // the {expr} content
}
```

### JSXText

```javascript
{
  type: "JSXText",
  value: "hello world"   // raw text between tags
}
```

### JSXFragment

```javascript
{
  type: "JSXFragment",
  children: [JSXElement | JSXExpression | JSXText]
}
```

## stdlib/kmx/react.km

Full React 19 API surface via extern declarations:

```kimchi
// React core
extern browser "react" {
  dec createElement: any
  dec Fragment: any
  dec Children: any
  dec cloneElement: any
  dec isValidElement: any
  dec memo: any
  dec forwardRef: any
  dec lazy: any
  dec Suspense: any
  dec StrictMode: any
  dec createContext: any
  dec createRef: any
}

// Hooks
extern browser "react" {
  dec useState: any
  dec useEffect: any
  dec useRef: any
  dec useMemo: any
  dec useCallback: any
  dec useContext: any
  dec useReducer: any
  dec useLayoutEffect: any
  dec useImperativeHandle: any
  dec useDebugValue: any
  dec useId: any
  dec useDeferredValue: any
  dec useTransition: any
  dec useSyncExternalStore: any
  dec useInsertionEffect: any
  dec useOptimistic: any
  dec useActionState: any
  dec useFormStatus: any
  dec use: any
  dec startTransition: any
  dec cache: any
}

// React DOM client
extern browser "react-dom/client" {
  dec createRoot: any
  dec hydrateRoot: any
}
```

Users import this once in their entry file:

```kimchi
as react dep stdlib.kmx.react
```

This makes all React functions available via `react.useState(...)`, `react.useEffect(...)`, etc. Or users can destructure:

```kimchi
as react dep stdlib.kmx.react
dec { useState, useEffect, useRef } = react
```

## File Structure

```
src/
  extensions/
    kmx-react.js      — JSX plugin (lexer, parser, generator hooks)
  index.js             — plugin loader
  lexer.js             — plugin hook points added
  parser.js            — plugin hook points added
  generator.js         — plugin hook points added
  typechecker.js       — plugin hook points added
  bundler.js           — handle .kmx files with plugin loaded
stdlib/
  kmx/
    react.km           — React 19 extern declarations
```

## Lexer Changes (in plugin)

The JSX lexer activates when `<` is encountered in expression context. It needs to distinguish:

- `<div>` — JSX element (tag name follows `<`)
- `a < b` — less-than comparison

**Heuristic:** If `<` is followed by an identifier or `/` or `>`, it's JSX. If followed by a number, space-then-operator, or nothing useful, it's less-than.

The plugin adds these token types:
- `JSX_OPEN` — `<tag`
- `JSX_CLOSE` — `</tag>`
- `JSX_SELF_CLOSE` — `/>`
- `JSX_TEXT` — raw text between tags
- `JSX_EXPR_START` — `{` inside JSX
- `JSX_EXPR_END` — `}` inside JSX

## Parser Changes (in plugin)

The parser plugin hooks into `parsePrimary()`. When it sees a `<` (or `JSX_OPEN` token) in expression position, it calls `parseJSXElement()` which:

1. Parses the opening tag and attributes
2. If self-closing (`/>`), returns immediately
3. Otherwise, parses children (text, expressions `{...}`, nested elements)
4. Expects the matching closing tag `</tag>`

## Generator Changes (in plugin)

The plugin adds visitors for JSX AST nodes:

- `visitJSXElement` — emits `jsx()` or `jsxs()` based on child count
- `visitJSXFragment` — emits `jsxs(Fragment, { children: [...] })`
- `visitJSXExpression` — visits the inner expression
- `visitJSXText` — emits the string literal (whitespace-trimmed)

For browser builds, the auto-import becomes a global reference (React loaded via script tag).

## Browser Build Integration

In browser builds (`kimchi build`):

1. The bundler treats `.kmx` files same as `.km` but with the plugin loaded
2. React is expected as a global (loaded via `<script>` tag)
3. The `jsx`/`jsxs`/`Fragment` imports become global references
4. The entry HTML file includes:

```html
<script src="https://unpkg.com/react@19/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@19/umd/react-dom.production.min.js"></script>
<script src="bundle.js"></script>
```
