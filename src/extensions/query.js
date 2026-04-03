// Query Plugin — CRUD database abstraction via directive blocks
// Syntax: query User { find 42 }
//         query User { where {role: "admin"} sortBy "name" asc limit 10 }
//         query User { create {name: "Alice"} }
//         query(override) User { find 42 }
// Types map to tables: User -> user (lowercase)

import { Token } from '../lexer.js';

// --- Query Lexer ---

function lexQuery(lexer) {
  if (lexer.peek() !== 'q') return null;
  if (lexer.source.slice(lexer.pos, lexer.pos + 5) !== 'query') return null;
  const after = lexer.source[lexer.pos + 5];
  if (after && /[a-zA-Z0-9_]/.test(after)) return null;

  // Don't match if preceded by a dot (e.g., stdlib.db.query)
  if (lexer.pos > 0 && lexer.source[lexer.pos - 1] === '.') return null;

  // Look ahead past whitespace for '(', or an uppercase letter (type name)
  let ahead = lexer.pos + 5;
  while (ahead < lexer.source.length && (lexer.source[ahead] === ' ' || lexer.source[ahead] === '\t')) ahead++;
  const ch = lexer.source[ahead];
  if (!ch || (ch !== '(' && !(ch >= 'A' && ch <= 'Z'))) return null;

  const startLine = lexer.line;
  const startColumn = lexer.column;

  // Consume 'query'
  for (let i = 0; i < 5; i++) lexer.advance();
  while (lexer.peek() === ' ' || lexer.peek() === '\t') lexer.advance();

  // Optional connection override: query(db2) User { ... }
  let override = null;
  if (lexer.peek() === '(') {
    lexer.advance(); // (
    let name = '';
    while (lexer.peek() !== ')' && lexer.peek() !== '\0') {
      name += lexer.advance();
    }
    lexer.advance(); // )
    override = name.trim();
    while (lexer.peek() === ' ' || lexer.peek() === '\t') lexer.advance();
  }

  // Type name (uppercase start)
  let typeName = '';
  while (/[a-zA-Z0-9_]/.test(lexer.peek())) {
    typeName += lexer.advance();
  }
  if (!typeName) {
    lexer.error('Expected type name after query');
  }

  while (lexer.peek() === ' ' || lexer.peek() === '\t' || lexer.peek() === '\n') lexer.advance();

  // Expect {
  if (lexer.peek() !== '{') {
    lexer.error('Expected { after query type name');
  }
  lexer.advance(); // {

  // Read body until matching }
  let depth = 1;
  let body = '';
  while (depth > 0 && lexer.peek() !== '\0') {
    const ch = lexer.peek();
    if (ch === '{') { depth++; body += lexer.advance(); }
    else if (ch === '}') {
      depth--;
      if (depth === 0) { lexer.advance(); break; }
      body += lexer.advance();
    } else {
      body += lexer.advance();
    }
  }

  return new Token('QUERY_BLOCK', {
    typeName,
    override,
    body: body.trim(),
  }, startLine, startColumn);
}

// --- Query Body Parser ---

function parseQueryBody(body) {
  const ops = [];
  const tokens = tokenizeBody(body);
  let i = 0;

  function peek() { return tokens[i] || null; }
  function advance() { return tokens[i++]; }
  function expect(val) {
    const t = advance();
    if (!t || t !== val) throw new Error(`Expected '${val}', got '${t}'`);
    return t;
  }

  while (i < tokens.length) {
    const token = peek();

    if (token === 'find') {
      advance();
      const id = advance();
      ops.push({ op: 'find', id });
    } else if (token === 'all') {
      advance();
      ops.push({ op: 'all' });
    } else if (token === 'first') {
      advance();
      ops.push({ op: 'first' });
    } else if (token === 'last') {
      advance();
      ops.push({ op: 'last' });
    } else if (token === 'count') {
      advance();
      ops.push({ op: 'count' });
    } else if (token === 'where') {
      advance();
      const obj = readObject(tokens, { pos: i });
      i = obj.endPos;
      ops.push({ op: 'where', conditions: obj.value });
    } else if (token === 'sortBy') {
      advance();
      const col = advance(); // column name (string)
      let order = 'asc';
      if (peek() === 'asc' || peek() === 'desc') {
        order = advance();
      }
      ops.push({ op: 'sortBy', column: col, order });
    } else if (token === 'limit') {
      advance();
      ops.push({ op: 'limit', value: advance() });
    } else if (token === 'offset') {
      advance();
      ops.push({ op: 'offset', value: advance() });
    } else if (token === 'create') {
      advance();
      const obj = readObject(tokens, { pos: i });
      i = obj.endPos;
      ops.push({ op: 'create', data: obj.value });
    } else if (token === 'update') {
      advance();
      const id = advance();
      const obj = readObject(tokens, { pos: i });
      i = obj.endPos;
      ops.push({ op: 'update', id, data: obj.value });
    } else if (token === 'remove') {
      advance();
      const id = advance();
      ops.push({ op: 'remove', id });
    } else if (token === 'include') {
      advance();
      const relType = advance();
      let subOps = null;
      // Check for optional sub-block: include Post { where ... }
      if (peek() === '{') {
        advance(); // {
        let subBody = '';
        let depth = 1;
        while (depth > 0 && i < tokens.length) {
          const t = advance();
          if (t === '{') depth++;
          else if (t === '}') { depth--; if (depth === 0) break; }
          if (depth > 0) subBody += t + ' ';
        }
        subOps = parseQueryBody(subBody.trim());
      }
      // Check for "on" clause: include Post on "author_id"
      let foreignKey = null;
      if (peek() === 'on') {
        advance(); // on
        foreignKey = advance();
      }
      ops.push({ op: 'include', relType, subOps, foreignKey });
    } else {
      // Skip unknown tokens
      advance();
    }
  }

  return ops;
}

function tokenizeBody(body) {
  const tokens = [];
  let i = 0;

  while (i < body.length) {
    // Skip whitespace
    while (i < body.length && /\s/.test(body[i])) i++;
    if (i >= body.length) break;

    // String literal
    if (body[i] === '"') {
      i++; // opening "
      let str = '';
      while (i < body.length && body[i] !== '"') {
        if (body[i] === '\\') { i++; str += body[i++]; continue; }
        str += body[i++];
      }
      i++; // closing "
      tokens.push(str);
      continue;
    }

    // $variable reference
    if (body[i] === '$') {
      i++; // $
      let name = '';
      while (i < body.length && /[a-zA-Z0-9_]/.test(body[i])) {
        name += body[i++];
      }
      tokens.push('$' + name);
      continue;
    }

    // Braces
    if (body[i] === '{' || body[i] === '}') {
      tokens.push(body[i++]);
      continue;
    }

    // Comma, colon
    if (body[i] === ',' || body[i] === ':') {
      tokens.push(body[i++]);
      continue;
    }

    // Number
    if (/[0-9]/.test(body[i]) || (body[i] === '-' && i + 1 < body.length && /[0-9]/.test(body[i + 1]))) {
      let num = '';
      if (body[i] === '-') num += body[i++];
      while (i < body.length && /[0-9.]/.test(body[i])) num += body[i++];
      tokens.push(num);
      continue;
    }

    // Boolean / keyword / identifier
    if (/[a-zA-Z_]/.test(body[i])) {
      let word = '';
      while (i < body.length && /[a-zA-Z0-9_]/.test(body[i])) word += body[i++];
      tokens.push(word);
      continue;
    }

    // Skip unknown chars
    i++;
  }

  return tokens;
}

function readObject(tokens, state) {
  const pairs = [];
  if (tokens[state.pos] !== '{') {
    throw new Error('Expected { for object literal in query body');
  }
  state.pos++; // {

  while (state.pos < tokens.length && tokens[state.pos] !== '}') {
    const key = tokens[state.pos++];
    if (tokens[state.pos] === ':') {
      state.pos++; // :
      const value = tokens[state.pos++];
      pairs.push({ key, value });
    }
    if (tokens[state.pos] === ',') state.pos++;
  }

  if (tokens[state.pos] === '}') state.pos++;

  return { value: pairs, endPos: state.pos };
}

// --- Query AST Parser ---

function parseQuery(parser) {
  const token = parser.peek();
  if (token.type !== 'QUERY_BLOCK') return null;

  parser.advance();
  const ops = parseQueryBody(token.value.body);

  return {
    type: 'QueryBlock',
    typeName: token.value.typeName,
    override: token.value.override,
    operations: ops,
    line: token.line,
    column: token.column,
  };
}

// --- Query Generator ---

function getTableConfig(generator, typeName) {
  const annotation = generator.typeAnnotations?.get(typeName);
  if (!annotation || annotation.name !== 'query.table' || !annotation.args) return null;

  // annotation.args is an ObjectExpression AST node
  const config = {};
  if (annotation.args.type === 'ObjectExpression' && annotation.args.properties) {
    for (const prop of annotation.args.properties) {
      const key = prop.key?.name || prop.key;
      const value = {};
      if (prop.value?.type === 'ObjectExpression' && prop.value.properties) {
        for (const p of prop.value.properties) {
          const k = p.key?.name || p.key;
          const v = p.value?.value !== undefined ? p.value.value : (p.value?.name || true);
          value[k] = v;
        }
      }
      config[key] = value;
    }
  }
  return config;
}

function getColumnName(tableConfig, field) {
  if (tableConfig && tableConfig[field] && tableConfig[field].col) {
    return tableConfig[field].col;
  }
  return field;
}

function getPrimaryKeyField(tableConfig) {
  if (!tableConfig) return 'id';
  for (const [field, meta] of Object.entries(tableConfig)) {
    if (meta.primaryKey) return getColumnName(tableConfig, field);
  }
  return 'id';
}

function generateQuery(generator, node) {
  if (node.type !== 'QueryBlock') return undefined;

  const table = node.typeName.toLowerCase();
  const conn = node.override || 'query';
  const ops = node.operations;
  const tableConfig = getTableConfig(generator, node.typeName);

  if (ops.length === 0) return 'null';

  const primary = ops[0];

  switch (primary.op) {
    case 'find': {
      const id = resolveValue(primary.id);
      const pk = getPrimaryKeyField(tableConfig);
      const pkArg = pk !== 'id' ? `, "${pk}"` : '';
      const includes = ops.filter(o => o.op === 'include');
      if (includes.length === 0) {
        return `await ${conn}.find("${table}", ${id}${pkArg})`;
      }
      // Find with includes
      const parts = [`await ${conn}.find("${table}", ${id}${pkArg})`];
      for (const inc of includes) {
        const relTable = inc.relType.toLowerCase();
        const fk = inc.foreignKey ? `"${inc.foreignKey}"` : `"${table.replace(/s$/, '')}_id"`;
        if (inc.subOps && inc.subOps.length > 0) {
          const subOpts = buildWhereOpts(inc.subOps);
          parts.push(`await ${conn}._include("${relTable}", ${fk}, _result.id, ${subOpts})`);
        } else {
          parts.push(`await ${conn}._include("${relTable}", ${fk}, _result.id)`);
        }
      }
      // Wrap in IIFE for includes
      return `await (async () => { const _result = ${parts[0]}; if (_result) { ${includes.map((inc, i) => {
        const relTable = inc.relType.toLowerCase();
        const prop = relTable;
        return `_result.${prop} = ${parts[i + 1]};`;
      }).join(' ')} } return _result; })()`;
    }

    case 'all': {
      return `await ${conn}.all("${table}")`;
    }

    case 'first': {
      return `await ${conn}.first("${table}")`;
    }

    case 'last': {
      return `await ${conn}.last("${table}")`;
    }

    case 'count': {
      return `await ${conn}.count("${table}")`;
    }

    case 'where': {
      const opts = buildWhereOpts(ops);
      return `await ${conn}.where("${table}", ${opts})`;
    }

    case 'create': {
      const data = buildDataObject(primary.data);
      return `await ${conn}.create("${table}", ${data})`;
    }

    case 'update': {
      const id = resolveValue(primary.id);
      const data = buildDataObject(primary.data);
      return `await ${conn}.update("${table}", ${id}, ${data})`;
    }

    case 'remove': {
      const id = resolveValue(primary.id);
      return `await ${conn}.remove("${table}", ${id})`;
    }

    default:
      return 'null';
  }
}

function resolveValue(val) {
  if (!val) return 'null';
  if (val.startsWith('$')) return val.slice(1); // $var -> var
  if (val === 'true' || val === 'false' || val === 'null') return val;
  if (/^-?[0-9]/.test(val)) return val;
  return JSON.stringify(val); // string
}

function buildDataObject(pairs) {
  if (!pairs || pairs.length === 0) return '{}';
  const props = pairs.map(p => `${JSON.stringify(p.key)}: ${resolveValue(p.value)}`);
  return `{ ${props.join(', ')} }`;
}

function buildWhereOpts(ops) {
  const wheres = ops.filter(o => o.op === 'where');
  const sortBy = ops.find(o => o.op === 'sortBy');
  const limit = ops.find(o => o.op === 'limit');
  const offset = ops.find(o => o.op === 'offset');

  // Merge all where conditions
  const allConditions = [];
  for (const w of wheres) {
    for (const pair of w.conditions) {
      allConditions.push(pair);
    }
  }

  const parts = [];
  if (allConditions.length > 0) {
    parts.push(`conditions: ${buildDataObject(allConditions)}`);
  }
  if (sortBy) {
    parts.push(`sortBy: ${JSON.stringify(sortBy.column)}`);
    parts.push(`order: "${sortBy.order}"`);
  }
  if (limit) {
    parts.push(`limit: ${limit.value}`);
  }
  if (offset) {
    parts.push(`offset: ${offset.value}`);
  }

  return `{ ${parts.join(', ')} }`;
}

// --- Auto-imports ---

function autoImports() {
  return [];
}

const queryPlugin = {
  name: 'query',

  lexerRules(lexer) {
    return lexQuery(lexer);
  },

  parserRules(parser) {
    return parseQuery(parser);
  },

  generatorVisitors(generator, node) {
    return generateQuery(generator, node);
  },

  autoImports,
};

export default queryPlugin;
