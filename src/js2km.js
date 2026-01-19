// JavaScript to KimchiLang Converter
// Transforms JavaScript source code into KimchiLang syntax

import * as acorn from 'acorn';

export class JS2KM {
  constructor() {
    this.indent = 0;
    this.output = [];
  }

  convert(jsSource) {
    const ast = acorn.parse(jsSource, {
      ecmaVersion: 'latest',
      sourceType: 'module',
    });
    
    this.output = [];
    this.indent = 0;
    
    for (const node of ast.body) {
      this.visitNode(node);
    }
    
    return this.output.join('\n');
  }

  emit(line) {
    const indentation = '  '.repeat(this.indent);
    this.output.push(indentation + line);
  }

  emitEmpty() {
    this.output.push('');
  }

  visitNode(node) {
    switch (node.type) {
      case 'VariableDeclaration':
        this.visitVariableDeclaration(node);
        break;
      case 'FunctionDeclaration':
        this.visitFunctionDeclaration(node);
        break;
      case 'ClassDeclaration':
        this.visitClassDeclaration(node);
        break;
      case 'ExpressionStatement':
        this.visitExpressionStatement(node);
        break;
      case 'IfStatement':
        this.visitIfStatement(node);
        break;
      case 'ForStatement':
        this.visitForStatement(node);
        break;
      case 'ForOfStatement':
        this.visitForOfStatement(node);
        break;
      case 'ForInStatement':
        this.visitForInStatement(node);
        break;
      case 'WhileStatement':
        this.visitWhileStatement(node);
        break;
      case 'ReturnStatement':
        this.visitReturnStatement(node);
        break;
      case 'ThrowStatement':
        this.visitThrowStatement(node);
        break;
      case 'TryStatement':
        this.visitTryStatement(node);
        break;
      case 'BlockStatement':
        this.visitBlockStatement(node);
        break;
      case 'ExportNamedDeclaration':
        this.visitExportNamedDeclaration(node);
        break;
      case 'ExportDefaultDeclaration':
        this.visitExportDefaultDeclaration(node);
        break;
      case 'ImportDeclaration':
        this.visitImportDeclaration(node);
        break;
      default:
        this.emit(`// Unsupported: ${node.type}`);
    }
  }

  visitVariableDeclaration(node, expose = false) {
    for (const decl of node.declarations) {
      const name = decl.id.name;
      const init = decl.init ? this.visitExpression(decl.init) : 'null';
      const prefix = expose ? 'expose ' : '';
      
      // Handle require() calls - convert to dep statement
      if (decl.init && decl.init.type === 'CallExpression' &&
          decl.init.callee.name === 'require' &&
          decl.init.arguments.length > 0) {
        const modulePath = decl.init.arguments[0].value;
        const depPath = modulePath.replace(/[\/\.]/g, '.').replace(/^\.+/, '');
        this.emit(`as ${name} dep ${depPath}`);
      } else {
        this.emit(`${prefix}dec ${name} = ${init}`);
      }
    }
  }

  visitFunctionDeclaration(node, expose = false) {
    const name = node.id.name;
    const params = node.params.map(p => this.visitPattern(p)).join(', ');
    const prefix = expose ? 'expose ' : '';
    
    this.emit(`${prefix}fn ${name}(${params}) {`);
    this.indent++;
    
    for (const stmt of node.body.body) {
      this.visitNode(stmt);
    }
    
    this.indent--;
    this.emit('}');
    this.emitEmpty();
  }

  visitClassDeclaration(node, expose = false) {
    const name = node.id.name;
    const prefix = expose ? 'expose ' : '';
    
    // Transform class to factory function
    this.emit(`// Converted from class ${name}`);
    this.emit(`${prefix}fn create${name}(${this.getConstructorParams(node)}) {`);
    this.indent++;
    
    // Create the object with methods
    this.emit('return {');
    this.indent++;
    
    const methods = node.body.body.filter(m => m.type === 'MethodDefinition' && m.kind === 'method');
    for (let i = 0; i < methods.length; i++) {
      const method = methods[i];
      const methodName = method.key.name;
      const params = method.value.params.map(p => this.visitPattern(p)).join(', ');
      
      this.emit(`${methodName}: fn(${params}) {`);
      this.indent++;
      
      for (const stmt of method.value.body.body) {
        this.visitNode(this.transformThisReferences(stmt));
      }
      
      this.indent--;
      const comma = i < methods.length - 1 ? ',' : '';
      this.emit(`}${comma}`);
    }
    
    this.indent--;
    this.emit('}');
    
    this.indent--;
    this.emit('}');
    this.emitEmpty();
  }

  getConstructorParams(classNode) {
    const constructor = classNode.body.body.find(
      m => m.type === 'MethodDefinition' && m.kind === 'constructor'
    );
    if (constructor) {
      return constructor.value.params.map(p => this.visitPattern(p)).join(', ');
    }
    return '';
  }

  transformThisReferences(node) {
    // Deep clone and transform this.x to x (captured from closure)
    // For simplicity, we'll handle this in expression generation
    return node;
  }

  visitExpressionStatement(node) {
    // Skip "use strict" directive
    if (node.expression.type === 'Literal' && node.expression.value === 'use strict') {
      return;
    }
    
    // Check for module.exports = ... -> expose dec
    if (node.expression.type === 'AssignmentExpression' &&
        node.expression.left.type === 'MemberExpression' &&
        node.expression.left.object.name === 'module' &&
        node.expression.left.property.name === 'exports') {
      const value = this.visitExpression(node.expression.right);
      this.emit(`expose dec exports = ${value}`);
      return;
    }
    
    const expr = this.visitExpression(node.expression);
    
    // Check for console.log -> print
    if (node.expression.type === 'CallExpression' &&
        node.expression.callee.type === 'MemberExpression' &&
        node.expression.callee.object.name === 'console' &&
        node.expression.callee.property.name === 'log') {
      const args = node.expression.arguments.map(a => this.visitExpression(a)).join(' + ');
      this.emit(`print ${args}`);
    } else {
      this.emit(expr);
    }
  }

  visitIfStatement(node) {
    // Convert to pattern matching syntax
    const test = this.visitExpression(node.test);
    this.emit(`|${test}| => {`);
    this.indent++;
    
    if (node.consequent.type === 'BlockStatement') {
      for (const stmt of node.consequent.body) {
        this.visitNode(stmt);
      }
    } else {
      this.visitNode(node.consequent);
    }
    
    this.indent--;
    this.emit('}');
    
    if (node.alternate) {
      if (node.alternate.type === 'IfStatement') {
        this.visitIfStatement(node.alternate);
      } else {
        // else block - use a catch-all pattern
        this.emit('|true| => {');
        this.indent++;
        if (node.alternate.type === 'BlockStatement') {
          for (const stmt of node.alternate.body) {
            this.visitNode(stmt);
          }
        } else {
          this.visitNode(node.alternate);
        }
        this.indent--;
        this.emit('}');
      }
    }
  }

  visitForStatement(node) {
    // Traditional for loop - convert to while
    if (node.init) {
      this.visitNode(node.init);
    }
    
    const test = node.test ? this.visitExpression(node.test) : 'true';
    this.emit(`while ${test} {`);
    this.indent++;
    
    if (node.body.type === 'BlockStatement') {
      for (const stmt of node.body.body) {
        this.visitNode(stmt);
      }
    } else {
      this.visitNode(node.body);
    }
    
    if (node.update) {
      this.emit(this.visitExpression(node.update));
    }
    
    this.indent--;
    this.emit('}');
  }

  visitForOfStatement(node) {
    const left = this.visitPattern(node.left.declarations ? node.left.declarations[0].id : node.left);
    const right = this.visitExpression(node.right);
    
    this.emit(`for ${left} in ${right} {`);
    this.indent++;
    
    if (node.body.type === 'BlockStatement') {
      for (const stmt of node.body.body) {
        this.visitNode(stmt);
      }
    } else {
      this.visitNode(node.body);
    }
    
    this.indent--;
    this.emit('}');
  }

  visitForInStatement(node) {
    // for...in iterates over keys
    const left = this.visitPattern(node.left.declarations ? node.left.declarations[0].id : node.left);
    const right = this.visitExpression(node.right);
    
    this.emit(`// Note: for...in iterates over keys`);
    this.emit(`for ${left} in Object.keys(${right}) {`);
    this.indent++;
    
    if (node.body.type === 'BlockStatement') {
      for (const stmt of node.body.body) {
        this.visitNode(stmt);
      }
    } else {
      this.visitNode(node.body);
    }
    
    this.indent--;
    this.emit('}');
  }

  visitWhileStatement(node) {
    const test = this.visitExpression(node.test);
    this.emit(`while ${test} {`);
    this.indent++;
    
    if (node.body.type === 'BlockStatement') {
      for (const stmt of node.body.body) {
        this.visitNode(stmt);
      }
    } else {
      this.visitNode(node.body);
    }
    
    this.indent--;
    this.emit('}');
  }

  visitReturnStatement(node) {
    if (node.argument) {
      this.emit(`return ${this.visitExpression(node.argument)}`);
    } else {
      this.emit('return');
    }
  }

  visitThrowStatement(node) {
    this.emit(`throw ${this.visitExpression(node.argument)}`);
  }

  visitTryStatement(node) {
    this.emit('try {');
    this.indent++;
    
    for (const stmt of node.block.body) {
      this.visitNode(stmt);
    }
    
    this.indent--;
    
    if (node.handler) {
      const param = node.handler.param ? node.handler.param.name : 'e';
      this.emit(`} catch(${param}) {`);
      this.indent++;
      
      for (const stmt of node.handler.body.body) {
        this.visitNode(stmt);
      }
      
      this.indent--;
    }
    
    if (node.finalizer) {
      this.emit('} finally {');
      this.indent++;
      
      for (const stmt of node.finalizer.body) {
        this.visitNode(stmt);
      }
      
      this.indent--;
    }
    
    this.emit('}');
  }

  visitBlockStatement(node) {
    this.emit('{');
    this.indent++;
    
    for (const stmt of node.body) {
      this.visitNode(stmt);
    }
    
    this.indent--;
    this.emit('}');
  }

  visitExportNamedDeclaration(node) {
    if (node.declaration) {
      if (node.declaration.type === 'FunctionDeclaration') {
        this.visitFunctionDeclaration(node.declaration, true);
      } else if (node.declaration.type === 'VariableDeclaration') {
        this.visitVariableDeclaration(node.declaration, true);
      } else if (node.declaration.type === 'ClassDeclaration') {
        this.visitClassDeclaration(node.declaration, true);
      }
    }
  }

  visitExportDefaultDeclaration(node) {
    this.emit('// Default export');
    if (node.declaration.type === 'FunctionDeclaration') {
      this.visitFunctionDeclaration(node.declaration, true);
    } else if (node.declaration.type === 'ClassDeclaration') {
      this.visitClassDeclaration(node.declaration, true);
    } else {
      this.emit(`expose dec default = ${this.visitExpression(node.declaration)}`);
    }
  }

  visitImportDeclaration(node) {
    const source = node.source.value;
    
    for (const spec of node.specifiers) {
      if (spec.type === 'ImportDefaultSpecifier') {
        this.emit(`// Import: ${spec.local.name} from "${source}"`);
        this.emit(`as ${spec.local.name} dep ${source.replace(/[\/\.]/g, '.')}`);
      } else if (spec.type === 'ImportSpecifier') {
        this.emit(`// Import: { ${spec.imported.name} } from "${source}"`);
        this.emit(`as ${spec.local.name} dep ${source.replace(/[\/\.]/g, '.')}`);
      }
    }
  }

  visitExpression(node) {
    if (!node) return '';
    
    switch (node.type) {
      case 'Identifier':
        return node.name;
      
      case 'Literal':
        if (typeof node.value === 'string') {
          return `"${node.value}"`;
        }
        return String(node.value);
      
      case 'TemplateLiteral':
        return this.visitTemplateLiteral(node);
      
      case 'BinaryExpression':
      case 'LogicalExpression':
        return `${this.visitExpression(node.left)} ${node.operator} ${this.visitExpression(node.right)}`;
      
      case 'UnaryExpression':
        return `${node.operator}${this.visitExpression(node.argument)}`;
      
      case 'UpdateExpression':
        if (node.prefix) {
          return `${node.operator}${this.visitExpression(node.argument)}`;
        }
        return `${this.visitExpression(node.argument)}${node.operator}`;
      
      case 'AssignmentExpression':
        return `${this.visitExpression(node.left)} ${node.operator} ${this.visitExpression(node.right)}`;
      
      case 'MemberExpression':
        if (node.object.type === 'ThisExpression') {
          // Transform this.x to just x (closure capture)
          return node.property.name;
        }
        if (node.computed) {
          return `${this.visitExpression(node.object)}[${this.visitExpression(node.property)}]`;
        }
        return `${this.visitExpression(node.object)}.${node.property.name}`;
      
      case 'CallExpression':
        const callee = this.visitExpression(node.callee);
        const args = node.arguments.map(a => this.visitExpression(a)).join(', ');
        return `${callee}(${args})`;
      
      case 'NewExpression':
        // Transform new X() to createX() or X()
        const className = this.visitExpression(node.callee);
        const newArgs = node.arguments.map(a => this.visitExpression(a)).join(', ');
        return `create${className}(${newArgs})`;
      
      case 'ArrayExpression':
        const elements = node.elements.map(e => {
          if (e && e.type === 'SpreadElement') {
            return `...${this.visitExpression(e.argument)}`;
          }
          return e ? this.visitExpression(e) : '';
        }).join(', ');
        return `[${elements}]`;
      
      case 'ObjectExpression':
        const props = node.properties.map(p => {
          if (p.type === 'SpreadElement') {
            return `...${this.visitExpression(p.argument)}`;
          }
          const key = p.key.type === 'Identifier' ? p.key.name : this.visitExpression(p.key);
          const value = this.visitExpression(p.value);
          if (p.shorthand) {
            return key;
          }
          return `${key}: ${value}`;
        }).join(', ');
        return `{ ${props} }`;
      
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        const fnParams = node.params.map(p => this.visitPattern(p)).join(', ');
        if (node.body.type === 'BlockStatement') {
          // Multi-line arrow function
          let body = [];
          for (const stmt of node.body.body) {
            // Simplified - just get the expression
            if (stmt.type === 'ReturnStatement' && stmt.argument) {
              body.push(`return ${this.visitExpression(stmt.argument)}`);
            }
          }
          return `fn(${fnParams}) { ${body.join('; ')} }`;
        }
        return `${fnParams} => ${this.visitExpression(node.body)}`;
      
      case 'ConditionalExpression':
        return `${this.visitExpression(node.test)} ? ${this.visitExpression(node.consequent)} : ${this.visitExpression(node.alternate)}`;
      
      case 'ThisExpression':
        return '/* this */';
      
      case 'SpreadElement':
        return `...${this.visitExpression(node.argument)}`;
      
      case 'AwaitExpression':
        return `await ${this.visitExpression(node.argument)}`;
      
      default:
        return `/* ${node.type} */`;
    }
  }

  visitTemplateLiteral(node) {
    let result = '"';
    for (let i = 0; i < node.quasis.length; i++) {
      result += node.quasis[i].value.raw;
      if (i < node.expressions.length) {
        result += '" + ' + this.visitExpression(node.expressions[i]) + ' + "';
      }
    }
    result += '"';
    return result;
  }

  visitPattern(node) {
    if (node.type === 'Identifier') {
      return node.name;
    }
    if (node.type === 'AssignmentPattern') {
      return `${node.left.name} = ${this.visitExpression(node.right)}`;
    }
    if (node.type === 'RestElement') {
      return `...${node.argument.name}`;
    }
    return '/* pattern */';
  }
}

export function convertJS(jsSource) {
  const converter = new JS2KM();
  return converter.convert(jsSource);
}
