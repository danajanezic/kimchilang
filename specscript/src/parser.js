// specscript/src/parser.js

import { TokenType } from './lexer.js';

export const NodeType = {
  Program: 'Program',
  DecDeclaration: 'DecDeclaration',
  FunctionDeclaration: 'FunctionDeclaration',
  ReturnStatement: 'ReturnStatement',
  IfStatement: 'IfStatement',
  ForInStatement: 'ForInStatement',
  WhileStatement: 'WhileStatement',
  BreakStatement: 'BreakStatement',
  ContinueStatement: 'ContinueStatement',
  TryStatement: 'TryStatement',
  ThrowStatement: 'ThrowStatement',
  BlockStatement: 'BlockStatement',
  ExpressionStatement: 'ExpressionStatement',
  TestBlock: 'TestBlock',
  EnumDeclaration: 'EnumDeclaration',
  Identifier: 'Identifier',
  Literal: 'Literal',
  BinaryExpression: 'BinaryExpression',
  UnaryExpression: 'UnaryExpression',
  CallExpression: 'CallExpression',
  MemberExpression: 'MemberExpression',
  ArrowFunctionExpression: 'ArrowFunctionExpression',
  ObjectExpression: 'ObjectExpression',
  ArrayExpression: 'ArrayExpression',
  PipeExpression: 'PipeExpression',
  FlowExpression: 'FlowExpression',
  SpreadElement: 'SpreadElement',
  RangeExpression: 'RangeExpression',
  NamedConstructor: 'NamedConstructor',
  ObjectPattern: 'ObjectPattern',
  ArrayPattern: 'ArrayPattern',
  Property: 'Property',
};

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek(offset = 0) {
    const idx = this.pos + offset;
    if (idx >= this.tokens.length) return this.tokens[this.tokens.length - 1]; // EOF
    return this.tokens[idx];
  }

  advance() {
    const tok = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return tok;
  }

  check(type) {
    return this.peek().type === type;
  }

  match(...types) {
    for (const type of types) {
      if (this.check(type)) {
        return this.advance();
      }
    }
    return null;
  }

  expect(type, message) {
    if (!this.check(type)) {
      const tok = this.peek();
      throw new Error(message || `Expected ${type} but got ${tok.type} ('${tok.value}') at line ${tok.line}`);
    }
    return this.advance();
  }

  isAtEnd() {
    return this.peek().type === TokenType.EOF;
  }

  parse() {
    const body = [];
    while (!this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) body.push(stmt);
    }
    return { type: NodeType.Program, body };
  }

  parseStatement() {
    const tok = this.peek();

    switch (tok.type) {
      case TokenType.DEC:
        return this.parseDecDeclaration();
      case TokenType.FN:
        return this.parseFunctionDeclaration();
      case TokenType.ASYNC:
        return this.parseAsyncFunctionDeclaration();
      case TokenType.RETURN:
        return this.parseReturnStatement();
      case TokenType.IF:
        return this.parseIfStatement();
      case TokenType.FOR:
        return this.parseForStatement();
      case TokenType.WHILE:
        return this.parseWhileStatement();
      case TokenType.BREAK:
        this.advance();
        return { type: NodeType.BreakStatement };
      case TokenType.CONTINUE:
        this.advance();
        return { type: NodeType.ContinueStatement };
      case TokenType.TRY:
        return this.parseTryStatement();
      case TokenType.THROW:
        return this.parseThrowStatement();
      case TokenType.TEST:
        return this.parseTestBlock();
      case TokenType.ENUM:
        return this.parseEnumDeclaration();
      default:
        return this.parseExpressionStatement();
    }
  }

  parseDecDeclaration() {
    this.expect(TokenType.DEC);

    // Check for destructuring patterns
    if (this.check(TokenType.LBRACE)) {
      // Object destructuring: dec { a, b } = expr
      const pattern = this.parseObjectPattern();
      this.expect(TokenType.ASSIGN);
      const init = this.parseExpression();
      return { type: NodeType.DecDeclaration, pattern, name: null, init };
    }

    if (this.check(TokenType.LBRACKET)) {
      // Array destructuring: dec [a, b] = expr
      const pattern = this.parseArrayPattern();
      this.expect(TokenType.ASSIGN);
      const init = this.parseExpression();
      return { type: NodeType.DecDeclaration, pattern, name: null, init };
    }

    // Simple declaration: dec name = expr
    const nameTok = this.expect(TokenType.IDENTIFIER);
    this.expect(TokenType.ASSIGN);
    const init = this.parseExpression();
    return { type: NodeType.DecDeclaration, name: nameTok.value, pattern: null, init };
  }

  parseObjectPattern() {
    this.expect(TokenType.LBRACE);
    const properties = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const name = this.expect(TokenType.IDENTIFIER);
      properties.push(name.value);
      if (!this.match(TokenType.COMMA)) break;
    }
    this.expect(TokenType.RBRACE);
    return { type: NodeType.ObjectPattern, properties };
  }

  parseArrayPattern() {
    this.expect(TokenType.LBRACKET);
    const elements = [];
    while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
      const name = this.expect(TokenType.IDENTIFIER);
      elements.push(name.value);
      if (!this.match(TokenType.COMMA)) break;
    }
    this.expect(TokenType.RBRACKET);
    return { type: NodeType.ArrayPattern, elements };
  }

  parseFunctionDeclaration(isAsync = false) {
    this.expect(TokenType.FN);
    const nameTok = this.expect(TokenType.IDENTIFIER);
    const params = this.parseParamList();
    const body = this.parseBlock();
    return { type: NodeType.FunctionDeclaration, name: nameTok.value, params, body, async: isAsync };
  }

  parseAsyncFunctionDeclaration() {
    this.expect(TokenType.ASYNC);
    return this.parseFunctionDeclaration(true);
  }

  parseParamList() {
    this.expect(TokenType.LPAREN);
    const params = [];
    while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
      const param = this.expect(TokenType.IDENTIFIER);
      params.push(param.value);
      if (!this.match(TokenType.COMMA)) break;
    }
    this.expect(TokenType.RPAREN);
    return params;
  }

  parseBlock() {
    this.expect(TokenType.LBRACE);
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) body.push(stmt);
    }
    this.expect(TokenType.RBRACE);
    return { type: NodeType.BlockStatement, body };
  }

  parseReturnStatement() {
    this.expect(TokenType.RETURN);
    // Check if there's an expression to return
    const tok = this.peek();
    if (tok.type === TokenType.RBRACE || tok.type === TokenType.EOF) {
      return { type: NodeType.ReturnStatement, argument: null };
    }
    const argument = this.parseExpression();
    return { type: NodeType.ReturnStatement, argument };
  }

  parseIfStatement() {
    this.expect(TokenType.IF);
    const test = this.parseExpression();
    const consequent = this.parseBlock();

    let alternate = null;
    if (this.match(TokenType.ELIF)) {
      // elif: re-parse as another if
      this.pos--; // back up - we already consumed ELIF but need to treat it as IF
      // Actually, we just consumed ELIF. Now parse the elif's condition and body.
      const elifTest = this.parseExpression();
      const elifConsequent = this.parseBlock();
      let elifAlternate = null;
      if (this.match(TokenType.ELSE)) {
        elifAlternate = this.parseBlock();
      }
      alternate = { type: NodeType.IfStatement, test: elifTest, consequent: elifConsequent, alternate: elifAlternate };
    } else if (this.match(TokenType.ELSE)) {
      alternate = this.parseBlock();
    }

    return { type: NodeType.IfStatement, test, consequent, alternate };
  }

  parseForStatement() {
    this.expect(TokenType.FOR);
    const variableTok = this.expect(TokenType.IDENTIFIER);
    this.expect(TokenType.IN);
    const iterable = this.parseExpression();
    const body = this.parseBlock();
    return { type: NodeType.ForInStatement, variable: variableTok.value, iterable, body };
  }

  parseWhileStatement() {
    this.expect(TokenType.WHILE);
    const test = this.parseExpression();
    const body = this.parseBlock();
    return { type: NodeType.WhileStatement, test, body };
  }

  parseTryStatement() {
    this.expect(TokenType.TRY);
    const block = this.parseBlock();

    let param = null;
    let handler = null;
    if (this.match(TokenType.CATCH)) {
      const paramTok = this.expect(TokenType.IDENTIFIER);
      param = paramTok.value;
      handler = this.parseBlock();
    }

    let finalizer = null;
    if (this.match(TokenType.FINALLY)) {
      finalizer = this.parseBlock();
    }

    return { type: NodeType.TryStatement, block, param, handler, finalizer };
  }

  parseThrowStatement() {
    this.expect(TokenType.THROW);
    const argument = this.parseExpression();
    return { type: NodeType.ThrowStatement, argument };
  }

  parseTestBlock() {
    this.expect(TokenType.TEST);
    const nameTok = this.expect(TokenType.STRING);
    const body = this.parseBlock();
    return { type: NodeType.TestBlock, name: nameTok.value, body };
  }

  parseEnumDeclaration() {
    this.expect(TokenType.ENUM);
    const nameTok = this.expect(TokenType.IDENTIFIER);
    this.expect(TokenType.LBRACE);
    const variants = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const variant = this.expect(TokenType.IDENTIFIER);
      variants.push(variant.value);
      if (!this.match(TokenType.COMMA)) break;
    }
    this.expect(TokenType.RBRACE);
    return { type: NodeType.EnumDeclaration, name: nameTok.value, variants };
  }

  parseExpressionStatement() {
    const expr = this.parseExpression();
    return { type: NodeType.ExpressionStatement, expression: expr };
  }

  // --- Expression parsing (precedence climbing) ---

  parseExpression() {
    return this.parsePipe();
  }

  parsePipe() {
    let left = this.parseFlow();
    while (this.check(TokenType.PIPE)) {
      this.advance();
      const right = this.parseFlow();
      left = { type: NodeType.PipeExpression, left, right };
    }
    return left;
  }

  parseFlow() {
    let left = this.parseOr();
    while (this.check(TokenType.FLOW)) {
      this.advance();
      const right = this.parseOr();
      left = { type: NodeType.FlowExpression, left, right };
    }
    return left;
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.check(TokenType.OR)) {
      const op = this.advance().value;
      const right = this.parseAnd();
      left = { type: NodeType.BinaryExpression, operator: op, left, right };
    }
    return left;
  }

  parseAnd() {
    let left = this.parseEquality();
    while (this.check(TokenType.AND)) {
      const op = this.advance().value;
      const right = this.parseEquality();
      left = { type: NodeType.BinaryExpression, operator: op, left, right };
    }
    return left;
  }

  parseEquality() {
    let left = this.parseComparison();
    while (this.check(TokenType.EQ) || this.check(TokenType.NEQ)) {
      const op = this.advance().value;
      const right = this.parseComparison();
      left = { type: NodeType.BinaryExpression, operator: op, left, right };
    }
    return left;
  }

  parseComparison() {
    let left = this.parseRange();
    while (
      this.check(TokenType.LT) || this.check(TokenType.GT) ||
      this.check(TokenType.LTE) || this.check(TokenType.GTE)
    ) {
      const op = this.advance().value;
      const right = this.parseRange();
      left = { type: NodeType.BinaryExpression, operator: op, left, right };
    }
    return left;
  }

  parseRange() {
    let left = this.parseAddition();
    if (this.check(TokenType.RANGE)) {
      this.advance();
      const right = this.parseAddition();
      return { type: NodeType.RangeExpression, start: left, end: right };
    }
    return left;
  }

  parseAddition() {
    let left = this.parseMultiplication();
    while (this.check(TokenType.PLUS) || this.check(TokenType.MINUS)) {
      const op = this.advance().value;
      const right = this.parseMultiplication();
      left = { type: NodeType.BinaryExpression, operator: op, left, right };
    }
    return left;
  }

  parseMultiplication() {
    let left = this.parseUnary();
    while (
      this.check(TokenType.STAR) || this.check(TokenType.SLASH) || this.check(TokenType.PERCENT)
    ) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = { type: NodeType.BinaryExpression, operator: op, left, right };
    }
    return left;
  }

  parseUnary() {
    if (this.check(TokenType.NOT)) {
      const op = this.advance().value;
      const argument = this.parseUnary();
      return { type: NodeType.UnaryExpression, operator: op, argument };
    }
    if (this.check(TokenType.MINUS)) {
      const op = this.advance().value;
      const argument = this.parseUnary();
      return { type: NodeType.UnaryExpression, operator: op, argument };
    }
    return this.parseCallMember();
  }

  parseCallMember() {
    let expr = this.parsePrimary();

    while (true) {
      if (this.check(TokenType.LPAREN)) {
        // Function call
        this.advance();
        const args = [];
        while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
          if (this.check(TokenType.SPREAD)) {
            this.advance();
            const spreadArg = this.parseExpression();
            args.push({ type: NodeType.SpreadElement, argument: spreadArg });
          } else {
            args.push(this.parseExpression());
          }
          if (!this.match(TokenType.COMMA)) break;
        }
        this.expect(TokenType.RPAREN);
        expr = { type: NodeType.CallExpression, callee: expr, arguments: args };
      } else if (this.check(TokenType.DOT)) {
        // Member access
        this.advance();
        const prop = this.expect(TokenType.IDENTIFIER);
        expr = { type: NodeType.MemberExpression, object: expr, property: prop.value, computed: false };
      } else if (this.check(TokenType.LBRACKET)) {
        // Computed member access
        this.advance();
        const prop = this.parseExpression();
        this.expect(TokenType.RBRACKET);
        expr = { type: NodeType.MemberExpression, object: expr, property: prop, computed: true };
      } else {
        break;
      }
    }

    return expr;
  }

  parsePrimary() {
    const tok = this.peek();

    // Number literal
    if (tok.type === TokenType.NUMBER) {
      this.advance();
      return { type: NodeType.Literal, value: parseFloat(tok.value), raw: tok.value };
    }

    // String literal
    if (tok.type === TokenType.STRING) {
      this.advance();
      return { type: NodeType.Literal, value: tok.value, raw: `"${tok.value}"` };
    }

    // Boolean literal
    if (tok.type === TokenType.BOOLEAN) {
      this.advance();
      return { type: NodeType.Literal, value: tok.value === 'true', raw: tok.value };
    }

    // Null literal
    if (tok.type === TokenType.NULL) {
      this.advance();
      return { type: NodeType.Literal, value: null, raw: 'null' };
    }

    // EXPECT keyword — treat as identifier so expect(x).toBe(y) works
    if (tok.type === TokenType.EXPECT) {
      this.advance();
      return { type: NodeType.Identifier, name: 'expect' };
    }

    // Identifier — check for arrow function or named constructor
    if (tok.type === TokenType.IDENTIFIER) {
      this.advance();

      // Check for arrow function: ident =>
      if (this.check(TokenType.FAT_ARROW)) {
        this.advance();
        const body = this.parseExpression();
        return {
          type: NodeType.ArrowFunctionExpression,
          params: [tok.value],
          body,
          expression: true,
        };
      }

      // Check for named constructor: UpperIdent { key: val, ... }
      // Only if identifier starts with uppercase and is followed by LBRACE
      if (tok.value[0] === tok.value[0].toUpperCase() && tok.value[0] !== tok.value[0].toLowerCase() && this.check(TokenType.LBRACE)) {
        // Peek ahead to see if this looks like an object (key: val) not a block
        // We treat it as NamedConstructor
        this.advance(); // consume {
        const fields = [];
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
          const key = this.expect(TokenType.IDENTIFIER);
          this.expect(TokenType.COLON);
          const value = this.parseExpression();
          fields.push({ type: NodeType.Property, key: key.value, value });
          if (!this.match(TokenType.COMMA)) break;
        }
        this.expect(TokenType.RBRACE);
        return { type: NodeType.NamedConstructor, name: tok.value, fields };
      }

      return { type: NodeType.Identifier, name: tok.value };
    }

    // Parenthesized expression or arrow function params
    if (tok.type === TokenType.LPAREN) {
      // Look ahead to detect arrow function: () => or (a, b) =>
      if (this.isArrowFunctionParams()) {
        return this.parseArrowFunctionWithParens();
      }

      this.advance(); // consume (
      const expr = this.parseExpression();
      this.expect(TokenType.RPAREN);
      return expr;
    }

    // Object literal
    if (tok.type === TokenType.LBRACE) {
      return this.parseObjectLiteral();
    }

    // Array literal
    if (tok.type === TokenType.LBRACKET) {
      return this.parseArrayLiteral();
    }

    throw new Error(`Unexpected token ${tok.type} ('${tok.value}') at line ${tok.line}, column ${tok.column}`);
  }

  isArrowFunctionParams() {
    // Save position, scan ahead to check for => after closing paren
    const saved = this.pos;
    let i = this.pos;

    if (this.tokens[i].type !== TokenType.LPAREN) return false;
    i++; // skip (

    // Empty parens: ()
    if (this.tokens[i].type === TokenType.RPAREN) {
      // Check next is =>
      return this.tokens[i + 1] && this.tokens[i + 1].type === TokenType.FAT_ARROW;
    }

    // Scan params: must be IDENTIFIER (COMMA IDENTIFIER)* RPAREN FAT_ARROW
    while (i < this.tokens.length) {
      if (this.tokens[i].type !== TokenType.IDENTIFIER) return false;
      i++;
      if (this.tokens[i].type === TokenType.RPAREN) {
        return this.tokens[i + 1] && this.tokens[i + 1].type === TokenType.FAT_ARROW;
      }
      if (this.tokens[i].type === TokenType.COMMA) {
        i++;
        continue;
      }
      return false;
    }
    return false;
  }

  parseArrowFunctionWithParens() {
    this.expect(TokenType.LPAREN);
    const params = [];
    while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
      const p = this.expect(TokenType.IDENTIFIER);
      params.push(p.value);
      if (!this.match(TokenType.COMMA)) break;
    }
    this.expect(TokenType.RPAREN);
    this.expect(TokenType.FAT_ARROW);

    let body;
    if (this.check(TokenType.LBRACE)) {
      body = this.parseBlock();
    } else {
      body = this.parseExpression();
    }

    return {
      type: NodeType.ArrowFunctionExpression,
      params,
      body,
      expression: !this.check(TokenType.LBRACE),
    };
  }

  parseObjectLiteral() {
    this.expect(TokenType.LBRACE);
    const properties = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this.expect(TokenType.IDENTIFIER);

      if (this.check(TokenType.COLON)) {
        this.advance();
        const value = this.parseExpression();
        properties.push({ type: NodeType.Property, key: key.value, value, shorthand: false });
      } else {
        // Shorthand property
        properties.push({
          type: NodeType.Property,
          key: key.value,
          value: { type: NodeType.Identifier, name: key.value },
          shorthand: true,
        });
      }

      if (!this.match(TokenType.COMMA)) break;
    }

    this.expect(TokenType.RBRACE);
    return { type: NodeType.ObjectExpression, properties };
  }

  parseArrayLiteral() {
    this.expect(TokenType.LBRACKET);
    const elements = [];

    while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
      if (this.check(TokenType.SPREAD)) {
        this.advance();
        const argument = this.parseExpression();
        elements.push({ type: NodeType.SpreadElement, argument });
      } else {
        elements.push(this.parseExpression());
      }

      if (!this.match(TokenType.COMMA)) break;
    }

    this.expect(TokenType.RBRACKET);
    return { type: NodeType.ArrayExpression, elements };
  }
}

export function parse(tokens) {
  const parser = new Parser(tokens);
  return parser.parse();
}
