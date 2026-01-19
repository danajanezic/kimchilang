// KimchiLang Code Generator - Converts AST to JavaScript

import { NodeType } from './parser.js';

export class CodeGenerator {
  constructor(options = {}) {
    this.indent = 0;
    this.indentStr = options.indentStr || '  ';
    this.output = '';
  }

  generate(ast) {
    this.output = '';
    this.visitProgram(ast);
    return this.output;
  }

  emit(code) {
    this.output += code;
  }

  emitLine(code = '') {
    this.output += this.getIndent() + code + '\n';
  }

  getIndent() {
    return this.indentStr.repeat(this.indent);
  }

  pushIndent() {
    this.indent++;
  }

  popIndent() {
    this.indent--;
  }

  emitRuntimeExtensions() {
    // Extend Array prototype with stdlib methods
    this.emitLine('// KimchiLang stdlib extensions');
    this.emitLine('if (!Array.prototype._kmExtended) {');
    this.pushIndent();
    this.emitLine('Array.prototype._kmExtended = true;');
    this.emitLine('Array.prototype.first = function() { return this[0]; };');
    this.emitLine('Array.prototype.last = function() { return this[this.length - 1]; };');
    this.emitLine('Array.prototype.isEmpty = function() { return this.length === 0; };');
    this.emitLine('Array.prototype.sum = function() { return this.reduce((a, b) => a + b, 0); };');
    this.emitLine('Array.prototype.product = function() { return this.reduce((a, b) => a * b, 1); };');
    this.emitLine('Array.prototype.average = function() { return this.reduce((a, b) => a + b, 0) / this.length; };');
    this.emitLine('Array.prototype.max = function() { return Math.max(...this); };');
    this.emitLine('Array.prototype.min = function() { return Math.min(...this); };');
    this.emitLine('Array.prototype.take = function(n) { return this.slice(0, n); };');
    this.emitLine('Array.prototype.drop = function(n) { return this.slice(n); };');
    this.emitLine('Array.prototype.flatten = function() { return this.flat(Infinity); };');
    this.emitLine('Array.prototype.unique = function() { return [...new Set(this)]; };');
    this.popIndent();
    this.emitLine('}');
    
    // Extend String prototype with stdlib methods
    this.emitLine('if (!String.prototype._kmExtended) {');
    this.pushIndent();
    this.emitLine('String.prototype._kmExtended = true;');
    this.emitLine('String.prototype.isEmpty = function() { return this.length === 0; };');
    this.emitLine('String.prototype.isBlank = function() { return this.trim().length === 0; };');
    this.emitLine('String.prototype.toChars = function() { return this.split(""); };');
    this.emitLine('String.prototype.toLines = function() { return this.split("\\n"); };');
    this.emitLine('String.prototype.capitalize = function() { return this.length === 0 ? this : this[0].toUpperCase() + this.slice(1); };');
    this.popIndent();
    this.emitLine('}');
    
    // Add Object utility functions (can't extend Object.prototype safely)
    this.emitLine('const _obj = {');
    this.pushIndent();
    this.emitLine('keys: (o) => Object.keys(o),');
    this.emitLine('values: (o) => Object.values(o),');
    this.emitLine('entries: (o) => Object.entries(o),');
    this.emitLine('fromEntries: (arr) => Object.fromEntries(arr),');
    this.emitLine('has: (o, k) => Object.hasOwn(o, k),');
    this.emitLine('freeze: (o) => Object.freeze(o),');
    this.emitLine('isEmpty: (o) => Object.keys(o).length === 0,');
    this.emitLine('size: (o) => Object.keys(o).length,');
    this.popIndent();
    this.emitLine('};');
    this.emitLine();
    
    // Add error helper function for typed errors
    this.emitLine('function error(message, name = "Error") {');
    this.pushIndent();
    this.emitLine('const e = new Error(message);');
    this.emitLine('e.name = name;');
    this.emitLine('return e;');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('error.create = (name) => {');
    this.pushIndent();
    this.emitLine('const fn = (message) => error(message, name);');
    this.emitLine('Object.defineProperty(fn, "name", { value: name, writable: false });');
    this.emitLine('return fn;');
    this.popIndent();
    this.emitLine('};');
    this.emitLine();
    
    // Secret wrapper class - masks value when converted to string
    this.emitLine('class _Secret {');
    this.pushIndent();
    this.emitLine('constructor(value) { this._value = value; }');
    this.emitLine('toString() { return "********"; }');
    this.emitLine('valueOf() { return this._value; }');
    this.emitLine('get value() { return this._value; }');
    this.emitLine('[Symbol.toPrimitive](hint) { return hint === "string" ? "********" : this._value; }');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('function _secret(value) { return new _Secret(value); }');
    this.emitLine();
    
    // Deep freeze helper for dec declarations
    this.emitLine('function _deepFreeze(obj) {');
    this.pushIndent();
    this.emitLine('if (obj === null || typeof obj !== "object") return obj;');
    this.emitLine('Object.keys(obj).forEach(key => _deepFreeze(obj[key]));');
    this.emitLine('return Object.freeze(obj);');
    this.popIndent();
    this.emitLine('}');
    this.emitLine();
    
    // Testing framework runtime
    this.emitLine('// Testing framework');
    this.emitLine('const _tests = [];');
    this.emitLine('let _currentDescribe = null;');
    this.emitLine('function _describe(name, fn) {');
    this.pushIndent();
    this.emitLine('const prev = _currentDescribe;');
    this.emitLine('_currentDescribe = { name, tests: [], parent: prev };');
    this.emitLine('fn();');
    this.emitLine('if (prev) { prev.tests.push(_currentDescribe); }');
    this.emitLine('else { _tests.push(_currentDescribe); }');
    this.emitLine('_currentDescribe = prev;');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('function _test(name, fn) {');
    this.pushIndent();
    this.emitLine('const test = { name, fn, describe: _currentDescribe };');
    this.emitLine('if (_currentDescribe) { _currentDescribe.tests.push(test); }');
    this.emitLine('else { _tests.push(test); }');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('function _expect(actual) {');
    this.pushIndent();
    this.emitLine('return {');
    this.pushIndent();
    this.emitLine('toBe(expected) { if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`); },');
    this.emitLine('toEqual(expected) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)} to equal ${JSON.stringify(actual)}`); },');
    this.emitLine('toContain(item) { if (!actual.includes(item)) throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`); },');
    this.emitLine('toBeNull() { if (actual !== null) throw new Error(`Expected null but got ${JSON.stringify(actual)}`); },');
    this.emitLine('toBeTruthy() { if (!actual) throw new Error(`Expected truthy but got ${JSON.stringify(actual)}`); },');
    this.emitLine('toBeFalsy() { if (actual) throw new Error(`Expected falsy but got ${JSON.stringify(actual)}`); },');
    this.emitLine('toBeGreaterThan(n) { if (actual <= n) throw new Error(`Expected ${actual} > ${n}`); },');
    this.emitLine('toBeLessThan(n) { if (actual >= n) throw new Error(`Expected ${actual} < ${n}`); },');
    this.emitLine('toHaveLength(n) { if (actual.length !== n) throw new Error(`Expected length ${n} but got ${actual.length}`); },');
    this.emitLine('toMatch(pattern) { if (!pattern.test(actual)) throw new Error(`Expected ${JSON.stringify(actual)} to match ${pattern}`); },');
    this.emitLine('toThrow(msg) { try { actual(); throw new Error("Expected to throw"); } catch(e) { if (msg && !e.message.includes(msg)) throw new Error(`Expected error containing "${msg}" but got "${e.message}"`); } },');
    this.popIndent();
    this.emitLine('};');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('function _assert(condition, message) { if (!condition) throw new Error(message); }');
    this.emitLine('async function _runTests() {');
    this.pushIndent();
    this.emitLine('let passed = 0, failed = 0;');
    this.emitLine('async function runItem(item, indent = "") {');
    this.pushIndent();
    this.emitLine('if (item.fn) {');
    this.pushIndent();
    this.emitLine('try { await item.fn(); console.log(indent + "✓ " + item.name); passed++; }');
    this.emitLine('catch (e) { console.log(indent + "✗ " + item.name); console.log(indent + "  " + e.message); failed++; }');
    this.popIndent();
    this.emitLine('} else {');
    this.pushIndent();
    this.emitLine('console.log(indent + item.name);');
    this.emitLine('for (const t of item.tests) await runItem(t, indent + "  ");');
    this.popIndent();
    this.emitLine('}');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('for (const item of _tests) await runItem(item);');
    this.emitLine('console.log(`\\n${passed + failed} tests, ${passed} passed, ${failed} failed`);');
    this.emitLine('return { passed, failed };');
    this.popIndent();
    this.emitLine('}');
    this.emitLine();
  }

  visit(node) {
    if (!node) return '';
    
    const methodName = `visit${node.type}`;
    if (this[methodName]) {
      return this[methodName](node);
    }
    
    throw new Error(`Unknown node type: ${node.type}`);
  }

  visitProgram(node) {
    // Separate deps, args, env, dec declarations, and other statements
    const depStatements = node.body.filter(stmt => stmt.type === NodeType.DepStatement);
    const argDeclarations = node.body.filter(stmt => stmt.type === NodeType.ArgDeclaration);
    const envDeclarations = node.body.filter(stmt => stmt.type === NodeType.EnvDeclaration);
    const decDeclarations = node.body.filter(stmt => stmt.type === NodeType.DecDeclaration);
    const otherStatements = node.body.filter(stmt => 
      stmt.type !== NodeType.DepStatement && stmt.type !== NodeType.ArgDeclaration && stmt.type !== NodeType.EnvDeclaration
    );
    
    // Build list of dep paths for distinguishing deps from args in _opts
    const depPaths = depStatements.map(dep => dep.path);
    const argNames = argDeclarations.map(arg => arg.name);
    
    // First, emit the raw imports for all dependencies
    for (const dep of depStatements) {
      const filePath = './' + dep.pathParts.join('/') + '.km';
      const moduleVar = `_dep_${dep.alias}`;
      this.emitLine(`import ${moduleVar} from '${filePath}';`);
    }
    if (depStatements.length > 0) {
      this.emitLine();
    }
    
    // Emit stdlib prototype extensions
    this.emitRuntimeExtensions();
    
    // Export default factory function
    this.emitLine('export default function(_opts = {}) {');
    this.pushIndent();
    
    // Validate required args
    for (const arg of argDeclarations) {
      if (arg.required) {
        this.emitLine(`if (_opts["${arg.name}"] === undefined) throw new Error("Required argument '${arg.name}' not provided");`);
      }
    }
    if (argDeclarations.some(a => a.required)) {
      this.emitLine();
    }
    
    // Extract args from _opts with defaults
    for (const arg of argDeclarations) {
      const secretWrap = arg.secret ? '_secret(' : '';
      const secretClose = arg.secret ? ')' : '';
      if (arg.defaultValue) {
        const defaultCode = this.visitExpression(arg.defaultValue);
        this.emitLine(`const ${arg.name} = ${secretWrap}_opts["${arg.name}"] !== undefined ? _opts["${arg.name}"] : ${defaultCode}${secretClose};`);
      } else {
        this.emitLine(`const ${arg.name} = ${secretWrap}_opts["${arg.name}"]${secretClose};`);
      }
    }
    if (argDeclarations.length > 0) {
      this.emitLine();
    }
    
    // Extract env vars from process.env
    for (const env of envDeclarations) {
      if (env.required) {
        this.emitLine(`if (process.env["${env.name}"] === undefined) throw new Error("Required environment variable '${env.name}' not set");`);
      }
    }
    if (envDeclarations.some(e => e.required)) {
      this.emitLine();
    }
    
    for (const env of envDeclarations) {
      const secretWrap = env.secret ? '_secret(' : '';
      const secretClose = env.secret ? ')' : '';
      if (env.defaultValue) {
        const defaultCode = this.visitExpression(env.defaultValue);
        this.emitLine(`const ${env.name} = ${secretWrap}process.env["${env.name}"] !== undefined ? process.env["${env.name}"] : ${defaultCode}${secretClose};`);
      } else {
        this.emitLine(`const ${env.name} = ${secretWrap}process.env["${env.name}"]${secretClose};`);
      }
    }
    if (envDeclarations.length > 0) {
      this.emitLine();
    }
    
    // Resolve each dependency, checking _opts first (for injection)
    for (const dep of depStatements) {
      const moduleVar = `_dep_${dep.alias}`;
      if (dep.overrides) {
        const overridesCode = this.visitExpression(dep.overrides);
        this.emitLine(`const ${dep.alias} = _opts["${dep.path}"] || ${moduleVar}(${overridesCode});`);
      } else {
        this.emitLine(`const ${dep.alias} = _opts["${dep.path}"] || ${moduleVar}();`);
      }
    }
    if (depStatements.length > 0) {
      this.emitLine();
    }
    
    // Emit the rest of the module body (top-level statements)
    for (const stmt of otherStatements) {
      this.visitStatement(stmt, true);
    }
    
    // Return an object with all exported values (collect exports)
    const exports = this.collectExports(otherStatements);
    if (exports.length > 0) {
      this.emitLine();
      this.emitLine(`return { ${exports.join(', ')} };`);
    }
    
    this.popIndent();
    this.emitLine('}');
  }

  collectExports(statements) {
    const exports = [];
    for (const stmt of statements) {
      // Only export items marked with 'expose'
      if (!stmt.exposed) continue;
      
      if (stmt.type === NodeType.FunctionDeclaration) {
        exports.push(stmt.name);
      } else if (stmt.type === NodeType.DecDeclaration) {
        exports.push(stmt.name);
      }
    }
    return exports;
  }

  visitStatement(node, isTopLevel = false) {
    switch (node.type) {
      case NodeType.DecDeclaration:
        this.visitDecDeclaration(node);
        break;
      case NodeType.FunctionDeclaration:
        this.visitFunctionDeclaration(node);
        break;
      case NodeType.IfStatement:
        this.visitIfStatement(node);
        break;
      case NodeType.WhileStatement:
        this.visitWhileStatement(node);
        break;
      case NodeType.ForInStatement:
        this.visitForInStatement(node);
        break;
      case NodeType.ReturnStatement:
        this.visitReturnStatement(node);
        break;
      case NodeType.BreakStatement:
        this.emitLine('break;');
        break;
      case NodeType.ContinueStatement:
        this.emitLine('continue;');
        break;
      case NodeType.TryStatement:
        this.visitTryStatement(node);
        break;
      case NodeType.ThrowStatement:
        this.visitThrowStatement(node);
        break;
      case NodeType.PatternMatch:
        this.visitPatternMatch(node, isTopLevel);
        break;
      case NodeType.PrintStatement:
        this.visitPrintStatement(node);
        break;
      case NodeType.DepStatement:
        this.visitDepStatement(node);
        break;
      case NodeType.EnumDeclaration:
        this.visitEnumDeclaration(node);
        break;
      case NodeType.ArgDeclaration:
        // Args are handled in visitProgram, not individually
        break;
      case NodeType.EnvDeclaration:
        // Env vars are handled in visitProgram, not individually
        break;
      case NodeType.JSBlock:
        this.visitJSBlock(node);
        break;
      case NodeType.TestBlock:
        this.visitTestBlock(node);
        break;
      case NodeType.DescribeBlock:
        this.visitDescribeBlock(node);
        break;
      case NodeType.ExpectStatement:
        this.visitExpectStatement(node);
        break;
      case NodeType.AssertStatement:
        this.visitAssertStatement(node);
        break;
      case NodeType.ExpressionStatement:
        this.emitLine(this.visitExpression(node.expression) + ';');
        break;
      case NodeType.BlockStatement:
        this.visitBlockStatement(node);
        break;
      default:
        throw new Error(`Unknown statement type: ${node.type}`);
    }
  }

  visitDecDeclaration(node) {
    // dec creates deeply immutable variables using Object.freeze recursively
    let init = this.visitExpression(node.init);
    
    // Wrap with _secret() if marked as secret
    if (node.secret) {
      init = `_secret(${init})`;
    }
    
    if (node.destructuring) {
      // Handle destructuring patterns
      if (node.pattern.type === NodeType.ObjectPattern) {
        // Object destructuring: const { a, b } = _deepFreeze(obj);
        const props = node.pattern.properties.map(p => {
          if (p.key === p.value) {
            return p.key;
          }
          return `${p.key}: ${p.value}`;
        }).join(', ');
        this.emitLine(`const { ${props} } = _deepFreeze(${init});`);
      } else if (node.pattern.type === NodeType.ArrayPattern) {
        // Array destructuring: const [x, y] = _deepFreeze(arr);
        const elems = node.pattern.elements.map(e => {
          if (e === null) return '';
          return e.name;
        }).join(', ');
        this.emitLine(`const [${elems}] = _deepFreeze(${init});`);
      }
    } else {
      this.emitLine(`const ${node.name} = _deepFreeze(${init});`);
    }
  }

  visitFunctionDeclaration(node) {
    const async = node.async ? 'async ' : '';
    const params = this.generateParams(node.params);
    
    if (node.memoized) {
      // Generate memoized function
      this.emitLine(`const ${node.name} = (() => {`);
      this.pushIndent();
      this.emitLine('const _cache = new Map();');
      this.emitLine(`return ${async}function(${params}) {`);
      this.pushIndent();
      this.emitLine('const _key = JSON.stringify([...arguments]);');
      this.emitLine('if (_cache.has(_key)) return _cache.get(_key);');
      // Generate function body, capturing the result
      // For async functions, the inner IIFE must also be async and awaited
      if (node.async) {
        this.emitLine('const _result = await (async () => {');
      } else {
        this.emitLine('const _result = (() => {');
      }
      this.pushIndent();
      for (const stmt of node.body.body) {
        this.visitStatement(stmt);
      }
      this.popIndent();
      this.emitLine('})();');
      this.emitLine('_cache.set(_key, _result);');
      this.emitLine('return _result;');
      this.popIndent();
      this.emitLine('};');
      this.popIndent();
      this.emitLine('})();');
    } else {
      this.emitLine(`${async}function ${node.name}(${params}) {`);
      this.pushIndent();
      for (const stmt of node.body.body) {
        this.visitStatement(stmt);
      }
      this.popIndent();
      this.emitLine('}');
    }
    this.emitLine();
  }

  visitEnumDeclaration(node) {
    // Generate enum as a frozen object with auto-incrementing values
    this.emitLine(`const ${node.name} = Object.freeze({`);
    this.pushIndent();
    
    let autoValue = 0;
    for (let i = 0; i < node.members.length; i++) {
      const member = node.members[i];
      let value;
      
      if (member.value !== null) {
        value = this.visitExpression(member.value);
        // If it's a number literal, update autoValue for next member
        if (member.value.type === NodeType.Literal && typeof member.value.value === 'number') {
          autoValue = member.value.value + 1;
        }
      } else {
        value = autoValue;
        autoValue++;
      }
      
      const comma = i < node.members.length - 1 ? ',' : '';
      this.emitLine(`${member.name}: ${value}${comma}`);
    }
    
    this.popIndent();
    this.emitLine('});');
    this.emitLine();
  }

  visitJSBlock(node) {
    // JS interop block - wraps raw JavaScript in an IIFE with optional inputs
    // Syntax: js { code }         -> (() => { code })();
    //         js(a, b) { code }   -> ((a, b) => { code })(a, b);
    
    if (node.inputs.length === 0) {
      // No inputs - simple IIFE
      this.emitLine('(() => {');
      this.pushIndent();
      // Emit the raw JS code, preserving formatting
      const lines = node.code.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          this.emitLine(line.trim());
        }
      }
      this.popIndent();
      this.emitLine('})();');
    } else {
      // With inputs - IIFE that receives kimchi variables
      const params = node.inputs.join(', ');
      this.emitLine(`((${params}) => {`);
      this.pushIndent();
      const lines = node.code.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          this.emitLine(line.trim());
        }
      }
      this.popIndent();
      this.emitLine(`})(${params});`);
    }
    this.emitLine();
  }

  visitJSBlockExpression(node) {
    // JS block as expression - returns an IIFE that can be assigned
    // Syntax: dec result = js(a, b) { return a + b; }
    // Generates: ((a, b) => { return a + b; })(a, b)
    
    const lines = node.code.split('\n').filter(l => l.trim()).map(l => l.trim()).join(' ');
    
    if (node.inputs.length === 0) {
      return `(() => { ${lines} })()`;
    } else {
      const params = node.inputs.join(', ');
      return `((${params}) => { ${lines} })(${params})`;
    }
  }

  generateParams(params) {
    return params.map(p => {
      if (p.type === 'RestElement') {
        return `...${p.argument}`;
      }
      if (p.defaultValue) {
        return `${p.name} = ${this.visitExpression(p.defaultValue)}`;
      }
      return p.name;
    }).join(', ');
  }

  visitBlockStatement(node) {
    this.emitLine('{');
    this.pushIndent();
    for (const stmt of node.body) {
      this.visitStatement(stmt);
    }
    this.popIndent();
    this.emitLine('}');
  }

  visitIfStatement(node, isElseIf = false) {
    const prefix = isElseIf ? '' : this.getIndent();
    this.emit(prefix + `if (${this.visitExpression(node.test)}) {\n`);
    this.pushIndent();
    for (const stmt of node.consequent.body) {
      this.visitStatement(stmt);
    }
    this.popIndent();
    
    if (node.alternate) {
      if (node.alternate.type === NodeType.IfStatement) {
        this.emit(this.getIndent() + '} else ');
        this.visitIfStatement(node.alternate, true);
      } else {
        this.emitLine('} else {');
        this.pushIndent();
        for (const stmt of node.alternate.body) {
          this.visitStatement(stmt);
        }
        this.popIndent();
        this.emitLine('}');
      }
    } else {
      this.emitLine('}');
    }
  }

  visitWhileStatement(node) {
    this.emitLine(`while (${this.visitExpression(node.test)}) {`);
    this.pushIndent();
    for (const stmt of node.body.body) {
      this.visitStatement(stmt);
    }
    this.popIndent();
    this.emitLine('}');
  }

  visitForInStatement(node) {
    const iterable = this.visitExpression(node.iterable);
    this.emitLine(`for (const ${node.variable} of ${iterable}) {`);
    this.pushIndent();
    for (const stmt of node.body.body) {
      this.visitStatement(stmt);
    }
    this.popIndent();
    this.emitLine('}');
  }

  visitReturnStatement(node) {
    if (node.argument) {
      this.emitLine(`return ${this.visitExpression(node.argument)};`);
    } else {
      this.emitLine('return;');
    }
  }

  visitTryStatement(node) {
    this.emitLine('try {');
    this.pushIndent();
    for (const stmt of node.block.body) {
      this.visitStatement(stmt);
    }
    this.popIndent();
    
    if (node.handler) {
      const param = node.handler.param ? `(${node.handler.param})` : '';
      this.emitLine(`} catch ${param} {`);
      this.pushIndent();
      for (const stmt of node.handler.body.body) {
        this.visitStatement(stmt);
      }
      this.popIndent();
    }
    
    if (node.finalizer) {
      this.emitLine('} finally {');
      this.pushIndent();
      for (const stmt of node.finalizer.body) {
        this.visitStatement(stmt);
      }
      this.popIndent();
    }
    
    this.emitLine('}');
  }

  visitThrowStatement(node) {
    this.emitLine(`throw ${this.visitExpression(node.argument)};`);
  }

  visitPatternMatch(node, isTopLevel = false) {
    // Standalone pattern matching: |condition| => code
    // At top level: use if/else if chain (no return)
    // Inside function: each case returns from the function when matched
    for (let i = 0; i < node.cases.length; i++) {
      const matchCase = node.cases[i];
      const condition = this.visitExpression(matchCase.test);
      
      // Use else if for subsequent cases
      const prefix = i === 0 ? 'if' : '} else if';
      if (i > 0) {
        this.popIndent();
      }
      this.emitLine(`${prefix} (${condition}) {`);
      this.pushIndent();
      
      if (matchCase.consequent.type === NodeType.BlockStatement) {
        for (const stmt of matchCase.consequent.body) {
          this.visitStatement(stmt);
        }
      } else {
        this.visitStatement(matchCase.consequent);
      }
      
      // Only add return inside functions, not at top level
      if (!isTopLevel) {
        this.emitLine('return;');
      }
    }
    
    // Close the final if block
    if (node.cases.length > 0) {
      this.popIndent();
      this.emitLine('}');
    }
  }

  visitPrintStatement(node) {
    this.emitLine(`console.log(${this.visitExpression(node.argument)});`);
  }

  visitDepStatement(node) {
    // Convert dotted path to file path: project.salesforce.client -> ./project/salesforce/client.km
    const filePath = './' + node.pathParts.join('/') + '.km';
    
    // Import the module (which exports a factory function)
    const moduleVar = `_dep_${node.alias}`;
    this.emitLine(`import ${moduleVar} from '${filePath}';`);
    
    // Call the factory function with optional overrides to get the actual module
    if (node.overrides) {
      const overridesCode = this.visitExpression(node.overrides);
      this.emitLine(`const ${node.alias} = ${moduleVar}(${overridesCode});`);
    } else {
      this.emitLine(`const ${node.alias} = ${moduleVar}();`);
    }
  }

  visitExpression(node) {
    switch (node.type) {
      case NodeType.Literal:
        return this.visitLiteral(node);
      case NodeType.Identifier:
        return node.name;
      case NodeType.BinaryExpression:
        return this.visitBinaryExpression(node);
      case NodeType.UnaryExpression:
        return this.visitUnaryExpression(node);
      case NodeType.AssignmentExpression:
        return this.visitAssignmentExpression(node);
      case NodeType.CallExpression:
        return this.visitCallExpression(node);
      case NodeType.MemberExpression:
        return this.visitMemberExpression(node);
      case NodeType.ArrayExpression:
        return this.visitArrayExpression(node);
      case NodeType.ObjectExpression:
        return this.visitObjectExpression(node);
      case NodeType.ArrowFunctionExpression:
        return this.visitArrowFunctionExpression(node);
      case NodeType.ConditionalExpression:
        return this.visitConditionalExpression(node);
      case NodeType.AwaitExpression:
        return `await ${this.visitExpression(node.argument)}`;
      case NodeType.SpreadElement:
        return `...${this.visitExpression(node.argument)}`;
      case NodeType.RangeExpression:
        return this.visitRangeExpression(node);
      case NodeType.FlowExpression:
        return this.visitFlowExpression(node);
      case NodeType.PipeExpression:
        return this.visitPipeExpression(node);
      case NodeType.TemplateLiteral:
        return this.visitTemplateLiteral(node);
      case NodeType.JSBlock:
        return this.visitJSBlockExpression(node);
      default:
        throw new Error(`Unknown expression type: ${node.type}`);
    }
  }

  visitLiteral(node) {
    // Numbers - use raw value to preserve format (hex, binary, etc)
    if (node.isNumber) {
      return node.raw;
    }
    // Strings
    if (node.isString || typeof node.value === 'string') {
      // Check if it's a template string
      if (node.raw && node.raw.startsWith('`')) {
        return node.raw;
      }
      return JSON.stringify(node.value);
    }
    if (node.value === null) {
      return 'null';
    }
    if (typeof node.value === 'boolean') {
      return node.value ? 'true' : 'false';
    }
    return String(node.raw || node.value);
  }

  visitBinaryExpression(node) {
    const left = this.visitExpression(node.left);
    const right = this.visitExpression(node.right);
    
    // Handle 'is' operator - compares .name properties
    if (node.operator === 'is') {
      return `(${left}?.name === ${right}?.name)`;
    }
    
    // Handle 'is not' operator - negated .name comparison
    if (node.operator === 'is not') {
      return `(${left}?.name !== ${right}?.name)`;
    }
    
    return `(${left} ${node.operator} ${right})`;
  }

  visitUnaryExpression(node) {
    const argument = this.visitExpression(node.argument);
    if (node.operator === '!' || node.operator === '~' || node.operator === '-') {
      return `${node.operator}${argument}`;
    }
    return `${node.operator} ${argument}`;
  }

  visitAssignmentExpression(node) {
    const left = this.visitExpression(node.left);
    const right = this.visitExpression(node.right);
    return `${left} ${node.operator} ${right}`;
  }

  visitCallExpression(node) {
    const callee = this.visitExpression(node.callee);
    const args = node.arguments.map(a => this.visitExpression(a)).join(', ');
    return `${callee}(${args})`;
  }

  visitMemberExpression(node) {
    const object = this.visitExpression(node.object);
    if (node.computed) {
      const property = this.visitExpression(node.property);
      // Use optional chaining for safe access
      return `${object}?.[${property}]`;
    }
    // Use optional chaining for safe access
    return `${object}?.${node.property}`;
  }

  visitArrayExpression(node) {
    const elements = node.elements.map(e => this.visitExpression(e)).join(', ');
    return `[${elements}]`;
  }

  visitObjectExpression(node) {
    if (node.properties.length === 0) {
      return '{}';
    }
    
    const props = node.properties.map(p => {
      // Handle spread element
      if (p.type === NodeType.SpreadElement) {
        return `...${this.visitExpression(p.argument)}`;
      }
      
      const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(p.key) ? p.key : JSON.stringify(p.key);
      const value = this.visitExpression(p.value);
      
      if (p.shorthand && p.value.type === NodeType.Identifier && p.value.name === p.key) {
        return key;
      }
      return `${key}: ${value}`;
    }).join(', ');
    
    return `{ ${props} }`;
  }

  visitArrowFunctionExpression(node) {
    const params = this.generateParams(node.params);
    const paramsStr = node.params.length === 1 && !node.params[0].defaultValue 
      ? node.params[0].name 
      : `(${params})`;
    
    if (node.body.type === NodeType.BlockStatement) {
      const bodyLines = [];
      const savedOutput = this.output;
      this.output = '';
      this.pushIndent();
      for (const stmt of node.body.body) {
        this.visitStatement(stmt);
      }
      this.popIndent();
      const bodyContent = this.output;
      this.output = savedOutput;
      return `${paramsStr} => {\n${bodyContent}${this.getIndent()}}`;
    }
    
    const body = this.visitExpression(node.body);
    return `${paramsStr} => ${body}`;
  }

  visitConditionalExpression(node) {
    const test = this.visitExpression(node.test);
    const consequent = this.visitExpression(node.consequent);
    const alternate = this.visitExpression(node.alternate);
    return `(${test} ? ${consequent} : ${alternate})`;
  }

  visitRangeExpression(node) {
    const start = this.visitExpression(node.start);
    const end = this.visitExpression(node.end);
    return `Array.from({ length: ${end} - ${start} }, (_, i) => ${start} + i)`;
  }

  visitFlowExpression(node) {
    // Flow: composedFn >> fn1 fn2 fn3
    // Generates: const composedFn = (...args) => fn3(fn2(fn1(...args)));
    const { name, functions } = node;
    
    if (functions.length === 0) {
      return `const ${name} = (x) => x`;
    }
    
    // Build nested function calls from first to last
    // The composed function takes args and passes them to the first function
    let result = `${functions[0]}(..._args)`;
    
    for (let i = 1; i < functions.length; i++) {
      result = `${functions[i]}(${result})`;
    }
    
    return `const ${name} = (..._args) => ${result}`;
  }

  visitPipeExpression(node) {
    // Pipe: value ~> fn1 ~> fn2
    // Generates: fn2(fn1(value))
    const left = this.visitExpression(node.left);
    const right = this.visitExpression(node.right);
    
    // The right side is a function that receives the left side as argument
    return `${right}(${left})`;
  }

  visitTemplateLiteral(node) {
    // Convert KimchiLang string interpolation to JavaScript template literal
    // node.parts contains string segments, node.expressions contains parsed AST nodes
    let result = '`';
    
    for (let i = 0; i < node.parts.length; i++) {
      // Escape backticks in the string parts
      result += node.parts[i].replace(/`/g, '\\`');
      
      // Add expression if there is one after this part
      if (i < node.expressions.length) {
        result += '${' + this.visitExpression(node.expressions[i]) + '}';
      }
    }
    
    result += '`';
    return result;
  }
  
  // Testing framework code generation
  visitTestBlock(node) {
    this.emitLine(`_test(${JSON.stringify(node.name)}, async () => {`);
    this.pushIndent();
    for (const stmt of node.body.body) {
      this.visitStatement(stmt);
    }
    this.popIndent();
    this.emitLine('});');
  }
  
  visitDescribeBlock(node) {
    this.emitLine(`_describe(${JSON.stringify(node.name)}, () => {`);
    this.pushIndent();
    for (const stmt of node.body.body) {
      this.visitStatement(stmt);
    }
    this.popIndent();
    this.emitLine('});');
  }
  
  visitExpectStatement(node) {
    const actual = this.visitExpression(node.actual);
    const matcher = node.matcher;
    const expected = node.expected ? this.visitExpression(node.expected) : '';
    
    // Generate appropriate assertion based on matcher
    switch (matcher) {
      case 'toBe':
        this.emitLine(`_expect(${actual}).toBe(${expected});`);
        break;
      case 'toEqual':
        this.emitLine(`_expect(${actual}).toEqual(${expected});`);
        break;
      case 'toContain':
        this.emitLine(`_expect(${actual}).toContain(${expected});`);
        break;
      case 'toBeNull':
        this.emitLine(`_expect(${actual}).toBeNull();`);
        break;
      case 'toBeTruthy':
        this.emitLine(`_expect(${actual}).toBeTruthy();`);
        break;
      case 'toBeFalsy':
        this.emitLine(`_expect(${actual}).toBeFalsy();`);
        break;
      case 'toBeGreaterThan':
        this.emitLine(`_expect(${actual}).toBeGreaterThan(${expected});`);
        break;
      case 'toBeLessThan':
        this.emitLine(`_expect(${actual}).toBeLessThan(${expected});`);
        break;
      case 'toThrow':
        this.emitLine(`_expect(${actual}).toThrow(${expected});`);
        break;
      case 'toMatch':
        this.emitLine(`_expect(${actual}).toMatch(${expected});`);
        break;
      case 'toHaveLength':
        this.emitLine(`_expect(${actual}).toHaveLength(${expected});`);
        break;
      default:
        // Generic matcher
        this.emitLine(`_expect(${actual}).${matcher}(${expected});`);
    }
  }
  
  visitAssertStatement(node) {
    const condition = this.visitExpression(node.condition);
    const message = node.message ? this.visitExpression(node.message) : JSON.stringify('Assertion failed');
    this.emitLine(`_assert(${condition}, ${message});`);
  }
}

export function generate(ast, options = {}) {
  const generator = new CodeGenerator(options);
  return generator.generate(ast);
}
