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
  }

  isSignificantNewline(token) {
    return false; // For now, ignore all newlines (use semicolons or braces)
  }

  error(message) {
    throw new ParseError(message, this.peek());
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
    
    // Declarations
    if (this.check(TokenType.DEC)) {
      const decl = this.parseDecDeclaration();
      decl.exposed = exposed;
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
    
    // If expose was used but not followed by a valid declaration
    if (exposed) {
      this.error('expose must be followed by dec, fn, memo, or enum');
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
    
    // Print (convenience)
    if (this.check(TokenType.PRINT)) {
      return this.parsePrintStatement();
    }
    
    // Dependency declaration: as <alias> dep <path>
    if (this.check(TokenType.AS)) {
      return this.parseDepStatement();
    }
    
    // Arg declaration: arg <name>, !arg <name>, arg <name> = <default>
    if (this.check(TokenType.ARG) || (this.check(TokenType.NOT) && this.peek(1).type === TokenType.ARG)) {
      return this.parseArgDeclaration();
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
    
    while (this.match(TokenType.BITOR)) {
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
      return {
        type: NodeType.Identifier,
        name: this.advance().value,
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
}

export function parse(tokens) {
  const parser = new Parser(tokens);
  return parser.parse();
}
