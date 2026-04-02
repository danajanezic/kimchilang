# Compiler Plugin System

[Back to README](../README.md)

KimchiLang's compiler supports plugins that extend the language with new syntax. Plugins hook into three stages of the compiler pipeline — lexing, parsing, and code generation — plus an auto-import hook for adding module imports.

The KMX-React plugin (JSX support for `.kmx` files) is the reference implementation.

## Plugin Structure

A plugin is a JavaScript module that exports a default object with four optional hooks:

```js
export default {
  name: 'my-plugin',

  // Called during tokenization — return a Token or null
  lexerRules(lexer) { ... },

  // Called during parsing — return an AST node or null
  parserRules(parser) { ... },

  // Called during code generation — return a JS string or undefined
  generatorVisitors(generator, node) { ... },

  // Called when emitting file header — return array of import statements
  autoImports(usedFeatures) { ... },
};
```

All hooks are optional. A plugin can implement any subset.

## Hook Details

### `lexerRules(lexer)`

Called at the start of each token in the main tokenization loop. The lexer instance is passed directly, giving access to:

| Method/Property | Description |
|----------------|-------------|
| `lexer.peek(offset?)` | Look at character at current position + offset without consuming |
| `lexer.advance()` | Consume and return the current character, advance position |
| `lexer.error(message)` | Throw a lexer error with line:column position |
| `lexer.pos` | Current position in source string |
| `lexer.line` | Current line number |
| `lexer.column` | Current column number |
| `lexer.source` | The full source string |

**Return:** A `Token` object to insert into the token stream, or `null` to pass through to the default lexer.

```js
import { Token } from '../lexer.js';

function lexerRules(lexer) {
  // Only handle tokens starting with '<'
  if (lexer.peek() !== '<') return null;

  // Consume characters and build a token
  let value = '';
  // ... consume with lexer.advance() ...

  return new Token('MY_TOKEN', value, lexer.line, lexer.column);
}
```

The KMX plugin uses this to capture entire JSX element trees as single compound tokens, recursively lexing nested elements, attributes, and expression children.

### `parserRules(parser)`

Called at the start of `parsePrimary()` — the entry point for parsing expressions. The parser instance provides:

| Method/Property | Description |
|----------------|-------------|
| `parser.peek()` | Look at the current token without consuming |
| `parser.advance()` | Consume and return the current token |
| `parser.check(tokenType)` | Check if current token matches a type |
| `parser.match(tokenType)` | If current token matches, consume and return true |
| `parser.expect(tokenType, message)` | Consume token or throw parse error |
| `parser.tokens` | The full token array |
| `parser.pos` | Current position in token array |

**Return:** An AST node object, or `null` to pass through to the default parser.

```js
function parserRules(parser) {
  const token = parser.peek();
  if (token.type !== 'MY_TOKEN') return null;

  parser.advance();
  return {
    type: 'MyCustomNode',
    value: token.value,
    line: token.line,
    column: token.column,
  };
}
```

The KMX plugin converts `JSX_ELEMENT` and `JSX_FRAGMENT` tokens into `JSXElement` and `JSXFragment` AST nodes with nested children, attributes, and expression nodes.

### `generatorVisitors(generator, node)`

Called in the `default` case of `visitExpression()` — when the generator encounters an AST node type it doesn't recognize. The generator instance provides:

| Method/Property | Description |
|----------------|-------------|
| `generator.visitExpression(node)` | Recursively generate JS for any expression node |
| `generator.emitLine(code)` | Emit a line of generated JavaScript |
| `generator.pushIndent()` | Increase indentation level |
| `generator.popIndent()` | Decrease indentation level |
| `generator.options` | Compiler options (target, debug, etc.) |

**Return:** A JavaScript string for the node, or `undefined` to pass through.

```js
function generatorVisitors(generator, node) {
  if (node.type === 'MyCustomNode') {
    return `myRuntime(${JSON.stringify(node.value)})`;
  }
  return undefined;
}
```

The KMX plugin generates `jsx()`, `jsxs()`, and `Fragment` calls from JSX AST nodes. Expression children are recursively compiled through the full KimchiLang pipeline to handle nested JSX and KimchiLang syntax inside `{expressions}`.

### `autoImports(usedFeatures)`

Called when the generator emits the file header. `usedFeatures` is a `Set` of feature strings detected in the AST (e.g., `'ShellBlock'`, `'PipeExpression'`).

**Return:** An array of import statement strings to add at the top of the output, or an empty array.

```js
function autoImports(usedFeatures) {
  if (usedFeatures.has('MyCustomNode')) {
    return ["import { myRuntime } from 'my-runtime';"];
  }
  return [];
}
```

The KMX plugin uses this to add `import { jsx, jsxs, Fragment } from 'react/jsx-runtime'` when JSX is detected in the AST.

## Plugin Registration

Plugins are loaded based on file extension via the registry (`src/extensions/registry.js`):

```js
const EXTENSION_PLUGINS = {
  '.kmx': './kmx-react.js',
};
```

When the compiler encounters a `.kmx` file, it automatically loads the `kmx-react` plugin. The bundler also respects this — `.kmx` files in `dep` imports get the plugin applied.

Plugins can also be passed explicitly via compiler options:

```js
import { compile } from './src/index.js';
import myPlugin from './my-plugin.js';

const js = compile(source, { plugins: [myPlugin] });
```

## Example: KMX-React Plugin

The built-in KMX plugin demonstrates all four hooks:

**Lexer:** Captures `<div className="x">children</div>` as a single `JSX_ELEMENT` token by recursively consuming nested elements, attributes (`string`, `{expression}`, `boolean`), and children (`text`, `{expression}`, nested elements, fragments).

**Parser:** Converts compound tokens into `JSXElement` nodes with `tag`, `attributes`, `children`, and `selfClosing` properties. Components (uppercase first letter) are stored as `Identifier` nodes; HTML elements as strings.

**Generator:** Emits `jsx("div", { className: "x", children: "text" })` for single-child elements and `jsxs("div", { children: [...] })` for multiple children. The `key` attribute is extracted to the third argument. Expression children are recursively compiled through the full KimchiLang pipeline.

**Auto-imports:** Adds `import { jsx, jsxs, Fragment } from 'react/jsx-runtime'` when any JSX node is present.

## Writing a New Plugin

To add support for a new syntax:

1. Create `src/extensions/my-plugin.js` with the four hooks
2. Register the file extension in `src/extensions/registry.js`
3. The compiler will auto-load it for files with that extension

Plugins are JavaScript modules (not KimchiLang) because they operate on the compiler's internal data structures. They have full access to the lexer, parser, and generator internals.
