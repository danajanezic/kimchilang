// SQL Plugin — inline SQL with compile-time parameterization
// Syntax: sql is Type { SELECT * FROM users WHERE id = $userId }
//         sql in Type1, Type2 { SELECT ... }
//         sql { SELECT ... }
// Compiles to: await db.query("SELECT ... WHERE id = $1", [userId])

import { Token } from '../lexer.js';

// --- SQL Lexer ---

function lexSQL(lexer) {
  // Only trigger on 'sql' identifier followed by 'is', 'in', or '{'
  if (lexer.peek() !== 's') return null;
  if (lexer.source.slice(lexer.pos, lexer.pos + 3) !== 'sql') return null;
  const after = lexer.source[lexer.pos + 3];
  if (after && /[a-zA-Z0-9_]/.test(after)) return null; // not 'sql' keyword, e.g. 'sqlHelper'

  // Look ahead past whitespace for 'is', 'in', or '{'
  let ahead = lexer.pos + 3;
  while (ahead < lexer.source.length && (lexer.source[ahead] === ' ' || lexer.source[ahead] === '\t')) ahead++;
  const rest = lexer.source.slice(ahead);
  if (!rest.startsWith('is ') && !rest.startsWith('in ') && !rest.startsWith('{')) return null;

  const startLine = lexer.line;
  const startColumn = lexer.column;

  // Consume 'sql'
  lexer.advance(); lexer.advance(); lexer.advance();

  // Skip whitespace
  while (lexer.peek() === ' ' || lexer.peek() === '\t') lexer.advance();

  // Parse type mode: is/in + type names
  let typeMode = null;
  const typeNames = [];

  if (lexer.source.slice(lexer.pos, lexer.pos + 3) === 'is ') {
    typeMode = 'intersection';
    lexer.advance(); lexer.advance(); // 'is'
    while (lexer.peek() === ' ') lexer.advance();
    readTypeNames(lexer, typeNames);
  } else if (lexer.source.slice(lexer.pos, lexer.pos + 3) === 'in ') {
    typeMode = 'union';
    lexer.advance(); lexer.advance(); // 'in'
    while (lexer.peek() === ' ') lexer.advance();
    readTypeNames(lexer, typeNames);
  }

  // Skip whitespace before {
  while (lexer.peek() === ' ' || lexer.peek() === '\t' || lexer.peek() === '\n') lexer.advance();

  // Expect {
  if (lexer.peek() !== '{') {
    lexer.error('Expected { after sql declaration');
  }
  lexer.advance(); // {

  // Read SQL body until matching }
  let depth = 1;
  let sql = '';
  const params = [];
  let paramIndex = 0;

  while (depth > 0 && lexer.peek() !== '\0') {
    const ch = lexer.peek();
    if (ch === '{') {
      depth++;
      sql += lexer.advance();
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        lexer.advance(); // closing }
        break;
      }
      sql += lexer.advance();
    } else if (ch === '$' && /[a-zA-Z_]/.test(lexer.peek(1))) {
      // Parameter: $varName -> $N placeholder
      lexer.advance(); // $
      let varName = '';
      while (/[a-zA-Z0-9_]/.test(lexer.peek())) {
        varName += lexer.advance();
      }
      paramIndex++;
      params.push(varName);
      sql += `$${paramIndex}`;
    } else {
      sql += lexer.advance();
    }
  }

  return new Token('SQL_QUERY', {
    sql: sql.trim(),
    params,
    typeMode,
    typeNames,
  }, startLine, startColumn);
}

function readTypeNames(lexer, typeNames) {
  while (true) {
    let name = '';
    while (/[a-zA-Z0-9_.]/.test(lexer.peek())) {
      name += lexer.advance();
    }
    if (name) typeNames.push(name);
    while (lexer.peek() === ' ') lexer.advance();
    if (lexer.peek() === ',') {
      lexer.advance(); // ,
      while (lexer.peek() === ' ') lexer.advance();
    } else {
      break;
    }
  }
}

// --- SQL Parser ---

function parseSQL(parser) {
  const token = parser.peek();
  if (token.type !== 'SQL_QUERY') return null;

  parser.advance();
  return {
    type: 'SqlQuery',
    sql: token.value.sql,
    params: token.value.params,
    typeMode: token.value.typeMode,
    typeNames: token.value.typeNames,
    line: token.line,
    column: token.column,
  };
}

// --- SQL Generator ---

function generateSQL(generator, node) {
  if (node.type !== 'SqlQuery') return undefined;

  const sqlStr = JSON.stringify(node.sql);
  const params = node.params;

  if (params.length === 0) {
    return `await db.query(${sqlStr})`;
  }

  const paramList = params.join(', ');
  return `await db.query(${sqlStr}, [${paramList}])`;
}

// --- Auto-imports ---

function autoImports(usedFeatures) {
  // No auto-import — the db connection is provided by the user via extern or dep
  return [];
}

const sqlPlugin = {
  name: 'sql',

  lexerRules(lexer) {
    return lexSQL(lexer);
  },

  parserRules(parser) {
    return parseSQL(parser);
  },

  generatorVisitors(generator, node) {
    return generateSQL(generator, node);
  },

  autoImports,
};

export default sqlPlugin;
