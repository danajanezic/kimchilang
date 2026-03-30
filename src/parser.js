// KimchiLang Parser - Converts tokens into an Abstract Syntax Tree (AST)

import { TokenType, Lexer } from './lexer.js';

// AST Node Types
export const NodeType = {
  Program: 'Program',
  
  // Declarations
  DecDeclaration: 'DecDeclaration',
  MutDeclaration: 'MutDeclaration',
  FunctionDeclaration: 'FunctionDeclaration',
  
  // Statements
  ExpressionStatement: 'ExpressionStatement',
  BlockStatement: 'BlockStatement',
  IfStatement: 'IfStatement',
  WhileStatement: 'WhileStatement',
  ForStatement: 'ForStatement',
  ForInStatement: 'ForInStatement',
  ReturnStatement: 'ReturnStatement',
  BreakStatement: 'BreakStatement',
  ContinueStatement: 'ContinueStatement',
  TryStatement: 'TryStatement',
  ThrowStatement: 'ThrowStatement',
  PatternMatch: 'PatternMatch',
  PrintStatement: 'PrintStatement',
  DepStatement: 'DepStatement',
  ArgDeclaration: 'ArgDeclaration',
  EnvDeclaration: 'EnvDeclaration',
  
  // Expressions
  Identifier: 'Identifier',
  Literal: 'Literal',
  BinaryExpression: 'BinaryExpression',
  UnaryExpression: 'UnaryExpression',
  AssignmentExpression: 'AssignmentExpression',
  CallExpression: 'CallExpression',
  MemberExpression: 'MemberExpression',
  ArrayExpression: 'ArrayExpression',
  ObjectExpression: 'ObjectExpression',
  ArrowFunctionExpression: 'ArrowFunctionExpression',
  ConditionalExpression: 'ConditionalExpression',
  AwaitExpression: 'AwaitExpression',
  SpreadElement: 'SpreadElement',
  RangeExpression: 'RangeExpression',
  FlowExpression: 'FlowExpression',
  PipeExpression: 'PipeExpression',
  TemplateLiteral: 'TemplateLiteral',
  ConditionalMethodExpression: 'ConditionalMethodExpression',

  // Patterns
  Property: 'Property',
  MatchCase: 'MatchCase',
  ObjectPattern: 'ObjectPattern',
  ArrayPattern: 'ArrayPattern',
  EnumDeclaration: 'EnumDeclaration',
  RegexLiteral: 'RegexLiteral',
  MatchExpression: 'MatchExpression',
  
  GuardStatement: 'GuardStatement',
  MatchBlock: 'MatchBlock',
  MatchArm: 'MatchArm',
  WildcardPattern: 'WildcardPattern',

  // Interop
  JSBlock: 'JSBlock',
  ShellBlock: 'ShellBlock',
  
  // Testing
  TestBlock: 'TestBlock',
  DescribeBlock: 'DescribeBlock',
  ExpectStatement: 'ExpectStatement',
  AssertStatement: 'AssertStatement',
  BeforeAllBlock: 'BeforeAllBlock',
  AfterAllBlock: 'AfterAllBlock',
  BeforeEachBlock: 'BeforeEachBlock',
  AfterEachBlock: 'AfterEachBlock',
};

class ParseError extends Error {
  constructor(message, token) {
    super(`Parse Error at ${token.line}:${token.column}: ${message}`);
    this.token = token;
  }
}

export class Parser {
  constructor(tokens) {
    this.tokens = tokens.filter(t => t.type !== TokenType.NEWLINE || this.isSignificantNewline(t));
    this.pos = 0;
    this.decVariables = new Set(); // Track deeply immutable variables
    this.secretVariables = new Set(); // Track secret variables
    this.inMatchArmBody = false; // Track when inside match arm body to limit expression parsing
  }

  isSignificantNewline(token) {
    return false; // For now, ignore all newlines (use semicolons or braces)
  }

  error(message) {
    throw new ParseError(message, this.peek());
  }

  errorAt(message, token) {
    throw new ParseError(message, token);
  }

  peek(offset = 0) {
    const pos = this.pos + offset;
    if (pos >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1]; // EOF
    }
    return this.tokens[pos];
  }

  advance() {
    const token = this.peek();
    if (token.type !== TokenType.EOF) {
      this.pos++;
    }
    return token;
  }

  check(type) {
    return this.peek().type === type;
  }

  match(...types) {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  expect(type, message) {
    if (this.check(type)) {
      return this.advance();
    }
    this.error(message || `Expected ${type}, got ${this.peek().type}`);
  }

  skipNewlines() {
    while (this.match(TokenType.NEWLINE)) {}
  }

  // Attach position info from a token to a node
  withPosition(node, token = null) {
    const t = token || this.peek();
    node.line = t.line;
    node.column = t.column;
    return node;
  }

  // Main parsing entry point
  parse() {
    const body = [];
    
    while (!this.check(TokenType.EOF)) {
      this.skipNewlines();
      if (this.check(TokenType.EOF)) break;
      
      const stmt = this.parseStatement();
      if (stmt) body.push(stmt);
    }
    
    return {
      type: NodeType.Program,
      body,
    };
  }

  parseKMDoc(text) {
    const lines = text.split('\n').map(line => line.replace(/^\s*\*\s?/, '').trim());
    const result = { description: '', params: [], returns: null };

    const descLines = [];
    for (const line of lines) {
      if (line.startsWith('@')) break;
      if (line) descLines.push(line);
    }
    result.description = descLines.join(' ').trim();

    for (const line of lines) {
      const paramMatch = line.match(/^@param\s+\{([^}]+)\}\s+(\w+)(?:\s*-\s*(.+))?/);
      if (paramMatch) {
        result.params.push({
          type: paramMatch[1].trim(),
          name: paramMatch[2],
          description: paramMatch[3] ? paramMatch[3].trim() : null,
        });
        continue;
      }

      const returnsMatch = line.match(/^@returns?\s+\{([^}]+)\}(?:\s+(.+))?/);
      if (returnsMatch) {
        result.returns = {
          type: returnsMatch[1].trim(),
          description: returnsMatch[2] ? returnsMatch[2].trim() : null,
        };
        continue;
      }

      const typeMatch = line.match(/^@type\s+\{([^}]+)\}/);
      if (typeMatch) {
        result.type = typeMatch[1].trim();
      }
    }

    return result;
  }

  parseStatement() {
    this.skipNewlines();

    // Capture doc comment if present
    let kmdoc = undefined;
    if (this.check(TokenType.DOC_COMMENT)) {
      const docToken = this.advance();
      kmdoc = this.parseKMDoc(docToken.value);
      this.skipNewlines();
    }

    // Check for expose modifier
    let exposed = false;
    if (this.check(TokenType.EXPOSE)) {
      this.advance();
      exposed = true;
    }
    
    // Check for secret modifier
    let secret = false;
    if (this.check(TokenType.SECRET)) {
      this.advance();
      secret = true;
    }
    
    // Declarations
    if (this.check(TokenType.DEC)) {
      const decl = this.parseDecDeclaration();
      decl.exposed = exposed;
      decl.secret = secret;
      if (kmdoc) decl.kmdoc = kmdoc;
      // Track secret variables
      if (secret && decl.name) {
        this.secretVariables.add(decl.name);
      }
      return decl;
    }

    if (this.check(TokenType.MUT)) {
      const decl = this.parseMutDeclaration();
      if (kmdoc) decl.kmdoc = kmdoc;
      return decl;
    }

    if (this.check(TokenType.ASYNC)) {
      this.advance();
      if (this.check(TokenType.FN)) {
        const decl = this.parseFunctionDeclaration();
        decl.async = true;
        decl.exposed = exposed;
        if (kmdoc) decl.kmdoc = kmdoc;
        return decl;
      }
      if (this.check(TokenType.MEMO)) {
        const decl = this.parseMemoDeclaration();
        decl.async = true;
        decl.exposed = exposed;
        if (kmdoc) decl.kmdoc = kmdoc;
        return decl;
      }
      this.error('async must be followed by fn or memo');
    }
    
    if (this.check(TokenType.FN)) {
      const decl = this.parseFunctionDeclaration();
      decl.exposed = exposed;
      if (kmdoc) decl.kmdoc = kmdoc;
      return decl;
    }

    if (this.check(TokenType.MEMO)) {
      const decl = this.parseMemoDeclaration();
      decl.exposed = exposed;
      if (kmdoc) decl.kmdoc = kmdoc;
      return decl;
    }

    if (this.check(TokenType.ENUM)) {
      const decl = this.parseEnumDeclaration();
      decl.exposed = exposed;
      if (kmdoc) decl.kmdoc = kmdoc;
      return decl;
    }
    
    // Env declaration: env <name>, !env <name>, secret env <name>
    if (this.check(TokenType.ENV) || (this.check(TokenType.NOT) && this.peek(1).type === TokenType.ENV)) {
      const decl = this.parseEnvDeclaration();
      decl.secret = secret;
      if (secret) {
        this.secretVariables.add(decl.name);
      }
      return decl;
    }
    
    // Arg declaration: arg <name>, !arg <name>, arg <name> = <default>, secret arg <name>
    if (this.check(TokenType.ARG) || (this.check(TokenType.NOT) && this.peek(1).type === TokenType.ARG)) {
      const decl = this.parseArgDeclaration();
      decl.secret = secret;
      if (secret) {
        this.secretVariables.add(decl.name);
      }
      return decl;
    }
    
    // If expose was used but not followed by a valid declaration
    if (exposed) {
      this.error('expose must be followed by dec, fn, memo, or enum');
    }
    
    // If secret was used but not followed by dec, env, or arg
    if (secret) {
      this.error('secret must be followed by dec, env, or arg');
    }
    
    // Control flow
    if (this.check(TokenType.GUARD)) {
      return this.parseGuardStatement();
    }

    if (this.check(TokenType.IF)) {
      return this.parseIfStatement();
    }
    
    if (this.check(TokenType.WHILE)) {
      return this.parseWhileStatement();
    }
    
    if (this.check(TokenType.FOR)) {
      return this.parseForStatement();
    }
    
    if (this.check(TokenType.RETURN)) {
      return this.parseReturnStatement();
    }
    
    if (this.check(TokenType.BREAK)) {
      this.advance();
      return { type: NodeType.BreakStatement };
    }
    
    if (this.check(TokenType.CONTINUE)) {
      this.advance();
      return { type: NodeType.ContinueStatement };
    }
    
    if (this.check(TokenType.TRY)) {
      return this.parseTryStatement();
    }
    
    if (this.check(TokenType.THROW)) {
      return this.parseThrowStatement();
    }
    
    // Pattern matching: |condition| => code
    if (this.check(TokenType.BITOR)) {
      return this.parsePatternMatch();
    }
    
    // Print (convenience)
    if (this.check(TokenType.PRINT)) {
      return this.parsePrintStatement();
    }
    
    // Dependency declaration: as <alias> dep <path>
    if (this.check(TokenType.AS)) {
      return this.parseDepStatement();
    }
    
    // JS interop block: js { ... } or js(args) { ... }
    if (this.check(TokenType.JS)) {
      return this.parseJSBlock();
    }
    
    // Shell interop block: shell { ... } or shell(args) { ... }
    if (this.check(TokenType.SHELL)) {
      return this.parseShellBlock();
    }
    
    // Lifecycle hooks
    if (this.check(TokenType.BEFORE_ALL)) {
      this.advance();
      return { type: NodeType.BeforeAllBlock, body: this.parseBlock() };
    }
    if (this.check(TokenType.AFTER_ALL)) {
      this.advance();
      return { type: NodeType.AfterAllBlock, body: this.parseBlock() };
    }
    if (this.check(TokenType.BEFORE_EACH)) {
      this.advance();
      return { type: NodeType.BeforeEachBlock, body: this.parseBlock() };
    }
    if (this.check(TokenType.AFTER_EACH)) {
      this.advance();
      return { type: NodeType.AfterEachBlock, body: this.parseBlock() };
    }

    // Test block: test "name" { ... }
    if (this.check(TokenType.TEST)) {
      return this.parseTestBlock();
    }
    
    // Describe block: describe "name" { ... }
    if (this.check(TokenType.DESCRIBE)) {
      return this.parseDescribeBlock();
    }
    
    // Expect statement: expect(value).toBe(expected)
    if (this.check(TokenType.EXPECT)) {
      return this.parseExpectStatement();
    }
    
    // Assert statement: assert condition, "message"
    if (this.check(TokenType.ASSERT)) {
      return this.parseAssertStatement();
    }
    
    // Expression statement
    return this.parseExpressionStatement();
  }

  parseDecDeclaration() {
    this.expect(TokenType.DEC, 'Expected dec');
    
    // Check for destructuring pattern
    if (this.check(TokenType.LBRACE)) {
      // Object destructuring: dec { a, b } = obj
      const pattern = this.parseObjectPattern();
      this.expect(TokenType.ASSIGN, 'dec requires initialization');
      const init = this.parseExpression();
      
      // Register all destructured variables as immutable
      for (const prop of pattern.properties) {
        this.decVariables.add(prop.key);
      }
      
      return {
        type: NodeType.DecDeclaration,
        pattern,
        init,
        destructuring: true,
      };
    }
    
    if (this.check(TokenType.LBRACKET)) {
      // Array destructuring: dec [x, y] = arr
      const pattern = this.parseArrayPattern();
      this.expect(TokenType.ASSIGN, 'dec requires initialization');
      const init = this.parseExpression();
      
      // Register all destructured variables as immutable
      for (const elem of pattern.elements) {
        if (elem && elem.type === NodeType.Identifier) {
          this.decVariables.add(elem.name);
        }
      }
      
      return {
        type: NodeType.DecDeclaration,
        pattern,
        init,
        destructuring: true,
      };
    }
    
    const name = this.expect(TokenType.IDENTIFIER, 'Expected variable name').value;
    
    // Register this variable as deeply immutable
    this.decVariables.add(name);
    
    this.expect(TokenType.ASSIGN, 'dec requires initialization');
    const init = this.parseExpression();
    
    return {
      type: NodeType.DecDeclaration,
      name,
      init,
    };
  }

  parseMutDeclaration() {
    this.expect(TokenType.MUT, 'Expected mut');

    if (this.check(TokenType.LBRACE)) {
      const pattern = this.parseObjectPattern();
      this.expect(TokenType.ASSIGN, 'mut requires initialization');
      const init = this.parseExpression();
      return {
        type: NodeType.MutDeclaration,
        pattern,
        init,
        destructuring: true,
        line: this.tokens[this.pos - 1].line,
        column: this.tokens[this.pos - 1].column,
      };
    }

    if (this.check(TokenType.LBRACKET)) {
      const pattern = this.parseArrayPattern();
      this.expect(TokenType.ASSIGN, 'mut requires initialization');
      const init = this.parseExpression();
      return {
        type: NodeType.MutDeclaration,
        pattern,
        init,
        destructuring: true,
        line: this.tokens[this.pos - 1].line,
        column: this.tokens[this.pos - 1].column,
      };
    }

    const name = this.expect(TokenType.IDENTIFIER, 'Expected variable name').value;
    this.expect(TokenType.ASSIGN, 'mut requires initialization');
    const init = this.parseExpression();

    return {
      type: NodeType.MutDeclaration,
      name,
      init,
      line: this.tokens[this.pos - 1].line,
      column: this.tokens[this.pos - 1].column,
    };
  }

  parseObjectPattern() {
    this.expect(TokenType.LBRACE, 'Expected {');
    const properties = [];
    
    if (!this.check(TokenType.RBRACE)) {
      do {
        this.skipNewlines();
        if (this.check(TokenType.RBRACE)) break;
        
        const key = this.expect(TokenType.IDENTIFIER, 'Expected property name').value;
        
        // Check for renaming: { oldName: newName }
        let value = key;
        if (this.match(TokenType.COLON)) {
          value = this.expect(TokenType.IDENTIFIER, 'Expected variable name').value;
        }
        
        properties.push({ key, value });
      } while (this.match(TokenType.COMMA));
    }
    
    this.skipNewlines();
    this.expect(TokenType.RBRACE, 'Expected }');
    
    return {
      type: NodeType.ObjectPattern,
      properties,
    };
  }

  parseArrayPattern() {
    this.expect(TokenType.LBRACKET, 'Expected [');
    const elements = [];
    
    if (!this.check(TokenType.RBRACKET)) {
      do {
        this.skipNewlines();
        if (this.check(TokenType.RBRACKET)) break;
        
        // Allow holes in array destructuring: [a, , b]
        if (this.check(TokenType.COMMA)) {
          elements.push(null);
        } else {
          const name = this.expect(TokenType.IDENTIFIER, 'Expected variable name').value;
          elements.push({ type: NodeType.Identifier, name });
        }
      } while (this.match(TokenType.COMMA));
    }
    
    this.skipNewlines();
    this.expect(TokenType.RBRACKET, 'Expected ]');
    
    return {
      type: NodeType.ArrayPattern,
      elements,
    };
  }

  parseFunctionDeclaration() {
    this.expect(TokenType.FN, 'Expected fn');
    const async = false; // TODO: handle async
    const name = this.expect(TokenType.IDENTIFIER, 'Expected function name').value;
    
    this.expect(TokenType.LPAREN, 'Expected (');
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, 'Expected )');
    
    const body = this.parseBlock();
    
    return {
      type: NodeType.FunctionDeclaration,
      name,
      params,
      body,
      async,
    };
  }

  parseMemoDeclaration() {
    this.expect(TokenType.MEMO, 'Expected memo');
    const name = this.expect(TokenType.IDENTIFIER, 'Expected function name').value;
    
    this.expect(TokenType.LPAREN, 'Expected (');
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, 'Expected )');
    
    const body = this.parseBlock();
    
    return {
      type: NodeType.FunctionDeclaration,
      name,
      params,
      body,
      async: false,
      memoized: true,
    };
  }

  parseEnumDeclaration() {
    this.expect(TokenType.ENUM, 'Expected enum');
    const name = this.expect(TokenType.IDENTIFIER, 'Expected enum name').value;
    
    this.expect(TokenType.LBRACE, 'Expected {');
    const members = [];
    
    this.skipNewlines();
    if (!this.check(TokenType.RBRACE)) {
      do {
        this.skipNewlines();
        if (this.check(TokenType.RBRACE)) break;
        
        const memberName = this.expect(TokenType.IDENTIFIER, 'Expected enum member name').value;
        
        // Check for explicit value assignment
        let value = null;
        if (this.match(TokenType.ASSIGN)) {
          value = this.parseExpression();
        }
        
        members.push({ name: memberName, value });
      } while (this.match(TokenType.COMMA));
    }
    
    this.skipNewlines();
    this.expect(TokenType.RBRACE, 'Expected }');
    
    return {
      type: NodeType.EnumDeclaration,
      name,
      members,
    };
  }

  parseParameterList() {
    const params = [];
    
    if (!this.check(TokenType.RPAREN)) {
      do {
        if (this.match(TokenType.SPREAD)) {
          params.push({
            type: 'RestElement',
            argument: this.expect(TokenType.IDENTIFIER, 'Expected parameter name').value,
          });
          break;
        }
        
        // Check for object destructuring pattern: { a, b }
        if (this.check(TokenType.LBRACE)) {
          const pattern = this.parseObjectPattern();
          let defaultValue = null;
          if (this.match(TokenType.ASSIGN)) {
            defaultValue = this.parseExpression();
          }
          params.push({ pattern, defaultValue, destructuring: 'object' });
          continue;
        }
        
        // Check for array destructuring pattern: [a, b]
        if (this.check(TokenType.LBRACKET)) {
          const pattern = this.parseArrayPattern();
          let defaultValue = null;
          if (this.match(TokenType.ASSIGN)) {
            defaultValue = this.parseExpression();
          }
          params.push({ pattern, defaultValue, destructuring: 'array' });
          continue;
        }
        
        const name = this.expect(TokenType.IDENTIFIER, 'Expected parameter name').value;
        let defaultValue = null;
        
        if (this.match(TokenType.ASSIGN)) {
          defaultValue = this.parseExpression();
        }
        
        params.push({ name, defaultValue });
      } while (this.match(TokenType.COMMA));
    }
    
    return params;
  }

  parseBlock() {
    this.expect(TokenType.LBRACE, 'Expected {');
    const body = [];
    
    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      this.skipNewlines();
      if (this.check(TokenType.RBRACE)) break;
      
      const stmt = this.parseStatement();
      if (stmt) body.push(stmt);
    }
    
    this.expect(TokenType.RBRACE, 'Expected }');
    
    return {
      type: NodeType.BlockStatement,
      body,
    };
  }

  parseGuardStatement() {
    const guardToken = this.expect(TokenType.GUARD, 'Expected guard');
    const test = this.parseExpression();

    if (!this.match(TokenType.ELSE)) {
      this.error('guard requires an else block');
    }

    const alternate = this.parseBlock();

    return {
      type: NodeType.GuardStatement,
      test,
      alternate,
      line: guardToken.line,
      column: guardToken.column,
    };
  }

  parseMatchBlock() {
    this.expect(TokenType.MATCH_KEYWORD, 'Expected match');
    const subject = this.parseExpression();
    this.expect(TokenType.LBRACE, 'Expected { after match subject');

    const arms = [];
    this.skipNewlines();

    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      const arm = this.parseMatchArm();
      arms.push(arm);
      this.skipNewlines();
    }

    this.expect(TokenType.RBRACE, 'Expected } to close match');

    return {
      type: NodeType.MatchBlock,
      subject,
      arms,
      line: this.tokens[this.pos - 1].line,
      column: this.tokens[this.pos - 1].column,
    };
  }

  parseMatchArm() {
    const pattern = this.parseMatchPattern();

    // Optional when guard
    let guard = null;
    if (this.check(TokenType.WHEN)) {
      this.advance();
      guard = this.parseExpression();
    }

    this.expect(TokenType.FAT_ARROW, 'Expected => after pattern');

    // Body: either a block or a single expression
    let body;
    if (this.check(TokenType.LBRACE)) {
      body = this.parseBlock();
    } else {
      // Set flag to prevent [ from being consumed as computed member access
      // since newlines are stripped and [ could be the start of the next arm's pattern
      const prevInMatchArmBody = this.inMatchArmBody;
      this.inMatchArmBody = true;
      body = this.parseExpression();
      this.inMatchArmBody = prevInMatchArmBody;
    }

    return {
      type: NodeType.MatchArm,
      pattern,
      guard,
      body,
      line: this.tokens[this.pos - 1].line,
      column: this.tokens[this.pos - 1].column,
    };
  }

  parseMatchPattern() {
    // Wildcard: _
    if (this.check(TokenType.IDENTIFIER) && this.tokens[this.pos].value === '_') {
      this.advance();
      return { type: NodeType.WildcardPattern };
    }

    // is TypeCheck
    if (this.check(TokenType.IS)) {
      this.advance();
      const typeName = this.expect(TokenType.IDENTIFIER, 'Expected type name after is').value;
      return {
        type: 'IsPattern',
        typeName,
      };
    }

    // Object destructuring pattern: { key: value, key2 }
    if (this.check(TokenType.LBRACE)) {
      return this.parseMatchObjectPattern();
    }

    // Array destructuring pattern: [a, b, c]
    if (this.check(TokenType.LBRACKET)) {
      return this.parseMatchArrayPattern();
    }

    // Literal value or binding variable
    if (this.check(TokenType.NUMBER) || this.check(TokenType.STRING) ||
        this.check(TokenType.BOOLEAN) || this.check(TokenType.NULL)) {
      const token = this.advance();
      let value = token.value;
      if (token.type === TokenType.NUMBER) {
        value = parseFloat(value);
      } else if (token.type === TokenType.BOOLEAN) {
        value = token.value === 'true';
      } else if (token.type === TokenType.NULL) {
        value = null;
      }
      return {
        type: 'LiteralPattern',
        value,
        raw: token.value,
      };
    }

    // Identifier — binding variable (like n in: n when n >= 90)
    if (this.check(TokenType.IDENTIFIER)) {
      const name = this.advance().value;
      return {
        type: 'BindingPattern',
        name,
      };
    }

    this.error('Expected match pattern');
  }

  parseMatchObjectPattern() {
    this.expect(TokenType.LBRACE, 'Expected {');
    const properties = [];

    while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      this.skipNewlines();
      if (this.check(TokenType.RBRACE)) break;

      const key = this.expect(TokenType.IDENTIFIER, 'Expected property name').value;

      let value = null;
      if (this.match(TokenType.COLON)) {
        // { key: pattern } — value is a literal or binding
        if (this.check(TokenType.NUMBER) || this.check(TokenType.STRING) ||
            this.check(TokenType.BOOLEAN) || this.check(TokenType.NULL)) {
          const token = this.advance();
          let val = token.value;
          if (token.type === TokenType.NUMBER) val = parseFloat(val);
          else if (token.type === TokenType.BOOLEAN) val = token.value === 'true';
          else if (token.type === TokenType.NULL) val = null;
          value = { type: 'LiteralPattern', value: val, raw: token.value };
        } else if (this.check(TokenType.IDENTIFIER)) {
          value = { type: 'BindingPattern', name: this.advance().value };
        }
      }

      properties.push({ key, value });

      if (!this.check(TokenType.RBRACE)) {
        this.match(TokenType.COMMA);
      }
    }

    this.expect(TokenType.RBRACE, 'Expected }');

    return {
      type: 'ObjectDestructurePattern',
      properties,
    };
  }

  parseMatchArrayPattern() {
    this.expect(TokenType.LBRACKET, 'Expected [');
    const elements = [];

    while (!this.check(TokenType.RBRACKET) && !this.check(TokenType.EOF)) {
      this.skipNewlines();
      if (this.check(TokenType.RBRACKET)) break;

      if (this.check(TokenType.NUMBER) || this.check(TokenType.STRING) ||
          this.check(TokenType.BOOLEAN) || this.check(TokenType.NULL)) {
        const token = this.advance();
        let value = token.value;
        if (token.type === TokenType.NUMBER) value = parseFloat(value);
        else if (token.type === TokenType.BOOLEAN) value = token.value === 'true';
        else if (token.type === TokenType.NULL) value = null;
        elements.push({ type: 'LiteralPattern', value, raw: token.value });
      } else if (this.check(TokenType.IDENTIFIER)) {
        const name = this.advance().value;
        if (name === '_') {
          elements.push({ type: NodeType.WildcardPattern });
        } else {
          elements.push({ type: 'BindingPattern', name });
        }
      }

      if (!this.check(TokenType.RBRACKET)) {
        this.match(TokenType.COMMA);
      }
    }

    this.expect(TokenType.RBRACKET, 'Expected ]');

    return {
      type: 'ArrayDestructurePattern',
      elements,
    };
  }

  parseIfStatement() {
    this.expect(TokenType.IF, 'Expected if');
    const test = this.parseExpression();
    const consequent = this.parseBlock();
    
    let alternate = null;
    if (this.match(TokenType.ELIF)) {
      this.pos--; // Put elif back
      this.tokens[this.pos] = { ...this.tokens[this.pos], type: TokenType.IF };
      alternate = this.parseIfStatement();
    } else if (this.match(TokenType.ELSE)) {
      if (this.check(TokenType.IF)) {
        alternate = this.parseIfStatement();
      } else {
        alternate = this.parseBlock();
      }
    }
    
    return {
      type: NodeType.IfStatement,
      test,
      consequent,
      alternate,
    };
  }

  parseWhileStatement() {
    this.expect(TokenType.WHILE, 'Expected while');
    const test = this.parseExpression();
    const body = this.parseBlock();
    
    return {
      type: NodeType.WhileStatement,
      test,
      body,
    };
  }

  parseForStatement() {
    this.expect(TokenType.FOR, 'Expected for');
    const variable = this.expect(TokenType.IDENTIFIER, 'Expected variable name').value;
    
    this.expect(TokenType.IN, 'Expected in');
    const iterable = this.parseExpression();
    const body = this.parseBlock();
    
    return {
      type: NodeType.ForInStatement,
      variable,
      iterable,
      body,
    };
  }

  parseReturnStatement() {
    this.expect(TokenType.RETURN, 'Expected return');
    
    let argument = null;
    if (!this.check(TokenType.RBRACE) && !this.check(TokenType.NEWLINE) && !this.check(TokenType.EOF)) {
      argument = this.parseExpression();
    }
    
    return {
      type: NodeType.ReturnStatement,
      argument,
    };
  }

  parseTryStatement() {
    this.expect(TokenType.TRY, 'Expected try');
    const block = this.parseBlock();
    
    let handler = null;
    if (this.match(TokenType.CATCH)) {
      let param = null;
      if (this.match(TokenType.LPAREN)) {
        param = this.expect(TokenType.IDENTIFIER, 'Expected catch parameter').value;
        this.expect(TokenType.RPAREN, 'Expected )');
      }
      const catchBody = this.parseBlock();
      handler = { param, body: catchBody };
    }
    
    let finalizer = null;
    if (this.match(TokenType.FINALLY)) {
      finalizer = this.parseBlock();
    }
    
    return {
      type: NodeType.TryStatement,
      block,
      handler,
      finalizer,
    };
  }

  parseThrowStatement() {
    this.expect(TokenType.THROW, 'Expected throw');
    const argument = this.parseExpression();
    
    return {
      type: NodeType.ThrowStatement,
      argument,
    };
  }

  parsePatternMatch() {
    // Standalone pattern matching: |condition| => code
    // Parse consecutive pattern cases
    const cases = [];
    
    while (this.check(TokenType.BITOR)) {
      this.expect(TokenType.BITOR, 'Expected |');
      // Parse condition without bitwise OR to avoid consuming the closing |
      const test = this.parsePatternCondition();
      this.expect(TokenType.BITOR, 'Expected |');
      this.expect(TokenType.FAT_ARROW, 'Expected =>');
      
      let consequent;
      if (this.check(TokenType.LBRACE)) {
        consequent = this.parseBlock();
      } else {
        consequent = this.parseStatement();
      }
      
      cases.push({
        type: NodeType.MatchCase,
        test,
        consequent,
      });
      
      this.skipNewlines();
    }
    
    return {
      type: NodeType.PatternMatch,
      cases,
    };
  }

  parsePatternCondition() {
    // Parse expression but stop before bitwise OR (|) to allow pattern delimiters
    // Skip directly to comparison level, bypassing bitwise operators
    return this.parsePatternOr();
  }

  parsePatternOr() {
    let left = this.parsePatternAnd();
    
    while (this.match(TokenType.OR)) {
      const right = this.parsePatternAnd();
      left = {
        type: NodeType.BinaryExpression,
        operator: '||',
        left,
        right,
      };
    }
    
    return left;
  }

  parsePatternAnd() {
    // Skip bitwise OR - go directly to comparison
    let left = this.parseEquality();
    
    while (this.match(TokenType.AND)) {
      const right = this.parseEquality();
      left = {
        type: NodeType.BinaryExpression,
        operator: '&&',
        left,
        right,
      };
    }
    
    return left;
  }

  parsePrintStatement() {
    this.expect(TokenType.PRINT, 'Expected print');
    const argument = this.parseExpression();
    
    return {
      type: NodeType.PrintStatement,
      argument,
    };
  }

  parseDepStatement() {
    // Syntax: as <alias> dep <dotted.path>
    // Or: as <alias> dep <dotted.path>({overrides})
    // Or: as <alias> dep @<dotted.path> (external module from .km_modules)
    this.expect(TokenType.AS, 'Expected as');
    const alias = this.expect(TokenType.IDENTIFIER, 'Expected dependency alias').value;
    this.expect(TokenType.DEP, 'Expected dep');
    
    // Check for @ prefix indicating external module
    const isExternal = this.match(TokenType.AT);
    
    // Parse dotted path (e.g., project_name.salesforce.client)
    // Accept keywords as path segments since module paths may contain words like 'test', 'string', etc.
    const pathParts = [];
    const token = this.advance();
    if (token.type !== TokenType.IDENTIFIER && typeof token.value !== 'string') {
      this.error('Expected dependency path');
    }
    pathParts.push(token.value);

    while (this.match(TokenType.DOT)) {
      const seg = this.advance();
      if (seg.type !== TokenType.IDENTIFIER && typeof seg.value !== 'string') {
        this.error('Expected path segment');
      }
      pathParts.push(seg.value);
    }
    
    const path = pathParts.join('.');
    
    // Check for dependency injection overrides: dep path({...})
    let overrides = null;
    if (this.match(TokenType.LPAREN)) {
      overrides = this.parseExpression();
      this.expect(TokenType.RPAREN, 'Expected )');
    }
    
    return {
      type: NodeType.DepStatement,
      alias,
      path,
      pathParts,
      overrides,
      isExternal,
    };
  }

  parseArgDeclaration() {
    // Syntax: arg <name>           - optional arg
    //         !arg <name>          - required arg
    //         arg <name> = <value> - optional arg with default
    let required = false;
    
    if (this.match(TokenType.NOT)) {
      required = true;
    }
    
    this.expect(TokenType.ARG, 'Expected arg');
    const name = this.expect(TokenType.IDENTIFIER, 'Expected argument name').value;
    
    let defaultValue = null;
    if (this.match(TokenType.ASSIGN)) {
      defaultValue = this.parseExpression();
    }
    
    return {
      type: NodeType.ArgDeclaration,
      name,
      required,
      defaultValue,
    };
  }

  parseEnvDeclaration() {
    // Syntax: env <name>           - optional env var (undefined if not set)
    //         !env <name>          - required env var (throws if not set)
    //         env <name> = <value> - optional env var with default
    let required = false;
    
    if (this.match(TokenType.NOT)) {
      required = true;
    }
    
    this.expect(TokenType.ENV, 'Expected env');
    const name = this.expect(TokenType.IDENTIFIER, 'Expected environment variable name').value;
    
    let defaultValue = null;
    if (this.match(TokenType.ASSIGN)) {
      defaultValue = this.parseExpression();
    }
    
    return {
      type: NodeType.EnvDeclaration,
      name,
      required,
      defaultValue,
    };
  }

  parseJSBlock() {
    // Syntax: js { ... }           - raw JS block
    //         js(a, b) { ... }     - JS block with inputs from kimchi scope
    this.expect(TokenType.JS, 'Expected js');
    
    const inputs = [];
    
    // Check for optional input parameters
    if (this.match(TokenType.LPAREN)) {
      if (!this.check(TokenType.RPAREN)) {
        do {
          const name = this.expect(TokenType.IDENTIFIER, 'Expected identifier').value;
          inputs.push(name);
        } while (this.match(TokenType.COMMA));
      }
      this.expect(TokenType.RPAREN, 'Expected )');
    }
    
    this.skipNewlines();
    this.expect(TokenType.LBRACE, 'Expected { after js');
    
    // Get the raw JS content from the JS_CONTENT token
    let jsCode = '';
    if (this.check(TokenType.JS_CONTENT)) {
      jsCode = this.advance().value;
    }
    
    this.expect(TokenType.RBRACE, 'Expected } to close js block');
    
    // Check for secrets being passed to console.log
    const secretInputs = inputs.filter(input => this.secretVariables.has(input));
    if (secretInputs.length > 0) {
      for (const secretInput of secretInputs) {
        const consolePattern = new RegExp(`console\\s*\\.\\s*(log|error|warn|info|debug|trace)\\s*\\([^)]*\\b${secretInput}\\b`, 'g');
        if (consolePattern.test(jsCode)) {
          // Use the first console token for error location, or fall back to current position
          const errorToken = consoleTokens.length > 0 ? consoleTokens[0] : this.peek();
          this.errorAt(`Cannot pass secret '${secretInput}' to console.log in JS block - secrets must not be logged`, errorToken);
        }
      }
    }
    
    return {
      type: NodeType.JSBlock,
      inputs,
      code: jsCode.trim(),
    };
  }

  parseShellBlock() {
    // Syntax: shell { ... }           - raw shell block
    //         shell(a, b) { ... }     - shell block with inputs from kimchi scope
    // Note: The lexer handles shell specially - it captures raw content as SHELL_CONTENT token
    this.expect(TokenType.SHELL, 'Expected shell');
    
    const inputs = [];
    
    // Check for optional input parameters
    if (this.match(TokenType.LPAREN)) {
      if (!this.check(TokenType.RPAREN)) {
        do {
          const name = this.expect(TokenType.IDENTIFIER, 'Expected identifier').value;
          inputs.push(name);
        } while (this.match(TokenType.COMMA));
      }
      this.expect(TokenType.RPAREN, 'Expected )');
    }
    
    this.skipNewlines();
    this.expect(TokenType.LBRACE, 'Expected { after shell');
    
    // The lexer provides raw shell content as a single SHELL_CONTENT token
    const contentToken = this.expect(TokenType.SHELL_CONTENT, 'Expected shell command');
    const shellCode = contentToken.value;
    
    this.expect(TokenType.RBRACE, 'Expected } to close shell block');
    
    return {
      type: NodeType.ShellBlock,
      inputs,
      command: shellCode,
    };
  }

  parseShellBlockExpression() {
    // Same as parseShellBlock but returns as an expression node
    this.expect(TokenType.SHELL, 'Expected shell');
    
    const inputs = [];
    
    if (this.match(TokenType.LPAREN)) {
      if (!this.check(TokenType.RPAREN)) {
        do {
          const name = this.expect(TokenType.IDENTIFIER, 'Expected identifier').value;
          inputs.push(name);
        } while (this.match(TokenType.COMMA));
      }
      this.expect(TokenType.RPAREN, 'Expected )');
    }
    
    this.skipNewlines();
    this.expect(TokenType.LBRACE, 'Expected { after shell');
    
    // The lexer provides raw shell content as a single SHELL_CONTENT token
    const contentToken = this.expect(TokenType.SHELL_CONTENT, 'Expected shell command');
    const shellCode = contentToken.value;
    
    this.expect(TokenType.RBRACE, 'Expected } to close shell block');
    
    return {
      type: NodeType.ShellBlock,
      inputs,
      command: shellCode,
      isExpression: true,
    };
  }

  tokenToSource(token) {
    // Convert a token back to source code representation
    switch (token.type) {
      case TokenType.STRING:
        // Check if it's a backtick string (starts with backtick)
        if (token.value.startsWith('`')) {
          return token.value;  // Already includes backticks
        }
        return `"${token.value}"`;
      case TokenType.TEMPLATE_STRING:
        // Reconstruct the template string, converting interpolation markers back to ${...}
        let templateValue = token.value;
        templateValue = templateValue.replace(/\x00INTERP_START\x00/g, '${');
        templateValue = templateValue.replace(/\x00INTERP_END\x00/g, '}');
        return `\`${templateValue}\``;
      case TokenType.NUMBER:
      case TokenType.IDENTIFIER:
      case TokenType.BOOLEAN:
        return String(token.value);
      case TokenType.NULL:
        return 'null';
      case TokenType.PLUS:
        return '+';
      case TokenType.MINUS:
        return '-';
      case TokenType.STAR:
        return '*';
      case TokenType.SLASH:
        return '/';
      case TokenType.PERCENT:
        return '%';
      case TokenType.ASSIGN:
        return '=';
      case TokenType.EQ:
        return '==';
      case TokenType.NEQ:
        return '!=';
      case TokenType.LT:
        return '<';
      case TokenType.GT:
        return '>';
      case TokenType.LTE:
        return '<=';
      case TokenType.GTE:
        return '>=';
      case TokenType.AND:
        return '&&';
      case TokenType.OR:
        return '||';
      case TokenType.NOT:
        return '!';
      case TokenType.LPAREN:
        return '(';
      case TokenType.RPAREN:
        return ')';
      case TokenType.LBRACKET:
        return '[';
      case TokenType.RBRACKET:
        return ']';
      case TokenType.COMMA:
        return ',';
      case TokenType.DOT:
        return '.';
      case TokenType.COLON:
        return ':';
      case TokenType.SEMICOLON:
        return ';';
      case TokenType.ARROW:
        return '->';
      case TokenType.FAT_ARROW:
        return '=>';
      case TokenType.QUESTION:
        return '?';
      case TokenType.SPREAD:
        return '...';
      default:
        return token.value !== undefined ? String(token.value) : '';
    }
  }

  parseJSBlockExpression() {
    // Same as parseJSBlock but returns as an expression node
    // Used for: dec result = js(a, b) { return a + b; }
    this.expect(TokenType.JS, 'Expected js');
    
    const inputs = [];
    
    if (this.match(TokenType.LPAREN)) {
      if (!this.check(TokenType.RPAREN)) {
        do {
          const name = this.expect(TokenType.IDENTIFIER, 'Expected identifier').value;
          inputs.push(name);
        } while (this.match(TokenType.COMMA));
      }
      this.expect(TokenType.RPAREN, 'Expected )');
    }
    
    this.skipNewlines();
    this.expect(TokenType.LBRACE, 'Expected { after js');
    
    // Get the raw JS content from the JS_CONTENT token
    let jsCode = '';
    if (this.check(TokenType.JS_CONTENT)) {
      jsCode = this.advance().value;
    }
    
    this.expect(TokenType.RBRACE, 'Expected } to close js block');
    
    // Check for secrets being passed to console.log
    const secretInputs = inputs.filter(input => this.secretVariables.has(input));
    if (secretInputs.length > 0) {
      // Check if the JS code contains console.log with any of the secret inputs
      for (const secretInput of secretInputs) {
        // Match console.log, console.error, console.warn, console.info with the secret variable
        const consolePattern = new RegExp(`console\\s*\\.\\s*(log|error|warn|info|debug|trace)\\s*\\([^)]*\\b${secretInput}\\b`, 'g');
        if (consolePattern.test(jsCode)) {
          // Use the first console token for error location, or fall back to current position
          const errorToken = consoleTokens.length > 0 ? consoleTokens[0] : this.peek();
          this.errorAt(`Cannot pass secret '${secretInput}' to console.log in JS block - secrets must not be logged`, errorToken);
        }
      }
    }
    
    return {
      type: NodeType.JSBlock,
      inputs,
      code: jsCode.trim(),
      isExpression: true,
    };
  }

  parseExpressionStatement() {
    const expression = this.parseExpression();
    return {
      type: NodeType.ExpressionStatement,
      expression,
    };
  }

  // Expression parsing with precedence climbing
  parseExpression() {
    return this.parseAssignment();
  }

  parseAssignment() {
    const left = this.parseTernary();
    
    if (this.match(TokenType.ASSIGN, TokenType.PLUS_ASSIGN, TokenType.MINUS_ASSIGN, 
                   TokenType.STAR_ASSIGN, TokenType.SLASH_ASSIGN)) {
      const operator = this.tokens[this.pos - 1].value;
      
      // Check for immutability violations on dec variables
      this.checkDecImmutability(left);
      
      const right = this.parseAssignment();
      return {
        type: NodeType.AssignmentExpression,
        operator,
        left,
        right,
      };
    }
    
    return left;
  }

  checkDecImmutability(node) {
    // Get the root variable name from the assignment target
    const rootName = this.getRootIdentifier(node);
    if (rootName && this.decVariables.has(rootName)) {
      this.error(`Cannot reassign '${this.getFullPath(node)}': variable '${rootName}' is deeply immutable (declared with dec)`);
    }
  }

  getRootIdentifier(node) {
    if (node.type === NodeType.Identifier) {
      return node.name;
    }
    if (node.type === NodeType.MemberExpression) {
      return this.getRootIdentifier(node.object);
    }
    return null;
  }

  getFullPath(node) {
    if (node.type === NodeType.Identifier) {
      return node.name;
    }
    if (node.type === NodeType.MemberExpression) {
      const objectPath = this.getFullPath(node.object);
      if (node.computed) {
        return `${objectPath}[${node.property.name || node.property.value}]`;
      }
      return `${objectPath}.${node.property.name || node.property}`;
    }
    return '<unknown>';
  }

  parseTernary() {
    let test = this.parseFlow();
    
    if (this.match(TokenType.QUESTION)) {
      const consequent = this.parseExpression();
      this.expect(TokenType.COLON, 'Expected :');
      const alternate = this.parseTernary();
      return {
        type: NodeType.ConditionalExpression,
        test,
        consequent,
        alternate,
      };
    }
    
    return test;
  }

  parseFlow() {
    // New syntax: composedFn >> fn1 fn2 fn3
    // This creates a composed function that can be called later
    // We need to check if we have: IDENTIFIER >> ...
    
    // First parse the left side (potential function name)
    let left = this.parsePipe();
    
    // Check if followed by >> (flow operator)
    if (this.match(TokenType.FLOW)) {
      // left should be an identifier (the name of the composed function variable)
      if (left.type !== NodeType.Identifier) {
        this.error('Left side of >> must be an identifier');
      }
      
      const name = left.name;
      const functions = [];
      
      // Parse function identifiers until we hit end of expression
      while (this.check(TokenType.IDENTIFIER)) {
        functions.push(this.advance().value);
      }
      
      if (functions.length === 0) {
        this.error('Expected at least one function after >>');
      }
      
      return {
        type: NodeType.FlowExpression,
        name,
        functions,
      };
    }
    
    return left;
  }

  parsePipe() {
    // Pipe expression: value ~> fn1 ~> fn2
    // Left-associative: (value ~> fn1) ~> fn2
    let left = this.parseMatch();
    
    while (this.match(TokenType.PIPE)) {
      // The right side should be a function (identifier or member expression)
      const right = this.parseMatch();
      left = {
        type: NodeType.PipeExpression,
        left,
        right,
      };
    }
    
    return left;
  }

  parseMatch() {
    // Match expression: expr ~ /regex/ or expr ~ /regex/ => { body }
    let left = this.parseOr();
    
    if (this.match(TokenType.MATCH)) {
      if (!this.check(TokenType.REGEX)) {
        this.error('Expected regex pattern after ~');
      }
      
      const regexToken = this.advance();
      const regex = {
        type: NodeType.RegexLiteral,
        pattern: regexToken.value.pattern,
        flags: regexToken.value.flags,
      };
      
      // Check for optional => { body } for transformation
      let body = null;
      if (this.match(TokenType.FAT_ARROW)) {
        if (this.check(TokenType.LBRACE)) {
          body = this.parseBlock();
        } else {
          // Single expression body
          body = this.parseExpression();
        }
      }
      
      return {
        type: NodeType.MatchExpression,
        subject: left,
        pattern: regex,
        body,
      };
    }
    
    return left;
  }

  parseOr() {
    let left = this.parseNullish();

    while (this.match(TokenType.OR)) {
      const right = this.parseNullish();
      left = {
        type: NodeType.BinaryExpression,
        operator: '||',
        left,
        right,
      };
    }

    return left;
  }

  parseNullish() {
    let left = this.parseAnd();

    while (this.match(TokenType.NULLISH)) {
      const right = this.parseAnd();
      left = {
        type: NodeType.BinaryExpression,
        operator: '??',
        left,
        right,
      };
    }

    return left;
  }

  parseAnd() {
    let left = this.parseEquality();
    
    while (this.match(TokenType.AND)) {
      const right = this.parseEquality();
      left = {
        type: NodeType.BinaryExpression,
        operator: '&&',
        left,
        right,
      };
    }
    
    return left;
  }

  parseEquality() {
    let left = this.parseComparison();
    
    while (this.match(TokenType.EQ, TokenType.NEQ, TokenType.IS, TokenType.NOT)) {
      const token = this.tokens[this.pos - 1];
      let operator;
      if (token.type === TokenType.IS) {
        // Check for 'is not' combination
        if (this.match(TokenType.NOT)) {
          operator = 'is not';
        } else {
          operator = 'is';
        }
      } else if (token.type === TokenType.NOT) {
        // Standalone 'not' at equality level means != (like Python's 'not in' pattern)
        // But we need 'is' before it, so this shouldn't happen in normal flow
        // Rewind and let unary handle it
        this.pos--;
        break;
      } else {
        operator = token.value === '==' ? '===' : '!==';
      }
      const right = this.parseComparison();
      left = {
        type: NodeType.BinaryExpression,
        operator,
        left,
        right,
      };
    }
    
    return left;
  }

  parseComparison() {
    let left = this.parseShift();
    
    while (this.match(TokenType.LT, TokenType.GT, TokenType.LTE, TokenType.GTE)) {
      const operator = this.tokens[this.pos - 1].value;
      const right = this.parseShift();
      left = {
        type: NodeType.BinaryExpression,
        operator,
        left,
        right,
      };
    }
    
    return left;
  }

  parseShift() {
    let left = this.parseRange();
    
    while (this.match(TokenType.LSHIFT, TokenType.RSHIFT)) {
      const operator = this.tokens[this.pos - 1].value;
      const right = this.parseRange();
      left = {
        type: NodeType.BinaryExpression,
        operator,
        left,
        right,
      };
    }
    
    return left;
  }

  parseRange() {
    let left = this.parseAdditive();
    
    if (this.match(TokenType.RANGE)) {
      const right = this.parseAdditive();
      return {
        type: NodeType.RangeExpression,
        start: left,
        end: right,
      };
    }
    
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    
    while (this.match(TokenType.PLUS, TokenType.MINUS)) {
      const operator = this.tokens[this.pos - 1].value;
      const right = this.parseMultiplicative();
      left = {
        type: NodeType.BinaryExpression,
        operator,
        left,
        right,
      };
    }
    
    return left;
  }

  parseMultiplicative() {
    let left = this.parsePower();
    
    while (this.match(TokenType.STAR, TokenType.SLASH, TokenType.PERCENT)) {
      const operator = this.tokens[this.pos - 1].value;
      const right = this.parsePower();
      left = {
        type: NodeType.BinaryExpression,
        operator,
        left,
        right,
      };
    }
    
    return left;
  }

  parsePower() {
    let left = this.parseUnary();
    
    if (this.match(TokenType.POWER)) {
      const right = this.parsePower(); // Right associative
      left = {
        type: NodeType.BinaryExpression,
        operator: '**',
        left,
        right,
      };
    }
    
    return left;
  }

  parseUnary() {
    if (this.match(TokenType.NOT, TokenType.MINUS, TokenType.BITNOT)) {
      const operator = this.tokens[this.pos - 1].value;
      const argument = this.parseUnary();
      return {
        type: NodeType.UnaryExpression,
        operator: operator === 'not' ? '!' : operator,
        argument,
      };
    }
    
    if (this.match(TokenType.AWAIT)) {
      const argument = this.parseUnary();
      return {
        type: NodeType.AwaitExpression,
        argument,
      };
    }
    
    if (this.match(TokenType.SPREAD)) {
      const argument = this.parseUnary();
      return {
        type: NodeType.SpreadElement,
        argument,
      };
    }
    
    return this.parseCall();
  }

  parseCall() {
    let expr = this.parsePrimary();
    
    while (true) {
      if (this.match(TokenType.LPAREN)) {
        const args = this.parseArgumentList();
        this.expect(TokenType.RPAREN, 'Expected )');
        expr = {
          type: NodeType.CallExpression,
          callee: expr,
          arguments: args,
        };
      } else if (this.match(TokenType.DOT)) {
        // Check for .if() conditional method
        if (this.check(TokenType.IF)) {
          this.advance(); // consume 'if'
          this.expect(TokenType.LPAREN, 'Expected ( after .if');
          const condition = this.parseExpression();
          this.expect(TokenType.RPAREN, 'Expected ) after .if condition');

          // Check for optional .else()
          let fallback = null;
          if (this.check(TokenType.DOT)) {
            const nextPos = this.pos + 1;
            if (nextPos < this.tokens.length && this.tokens[nextPos].type === TokenType.ELSE) {
              this.advance(); // consume '.'
              this.advance(); // consume 'else'
              this.expect(TokenType.LPAREN, 'Expected ( after .else');
              fallback = this.parseExpression();
              this.expect(TokenType.RPAREN, 'Expected ) after .else value');
            }
          }

          expr = {
            type: NodeType.ConditionalMethodExpression,
            receiver: expr,
            condition,
            fallback,
            line: this.tokens[this.pos - 1].line,
            column: this.tokens[this.pos - 1].column,
          };
        } else {
          // Accept identifiers and keywords as property names (e.g., .test, .match, .is)
          const token = this.advance();
          const property = token.value;
          if (typeof property !== 'string') {
            this.error('Expected property name');
          }
          expr = {
            type: NodeType.MemberExpression,
            object: expr,
            property,
            computed: false,
          };
        }
      } else if (!this.inMatchArmBody && this.match(TokenType.LBRACKET)) {
        const property = this.parseExpression();
        this.expect(TokenType.RBRACKET, 'Expected ]');
        expr = {
          type: NodeType.MemberExpression,
          object: expr,
          property,
          computed: true,
        };
      } else {
        break;
      }
    }
    
    return expr;
  }

  parseArgumentList() {
    const args = [];
    
    if (!this.check(TokenType.RPAREN)) {
      do {
        args.push(this.parseExpression());
      } while (this.match(TokenType.COMMA));
    }
    
    return args;
  }

  parsePrimary() {
    if (this.check(TokenType.MATCH_KEYWORD)) {
      return this.parseMatchBlock();
    }

    // Literals
    if (this.check(TokenType.NUMBER)) {
      const token = this.advance();
      const raw = token.value;
      let value;
      if (raw.startsWith('0x') || raw.startsWith('0X')) {
        value = parseInt(raw, 16);
      } else if (raw.startsWith('0b') || raw.startsWith('0B')) {
        value = parseInt(raw.slice(2), 2);
      } else if (raw.startsWith('0o') || raw.startsWith('0O')) {
        value = parseInt(raw.slice(2), 8);
      } else {
        value = parseFloat(raw);
      }
      return {
        type: NodeType.Literal,
        value,
        raw,
        isNumber: true,
      };
    }
    
    if (this.check(TokenType.STRING)) {
      const token = this.advance();
      return {
        type: NodeType.Literal,
        value: token.value,
        raw: token.value,
        isString: true,
      };
    }
    
    if (this.check(TokenType.TEMPLATE_STRING)) {
      const token = this.advance();
      // Parse the template string with interpolation markers
      // Format: text\x00INTERP_START\x00expr\x00INTERP_END\x00text...
      const parts = [];
      const expressions = [];
      
      // Split by markers and parse
      const segments = token.value.split(/\x00INTERP_START\x00|\x00INTERP_END\x00/);
      for (let i = 0; i < segments.length; i++) {
        if (i % 2 === 0) {
          // Even indices are string parts
          parts.push(segments[i]);
        } else {
          // Odd indices are expression strings that need to be parsed
          const exprSource = segments[i];
          // Create a sub-lexer and parser for the expression
          // Lexer is imported at the top of the file
          const subLexer = new Lexer(exprSource);
          const subTokens = subLexer.tokenize();
          const subParser = new Parser(subTokens);
          const expr = subParser.parseExpression();
          expressions.push(expr);
        }
      }
      
      return {
        type: NodeType.TemplateLiteral,
        parts,
        expressions,
      };
    }
    
    if (this.check(TokenType.BOOLEAN)) {
      return {
        type: NodeType.Literal,
        value: this.advance().value === 'true',
        raw: this.tokens[this.pos - 1].value,
      };
    }
    
    if (this.check(TokenType.NULL)) {
      this.advance();
      return {
        type: NodeType.Literal,
        value: null,
        raw: 'null',
      };
    }
    
    // Regex literal
    if (this.check(TokenType.REGEX)) {
      const token = this.advance();
      return {
        type: NodeType.RegexLiteral,
        pattern: token.value.pattern,
        flags: token.value.flags,
      };
    }
    
    // JS block as expression: dec result = js(a, b) { return a + b; }
    if (this.check(TokenType.JS)) {
      return this.parseJSBlockExpression();
    }
    
    // Shell block as expression: dec result = shell { ls -la }
    if (this.check(TokenType.SHELL)) {
      return this.parseShellBlockExpression();
    }
    
    // Arrow function with single param (no parens) - check before identifier
    if (this.check(TokenType.IDENTIFIER) && this.peek(1).type === TokenType.FAT_ARROW) {
      const param = this.advance().value;
      this.expect(TokenType.FAT_ARROW, 'Expected =>');
      let body;
      if (this.check(TokenType.LBRACE)) {
        body = this.parseBlock();
      } else {
        body = this.parseExpression();
      }
      return {
        type: NodeType.ArrowFunctionExpression,
        params: [{ name: param, defaultValue: null }],
        body,
      };
    }
    
    // Identifier
    if (this.check(TokenType.IDENTIFIER)) {
      const token = this.advance();
      return {
        type: NodeType.Identifier,
        name: token.value,
        line: token.line,
        column: token.column,
      };
    }
    
    // Grouped expression or arrow function
    if (this.match(TokenType.LPAREN)) {
      // Check for arrow function
      const startPos = this.pos;
      let isArrow = false;
      let params = [];
      
      if (this.check(TokenType.RPAREN)) {
        this.advance();
        if (this.check(TokenType.FAT_ARROW)) {
          isArrow = true;
        } else {
          this.pos = startPos;
        }
      } else if (this.check(TokenType.IDENTIFIER)) {
        // Try to parse as parameter list
        const savedPos = this.pos;
        try {
          params = [];
          do {
            params.push(this.expect(TokenType.IDENTIFIER, '').value);
          } while (this.match(TokenType.COMMA));
          
          if (this.match(TokenType.RPAREN) && this.check(TokenType.FAT_ARROW)) {
            isArrow = true;
          } else {
            this.pos = savedPos;
          }
        } catch {
          this.pos = savedPos;
        }
      }
      
      if (isArrow) {
        this.expect(TokenType.FAT_ARROW, 'Expected =>');
        let body;
        if (this.check(TokenType.LBRACE)) {
          body = this.parseBlock();
        } else {
          body = this.parseExpression();
        }
        return {
          type: NodeType.ArrowFunctionExpression,
          params: params.map(p => ({ name: p, defaultValue: null })),
          body,
        };
      }
      
      // Regular grouped expression
      const expr = this.parseExpression();
      this.expect(TokenType.RPAREN, 'Expected )');
      return expr;
    }
    
    // Array literal
    if (this.match(TokenType.LBRACKET)) {
      const elements = [];
      
      if (!this.check(TokenType.RBRACKET)) {
        do {
          if (this.check(TokenType.RBRACKET)) break;
          elements.push(this.parseExpression());
        } while (this.match(TokenType.COMMA));
      }
      
      this.expect(TokenType.RBRACKET, 'Expected ]');
      return {
        type: NodeType.ArrayExpression,
        elements,
      };
    }
    
    // Object literal
    if (this.match(TokenType.LBRACE)) {
      const properties = [];
      
      if (!this.check(TokenType.RBRACE)) {
        do {
          this.skipNewlines();
          if (this.check(TokenType.RBRACE)) break;
          
          // Handle spread element: { ...obj }
          if (this.match(TokenType.SPREAD)) {
            const argument = this.parseUnary();
            properties.push({
              type: NodeType.SpreadElement,
              argument,
            });
            continue;
          }
          
          // Computed property key: { [expr]: value }
          if (this.match(TokenType.LBRACKET)) {
            const keyExpr = this.parseExpression();
            this.expect(TokenType.RBRACKET, 'Expected ] after computed key');
            this.expect(TokenType.COLON, 'Expected : after computed key');
            const value = this.parseExpression();
            properties.push({
              type: NodeType.Property,
              key: keyExpr,
              value,
              computed: true,
            });
            continue;
          }

          let key;
          if (this.check(TokenType.STRING)) {
            key = this.advance().value;
          } else {
            const token = this.advance();
            key = token.value;
            if (typeof key !== 'string') {
              this.error('Expected property name');
            }
          }

          let value;
          if (this.match(TokenType.COLON)) {
            value = this.parseExpression();
          } else {
            // Shorthand property
            value = { type: NodeType.Identifier, name: key };
          }

          properties.push({
            type: NodeType.Property,
            key,
            value,
            shorthand: !this.tokens[this.pos - 1] || this.tokens[this.pos - 1].type !== TokenType.COLON,
          });
        } while (this.match(TokenType.COMMA));
      }
      
      this.skipNewlines();
      this.expect(TokenType.RBRACE, 'Expected }');
      return {
        type: NodeType.ObjectExpression,
        properties,
      };
    }
    
    this.error(`Unexpected token: ${this.peek().type}`);
  }
  
  // Testing framework parsing
  parseTestBlock() {
    this.expect(TokenType.TEST, 'Expected test');

    // Check for .only or .skip modifier
    let modifier = null;
    if (this.match(TokenType.DOT)) {
      const mod = this.expect(TokenType.IDENTIFIER, 'Expected only or skip after test.').value;
      if (mod !== 'only' && mod !== 'skip') {
        this.error('Expected only or skip after test., got ' + mod);
      }
      modifier = mod;
    }

    const name = this.expect(TokenType.STRING, 'Expected test name').value;
    this.skipNewlines();
    const body = this.parseBlock();

    return {
      type: NodeType.TestBlock,
      name,
      body,
      modifier,
    };
  }

  parseDescribeBlock() {
    this.expect(TokenType.DESCRIBE, 'Expected describe');

    // Check for .only or .skip modifier
    let modifier = null;
    if (this.match(TokenType.DOT)) {
      const mod = this.expect(TokenType.IDENTIFIER, 'Expected only or skip after describe.').value;
      if (mod !== 'only' && mod !== 'skip') {
        this.error('Expected only or skip after describe., got ' + mod);
      }
      modifier = mod;
    }

    const name = this.expect(TokenType.STRING, 'Expected describe name').value;
    this.skipNewlines();
    const body = this.parseBlock();

    return {
      type: NodeType.DescribeBlock,
      name,
      body,
      modifier,
    };
  }
  
  parseExpectStatement() {
    this.expect(TokenType.EXPECT, 'Expected expect');
    this.expect(TokenType.LPAREN, 'Expected ( after expect');

    const actual = this.parseExpression();

    this.expect(TokenType.RPAREN, 'Expected ) after expect value');
    this.expect(TokenType.DOT, 'Expected . after expect()');

    // Check for .not modifier
    let negated = false;
    if (this.check(TokenType.NOT)) {
      this.advance();
      negated = true;
      this.expect(TokenType.DOT, 'Expected . after not');
    }

    // Parse matcher
    const matcher = this.expect(TokenType.IDENTIFIER, 'Expected matcher name').value;

    this.expect(TokenType.LPAREN, 'Expected ( after matcher');

    let expected = null;
    if (!this.check(TokenType.RPAREN)) {
      expected = this.parseExpression();
    }

    this.expect(TokenType.RPAREN, 'Expected ) after matcher value');

    return {
      type: NodeType.ExpectStatement,
      actual,
      matcher,
      expected,
      negated,
    };
  }
  
  parseAssertStatement() {
    this.expect(TokenType.ASSERT, 'Expected assert');
    
    const condition = this.parseExpression();
    
    // Optional message
    let message = null;
    if (this.match(TokenType.COMMA)) {
      message = this.parseExpression();
    }
    
    return {
      type: NodeType.AssertStatement,
      condition,
      message,
    };
  }
}

export function parse(tokens) {
  const parser = new Parser(tokens);
  return parser.parse();
}
