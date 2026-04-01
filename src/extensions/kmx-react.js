// KMX-React — JSX compiler extension for KimchiLang
// Compiles JSX syntax to React 19's jsx()/jsxs() from react/jsx-runtime

import { Token } from '../lexer.js';

// --- JSX Lexer ---

function lexJSX(lexer) {
  // Only trigger on '<' followed by a letter (tag), '>' (fragment), or '/' (closing)
  if (lexer.peek() !== '<') return null;
  const next = lexer.peek(1);
  const isLetter = (next >= 'a' && next <= 'z') || (next >= 'A' && next <= 'Z');
  const isFragment = next === '>';
  // Don't match '</' at top level — that would be a stray closing tag
  if (!isLetter && !isFragment) return null;

  const startLine = lexer.line;
  const startColumn = lexer.column;

  if (isFragment) {
    return lexFragment(lexer, startLine, startColumn);
  }

  const element = lexElement(lexer);
  const token = new Token('JSX_ELEMENT', element.tag, startLine, startColumn);
  token.tag = element.tag;
  token.attrs = element.attrs;
  token.children = element.children;
  token.selfClosing = element.selfClosing;
  return token;
}

function lexFragment(lexer, startLine, startColumn) {
  lexer.advance(); // <
  lexer.advance(); // >

  const children = lexChildren(lexer, '');

  // Expect </>
  expect(lexer, '<');
  expect(lexer, '/');
  expect(lexer, '>');

  const token = new Token('JSX_FRAGMENT', '', startLine, startColumn);
  token.children = children;
  return token;
}

function lexElement(lexer) {
  lexer.advance(); // consume '<'

  const tag = readTagName(lexer);
  const attrs = readAttributes(lexer);

  skipWS(lexer);

  // Self-closing?
  if (lexer.peek() === '/' && lexer.peek(1) === '>') {
    lexer.advance(); // /
    lexer.advance(); // >
    return { tag, attrs, children: [], selfClosing: true };
  }

  // Opening tag close
  expect(lexer, '>');

  const children = lexChildren(lexer, tag);

  // Consume closing tag </tagName>
  expect(lexer, '<');
  expect(lexer, '/');
  const closingTag = readTagName(lexer);
  if (closingTag !== tag) {
    lexer.error(`Expected closing tag </${tag}> but found </${closingTag}>`);
  }
  skipWS(lexer);
  expect(lexer, '>');

  return { tag, attrs, children, selfClosing: false };
}

function readTagName(lexer) {
  let name = '';
  while (isTagChar(lexer.peek())) {
    name += lexer.advance();
  }
  if (!name) lexer.error('Expected tag name');
  return name;
}

function isTagChar(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
         (ch >= '0' && ch <= '9') || ch === '.' || ch === '-' || ch === '_';
}

function readAttributes(lexer) {
  const attrs = [];
  while (true) {
    skipWS(lexer);
    const ch = lexer.peek();
    if (ch === '>' || ch === '/' || ch === '\0') break;

    const name = readAttrName(lexer);
    skipWS(lexer);

    if (lexer.peek() === '=') {
      lexer.advance(); // =
      skipWS(lexer);
      if (lexer.peek() === '"') {
        // String attribute
        lexer.advance(); // opening "
        let value = '';
        while (lexer.peek() !== '"' && lexer.peek() !== '\0') {
          value += lexer.advance();
        }
        expect(lexer, '"');
        attrs.push({ name, value: { type: 'string', value } });
      } else if (lexer.peek() === "'") {
        lexer.advance();
        let value = '';
        while (lexer.peek() !== "'" && lexer.peek() !== '\0') {
          value += lexer.advance();
        }
        expect(lexer, "'");
        attrs.push({ name, value: { type: 'string', value } });
      } else if (lexer.peek() === '{') {
        // Expression attribute
        const expr = readBracedExpression(lexer);
        attrs.push({ name, value: { type: 'expression', value: expr } });
      } else {
        lexer.error(`Unexpected character in attribute value: ${lexer.peek()}`);
      }
    } else {
      // Boolean attribute (no value)
      attrs.push({ name, value: { type: 'boolean', value: true } });
    }
  }
  return attrs;
}

function readAttrName(lexer) {
  let name = '';
  while (isAttrNameChar(lexer.peek())) {
    name += lexer.advance();
  }
  if (!name) lexer.error('Expected attribute name');
  return name;
}

function isAttrNameChar(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
         (ch >= '0' && ch <= '9') || ch === '-' || ch === '_';
}

function readBracedExpression(lexer) {
  expect(lexer, '{');
  let depth = 1;
  let expr = '';
  while (depth > 0 && lexer.peek() !== '\0') {
    const ch = lexer.advance();
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    }
    expr += ch;
  }
  return expr.trim();
}

function lexChildren(lexer, parentTag) {
  const children = [];
  while (true) {
    // Check for closing tag or fragment close
    if (lexer.peek() === '<') {
      if (lexer.peek(1) === '/') {
        break; // closing tag — return to parent
      }
      if (lexer.peek(1) === '>') {
        // Could be nested fragment — but only if we aren't already in a fragment close
        // Actually nested fragments are child elements
      }
      // Nested element or fragment
      const startLine = lexer.line;
      const startColumn = lexer.column;
      const next = lexer.peek(1);
      if (next === '>') {
        // Nested fragment
        const frag = lexFragment(lexer, startLine, startColumn);
        children.push({ type: 'element', tag: '', children: frag.children, attrs: [], selfClosing: false, isFragment: true });
      } else {
        const child = lexElement(lexer);
        children.push({ type: 'element', ...child });
      }
      continue;
    }

    if (lexer.peek() === '{') {
      // Expression child
      const expr = readBracedExpression(lexer);
      children.push({ type: 'expression', value: expr });
      continue;
    }

    if (lexer.peek() === '\0') break;

    // Text content
    let text = '';
    while (lexer.peek() !== '<' && lexer.peek() !== '{' && lexer.peek() !== '\0') {
      text += lexer.advance();
    }
    // Trim and skip whitespace-only text nodes
    const trimmed = text.trim();
    if (trimmed) {
      children.push({ type: 'text', value: trimmed });
    }
  }
  return children;
}

function skipWS(lexer) {
  while (lexer.peek() === ' ' || lexer.peek() === '\t' || lexer.peek() === '\n' || lexer.peek() === '\r') {
    lexer.advance();
  }
}

function expect(lexer, ch) {
  if (lexer.peek() !== ch) {
    lexer.error(`Expected '${ch}' but found '${lexer.peek()}'`);
  }
  lexer.advance();
}


// --- JSX Parser ---

function parseJSX(parser) {
  const token = parser.peek();
  if (token.type === 'JSX_ELEMENT') {
    parser.advance();
    return buildElementNode(token);
  }
  if (token.type === 'JSX_FRAGMENT') {
    parser.advance();
    return buildFragmentNode(token);
  }
  return null;
}

function buildElementNode(token) {
  const isComponent = token.tag[0] >= 'A' && token.tag[0] <= 'Z';
  const tag = isComponent
    ? { type: 'Identifier', name: token.tag }
    : token.tag;

  return {
    type: 'JSXElement',
    tag,
    attributes: (token.attrs || []).map(buildAttribute),
    children: (token.children || []).map(buildChild),
    selfClosing: token.selfClosing,
    line: token.line,
    column: token.column,
  };
}

function buildFragmentNode(token) {
  return {
    type: 'JSXFragment',
    children: (token.children || []).map(buildChild),
    line: token.line,
    column: token.column,
  };
}

function buildAttribute(attr) {
  let value;
  if (attr.value.type === 'string') {
    value = { type: 'Literal', value: attr.value.value, isString: true };
  } else if (attr.value.type === 'expression') {
    value = { type: 'JSXExpression', source: attr.value.value };
  } else {
    // boolean
    value = { type: 'Literal', value: true };
  }
  return { name: attr.name, value };
}

function buildChild(child) {
  if (child.type === 'text') {
    return { type: 'JSXText', value: child.value };
  }
  if (child.type === 'expression') {
    return { type: 'JSXExpression', source: child.value };
  }
  if (child.type === 'element') {
    if (child.isFragment) {
      return {
        type: 'JSXFragment',
        children: (child.children || []).map(buildChild),
      };
    }
    // Reconstruct a token-like object for buildElementNode
    return buildElementNode({
      tag: child.tag,
      attrs: child.attrs,
      children: child.children,
      selfClosing: child.selfClosing,
      line: 0,
      column: 0,
    });
  }
  return { type: 'JSXText', value: '' };
}


// --- JSX Generator ---

function generateJSX(generator, node) {
  if (node.type === 'JSXElement') {
    return emitElement(generator, node);
  }
  if (node.type === 'JSXFragment') {
    return emitFragment(generator, node);
  }
  if (node.type === 'JSXText') {
    return JSON.stringify(node.value);
  }
  if (node.type === 'JSXExpression') {
    return node.source;
  }
  return undefined;
}

function emitElement(generator, node) {
  const tag = typeof node.tag === 'string'
    ? JSON.stringify(node.tag)
    : node.tag.name;

  const { props, keyArg } = buildProps(generator, node);
  const children = node.children.map(c => generateJSX(generator, c));

  const fn = children.length > 1 ? 'jsxs' : 'jsx';
  const propsStr = buildPropsObject(props, children);
  const args = [tag, propsStr];
  if (keyArg !== null) {
    args.push(keyArg);
  }

  return `${fn}(${args.join(', ')})`;
}

function emitFragment(generator, node) {
  const children = node.children.map(c => generateJSX(generator, c));
  const fn = children.length > 1 ? 'jsxs' : 'jsx';
  const propsStr = buildPropsObject([], children);
  return `${fn}(Fragment, ${propsStr})`;
}

function buildProps(generator, node) {
  const props = [];
  let keyArg = null;

  for (const attr of node.attributes) {
    const valueStr = attr.value.type === 'Literal'
      ? (attr.value.isString ? JSON.stringify(attr.value.value) : String(attr.value.value))
      : attr.value.source; // JSXExpression

    if (attr.name === 'key') {
      keyArg = valueStr;
    } else {
      props.push(`${attr.name}: ${valueStr}`);
    }
  }

  return { props, keyArg };
}

function buildPropsObject(props, children) {
  const parts = [...props];
  if (children.length === 1) {
    parts.push(`children: ${children[0]}`);
  } else if (children.length > 1) {
    parts.push(`children: [${children.join(', ')}]`);
  }
  if (parts.length === 0) return '{}';
  return `{ ${parts.join(', ')} }`;
}


// --- Plugin export ---

const kmxReactPlugin = {
  name: 'kmx-react',

  lexerRules(lexer) {
    return lexJSX(lexer);
  },

  parserRules(parser) {
    return parseJSX(parser);
  },

  generatorVisitors(generator, node) {
    return generateJSX(generator, node);
  },
};

export default kmxReactPlugin;
