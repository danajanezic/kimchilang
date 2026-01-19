// KimchiLang Lexer - Tokenizes source code into tokens

export const TokenType = {
  // Literals
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  IDENTIFIER: 'IDENTIFIER',
  BOOLEAN: 'BOOLEAN',
  NULL: 'NULL',

  // Keywords
  EXPOSE: 'EXPOSE',
  DEC: 'DEC',
  FN: 'FN',
  MEMO: 'MEMO',
  RETURN: 'RETURN',
  IF: 'IF',
  ELSE: 'ELSE',
  ELIF: 'ELIF',
  WHILE: 'WHILE',
  FOR: 'FOR',
  IN: 'IN',
  BREAK: 'BREAK',
  CONTINUE: 'CONTINUE',
  AS: 'AS',
  ASYNC: 'ASYNC',
  AWAIT: 'AWAIT',
  TRY: 'TRY',
  CATCH: 'CATCH',
  FINALLY: 'FINALLY',
  THROW: 'THROW',
  PRINT: 'PRINT',
  DEP: 'DEP',
  ARG: 'ARG',
  ENV: 'ENV',
  SECRET: 'SECRET',
  IS: 'IS',
  ENUM: 'ENUM',
  JS: 'JS',
  SHELL: 'SHELL',
  SHELL_CONTENT: 'SHELL_CONTENT',
  TEST: 'TEST',
  DESCRIBE: 'DESCRIBE',
  EXPECT: 'EXPECT',
  ASSERT: 'ASSERT',

  // Operators
  PLUS: 'PLUS',
  MINUS: 'MINUS',
  STAR: 'STAR',
  SLASH: 'SLASH',
  PERCENT: 'PERCENT',
  POWER: 'POWER',
  ASSIGN: 'ASSIGN',
  PLUS_ASSIGN: 'PLUS_ASSIGN',
  MINUS_ASSIGN: 'MINUS_ASSIGN',
  STAR_ASSIGN: 'STAR_ASSIGN',
  SLASH_ASSIGN: 'SLASH_ASSIGN',
  EQ: 'EQ',
  NEQ: 'NEQ',
  LT: 'LT',
  GT: 'GT',
  LTE: 'LTE',
  GTE: 'GTE',
  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT',
  BITOR: 'BITOR',
  ARROW: 'ARROW',
  FAT_ARROW: 'FAT_ARROW',
  FLOW: 'FLOW',
  PIPE: 'PIPE',
  MATCH: 'MATCH',
  QUESTION: 'QUESTION',
  COLON: 'COLON',
  DOUBLE_COLON: 'DOUBLE_COLON',
  RANGE: 'RANGE',
  SPREAD: 'SPREAD',

  // Delimiters
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  LBRACE: 'LBRACE',
  RBRACE: 'RBRACE',
  LBRACKET: 'LBRACKET',
  RBRACKET: 'RBRACKET',
  COMMA: 'COMMA',
  DOT: 'DOT',
  SEMICOLON: 'SEMICOLON',
  NEWLINE: 'NEWLINE',

  // Special
  EOF: 'EOF',
  COMMENT: 'COMMENT',
  TEMPLATE_STRING: 'TEMPLATE_STRING',
  REGEX: 'REGEX',
};

const KEYWORDS = {
  'expose': TokenType.EXPOSE,
  'dec': TokenType.DEC,
  'fn': TokenType.FN,
  'memo': TokenType.MEMO,
  'return': TokenType.RETURN,
  'if': TokenType.IF,
  'else': TokenType.ELSE,
  'elif': TokenType.ELIF,
  'while': TokenType.WHILE,
  'for': TokenType.FOR,
  'in': TokenType.IN,
  'break': TokenType.BREAK,
  'continue': TokenType.CONTINUE,
  'as': TokenType.AS,
  'async': TokenType.ASYNC,
  'await': TokenType.AWAIT,
  'try': TokenType.TRY,
  'catch': TokenType.CATCH,
  'finally': TokenType.FINALLY,
  'throw': TokenType.THROW,
  'dep': TokenType.DEP,
  'arg': TokenType.ARG,
  'env': TokenType.ENV,
  'secret': TokenType.SECRET,
  'is': TokenType.IS,
  'enum': TokenType.ENUM,
  'js': TokenType.JS,
  'shell': TokenType.SHELL,
  'test': TokenType.TEST,
  'describe': TokenType.DESCRIBE,
  'expect': TokenType.EXPECT,
  'assert': TokenType.ASSERT,
  'print': TokenType.PRINT,
  'true': TokenType.BOOLEAN,
  'false': TokenType.BOOLEAN,
  'null': TokenType.NULL,
  'and': TokenType.AND,
  'or': TokenType.OR,
  'not': TokenType.NOT,
};

export class Token {
  constructor(type, value, line, column, sourcePos = 0) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.column = column;
    this.sourcePos = sourcePos;  // Position in source for raw extraction
  }

  toString() {
    return `Token(${this.type}, ${JSON.stringify(this.value)}, ${this.line}:${this.column})`;
  }
}

export class Lexer {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];
  }

  error(message) {
    throw new Error(`Lexer Error at ${this.line}:${this.column}: ${message}`);
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

  skipBlockComment() {
    this.advance(); // skip *
    while (!(this.peek() === '*' && this.peek(1) === '/')) {
      if (this.peek() === '\0') {
        this.error('Unterminated block comment');
      }
      this.advance();
    }
    this.advance(); // skip *
    this.advance(); // skip /
  }

  readString(quote) {
    const startLine = this.line;
    const startColumn = this.column;
    let value = '';
    let hasInterpolation = false;
    
    while (this.peek() !== quote) {
      if (this.peek() === '\0') {
        this.error('Unterminated string');
      }
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
          case '`': value += '`'; break;
          case '0': value += '\0'; break;
          case '$': value += '$'; break; // Allow escaping $ to prevent interpolation
          default: value += escaped;
        }
      } else if (this.peek() === '$' && this.peek(1) === '{') {
        // String interpolation detected - mark position for later parsing
        hasInterpolation = true;
        value += '\x00INTERP_START\x00'; // Use marker that we'll split on later
        this.advance(); // skip $
        this.advance(); // skip {
        // Read until matching }
        let braceDepth = 1;
        while (braceDepth > 0 && this.peek() !== '\0') {
          if (this.peek() === '{') braceDepth++;
          if (this.peek() === '}') braceDepth--;
          if (braceDepth > 0) {
            value += this.advance();
          }
        }
        if (this.peek() === '}') {
          this.advance(); // skip closing }
          value += '\x00INTERP_END\x00';
        } else {
          this.error('Unterminated interpolation in string');
        }
      } else {
        value += this.advance();
      }
    }
    this.advance(); // closing quote
    
    if (hasInterpolation) {
      // Return as template string token with the raw content (will be converted to backticks in generator)
      return new Token(TokenType.TEMPLATE_STRING, value, startLine, startColumn);
    }
    
    return new Token(TokenType.STRING, value, startLine, startColumn);
  }

  readTemplateString() {
    const startLine = this.line;
    const startColumn = this.column;
    let value = '`';
    
    while (this.peek() !== '`') {
      if (this.peek() === '\0') {
        this.error('Unterminated template string');
      }
      if (this.peek() === '\\') {
        value += this.advance();
        value += this.advance();
      } else {
        value += this.advance();
      }
    }
    value += this.advance(); // closing backtick
    
    return new Token(TokenType.STRING, value, startLine, startColumn);
  }

  readNumber() {
    const startLine = this.line;
    const startColumn = this.column;
    let value = '';
    
    // Handle hex, binary, octal
    if (this.peek() === '0') {
      value += this.advance();
      if (this.peek() === 'x' || this.peek() === 'X') {
        value += this.advance();
        while (/[0-9a-fA-F]/.test(this.peek())) {
          value += this.advance();
        }
        return new Token(TokenType.NUMBER, value, startLine, startColumn);
      } else if (this.peek() === 'b' || this.peek() === 'B') {
        value += this.advance();
        while (this.peek() === '0' || this.peek() === '1') {
          value += this.advance();
        }
        return new Token(TokenType.NUMBER, value, startLine, startColumn);
      } else if (this.peek() === 'o' || this.peek() === 'O') {
        value += this.advance();
        while (/[0-7]/.test(this.peek())) {
          value += this.advance();
        }
        return new Token(TokenType.NUMBER, value, startLine, startColumn);
      }
    }
    
    // Regular number
    while (/[0-9]/.test(this.peek())) {
      value += this.advance();
    }
    
    // Decimal part
    if (this.peek() === '.' && /[0-9]/.test(this.peek(1))) {
      value += this.advance(); // .
      while (/[0-9]/.test(this.peek())) {
        value += this.advance();
      }
    }
    
    // Exponent
    if (this.peek() === 'e' || this.peek() === 'E') {
      value += this.advance();
      if (this.peek() === '+' || this.peek() === '-') {
        value += this.advance();
      }
      while (/[0-9]/.test(this.peek())) {
        value += this.advance();
      }
    }
    
    return new Token(TokenType.NUMBER, value, startLine, startColumn);
  }

  canStartRegex() {
    // Regex can start after these token types (expression start context)
    // After values/identifiers/closing brackets, / is division
    // After operators that expect an operand, / could be regex
    if (this.tokens.length === 0) return true;
    
    const lastToken = this.tokens[this.tokens.length - 1];
    
    // After these, / is definitely division (they produce values)
    const divisionPrecedingTokens = [
      TokenType.NUMBER,
      TokenType.STRING,
      TokenType.TEMPLATE_STRING,
      TokenType.IDENTIFIER,
      TokenType.BOOLEAN,
      TokenType.NULL,
      TokenType.RPAREN,
      TokenType.RBRACKET,
      TokenType.RBRACE,
      TokenType.REGEX, // After a regex, / is division
    ];
    
    if (divisionPrecedingTokens.includes(lastToken.type)) {
      return false;
    }
    
    // After everything else (operators, keywords, opening brackets), / could be regex
    return true;
  }

  readRegex() {
    const startLine = this.line;
    const startColumn = this.column;
    let pattern = '';
    let flags = '';
    
    // Read pattern until unescaped /
    while (this.peek() !== '/' && this.peek() !== '\0' && this.peek() !== '\n') {
      if (this.peek() === '\\') {
        pattern += this.advance(); // backslash
        if (this.peek() !== '\0' && this.peek() !== '\n') {
          pattern += this.advance(); // escaped char
        }
      } else {
        pattern += this.advance();
      }
    }
    
    if (this.peek() !== '/') {
      this.error('Unterminated regex literal');
    }
    this.advance(); // closing /
    
    // Read flags (g, i, m, s, u, y)
    while (/[gimsuy]/.test(this.peek())) {
      flags += this.advance();
    }
    
    return new Token(TokenType.REGEX, { pattern, flags }, startLine, startColumn);
  }

  readIdentifier() {
    const startLine = this.line;
    const startColumn = this.column;
    let value = '';
    
    while (/[a-zA-Z0-9_$]/.test(this.peek())) {
      value += this.advance();
    }
    
    const type = KEYWORDS[value] || TokenType.IDENTIFIER;
    
    // Special handling for shell keyword - read raw content after {
    if (type === TokenType.SHELL) {
      this.tokens.push(new Token(type, value, startLine, startColumn));
      this.skipWhitespace();
      
      // Check for optional (inputs)
      if (this.peek() === '(') {
        this.tokens.push(new Token(TokenType.LPAREN, '(', this.line, this.column));
        this.advance();
        // Read input identifiers
        while (this.peek() !== ')' && this.peek() !== '\0') {
          this.skipWhitespace();
          if (this.peek() === ',') {
            this.tokens.push(new Token(TokenType.COMMA, ',', this.line, this.column));
            this.advance();
            continue;
          }
          if (/[a-zA-Z_$]/.test(this.peek())) {
            const idStart = this.line;
            const idCol = this.column;
            let id = '';
            while (/[a-zA-Z0-9_$]/.test(this.peek())) {
              id += this.advance();
            }
            this.tokens.push(new Token(TokenType.IDENTIFIER, id, idStart, idCol));
          } else {
            break;
          }
        }
        if (this.peek() === ')') {
          this.tokens.push(new Token(TokenType.RPAREN, ')', this.line, this.column));
          this.advance();
        }
        this.skipWhitespace();
      }
      
      // Skip newlines before {
      while (this.peek() === '\n') {
        this.advance();
      }
      this.skipWhitespace();
      
      // Now read the { and raw content until }
      if (this.peek() === '{') {
        this.tokens.push(new Token(TokenType.LBRACE, '{', this.line, this.column));
        this.advance();
        
        // Read raw shell content until matching }
        const contentStart = this.line;
        const contentCol = this.column;
        let content = '';
        let braceDepth = 1;
        
        while (braceDepth > 0 && this.peek() !== '\0') {
          if (this.peek() === '{') {
            braceDepth++;
            content += this.advance();
          } else if (this.peek() === '}') {
            braceDepth--;
            if (braceDepth > 0) {
              content += this.advance();
            }
          } else {
            content += this.advance();
          }
        }
        
        // Add the raw shell content as a single token
        this.tokens.push(new Token(TokenType.SHELL_CONTENT, content.trim(), contentStart, contentCol));
        
        // Add closing brace
        if (this.peek() === '}') {
          this.tokens.push(new Token(TokenType.RBRACE, '}', this.line, this.column));
          this.advance();
        }
        
        return null; // Already added tokens
      }
    }
    
    return new Token(type, value, startLine, startColumn);
  }

  addToken(type, value = null) {
    const token = new Token(type, value, this.line, this.column);
    this.tokens.push(token);
    return token;
  }

  tokenize() {
    while (this.pos < this.source.length) {
      this.skipWhitespace();
      
      if (this.pos >= this.source.length) break;
      
      const startLine = this.line;
      const startColumn = this.column;
      const char = this.peek();
      
      // Comments
      if (char === '/' && this.peek(1) === '/') {
        this.advance();
        this.advance();
        this.skipLineComment();
        continue;
      }
      
      if (char === '/' && this.peek(1) === '*') {
        this.advance();
        this.skipBlockComment();
        continue;
      }
      
      // Newlines (significant in KimchiLang)
      if (char === '\n') {
        this.advance();
        // Only add newline if previous token isn't already a newline
        if (this.tokens.length > 0 && this.tokens[this.tokens.length - 1].type !== TokenType.NEWLINE) {
          this.tokens.push(new Token(TokenType.NEWLINE, '\n', startLine, startColumn));
        }
        continue;
      }
      
      // Strings
      if (char === '"' || char === "'") {
        this.advance();
        this.tokens.push(this.readString(char));
        continue;
      }
      
      // Template strings
      if (char === '`') {
        this.advance();
        this.tokens.push(this.readTemplateString());
        continue;
      }
      
      // Numbers
      if (/[0-9]/.test(char)) {
        this.tokens.push(this.readNumber());
        continue;
      }
      
      // Identifiers and keywords
      if (/[a-zA-Z_$]/.test(char)) {
        const token = this.readIdentifier();
        if (token) {
          this.tokens.push(token);
        }
        continue;
      }
      
      // Operators and delimiters
      this.advance();
      
      switch (char) {
        case '+':
          if (this.match('=')) {
            this.tokens.push(new Token(TokenType.PLUS_ASSIGN, '+=', startLine, startColumn));
          } else {
            this.tokens.push(new Token(TokenType.PLUS, '+', startLine, startColumn));
          }
          break;
        case '-':
          if (this.match('>')) {
            this.tokens.push(new Token(TokenType.ARROW, '->', startLine, startColumn));
          } else if (this.match('=')) {
            this.tokens.push(new Token(TokenType.MINUS_ASSIGN, '-=', startLine, startColumn));
          } else {
            this.tokens.push(new Token(TokenType.MINUS, '-', startLine, startColumn));
          }
          break;
        case '*':
          if (this.match('*')) {
            this.tokens.push(new Token(TokenType.POWER, '**', startLine, startColumn));
          } else if (this.match('=')) {
            this.tokens.push(new Token(TokenType.STAR_ASSIGN, '*=', startLine, startColumn));
          } else {
            this.tokens.push(new Token(TokenType.STAR, '*', startLine, startColumn));
          }
          break;
        case '/':
          if (this.match('=')) {
            this.tokens.push(new Token(TokenType.SLASH_ASSIGN, '/=', startLine, startColumn));
          } else if (this.canStartRegex()) {
            // This is a regex literal
            this.tokens.push(this.readRegex());
          } else {
            this.tokens.push(new Token(TokenType.SLASH, '/', startLine, startColumn));
          }
          break;
        case '%':
          this.tokens.push(new Token(TokenType.PERCENT, '%', startLine, startColumn));
          break;
        case '=':
          if (this.match('=')) {
            this.tokens.push(new Token(TokenType.EQ, '==', startLine, startColumn));
          } else if (this.match('>')) {
            this.tokens.push(new Token(TokenType.FAT_ARROW, '=>', startLine, startColumn));
          } else {
            this.tokens.push(new Token(TokenType.ASSIGN, '=', startLine, startColumn));
          }
          break;
        case '!':
          if (this.match('=')) {
            this.tokens.push(new Token(TokenType.NEQ, '!=', startLine, startColumn));
          } else {
            this.tokens.push(new Token(TokenType.NOT, '!', startLine, startColumn));
          }
          break;
        case '<':
          if (this.match('=')) {
            this.tokens.push(new Token(TokenType.LTE, '<=', startLine, startColumn));
          } else if (this.match('<')) {
            this.tokens.push(new Token(TokenType.LSHIFT, '<<', startLine, startColumn));
          } else {
            this.tokens.push(new Token(TokenType.LT, '<', startLine, startColumn));
          }
          break;
        case '>':
          if (this.match('=')) {
            this.tokens.push(new Token(TokenType.GTE, '>=', startLine, startColumn));
          } else if (this.match('>')) {
            this.tokens.push(new Token(TokenType.FLOW, '>>', startLine, startColumn));
          } else {
            this.tokens.push(new Token(TokenType.GT, '>', startLine, startColumn));
          }
          break;
        case '&':
          if (this.match('&')) {
            this.tokens.push(new Token(TokenType.AND, '&&', startLine, startColumn));
          } else {
            this.error('Bitwise operators not supported. Use stdlib.bitwise instead.');
          }
          break;
        case '|':
          if (this.match('|')) {
            this.tokens.push(new Token(TokenType.OR, '||', startLine, startColumn));
          } else {
            this.tokens.push(new Token(TokenType.BITOR, '|', startLine, startColumn));
          }
          break;
        case '^':
          this.error('Bitwise operators not supported. Use stdlib.bitwise instead.');
          break;
        case '~':
          if (this.match('>')) {
            this.tokens.push(new Token(TokenType.PIPE, '~>', startLine, startColumn));
          } else {
            this.tokens.push(new Token(TokenType.MATCH, '~', startLine, startColumn));
          }
          break;
        case '?':
          this.tokens.push(new Token(TokenType.QUESTION, '?', startLine, startColumn));
          break;
        case ':':
          if (this.match(':')) {
            this.tokens.push(new Token(TokenType.DOUBLE_COLON, '::', startLine, startColumn));
          } else {
            this.tokens.push(new Token(TokenType.COLON, ':', startLine, startColumn));
          }
          break;
        case '.':
          if (this.match('.')) {
            if (this.match('.')) {
              this.tokens.push(new Token(TokenType.SPREAD, '...', startLine, startColumn));
            } else {
              this.tokens.push(new Token(TokenType.RANGE, '..', startLine, startColumn));
            }
          } else {
            this.tokens.push(new Token(TokenType.DOT, '.', startLine, startColumn));
          }
          break;
        case ',':
          this.tokens.push(new Token(TokenType.COMMA, ',', startLine, startColumn));
          break;
        case ';':
          this.tokens.push(new Token(TokenType.SEMICOLON, ';', startLine, startColumn));
          break;
        case '(':
          this.tokens.push(new Token(TokenType.LPAREN, '(', startLine, startColumn));
          break;
        case ')':
          this.tokens.push(new Token(TokenType.RPAREN, ')', startLine, startColumn));
          break;
        case '{':
          this.tokens.push(new Token(TokenType.LBRACE, '{', startLine, startColumn));
          break;
        case '}':
          this.tokens.push(new Token(TokenType.RBRACE, '}', startLine, startColumn));
          break;
        case '[':
          this.tokens.push(new Token(TokenType.LBRACKET, '[', startLine, startColumn));
          break;
        case ']':
          this.tokens.push(new Token(TokenType.RBRACKET, ']', startLine, startColumn));
          break;
        default:
          this.error(`Unexpected character: ${char}`);
      }
    }
    
    this.tokens.push(new Token(TokenType.EOF, null, this.line, this.column));
    return this.tokens;
  }
}

export function tokenize(source) {
  const lexer = new Lexer(source);
  return lexer.tokenize();
}
