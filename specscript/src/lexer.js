// specscript/src/lexer.js

export const TokenType = {
  // Literals
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  IDENTIFIER: 'IDENTIFIER',
  BOOLEAN: 'BOOLEAN',
  NULL: 'NULL',

  // Keywords
  DEC: 'DEC',
  FN: 'FN',
  RETURN: 'RETURN',
  IF: 'IF',
  ELSE: 'ELSE',
  ELIF: 'ELIF',
  FOR: 'FOR',
  IN: 'IN',
  WHILE: 'WHILE',
  BREAK: 'BREAK',
  CONTINUE: 'CONTINUE',
  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT',
  ASYNC: 'ASYNC',
  AWAIT: 'AWAIT',
  TRY: 'TRY',
  CATCH: 'CATCH',
  FINALLY: 'FINALLY',
  THROW: 'THROW',
  ENUM: 'ENUM',
  EXPOSE: 'EXPOSE',
  TEST: 'TEST',
  EXPECT: 'EXPECT',

  // Operators
  PLUS: 'PLUS',
  MINUS: 'MINUS',
  STAR: 'STAR',
  SLASH: 'SLASH',
  PERCENT: 'PERCENT',
  ASSIGN: 'ASSIGN',
  EQ: 'EQ',
  NEQ: 'NEQ',
  LT: 'LT',
  GT: 'GT',
  LTE: 'LTE',
  GTE: 'GTE',
  FAT_ARROW: 'FAT_ARROW',
  PIPE: 'PIPE',
  FLOW: 'FLOW',
  RANGE: 'RANGE',
  SPREAD: 'SPREAD',
  DOUBLE_COLON: 'DOUBLE_COLON',
  BITOR: 'BITOR',

  // Delimiters
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  LBRACE: 'LBRACE',
  RBRACE: 'RBRACE',
  LBRACKET: 'LBRACKET',
  RBRACKET: 'RBRACKET',
  COMMA: 'COMMA',
  DOT: 'DOT',
  COLON: 'COLON',
  NEWLINE: 'NEWLINE',

  // Special
  EOF: 'EOF',
};

const KEYWORDS = {
  dec: TokenType.DEC,
  fn: TokenType.FN,
  return: TokenType.RETURN,
  if: TokenType.IF,
  else: TokenType.ELSE,
  elif: TokenType.ELIF,
  for: TokenType.FOR,
  in: TokenType.IN,
  while: TokenType.WHILE,
  break: TokenType.BREAK,
  continue: TokenType.CONTINUE,
  and: TokenType.AND,
  or: TokenType.OR,
  not: TokenType.NOT,
  async: TokenType.ASYNC,
  await: TokenType.AWAIT,
  try: TokenType.TRY,
  catch: TokenType.CATCH,
  finally: TokenType.FINALLY,
  throw: TokenType.THROW,
  enum: TokenType.ENUM,
  expose: TokenType.EXPOSE,
  test: TokenType.TEST,
  expect: TokenType.EXPECT,
  true: TokenType.BOOLEAN,
  false: TokenType.BOOLEAN,
  null: TokenType.NULL,
};

class Token {
  constructor(type, value, line, column) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.column = column;
  }
}

class Lexer {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
  }

  peek(offset = 0) {
    return this.source[this.pos + offset];
  }

  advance() {
    const ch = this.source[this.pos];
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  skipWhitespace() {
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        this.advance();
      } else {
        break;
      }
    }
  }

  skipLineComment() {
    // Skip from // to end of line (but not the newline itself)
    while (this.pos < this.source.length && this.peek() !== '\n') {
      this.advance();
    }
  }

  skipHtmlComment() {
    // Skip from <!-- to -->
    while (this.pos < this.source.length) {
      if (this.peek() === '-' && this.peek(1) === '-' && this.peek(2) === '>') {
        this.advance(); // -
        this.advance(); // -
        this.advance(); // >
        return;
      }
      this.advance();
    }
  }

  readString(quote) {
    this.advance(); // consume opening quote
    let value = '';
    while (this.pos < this.source.length && this.peek() !== quote) {
      const ch = this.advance();
      if (ch === '\\') {
        const next = this.advance();
        switch (next) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case '\\': value += '\\'; break;
          case '"': value += '"'; break;
          case "'": value += "'"; break;
          default: value += '\\' + next;
        }
      } else {
        value += ch;
      }
    }
    this.advance(); // consume closing quote
    return value;
  }

  readNumber() {
    let value = '';
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (ch >= '0' && ch <= '9') {
        value += this.advance();
      } else if (ch === '.' && this.peek(1) >= '0' && this.peek(1) <= '9') {
        value += this.advance();
      } else {
        break;
      }
    }
    return value;
  }

  readIdentifier() {
    let value = '';
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
          (ch >= '0' && ch <= '9') || ch === '_') {
        value += this.advance();
      } else {
        break;
      }
    }
    return value;
  }

  tokenize() {
    const tokens = [];

    while (this.pos < this.source.length) {
      this.skipWhitespace();

      if (this.pos >= this.source.length) break;

      const ch = this.peek();
      const line = this.line;
      const column = this.column;

      // Newlines — skip
      if (ch === '\n') {
        this.advance();
        continue;
      }

      // HTML comment <!-- ... -->
      if (ch === '<' && this.peek(1) === '!' && this.peek(2) === '-' && this.peek(3) === '-') {
        this.skipHtmlComment();
        continue;
      }

      // Line comment //
      if (ch === '/' && this.peek(1) === '/') {
        this.skipLineComment();
        continue;
      }

      // Strings
      if (ch === '"' || ch === "'") {
        const value = this.readString(ch);
        tokens.push(new Token(TokenType.STRING, value, line, column));
        continue;
      }

      // Numbers
      if (ch >= '0' && ch <= '9') {
        const value = this.readNumber();
        tokens.push(new Token(TokenType.NUMBER, value, line, column));
        continue;
      }

      // Identifiers / keywords
      if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
        const value = this.readIdentifier();
        const kwType = KEYWORDS[value];
        if (kwType) {
          tokens.push(new Token(kwType, value, line, column));
        } else {
          tokens.push(new Token(TokenType.IDENTIFIER, value, line, column));
        }
        continue;
      }

      // Two-char and three-char operators
      if (ch === '.' && this.peek(1) === '.' && this.peek(2) === '.') {
        this.advance(); this.advance(); this.advance();
        tokens.push(new Token(TokenType.SPREAD, '...', line, column));
        continue;
      }

      if (ch === '.' && this.peek(1) === '.') {
        this.advance(); this.advance();
        tokens.push(new Token(TokenType.RANGE, '..', line, column));
        continue;
      }

      if (ch === '=' && this.peek(1) === '=') {
        this.advance(); this.advance();
        tokens.push(new Token(TokenType.EQ, '==', line, column));
        continue;
      }

      if (ch === '!' && this.peek(1) === '=') {
        this.advance(); this.advance();
        tokens.push(new Token(TokenType.NEQ, '!=', line, column));
        continue;
      }

      if (ch === '=' && this.peek(1) === '>') {
        this.advance(); this.advance();
        tokens.push(new Token(TokenType.FAT_ARROW, '=>', line, column));
        continue;
      }

      if (ch === '~' && this.peek(1) === '>') {
        this.advance(); this.advance();
        tokens.push(new Token(TokenType.PIPE, '~>', line, column));
        continue;
      }

      if (ch === '>' && this.peek(1) === '>') {
        this.advance(); this.advance();
        tokens.push(new Token(TokenType.FLOW, '>>', line, column));
        continue;
      }

      if (ch === '<' && this.peek(1) === '=') {
        this.advance(); this.advance();
        tokens.push(new Token(TokenType.LTE, '<=', line, column));
        continue;
      }

      if (ch === '>' && this.peek(1) === '=') {
        this.advance(); this.advance();
        tokens.push(new Token(TokenType.GTE, '>=', line, column));
        continue;
      }

      if (ch === ':' && this.peek(1) === ':') {
        this.advance(); this.advance();
        tokens.push(new Token(TokenType.DOUBLE_COLON, '::', line, column));
        continue;
      }

      // Single-char tokens
      this.advance();
      switch (ch) {
        case '=': tokens.push(new Token(TokenType.ASSIGN, '=', line, column)); break;
        case '+': tokens.push(new Token(TokenType.PLUS, '+', line, column)); break;
        case '-': tokens.push(new Token(TokenType.MINUS, '-', line, column)); break;
        case '*': tokens.push(new Token(TokenType.STAR, '*', line, column)); break;
        case '/': tokens.push(new Token(TokenType.SLASH, '/', line, column)); break;
        case '%': tokens.push(new Token(TokenType.PERCENT, '%', line, column)); break;
        case '<': tokens.push(new Token(TokenType.LT, '<', line, column)); break;
        case '>': tokens.push(new Token(TokenType.GT, '>', line, column)); break;
        case '|': tokens.push(new Token(TokenType.BITOR, '|', line, column)); break;
        case '(': tokens.push(new Token(TokenType.LPAREN, '(', line, column)); break;
        case ')': tokens.push(new Token(TokenType.RPAREN, ')', line, column)); break;
        case '{': tokens.push(new Token(TokenType.LBRACE, '{', line, column)); break;
        case '}': tokens.push(new Token(TokenType.RBRACE, '}', line, column)); break;
        case '[': tokens.push(new Token(TokenType.LBRACKET, '[', line, column)); break;
        case ']': tokens.push(new Token(TokenType.RBRACKET, ']', line, column)); break;
        case ',': tokens.push(new Token(TokenType.COMMA, ',', line, column)); break;
        case '.': tokens.push(new Token(TokenType.DOT, '.', line, column)); break;
        case ':': tokens.push(new Token(TokenType.COLON, ':', line, column)); break;
        default:
          throw new Error(`Unexpected character '${ch}' at line ${line}, column ${column}`);
      }
    }

    tokens.push(new Token(TokenType.EOF, null, this.line, this.column));
    return tokens;
  }
}

export function tokenize(source) {
  const lexer = new Lexer(source);
  return lexer.tokenize();
}
