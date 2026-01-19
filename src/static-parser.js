// KimchiLang Static File Parser
// Parses .static files containing arrays, objects, and enums

export class StaticLexer {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];
  }

  error(message) {
    throw new Error(`Static Lexer Error at ${this.line}:${this.column}: ${message}`);
  }

  peek(offset = 0) {
    const pos = this.pos + offset;
    if (pos >= this.source.length) return '\0';
    return this.source[pos];
  }

  advance() {
    const char = this.peek();
    this.pos++;
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return char;
  }

  match(expected) {
    if (this.peek() === expected) {
      this.advance();
      return true;
    }
    return false;
  }

  skipWhitespace() {
    while (this.peek() === ' ' || this.peek() === '\t' || this.peek() === '\r') {
      this.advance();
    }
  }

  skipLineComment() {
    while (this.peek() !== '\n' && this.peek() !== '\0') {
      this.advance();
    }
  }

  readString(quote) {
    let value = '';
    while (this.peek() !== quote && this.peek() !== '\0') {
      if (this.peek() === '\\') {
        this.advance();
        const escaped = this.advance();
        switch (escaped) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case 'r': value += '\r'; break;
          case '\\': value += '\\'; break;
          case '"': value += '"'; break;
          case "'": value += "'"; break;
          default: value += escaped;
        }
      } else {
        value += this.advance();
      }
    }
    this.advance(); // closing quote
    return { type: 'STRING', value };
  }

  readNumber() {
    let value = '';
    const isNegative = this.peek() === '-';
    if (isNegative) value += this.advance();
    
    while (/[0-9]/.test(this.peek())) {
      value += this.advance();
    }
    
    if (this.peek() === '.' && /[0-9]/.test(this.peek(1))) {
      value += this.advance();
      while (/[0-9]/.test(this.peek())) {
        value += this.advance();
      }
    }
    
    return { type: 'NUMBER', value: parseFloat(value) };
  }

  readIdentifier() {
    let value = '';
    while (/[a-zA-Z0-9_$.]/.test(this.peek())) {
      value += this.advance();
    }
    
    // Check for boolean/null keywords
    if (value === 'true') return { type: 'BOOLEAN', value: true };
    if (value === 'false') return { type: 'BOOLEAN', value: false };
    if (value === 'null') return { type: 'NULL', value: null };
    if (value === 'secret') return { type: 'SECRET' };
    
    return { type: 'IDENTIFIER', value };
  }

  tokenize() {
    while (this.pos < this.source.length) {
      this.skipWhitespace();
      
      if (this.pos >= this.source.length) break;
      
      const char = this.peek();
      
      // Comments
      if (char === '/' && this.peek(1) === '/') {
        this.advance();
        this.advance();
        this.skipLineComment();
        continue;
      }
      
      // Newlines
      if (char === '\n') {
        this.advance();
        this.tokens.push({ type: 'NEWLINE' });
        continue;
      }
      
      // Strings
      if (char === '"' || char === "'") {
        this.advance();
        this.tokens.push(this.readString(char));
        continue;
      }
      
      // Numbers (including negative)
      if (/[0-9]/.test(char) || (char === '-' && /[0-9]/.test(this.peek(1)))) {
        this.tokens.push(this.readNumber());
        continue;
      }
      
      // Identifiers (including dotted paths like foo.bar.Baz)
      if (/[a-zA-Z_$]/.test(char)) {
        this.tokens.push(this.readIdentifier());
        continue;
      }
      
      // Single character tokens
      this.advance();
      switch (char) {
        case '[': this.tokens.push({ type: 'LBRACKET' }); break;
        case ']': this.tokens.push({ type: 'RBRACKET' }); break;
        case '{': this.tokens.push({ type: 'LBRACE' }); break;
        case '}': this.tokens.push({ type: 'RBRACE' }); break;
        case '`': this.tokens.push({ type: 'BACKTICK' }); break;
        case '=': this.tokens.push({ type: 'EQUALS' }); break;
        case ',': this.tokens.push({ type: 'COMMA' }); break;
        default:
          this.error(`Unexpected character: ${char}`);
      }
    }
    
    this.tokens.push({ type: 'EOF' });
    return this.tokens;
  }
}

export class StaticParser {
  constructor(tokens, modulePath = '') {
    this.tokens = tokens;
    this.pos = 0;
    this.modulePath = modulePath;
    this.declarations = {};
  }

  error(message) {
    const token = this.peek();
    throw new Error(`Static Parse Error: ${message} (got ${token.type})`);
  }

  peek() {
    return this.tokens[this.pos] || { type: 'EOF' };
  }

  advance() {
    return this.tokens[this.pos++];
  }

  check(type) {
    return this.peek().type === type;
  }

  match(type) {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  expect(type, message) {
    if (!this.check(type)) {
      this.error(message || `Expected ${type}`);
    }
    return this.advance();
  }

  skipNewlines() {
    while (this.match('NEWLINE')) {}
  }

  parse() {
    this.skipNewlines();
    
    while (!this.check('EOF')) {
      this.parseDeclaration();
      this.skipNewlines();
    }
    
    return this.declarations;
  }

  parseDeclaration() {
    // Check for secret modifier
    let isSecret = false;
    if (this.match('SECRET')) {
      isSecret = true;
      this.skipNewlines();
    }
    
    // Expect an identifier (the name)
    const nameToken = this.expect('IDENTIFIER', 'Expected declaration name');
    const name = nameToken.value;
    
    this.skipNewlines();
    
    // Determine type by next token
    if (this.check('LBRACKET')) {
      // Array declaration: Name [value1, value2, ...]
      this.declarations[name] = this.parseArray();
    } else if (this.check('LBRACE')) {
      // Object declaration: Name { key = value, ... }
      this.declarations[name] = this.parseObject();
    } else if (this.check('BACKTICK')) {
      // Enum declaration: Name `ENUM1 = foo, ENUM2 = bar`
      this.declarations[name] = this.parseEnum();
    } else if (this.check('STRING')) {
      // String primitive: Name "value"
      const token = this.advance();
      this.declarations[name] = { type: 'literal', value: token.value, secret: isSecret };
      return;
    } else if (this.check('NUMBER')) {
      // Number primitive: Name 123
      const token = this.advance();
      this.declarations[name] = { type: 'literal', value: token.value, secret: isSecret };
      return;
    } else if (this.check('BOOLEAN')) {
      // Boolean primitive: Name true/false
      const token = this.advance();
      this.declarations[name] = { type: 'literal', value: token.value, secret: isSecret };
      return;
    } else {
      this.error(`Expected [, {, \`, string, or number after declaration name "${name}"`);
    }
    
    // Mark the declaration as secret if needed
    if (isSecret && this.declarations[name]) {
      this.declarations[name].secret = true;
    }
  }

  parseArray() {
    this.expect('LBRACKET', 'Expected [');
    const values = [];
    
    this.skipNewlines();
    
    while (!this.check('RBRACKET') && !this.check('EOF')) {
      values.push(this.parseValue());
      
      // Comma or newline separates values
      if (this.match('COMMA')) {
        this.skipNewlines();
      } else if (this.check('NEWLINE')) {
        this.skipNewlines();
      }
    }
    
    this.expect('RBRACKET', 'Expected ]');
    
    return { type: 'array', values };
  }

  parseObject() {
    this.expect('LBRACE', 'Expected {');
    const properties = {};
    
    this.skipNewlines();
    
    while (!this.check('RBRACE') && !this.check('EOF')) {
      // Check for secret modifier on property
      let isSecret = false;
      if (this.match('SECRET')) {
        isSecret = true;
        this.skipNewlines();
      }
      
      const keyToken = this.expect('IDENTIFIER', 'Expected property name');
      const key = keyToken.value;
      
      this.expect('EQUALS', 'Expected = after property name');
      
      const value = this.parseValue();
      if (isSecret) {
        value.secret = true;
      }
      properties[key] = value;
      
      // Comma or newline separates properties
      if (this.match('COMMA')) {
        this.skipNewlines();
      } else if (this.check('NEWLINE')) {
        this.skipNewlines();
      }
    }
    
    this.expect('RBRACE', 'Expected }');
    
    return { type: 'object', properties };
  }

  parseEnum() {
    this.expect('BACKTICK', 'Expected `');
    const members = {};
    
    while (!this.check('BACKTICK') && !this.check('EOF')) {
      const nameToken = this.expect('IDENTIFIER', 'Expected enum member name');
      const name = nameToken.value;
      
      this.expect('EQUALS', 'Expected = after enum member name');
      
      const value = this.parseValue();
      members[name] = value;
      
      // Comma or newline separates members
      if (this.match('COMMA')) {
        this.skipNewlines();
      } else if (this.check('NEWLINE')) {
        this.skipNewlines();
      }
    }
    
    this.expect('BACKTICK', 'Expected closing `');
    
    return { type: 'enum', members };
  }

  parseValue() {
    this.skipNewlines();
    
    const token = this.peek();
    
    switch (token.type) {
      case 'STRING':
        this.advance();
        return { type: 'literal', value: token.value };
      
      case 'NUMBER':
        this.advance();
        return { type: 'literal', value: token.value };
      
      case 'BOOLEAN':
        this.advance();
        return { type: 'literal', value: token.value };
      
      case 'NULL':
        this.advance();
        return { type: 'literal', value: null };
      
      case 'IDENTIFIER':
        this.advance();
        // Could be a reference to another static file's data (e.g., foo.bar.Baz)
        if (token.value.includes('.')) {
          return { type: 'reference', path: token.value };
        }
        // Or a local reference
        return { type: 'reference', path: token.value };
      
      case 'LBRACKET':
        return this.parseArray();
      
      case 'LBRACE':
        return this.parseObject();
      
      default:
        this.error(`Unexpected token in value: ${token.type}`);
    }
  }
}

// Generate JavaScript code from parsed static file
export function generateStaticCode(declarations, modulePath) {
  let code = '// Generated from .static file\n\n';
  
  // Check if any declarations use secrets
  const hasSecrets = checkForSecrets(declarations);
  
  if (hasSecrets) {
    // Add _secret helper for secret values
    code += `// Secret wrapper class\n`;
    code += `class _Secret {\n`;
    code += `  constructor(value) { this._value = value; }\n`;
    code += `  toString() { return "********"; }\n`;
    code += `  valueOf() { return this._value; }\n`;
    code += `  get value() { return this._value; }\n`;
    code += `  [Symbol.toPrimitive](hint) { return hint === "string" ? "********" : this._value; }\n`;
    code += `}\n`;
    code += `function _secret(value) { return new _Secret(value); }\n\n`;
  }
  
  for (const [name, decl] of Object.entries(declarations)) {
    code += `export const ${name} = ${generateValue(decl)};\n\n`;
  }
  
  return code;
}

// Check if any node in the declarations tree has secret: true
function checkForSecrets(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.secret === true) return true;
  
  for (const value of Object.values(obj)) {
    if (checkForSecrets(value)) return true;
  }
  return false;
}

function generateValue(node) {
  let value;
  
  switch (node.type) {
    case 'literal':
      if (typeof node.value === 'string') {
        value = JSON.stringify(node.value);
      } else {
        value = String(node.value);
      }
      break;
    
    case 'reference':
      // References are resolved at runtime via the dependency system
      value = node.path;
      break;
    
    case 'array':
      const arrayItems = node.values.map(v => generateValue(v)).join(', ');
      value = `[${arrayItems}]`;
      break;
    
    case 'object':
      const objProps = Object.entries(node.properties)
        .map(([k, v]) => `${k}: ${generateValue(v)}`)
        .join(', ');
      value = `{ ${objProps} }`;
      break;
    
    case 'enum':
      // Enums are frozen objects
      const enumProps = Object.entries(node.members)
        .map(([k, v]) => `${k}: ${generateValue(v)}`)
        .join(', ');
      value = `Object.freeze({ ${enumProps} })`;
      break;
    
    default:
      throw new Error(`Unknown node type: ${node.type}`);
  }
  
  // Wrap in _secret() if marked as secret
  if (node.secret) {
    return `_secret(${value})`;
  }
  
  return value;
}

// Parse a static file and return declarations
export function parseStaticFile(source, modulePath = '') {
  const lexer = new StaticLexer(source);
  const tokens = lexer.tokenize();
  const parser = new StaticParser(tokens, modulePath);
  return parser.parse();
}
