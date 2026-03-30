// specscript/src/generator.js

import { NodeType } from './parser.js';

const RUNTIME_HELPERS = `
function _deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.getOwnPropertyNames(obj).forEach(name => {
    const value = obj[name];
    if (typeof value === 'object' && value !== null) {
      _deepFreeze(value);
    }
  });
  return Object.freeze(obj);
}

async function _pipe(value, ...fns) {
  let result = value;
  for (const fn of fns) {
    result = await fn(result);
  }
  return result;
}

function _flow(...fns) {
  return async function(value) {
    let result = value;
    for (const fn of fns) {
      result = await fn(result);
    }
    return result;
  };
}

const _tests = [];

function _test(name, fn) {
  _tests.push({ name, fn });
}

function _expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) throw new Error(\`Expected \${JSON.stringify(expected)}, got \${JSON.stringify(actual)}\`);
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(\`Expected \${JSON.stringify(expected)}, got \${JSON.stringify(actual)}\`);
    },
    toContain(item) {
      if (!actual.includes(item)) throw new Error(\`Expected \${JSON.stringify(actual)} to contain \${JSON.stringify(item)}\`);
    },
    toBeTruthy() {
      if (!actual) throw new Error(\`Expected truthy value, got \${JSON.stringify(actual)}\`);
    },
    toBeFalsy() {
      if (actual) throw new Error(\`Expected falsy value, got \${JSON.stringify(actual)}\`);
    },
    toBeNull() {
      if (actual !== null) throw new Error(\`Expected null, got \${JSON.stringify(actual)}\`);
    },
    toHaveLength(len) {
      if (actual.length !== len) throw new Error(\`Expected length \${len}, got \${actual.length}\`);
    },
    toBeGreaterThan(n) {
      if (actual <= n) throw new Error(\`Expected \${actual} to be greater than \${n}\`);
    },
    toBeLessThan(n) {
      if (actual >= n) throw new Error(\`Expected \${actual} to be less than \${n}\`);
    },
    toThrow() {
      try {
        actual();
        throw new Error('Expected function to throw');
      } catch (e) {
        if (e.message === 'Expected function to throw') throw e;
      }
    },
  };
}

async function _runTests() {
  if (_tests.length === 0) return;
  let passed = 0;
  let failed = 0;
  for (const { name, fn } of _tests) {
    try {
      await fn();
      console.log(\`  ✓ \${name}\`);
      passed++;
    } catch (e) {
      console.log(\`  ✗ \${name}: \${e.message}\`);
      failed++;
    }
  }
  console.log(\`\\n\${passed} passed, \${failed} failed\`);
}
`.trimStart();

class CodeGenerator {
  constructor() {
    this.output = '';
    this.indent = 0;
    this.hasTests = false;
  }

  emit(code) {
    this.output += code;
  }

  emitLine(code = '') {
    this.output += '  '.repeat(this.indent) + code + '\n';
  }

  pushIndent() {
    this.indent++;
  }

  popIndent() {
    this.indent--;
  }

  generate(ast) {
    this.output = RUNTIME_HELPERS + '\n';

    for (const node of ast.body) {
      this.generateNode(node);
    }

    if (this.hasTests) {
      this.emitLine('_runTests();');
    }

    return this.output;
  }

  generateNode(node) {
    switch (node.type) {
      case NodeType.DecDeclaration:
        this.generateDec(node);
        break;
      case NodeType.FunctionDeclaration:
        this.generateFunction(node);
        break;
      case NodeType.ReturnStatement:
        this.generateReturn(node);
        break;
      case NodeType.IfStatement:
        this.generateIf(node);
        break;
      case NodeType.ForInStatement:
        this.generateForIn(node);
        break;
      case NodeType.WhileStatement:
        this.generateWhile(node);
        break;
      case NodeType.TryStatement:
        this.generateTry(node);
        break;
      case NodeType.ThrowStatement:
        this.generateThrow(node);
        break;
      case NodeType.TestBlock:
        this.generateTest(node);
        break;
      case NodeType.EnumDeclaration:
        this.generateEnum(node);
        break;
      case NodeType.BreakStatement:
        this.emitLine('break;');
        break;
      case NodeType.ContinueStatement:
        this.emitLine('continue;');
        break;
      case NodeType.ExpressionStatement:
        this.emitLine(this.expr(node.expression) + ';');
        break;
      case NodeType.BlockStatement:
        for (const stmt of node.body) {
          this.generateNode(stmt);
        }
        break;
      default:
        this.emitLine('/* unknown node: ' + node.type + ' */');
    }
  }

  generateDec(node) {
    if (node.pattern) {
      // Destructuring
      const patternStr = this.exprPattern(node.pattern);
      this.emitLine(`const ${patternStr} = _deepFreeze(${this.expr(node.init)});`);
    } else {
      this.emitLine(`const ${node.name} = _deepFreeze(${this.expr(node.init)});`);
    }
  }

  generateFunction(node) {
    const asyncPrefix = node.async ? 'async ' : '';
    const params = node.params.join(', ');
    this.emitLine(`${asyncPrefix}function ${node.name}(${params}) {`);
    this.pushIndent();
    for (const stmt of node.body.body) {
      this.generateNode(stmt);
    }
    this.popIndent();
    this.emitLine('}');
  }

  generateReturn(node) {
    if (node.argument) {
      this.emitLine(`return ${this.expr(node.argument)};`);
    } else {
      this.emitLine('return;');
    }
  }

  generateIf(node) {
    this.emitLine(`if (${this.expr(node.test)}) {`);
    this.pushIndent();
    for (const stmt of node.consequent.body) {
      this.generateNode(stmt);
    }
    this.popIndent();
    if (node.alternate) {
      if (node.alternate.type === NodeType.IfStatement) {
        this.emit('  '.repeat(this.indent) + '} else ');
        // Inline the elif
        this.generateIfInline(node.alternate);
      } else {
        this.emitLine('} else {');
        this.pushIndent();
        for (const stmt of node.alternate.body) {
          this.generateNode(stmt);
        }
        this.popIndent();
        this.emitLine('}');
      }
    } else {
      this.emitLine('}');
    }
  }

  generateIfInline(node) {
    this.emit(`if (${this.expr(node.test)}) {\n`);
    this.pushIndent();
    for (const stmt of node.consequent.body) {
      this.generateNode(stmt);
    }
    this.popIndent();
    if (node.alternate) {
      if (node.alternate.type === NodeType.IfStatement) {
        this.emit('  '.repeat(this.indent) + '} else ');
        this.generateIfInline(node.alternate);
      } else {
        this.emitLine('} else {');
        this.pushIndent();
        for (const stmt of node.alternate.body) {
          this.generateNode(stmt);
        }
        this.popIndent();
        this.emitLine('}');
      }
    } else {
      this.emitLine('}');
    }
  }

  generateForIn(node) {
    this.emitLine(`for (const ${node.variable} of ${this.expr(node.iterable)}) {`);
    this.pushIndent();
    for (const stmt of node.body.body) {
      this.generateNode(stmt);
    }
    this.popIndent();
    this.emitLine('}');
  }

  generateWhile(node) {
    this.emitLine(`while (${this.expr(node.test)}) {`);
    this.pushIndent();
    for (const stmt of node.body.body) {
      this.generateNode(stmt);
    }
    this.popIndent();
    this.emitLine('}');
  }

  generateTry(node) {
    this.emitLine('try {');
    this.pushIndent();
    for (const stmt of node.block.body) {
      this.generateNode(stmt);
    }
    this.popIndent();
    if (node.handler) {
      this.emitLine(`} catch (${node.param}) {`);
      this.pushIndent();
      for (const stmt of node.handler.body) {
        this.generateNode(stmt);
      }
      this.popIndent();
    }
    if (node.finalizer) {
      this.emitLine('} finally {');
      this.pushIndent();
      for (const stmt of node.finalizer.body) {
        this.generateNode(stmt);
      }
      this.popIndent();
    }
    this.emitLine('}');
  }

  generateThrow(node) {
    this.emitLine(`throw ${this.expr(node.argument)};`);
  }

  generateTest(node) {
    this.hasTests = true;
    this.emitLine(`_test("${node.name}", async () => {`);
    this.pushIndent();
    for (const stmt of node.body.body) {
      this.generateNode(stmt);
    }
    this.popIndent();
    this.emitLine('});');
  }

  generateEnum(node) {
    const entries = node.variants.map(v => `"${v}": "${v}"`).join(', ');
    this.emitLine(`const ${node.name} = Object.freeze({ ${entries} });`);
  }

  exprPattern(pattern) {
    if (pattern.type === NodeType.ObjectPattern) {
      return `{ ${pattern.properties.join(', ')} }`;
    }
    if (pattern.type === NodeType.ArrayPattern) {
      return `[ ${pattern.elements.join(', ')} ]`;
    }
    return '/* unknown pattern */';
  }

  expr(node) {
    if (!node) return '';

    switch (node.type) {
      case NodeType.Literal: {
        if (typeof node.value === 'string') {
          return JSON.stringify(node.value);
        }
        if (node.value === null) return 'null';
        return String(node.value);
      }

      case NodeType.Identifier:
        return node.name;

      case NodeType.BinaryExpression: {
        const left = this.expr(node.left);
        const right = this.expr(node.right);
        let op = node.operator;
        if (op === '==') op = '===';
        else if (op === '!=') op = '!==';
        else if (op === 'and') op = '&&';
        else if (op === 'or') op = '||';
        return `${left} ${op} ${right}`;
      }

      case NodeType.UnaryExpression: {
        const arg = this.expr(node.argument);
        let op = node.operator;
        if (op === 'not') op = '!';
        return `${op}${arg}`;
      }

      case NodeType.MemberExpression: {
        const obj = this.expr(node.object);
        if (node.computed) {
          return `${obj}?.[${this.expr(node.property)}]`;
        }
        return `${obj}?.${node.property}`;
      }

      case NodeType.CallExpression: {
        const callee = this.expr(node.callee);
        const args = node.arguments.map(a => {
          if (a.type === NodeType.SpreadElement) {
            return `...${this.expr(a.argument)}`;
          }
          return this.expr(a);
        });
        return `${callee}(${args.join(', ')})`;
      }

      case NodeType.ArrowFunctionExpression: {
        const params = node.params.length === 1
          ? `(${node.params[0]})`
          : `(${node.params.join(', ')})`;
        if (node.body && node.body.type === NodeType.BlockStatement) {
          // Block body arrow — generate inline
          let bodyStr = '{\n';
          const savedOutput = this.output;
          const savedIndent = this.indent;
          this.output = '';
          this.indent = 1;
          for (const stmt of node.body.body) {
            this.generateNode(stmt);
          }
          bodyStr += this.output + '}';
          this.output = savedOutput;
          this.indent = savedIndent;
          return `${params} => ${bodyStr}`;
        }
        return `${params} => ${this.expr(node.body)}`;
      }

      case NodeType.ObjectExpression: {
        const props = node.properties.map(p => {
          if (p.shorthand) {
            return p.key;
          }
          return `"${p.key}": ${this.expr(p.value)}`;
        });
        return `{ ${props.join(', ')} }`;
      }

      case NodeType.ArrayExpression: {
        const elements = node.elements.map(e => {
          if (e.type === NodeType.SpreadElement) {
            return `...${this.expr(e.argument)}`;
          }
          return this.expr(e);
        });
        return `[${elements.join(', ')}]`;
      }

      case NodeType.PipeExpression: {
        return `_pipe(${this.expr(node.left)}, ${this.expr(node.right)})`;
      }

      case NodeType.FlowExpression: {
        return `_flow(${this.expr(node.left)}, ${this.expr(node.right)})`;
      }

      case NodeType.RangeExpression: {
        const start = this.expr(node.start);
        const end = this.expr(node.end);
        return `Array.from({ length: ${end} - ${start} }, (_, i) => ${start} + i)`;
      }

      case NodeType.NamedConstructor: {
        const fields = node.fields.map(f => `"${f.key}": ${this.expr(f.value)}`);
        return `_deepFreeze({ "_type": "${node.name}", ${fields.join(', ')} })`;
      }

      case NodeType.SpreadElement:
        return `...${this.expr(node.argument)}`;

      default:
        return `/* unknown expr: ${node.type} */`;
    }
  }
}

export function generate(ast) {
  const gen = new CodeGenerator();
  return gen.generate(ast);
}
