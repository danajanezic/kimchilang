// KimchiLang Parser - Converts tokens into an Abstract Syntax Tree (AST)

import { TokenType, Lexer } from './lexer.js';

// AST Node Types
export const NodeType = {
  Program: 'Program',
  
  // Declarations
  DecDeclaration: 'DecDeclaration',
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
  
  // Patterns
  Property: 'Property',
  MatchCase: 'MatchCase',
  ObjectPattern: 'ObjectPattern',
  ArrayPattern: 'ArrayPattern',
  EnumDeclaration: 'EnumDeclaration',
  RegexLiteral: 'RegexLiteral',
  
  // Interop
  JSBlock: 'JSBlock',
  ShellBlock: 'ShellBlock',
  
  // Testing
  TestBlock: 'TestBlock',
  DescribeBlock: 'DescribeBlock',
  ExpectStatement: 'ExpectStatement',
  AssertStatement: 'AssertStatement',
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

  parseStatement() {
    this.skipNewlines();
    
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
      // Track secret variables
      if (secret && decl.name) {
        this.secretVariables.add(decl.name);
      }
      return decl;
    }
    
    if (this.check(TokenType.ASYNC)) {
      this.advance();
      if (this.check(TokenType.FN)) {
        const decl = this.parseFunctionDeclaration();
        decl.async = true;
        decl.exposed = exposed;
        return decl;
      }
      if (this.check(TokenType.MEMO)) {
        const decl = this.parseMemoDeclaration();
        decl.async = true;
        decl.exposed = exposed;
        return decl;
      }
      this.error('async must be followed by fn or memo');
    }
    
    if (this.check(TokenType.FN)) {
      const decl = this.parseFunctionDeclaration();
      decl.exposed = exposed;
      return decl;
    }
    
    if (this.check(TokenType.MEMO)) {
      const decl = this.parseMemoDeclaration();
      decl.exposed = exposed;
      return decl;
    }
    
    if (this.check(TokenType.ENUM)) {
      const decl = this.parseEnumDeclaration();
      decl.exposed = exposed;
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
    
    // Regex pattern matching: /regex/ => code
    if (this.check(TokenType.REGEX)) {
      return this.parseRegexPatternMatch();
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

  parseRegexPatternMatch() {
    // Regex pattern matching: /regex/ => code
    // Parse consecutive regex pattern cases
    const cases = [];
    
    while (this.check(TokenType.REGEX)) {
      const regexToken = this.advance();
      const regex = {
        type: NodeType.RegexLiteral,
        pattern: regexToken.value.pattern,
        flags: regexToken.value.flags,
      };
      
      this.expect(TokenType.FAT_ARROW, 'Expected =>');
      
      let consequent;
      if (this.check(TokenType.LBRACE)) {
        consequent = this.parseBlock();
      } else {
        consequent = this.parseStatement();
      }
      
      cases.push({
        type: NodeType.MatchCase,
        test: regex,
        isRegex: true,
        consequent,
      });
      
      this.skipNewlines();
    }
    
    return {
      type: NodeType.PatternMatch,
      cases,
      isRegex: true,
    };
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
    this.expect(TokenType.AS, 'Expected as');
    const alias = this.expect(TokenType.IDENTIFIER, 'Expected dependency alias').value;
    this.expect(TokenType.DEP, 'Expected dep');
    
    // Parse dotted path (e.g., project_name.salesforce.client)
    const pathParts = [];
    pathParts.push(this.expect(TokenType.IDENTIFIER, 'Expected dependency path').value);
    
    while (this.match(TokenType.DOT)) {
      pathParts.push(this.expect(TokenType.IDENTIFIER, 'Expected path segment').value);
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
    
    // Read raw JavaScript code until matching closing brace
    // We need to track brace depth to handle nested braces in JS
    let braceDepth = 1;
    let jsCode = '';
    const startPos = this.pos;
    const consoleTokens = []; // Track console tokens for error reporting
    
    // Get the position in source after the opening brace
    const openBraceToken = this.tokens[this.pos - 1];
    let sourcePos = 0;
    
    // Find the position in source code
    for (let i = 0; i < this.pos; i++) {
      // Skip to after the opening brace in source
    }
    
    // Read tokens until we find the matching closing brace
    while (braceDepth > 0 && !this.check(TokenType.EOF)) {
      const token = this.peek();
      
      if (token.type === TokenType.LBRACE) {
        braceDepth++;
        jsCode += '{ ';
        this.advance();
      } else if (token.type === TokenType.RBRACE) {
        braceDepth--;
        if (braceDepth > 0) {
          jsCode += '} ';
          this.advance();
        }
      } else if (token.type === TokenType.NEWLINE) {
        jsCode += '\n';
        this.advance();
      } else if (token.type === TokenType.EQ && this.peek(1).type === TokenType.ASSIGN) {
        // Handle === (tokenized as == followed by =)
        jsCode += '=== ';
        this.advance();
        this.advance();
      } else if (token.type === TokenType.NEQ && this.peek(1).type === TokenType.ASSIGN) {
        // Handle !== (tokenized as != followed by =)
        jsCode += '!== ';
        this.advance();
        this.advance();
      } else {
        // Track console tokens for error reporting
        if (token.type === TokenType.IDENTIFIER && token.value === 'console') {
          consoleTokens.push(token);
        }
        // Reconstruct the token as source
        jsCode += this.tokenToSource(token) + ' ';
        this.advance();
      }
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
    
    let braceDepth = 1;
    let jsCode = '';
    const consoleTokens = []; // Track console tokens for error reporting
    
    while (braceDepth > 0 && !this.check(TokenType.EOF)) {
      const token = this.peek();
      
      if (token.type === TokenType.LBRACE) {
        braceDepth++;
        jsCode += '{ ';
        this.advance();
      } else if (token.type === TokenType.RBRACE) {
        braceDepth--;
        if (braceDepth > 0) {
          jsCode += '} ';
          this.advance();
        }
      } else if (token.type === TokenType.NEWLINE) {
        jsCode += '\n';
        this.advance();
      } else if (token.type === TokenType.EQ && this.peek(1).type === TokenType.ASSIGN) {
        // Handle === (tokenized as == followed by =)
        jsCode += '=== ';
        this.advance();
        this.advance();
      } else if (token.type === TokenType.NEQ && this.peek(1).type === TokenType.ASSIGN) {
        // Handle !== (tokenized as != followed by =)
        jsCode += '!== ';
        this.advance();
        this.advance();
      } else {
        // Track console tokens for error reporting
        if (token.type === TokenType.IDENTIFIER && token.value === 'console') {
          consoleTokens.push(token);
        }
        jsCode += this.tokenToSource(token) + ' ';
        this.advance();
      }
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
    let left = this.parseOr();
    
    while (this.match(TokenType.PIPE)) {
      // The right side should be a function (identifier or member expression)
      const right = this.parseOr();
      left = {
        type: NodeType.PipeExpression,
        left,
        right,
      };
    }
    
    return left;
  }

  parseOr() {
    let left = this.parseAnd();
    
    while (this.match(TokenType.OR)) {
      const right = this.parseAnd();
      left = {
        type: NodeType.BinaryExpression,
        operator: '||',
        left,
        right,
      };
    }
    
    return left;
  }

  parseAnd() {
    let left = this.parseBitOr();
    
    while (this.match(TokenType.AND)) {
      const right = this.parseBitOr();
      left = {
        type: NodeType.BinaryExpression,
        operator: '&&',
        left,
        right,
      };
    }
    
    return left;
  }

  parseBitOr() {
    let left = this.parseBitXor();
    
    while (this.check(TokenType.BITOR)) {
      // Look ahead to see if this is pattern matching syntax: |condition| =>
      // If we find another | followed by =>, this is pattern matching, not bitwise OR
      if (this.isPatternMatchStart()) {
        break;
      }
      this.advance(); // Consume the |
      const right = this.parseBitXor();
      left = {
        type: NodeType.BinaryExpression,
        operator: '|',
        left,
        right,
      };
    }
    
    return left;
  }
  
  isPatternMatchStart() {
    // Check if current position starts a pattern match: |condition| =>
    // We need to find a closing | followed by =>
    if (!this.check(TokenType.BITOR)) return false;
    
    let depth = 0;
    for (let i = this.pos; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      if (token.type === TokenType.BITOR) {
        depth++;
        if (depth === 2) {
          // Found closing |, check if next non-newline token is =>
          for (let j = i + 1; j < this.tokens.length; j++) {
            if (this.tokens[j].type === TokenType.NEWLINE) continue;
            return this.tokens[j].type === TokenType.FAT_ARROW;
          }
        }
      } else if (token.type === TokenType.NEWLINE || token.type === TokenType.EOF) {
        // Pattern match must be on same line or continue to =>
        if (depth === 0) return false;
      }
    }
    return false;
  }

  parseBitXor() {
    let left = this.parseBitAnd();
    
    while (this.match(TokenType.BITXOR)) {
      const right = this.parseBitAnd();
      left = {
        type: NodeType.BinaryExpression,
        operator: '^',
        left,
        right,
      };
    }
    
    return left;
  }

  parseBitAnd() {
    let left = this.parseEquality();
    
    while (this.match(TokenType.BITAND)) {
      const right = this.parseEquality();
      left = {
        type: NodeType.BinaryExpression,
        operator: '&',
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
        const property = this.expect(TokenType.IDENTIFIER, 'Expected property name').value;
        expr = {
          type: NodeType.MemberExpression,
          object: expr,
          property,
          computed: false,
        };
      } else if (this.match(TokenType.LBRACKET)) {
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
          
          let key;
          if (this.check(TokenType.STRING)) {
            key = this.advance().value;
          } else {
            key = this.expect(TokenType.IDENTIFIER, 'Expected property name').value;
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
    
    // Test name (string)
    const name = this.expect(TokenType.STRING, 'Expected test name').value;
    
    this.skipNewlines();
    
    // Test body
    const body = this.parseBlock();
    
    return {
      type: NodeType.TestBlock,
      name,
      body,
    };
  }
  
  parseDescribeBlock() {
    this.expect(TokenType.DESCRIBE, 'Expected describe');
    
    // Describe name (string)
    const name = this.expect(TokenType.STRING, 'Expected describe name').value;
    
    this.skipNewlines();
    
    // Describe body (contains tests and other statements)
    const body = this.parseBlock();
    
    return {
      type: NodeType.DescribeBlock,
      name,
      body,
    };
  }
  
  parseExpectStatement() {
    this.expect(TokenType.EXPECT, 'Expected expect');
    this.expect(TokenType.LPAREN, 'Expected ( after expect');
    
    const actual = this.parseExpression();
    
    this.expect(TokenType.RPAREN, 'Expected ) after expect value');
    this.expect(TokenType.DOT, 'Expected . after expect()');
    
    // Parse matcher: toBe, toEqual, toContain, etc.
    const matcher = this.expect(TokenType.IDENTIFIER, 'Expected matcher name').value;
    
    this.expect(TokenType.LPAREN, 'Expected ( after matcher');
    
    // Parse expected value (optional for some matchers like toBeNull)
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
