// KimchiLang Code Generator - Converts AST to JavaScript

import { NodeType } from './parser.js';

// Helper to check if a node or its children contain shell blocks
function containsShellBlock(node) {
  if (!node) return false;
  if (node.type === NodeType.ShellBlock) return true;
  
  // Check all properties that could contain child nodes
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && containsShellBlock(item)) {
          return true;
        }
      }
    } else if (value && typeof value === 'object' && value.type) {
      if (containsShellBlock(value)) return true;
    }
  }
  return false;
}

export class CodeGenerator {
  constructor(options = {}) {
    this.indent = 0;
    this.indentStr = options.indentStr || '  ';
    this.output = '';
    this.options = options;
    this.decVariables = new Set();
    this.knownShapes = new Map(); // Map<name, shapeTree> for ?. optimization
  }

  buildShapeTree(node) {
    if (!node) return true;

    if (node.type === NodeType.Literal || node.type === NodeType.TemplateLiteral) {
      return true; // primitive — non-null
    }

    if (node.type === NodeType.ArrayExpression) {
      return true; // array — non-null, elements unknown
    }

    if (node.type === NodeType.ObjectExpression) {
      const shape = {};
      for (const prop of node.properties) {
        if (prop.type === NodeType.SpreadElement) continue;
        const key = typeof prop.key === 'string' ? prop.key : (prop.key && (prop.key.name || prop.key.value));
        if (key) {
          shape[key] = this.buildShapeTree(prop.value);
        }
      }
      return shape;
    }

    return true; // other known expressions
  }

  scanUsedFeatures(ast) {
    const features = new Set();
    const scan = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.type) features.add(node.type);
      if (node.secret) features.add('secret');
      for (const key of Object.keys(node)) {
        const val = node[key];
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item === 'object') scan(item);
          }
        } else if (val && typeof val === 'object' && val.type) {
          scan(val);
        }
      }
    };
    scan(ast);
    return features;
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

  emitRuntimeImport() {
    // Import shared runtime (stdlib extensions, _obj, error)
    const runtimePath = this.options.runtimePath || './kimchi-runtime.js';
    this.emitLine(`import { _obj, error } from '${runtimePath}';`);
  }

  emitRuntimeExtensions() {
    
    // Secret wrapper class - masks value when converted to string
    if (this.usedFeatures && this.usedFeatures.has('secret')) {
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
    }
    
    
    // Async-aware pipe helper - awaits each step in the chain
    if (this.usedFeatures && this.usedFeatures.has('PipeExpression')) {
    this.emitLine('function _pipe(value, ...fns) {');
    this.pushIndent();
    this.emitLine('let result = value;');
    this.emitLine('for (let i = 0; i < fns.length; i++) {');
    this.pushIndent();
    this.emitLine('if (result && typeof result.then === "function") { return result.then(async r => { let v = r; for (let j = i; j < fns.length; j++) { v = await fns[j](v); } return v; }); }');
    this.emitLine('result = fns[i](result);');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('return result;');
    this.popIndent();
    this.emitLine('}');
    this.emitLine();
    }
    
    // Async-aware flow helper - creates an async composed function
    if (this.usedFeatures && this.usedFeatures.has('FlowExpression')) {
    this.emitLine('function _flow(...fns) {');
    this.pushIndent();
    this.emitLine('const composed = (...args) => {');
    this.pushIndent();
    this.emitLine('let result = fns[0](...args);');
    this.emitLine('for (let i = 1; i < fns.length; i++) {');
    this.pushIndent();
    this.emitLine('if (result && typeof result.then === "function") { return result.then(async r => { let v = r; for (let j = i; j < fns.length; j++) { v = await fns[j](v); } return v; }); }');
    this.emitLine('result = fns[i](result);');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('return result;');
    this.popIndent();
    this.emitLine('};');
    this.emitLine('return composed;');
    this.popIndent();
    this.emitLine('}');
    this.emitLine();
    }

    // Shell execution helper (async)
    if (this.usedFeatures && this.usedFeatures.has('ShellBlock')) {
    this.emitLine('async function _shell(command, inputs = {}) {');
    this.pushIndent();
    this.emitLine('const { exec } = await import("child_process");');
    this.emitLine('const { promisify } = await import("util");');
    this.emitLine('const execAsync = promisify(exec);');
    this.emitLine('// Interpolate inputs into command');
    this.emitLine('let cmd = command;');
    this.emitLine('for (const [key, value] of Object.entries(inputs)) {');
    this.pushIndent();
    this.emitLine('cmd = cmd.replace(new RegExp("\\\\$" + key + "\\\\b", "g"), String(value));');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('try {');
    this.pushIndent();
    this.emitLine('const { stdout, stderr } = await execAsync(cmd);');
    this.emitLine('return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };');
    this.popIndent();
    this.emitLine('} catch (error) {');
    this.pushIndent();
    this.emitLine('return { stdout: error.stdout?.trim() || "", stderr: error.stderr?.trim() || error.message, exitCode: error.code || 1 };');
    this.popIndent();
    this.emitLine('}');
    this.popIndent();
    this.emitLine('}');
    this.emitLine();
    }
    
    // Testing framework runtime
    const hasTests = this.usedFeatures && (
      this.usedFeatures.has('TestBlock') ||
      this.usedFeatures.has('DescribeBlock') ||
      this.usedFeatures.has('ExpectStatement') ||
      this.usedFeatures.has('AssertStatement') ||
      this.usedFeatures.has('BeforeAllBlock') ||
      this.usedFeatures.has('AfterAllBlock') ||
      this.usedFeatures.has('BeforeEachBlock') ||
      this.usedFeatures.has('AfterEachBlock')
    );
    if (hasTests) {
    this.emitLine('// Testing framework');
    this.emitLine('const _tests = [];');
    this.emitLine('let _currentDescribe = null;');
    this.emitLine('let _hasOnly = false;');

    this.emitLine('function _beforeAll(fn) { if (_currentDescribe) { _currentDescribe.beforeAll = _currentDescribe.beforeAll || []; _currentDescribe.beforeAll.push(fn); } }');
    this.emitLine('function _afterAll(fn) { if (_currentDescribe) { _currentDescribe.afterAll = _currentDescribe.afterAll || []; _currentDescribe.afterAll.push(fn); } }');
    this.emitLine('function _beforeEach(fn) { if (_currentDescribe) { _currentDescribe.beforeEach = _currentDescribe.beforeEach || []; _currentDescribe.beforeEach.push(fn); } }');
    this.emitLine('function _afterEach(fn) { if (_currentDescribe) { _currentDescribe.afterEach = _currentDescribe.afterEach || []; _currentDescribe.afterEach.push(fn); } }');

    // _describe with modifier support
    this.emitLine('function _describe(name, fn, modifier = null) {');
    this.pushIndent();
    this.emitLine('const prev = _currentDescribe;');
    this.emitLine('_currentDescribe = { name, tests: [], parent: prev, modifier };');
    this.emitLine('if (modifier === "only") _hasOnly = true;');
    this.emitLine('fn();');
    this.emitLine('if (prev) { prev.tests.push(_currentDescribe); }');
    this.emitLine('else { _tests.push(_currentDescribe); }');
    this.emitLine('_currentDescribe = prev;');
    this.popIndent();
    this.emitLine('}');

    // _test with modifier support
    this.emitLine('function _test(name, fn, modifier = null) {');
    this.pushIndent();
    this.emitLine('if (modifier === "only") _hasOnly = true;');
    this.emitLine('const test = { name, fn, describe: _currentDescribe, modifier };');
    this.emitLine('if (_currentDescribe) { _currentDescribe.tests.push(test); }');
    this.emitLine('else { _tests.push(test); }');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('function _expect(actual) {');
    this.pushIndent();
    this.emitLine('const matchers = {');
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
    this.emitLine('toThrow(msg) { try { actual(); throw new Error("Expected to throw"); } catch(e) { const eMsg = e.message || String(e); if (msg && !eMsg.includes(msg)) throw new Error(`Expected error containing "${msg}" but got "${eMsg}"`); } },');
    this.emitLine('toBeDefined() { if (actual === undefined) throw new Error(`Expected value to be defined but got undefined`); },');
    this.emitLine('toBeUndefined() { if (actual !== undefined) throw new Error(`Expected undefined but got ${JSON.stringify(actual)}`); },');
    this.emitLine('toBeCloseTo(num, digits = 2) { const precision = Math.pow(10, -digits) / 2; if (Math.abs(actual - num) >= precision) throw new Error(`Expected ${actual} to be close to ${num} (precision: ${digits} digits)`); },');
    this.emitLine('toBeInstanceOf(type) { if (actual?._id !== type?._id) throw new Error(`Expected instance of ${type?._id || type} but got ${actual?._id || actual}`); },');
    this.popIndent();
    this.emitLine('};');
    this.emitLine('const notMatchers = {};');
    this.emitLine('for (const [name, fn] of Object.entries(matchers)) {');
    this.pushIndent();
    this.emitLine('notMatchers[name] = (...args) => {');
    this.pushIndent();
    this.emitLine('let threw = false;');
    this.emitLine('try { fn(...args); } catch(e) { threw = true; }');
    this.emitLine('if (!threw) throw new Error(`Expected not.${name} to fail but it passed`);');
    this.popIndent();
    this.emitLine('};');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('Object.defineProperty(matchers, "not", { get() { return notMatchers; } });');
    this.emitLine('return matchers;');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('function _assert(condition, message) { if (!condition) throw new Error(message); }');
    // _runTests with only/skip logic
    this.emitLine('async function _runTests() {');
    this.pushIndent();
    this.emitLine('let passed = 0, failed = 0, skipped = 0;');
    this.emitLine('function shouldSkip(item, parentSkipped) {');
    this.pushIndent();
    this.emitLine('if (item.modifier === "skip" || parentSkipped) return true;');
    this.emitLine('if (_hasOnly && item.modifier !== "only") {');
    this.pushIndent();
    this.emitLine('if (item.tests) { return !hasOnly(item); }');
    this.emitLine('return true;');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('return false;');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('function hasOnly(item) {');
    this.pushIndent();
    this.emitLine('if (item.modifier === "only") return true;');
    this.emitLine('if (item.tests) return item.tests.some(t => hasOnly(t));');
    this.emitLine('return false;');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('async function runItem(item, indent = "", parentSkipped = false) {');
    this.pushIndent();
    this.emitLine('const skip = shouldSkip(item, parentSkipped);');
    this.emitLine('if (item.fn) {');
    this.pushIndent();
    this.emitLine('if (skip) { console.log(indent + "○ " + item.name + " (skipped)"); skipped++; return; }');
    this.emitLine('try { await item.fn(); console.log(indent + "✓ " + item.name); passed++; }');
    this.emitLine('catch (e) { console.log(indent + "✗ " + item.name); console.log(indent + "  " + e.message); failed++; }');
    this.popIndent();
    this.emitLine('} else {');
    this.pushIndent();
    this.emitLine('console.log(indent + item.name);');
    this.emitLine('const childSkipped = skip || item.modifier === "skip";');
    this.emitLine('if (!childSkipped && item.beforeAll) { for (const h of item.beforeAll) await h(); }');
    this.emitLine('for (const t of item.tests) {');
    this.pushIndent();
    this.emitLine('if (!childSkipped && t.fn && !shouldSkip(t, childSkipped)) {');
    this.pushIndent();
    this.emitLine('if (item.beforeEach) { for (const h of item.beforeEach) await h(); }');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('await runItem(t, indent + "  ", childSkipped);');
    this.emitLine('if (!childSkipped && t.fn && !shouldSkip(t, childSkipped)) {');
    this.pushIndent();
    this.emitLine('if (item.afterEach) { for (const h of item.afterEach) await h(); }');
    this.popIndent();
    this.emitLine('}');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('if (!childSkipped && item.afterAll) { for (const h of item.afterAll) await h(); }');
    this.popIndent();
    this.emitLine('}');
    this.popIndent();
    this.emitLine('}');
    this.emitLine('for (const item of _tests) await runItem(item);');
    this.emitLine('const total = passed + failed + skipped;');
    this.emitLine('const parts = [`${total} tests`, `${passed} passed`, `${failed} failed`];');
    this.emitLine('if (skipped > 0) parts.push(`${skipped} skipped`);');
    this.emitLine('console.log("\\n" + parts.join(", "));');
    this.emitLine('return { passed, failed, skipped };');
    this.popIndent();
    this.emitLine('}');
    this.emitLine();
    } // end if (hasTests)
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
    // Static files (.static) are imported directly, regular modules use factory pattern
    // External modules (@ prefix) are resolved from .km_modules directory
    for (const dep of depStatements) {
      const moduleVar = `_dep_${dep.alias}`;
      if (dep.isStatic) {
        // Static files export all declarations directly, no factory function
        // Use absolute path if basePath is provided (for run command)
        const relativePath = './' + dep.pathParts.join('/') + '.static.js';
        // For absolute paths, go up from basePath to project root, then use full path
        const filePath = this.options.basePath 
          ? `file://${this.options.basePath}/../${dep.pathParts.join('/')}.static.js`
          : relativePath;
        this.emitLine(`import * as ${moduleVar} from '${filePath}';`);
      } else if (dep.isExternal) {
        // External module from .km_modules: @foo.bar -> .km_modules/foo/bar.km
        const filePath = './.km_modules/' + dep.pathParts.join('/') + '.km';
        this.emitLine(`import ${moduleVar} from '${filePath}';`);
      } else {
        const filePath = './' + dep.pathParts.join('/') + '.km';
        this.emitLine(`import ${moduleVar} from '${filePath}';`);
      }
    }
    if (depStatements.length > 0) {
      this.emitLine();
    }
    
    // Scan AST for used features to tree-shake runtime helpers
    this.usedFeatures = this.scanUsedFeatures(node);

    // Import shared runtime (stdlib extensions, _obj, error)
    this.emitRuntimeImport();
    this.emitLine();

    // Emit conditional runtime helpers (only those actually used)
    this.emitRuntimeExtensions();
    
    // Export default async factory function
    this.emitLine('export default async function(_opts = {}) {');
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
      if (dep.isStatic) {
        // Static files are imported directly, no factory function, no overrides
        this.emitLine(`const ${dep.alias} = ${moduleVar};`);
      } else if (dep.overrides) {
        const overridesCode = this.visitExpression(dep.overrides);
        this.emitLine(`const ${dep.alias} = _opts["${dep.path}"] || await ${moduleVar}(${overridesCode});`);
      } else {
        this.emitLine(`const ${dep.alias} = _opts["${dep.path}"] || await ${moduleVar}();`);
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
      case NodeType.MutDeclaration:
        this.visitMutDeclaration(node);
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
      case NodeType.ShellBlock:
        this.visitShellBlock(node);
        break;
      case NodeType.TestBlock:
        this.visitTestBlock(node);
        break;
      case NodeType.DescribeBlock:
        this.visitDescribeBlock(node);
        break;
      case NodeType.BeforeAllBlock:
        this.visitHookBlock('_beforeAll', node);
        break;
      case NodeType.AfterAllBlock:
        this.visitHookBlock('_afterAll', node);
        break;
      case NodeType.BeforeEachBlock:
        this.visitHookBlock('_beforeEach', node);
        break;
      case NodeType.AfterEachBlock:
        this.visitHookBlock('_afterEach', node);
        break;
      case NodeType.ExpectStatement:
        this.visitExpectStatement(node);
        break;
      case NodeType.AssertStatement:
        this.visitAssertStatement(node);
        break;
      case NodeType.GuardStatement:
        this.visitGuardStatement(node);
        break;
      case NodeType.ExpressionStatement:
        if (node.expression.type === NodeType.MatchBlock) {
          this.visitMatchBlockStatement(node.expression);
        } else {
          this.emitLine(this.visitExpression(node.expression) + ';');
        }
        break;
      case NodeType.BlockStatement:
        this.visitBlockStatement(node);
        break;
      default:
        throw new Error(`Unknown statement type: ${node.type}`);
    }
  }

  visitDecDeclaration(node) {
    // dec creates immutable bindings (compile-time enforced)
    let init = this.visitExpression(node.init);
    
    // Wrap with _secret() if marked as secret
    if (node.secret) {
      init = `_secret(${init})`;
    }
    
    if (node.destructuring) {
      // Handle destructuring patterns
      if (node.pattern.type === NodeType.ObjectPattern) {
        // Object destructuring: const { a, b } = obj;
        const props = node.pattern.properties.map(p => {
          if (p.key === p.value) {
            return p.key;
          }
          return `${p.key}: ${p.value}`;
        }).join(', ');
        this.emitLine(`const { ${props} } = ${init};`);
        for (const p of node.pattern.properties) { this.decVariables.add(p.value || p.key); }
      } else if (node.pattern.type === NodeType.ArrayPattern) {
        // Array destructuring: const [x, y] = arr;
        const elems = node.pattern.elements.map(e => {
          if (e === null) return '';
          return e.name;
        }).join(', ');
        this.emitLine(`const [${elems}] = ${init};`);
        for (const e of node.pattern.elements) { if (e) this.decVariables.add(e.name); }
      }
    } else {
      this.emitLine(`const ${node.name} = ${init};`);
      this.decVariables.add(node.name);
      const shape = this.buildShapeTree(node.init);
      if (shape) this.knownShapes.set(node.name, shape);
    }
  }

  visitMutDeclaration(node) {
    let init = this.visitExpression(node.init);

    if (node.destructuring) {
      if (node.pattern.type === NodeType.ObjectPattern) {
        const props = node.pattern.properties.map(p => {
          if (p.key === p.value) {
            return p.key;
          }
          return `${p.key}: ${p.value}`;
        }).join(', ');
        this.emitLine(`let { ${props} } = ${init};`);
      } else if (node.pattern.type === NodeType.ArrayPattern) {
        const elems = node.pattern.elements.map(e => {
          if (e === null) return '';
          return e.name;
        }).join(', ');
        this.emitLine(`let [${elems}] = ${init};`);
      }
    } else {
      this.emitLine(`let ${node.name} = ${init};`);
      const shape = this.buildShapeTree(node.init);
      if (shape) this.knownShapes.set(node.name, shape);
    }
  }

  visitFunctionDeclaration(node) {
    // Auto-make functions async if they contain shell blocks
    const hasShellBlock = containsShellBlock(node.body);
    const async = (node.async || hasShellBlock) ? 'async ' : '';
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
      const args = node.inputs.map(name =>
        this.decVariables.has(name) ? `Object.freeze(${name})` : name
      ).join(', ');
      this.emitLine(`})(${args});`);
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
      const args = node.inputs.map(name =>
        this.decVariables.has(name) ? `Object.freeze(${name})` : name
      ).join(', ');
      return `((${params}) => { ${lines} })(${args})`;
    }
  }

  visitShellBlock(node) {
    // Shell interop block - executes shell command asynchronously
    // Syntax: shell { command }         -> await _shell("command");
    //         shell(a, b) { command }   -> await _shell("command", { a, b });
    
    const command = JSON.stringify(node.command);
    
    if (node.inputs.length === 0) {
      this.emitLine(`await _shell(${command});`);
    } else {
      const inputsObj = `{ ${node.inputs.join(', ')} }`;
      this.emitLine(`await _shell(${command}, ${inputsObj});`);
    }
  }

  visitShellBlockExpression(node) {
    // Shell block as expression - returns the shell result
    // Syntax: dec result = shell { ls -la }
    // Generates: await _shell("ls -la")
    
    const command = JSON.stringify(node.command);
    
    if (node.inputs.length === 0) {
      return `await _shell(${command})`;
    } else {
      const inputsObj = `{ ${node.inputs.join(', ')} }`;
      return `await _shell(${command}, ${inputsObj})`;
    }
  }

  generateParams(params) {
    return params.map(p => {
      if (p.type === 'RestElement') {
        return `...${p.argument}`;
      }
      
      // Handle destructuring patterns
      if (p.destructuring === 'object') {
        const props = p.pattern.properties.map(prop => prop.key).join(', ');
        const pattern = `{ ${props} }`;
        if (p.defaultValue) {
          return `${pattern} = ${this.visitExpression(p.defaultValue)}`;
        }
        return pattern;
      }
      
      if (p.destructuring === 'array') {
        const elems = p.pattern.elements.map(elem => {
          if (elem === null) return '';
          if (elem.type === 'Identifier') return elem.name;
          return this.visitExpression(elem);
        }).join(', ');
        const pattern = `[${elems}]`;
        if (p.defaultValue) {
          return `${pattern} = ${this.visitExpression(p.defaultValue)}`;
        }
        return pattern;
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

  visitGuardStatement(node) {
    const test = this.visitExpression(node.test);
    this.emitLine(`if (!(${test})) {`);
    this.pushIndent();
    for (const stmt of node.alternate.body) {
      this.visitStatement(stmt);
    }
    this.popIndent();
    this.emitLine('}');

    // Track non-null after guard: guard x != null else { ... }
    if (node.test.type === NodeType.BinaryExpression &&
        node.test.operator === '!=' &&
        node.test.right &&
        node.test.right.type === NodeType.Literal &&
        node.test.right.value === null &&
        node.test.left &&
        node.test.left.type === NodeType.Identifier) {
      if (!this.knownShapes.has(node.test.left.name)) {
        this.knownShapes.set(node.test.left.name, true);
      }
    }
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
    // Regex pattern matching: subject ~ /regex/ => code
    // At top level: use if/else if chain (no return)
    // Inside function: each case returns from the function when matched
    
    // For regex pattern matching with subject, evaluate subject once
    let subjectVar = null;
    if (node.subject && node.isRegex) {
      subjectVar = '_subject';
      const subjectExpr = this.visitExpression(node.subject);
      this.emitLine(`const ${subjectVar} = ${subjectExpr};`);
    }
    
    for (let i = 0; i < node.cases.length; i++) {
      const matchCase = node.cases[i];
      let condition;
      
      if (matchCase.isRegex || matchCase.test.type === NodeType.RegexLiteral) {
        // Regex pattern: test against subject
        // Store match result in $match for access in the body
        const regex = this.visitExpression(matchCase.test);
        const target = subjectVar || '_subject';
        condition = `($match = ${regex}.exec(${target}))`;
      } else {
        condition = this.visitExpression(matchCase.test);
      }
      
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
      case NodeType.ShellBlock:
        return this.visitShellBlockExpression(node);
      case NodeType.RegexLiteral:
        return this.visitRegexLiteral(node);
      case NodeType.MatchExpression:
        return this.visitMatchExpression(node);
      case NodeType.MatchBlock:
        return this.visitMatchBlock(node);
      case NodeType.ConditionalMethodExpression:
        return this.visitConditionalMethodExpression(node);
      default:
        throw new Error(`Unknown expression type: ${node.type}`);
    }
  }

  visitConditionalMethodExpression(node) {
    const receiver = this.visitExpression(node.receiver);
    const condition = this.visitExpression(node.condition);
    const fallback = node.fallback ? this.visitExpression(node.fallback) : 'null';
    return `((${condition}) ? ${receiver} : ${fallback})`;
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

  visitRegexLiteral(node) {
    return `/${node.pattern}/${node.flags}`;
  }

  visitMatchExpression(node) {
    // Match expression: subject ~ /regex/ or subject ~ /regex/ => { body }
    const subject = this.visitExpression(node.subject);
    const regex = this.visitExpression(node.pattern);
    
    if (node.body) {
      // With body: execute body with $match available, return result
      // Wrap in IIFE to create scope for $match
      if (node.body.type === NodeType.BlockStatement) {
        // Block body - generate IIFE with statements
        let bodyCode = '';
        for (const stmt of node.body.body) {
          if (stmt.type === NodeType.ReturnStatement) {
            bodyCode += `return ${this.visitExpression(stmt.argument)};`;
          } else {
            // For other statements, we'd need to handle them
            // For now, assume return statements
            bodyCode += this.visitExpression(stmt.expression) + ';';
          }
        }
        return `(($match) => { ${bodyCode} })(${regex}.exec(${subject}))`;
      } else {
        // Expression body
        const bodyExpr = this.visitExpression(node.body);
        return `(($match) => ${bodyExpr})(${regex}.exec(${subject}))`;
      }
    } else {
      // Without body: return first match (match[0]) or null
      return `(${regex}.exec(${subject}) || [])[0]`;
    }
  }

  visitMatchBlockStatement(node) {
    const subject = this.visitExpression(node.subject);
    this.emitLine(`const _subject = ${subject};`);

    let firstCondition = true;
    for (let i = 0; i < node.arms.length; i++) {
      const arm = node.arms[i];
      const isWildcard = arm.pattern.type === NodeType.WildcardPattern || arm.pattern.type === 'WildcardPattern';
      const { condition, bindings } = this.compileMatchPattern(arm.pattern, arm.guard);

      if (isWildcard) {
        if (firstCondition) {
          this.emitLine('{');
        } else {
          this.emitLine('} else {');
        }
      } else {
        if (firstCondition) {
          this.emitLine(`if (${condition}) {`);
        } else {
          this.emitLine(`} else if (${condition}) {`);
        }
      }
      firstCondition = false;

      this.pushIndent();
      for (const [name, expr] of bindings) {
        this.emitLine(`const ${name} = ${expr};`);
      }

      if (arm.body.type === 'BlockStatement') {
        for (const stmt of arm.body.body) {
          this.visitStatement(stmt);
        }
      } else {
        this.emitLine(this.visitExpression(arm.body) + ';');
      }
      this.popIndent();
    }

    if (node.arms.length > 0) {
      this.emitLine('}');
    }
  }

  visitMatchBlock(node) {
    const subject = this.visitExpression(node.subject);

    // Optimization: simple match with only literal/wildcard patterns and expression bodies → ternary chain
    const canTernary = node.arms.every(arm =>
      (arm.pattern.type === 'LiteralPattern' || arm.pattern.type === 'WildcardPattern' || arm.pattern.type === NodeType.WildcardPattern) &&
      arm.body.type !== 'BlockStatement' &&
      !arm.guard
    );

    if (canTernary && node.arms.length > 0) {
      let ternary = '';
      for (const arm of node.arms) {
        const body = this.visitExpression(arm.body);
        if (arm.pattern.type === 'WildcardPattern' || arm.pattern.type === NodeType.WildcardPattern) {
          ternary += body;
        } else {
          const val = typeof arm.pattern.value === 'string' ? `"${arm.pattern.value}"` : arm.pattern.value;
          ternary += `(${subject}) === ${val} ? ${body} : `;
        }
      }
      // If no wildcard, append null
      const hasDefault = node.arms.some(a => a.pattern.type === 'WildcardPattern' || a.pattern.type === NodeType.WildcardPattern);
      if (!hasDefault) ternary += 'null';
      return ternary;
    }

    let code = '(() => {\n';
    const baseIndent = this.getIndent();
    const indent = baseIndent + this.indentStr;
    const indent2 = indent + this.indentStr;

    code += `${indent}const _subject = ${subject};\n`;

    let firstCondition = true;

    for (let i = 0; i < node.arms.length; i++) {
      const arm = node.arms[i];
      const isWildcard = arm.pattern.type === NodeType.WildcardPattern || arm.pattern.type === 'WildcardPattern';
      const { condition, bindings } = this.compileMatchPattern(arm.pattern, arm.guard);

      if (isWildcard) {
        if (firstCondition) {
          code += `${indent}{\n`;
        } else {
          code += `${indent}} else {\n`;
        }
      } else {
        if (firstCondition) {
          code += `${indent}if (${condition}) {\n`;
        } else {
          code += `${indent}} else if (${condition}) {\n`;
        }
      }
      firstCondition = false;

      // Emit bindings (const declarations for destructured/bound variables)
      for (const [name, expr] of bindings) {
        code += `${indent2}const ${name} = ${expr};\n`;
      }

      // Emit body
      if (arm.body.type === 'BlockStatement') {
        // Block body - emit each statement
        for (const stmt of arm.body.body) {
          const prevOutput = this.output;
          this.output = '';
          const prevIndent = this.indent;
          this.indent = 0;
          this.visitStatement(stmt);
          const stmtCode = this.output.trim();
          this.output = prevOutput;
          this.indent = prevIndent;
          code += `${indent2}${stmtCode}\n`;
        }
      } else {
        // Expression body - return the value
        const bodyExpr = this.visitExpression(arm.body);
        code += `${indent2}return ${bodyExpr};\n`;
      }
    }

    // Close the last if/else block
    if (node.arms.length > 0) {
      code += `${indent}}\n`;
    }

    // If no wildcard/default arm, return null
    const hasDefault = node.arms.some(a =>
      a.pattern.type === NodeType.WildcardPattern || a.pattern.type === 'WildcardPattern'
    );
    if (!hasDefault) {
      code += `${indent}return null;\n`;
    }

    code += `${baseIndent}})()`;
    return code;
  }

  compileMatchPattern(pattern, guard) {
    const bindings = []; // Array of [name, expression]
    let condition = '';

    switch (pattern.type) {
      case 'LiteralPattern': {
        const val = typeof pattern.value === 'string' ? `"${pattern.value}"` : pattern.value;
        condition = `_subject === ${val}`;
        if (guard) {
          const guardExpr = this.visitExpression(guard);
          condition += ` && (${guardExpr})`;
        }
        break;
      }

      case 'BindingPattern': {
        bindings.push([pattern.name, '_subject']);
        if (guard) {
          // Replace binding name with _subject in the guard expression
          // so we avoid an IIFE just to scope the binding
          const guardExpr = this.visitExpression(guard);
          condition = guardExpr.replace(new RegExp(`\\b${pattern.name}\\b`, 'g'), '_subject');
        } else {
          condition = 'true';
        }
        break;
      }

      case 'IsPattern': {
        condition = `_subject?._id === ${pattern.typeName}?._id`;
        if (guard) {
          const guardExpr = this.visitExpression(guard);
          condition += ` && (${guardExpr})`;
        }
        break;
      }

      case 'ObjectDestructurePattern': {
        const checks = [];
        for (const prop of pattern.properties) {
          if (prop.value && prop.value.type === 'LiteralPattern') {
            const val = typeof prop.value.value === 'string' ? `"${prop.value.value}"` : prop.value.value;
            checks.push(`_subject?.${prop.key} === ${val}`);
          } else if (prop.value && prop.value.type === 'BindingPattern') {
            checks.push(`'${prop.key}' in (_subject || {})`);
            bindings.push([prop.value.name, `_subject.${prop.key}`]);
          } else {
            // Shorthand: { data } - key exists, bind to same name
            checks.push(`'${prop.key}' in (_subject || {})`);
            bindings.push([prop.key, `_subject.${prop.key}`]);
          }
        }
        condition = checks.join(' && ') || 'true';
        if (guard) {
          const guardExpr = this.visitExpression(guard);
          condition += ` && (${guardExpr})`;
        }
        break;
      }

      case 'ArrayDestructurePattern': {
        const checks = [];
        checks.push('Array.isArray(_subject)');
        for (let i = 0; i < pattern.elements.length; i++) {
          const elem = pattern.elements[i];
          if (elem.type === 'LiteralPattern') {
            const val = typeof elem.value === 'string' ? `"${elem.value}"` : elem.value;
            checks.push(`_subject[${i}] === ${val}`);
          } else if (elem.type === 'BindingPattern') {
            bindings.push([elem.name, `_subject[${i}]`]);
          }
          // WildcardPattern - no check or binding
        }
        condition = checks.join(' && ');
        if (guard) {
          const guardExpr = this.visitExpression(guard);
          condition += ` && (${guardExpr})`;
        }
        break;
      }

      case 'WildcardPattern':
      case NodeType.WildcardPattern: {
        condition = 'true';
        break;
      }

      default:
        condition = 'true';
    }

    return { condition, bindings };
  }

  visitBinaryExpression(node) {
    const left = this.visitExpression(node.left);
    const right = this.visitExpression(node.right);
    
    // Handle 'is' operator - compares ._id properties
    if (node.operator === 'is') {
      return `(${left}?._id === ${right}?._id)`;
    }
    
    // Handle 'is not' operator - negated ._id comparison
    if (node.operator === 'is not') {
      return `(${left}?._id !== ${right}?._id)`;
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
      const safe = this.isKnownNonNull(node.object, null);
      return safe ? `${object}[${property}]` : `${object}?.[${property}]`;
    }

    const safe = this.isKnownNonNull(node.object, node.property);
    return safe ? `${object}.${node.property}` : `${object}?.${node.property}`;
  }

  isKnownNonNull(objectNode, propertyName) {
    if (objectNode.type === NodeType.Identifier) {
      const shape = this.knownShapes.get(objectNode.name);
      if (!shape) return false;
      if (propertyName === null) return true; // computed — root is enough
      if (shape === true) return true; // root non-null, no sub-shape detail
      if (typeof shape === 'object' && propertyName in shape) return true;
      return false;
    }

    if (objectNode.type === NodeType.MemberExpression && !objectNode.computed) {
      const parentShape = this.getNestedShape(objectNode);
      if (parentShape === null) return false;
      if (propertyName === null) return true;
      if (parentShape === true) return false; // parent exists but no sub-shape
      if (typeof parentShape === 'object' && propertyName in parentShape) return true;
      return false;
    }

    return false;
  }

  getNestedShape(node) {
    if (node.type === NodeType.Identifier) {
      return this.knownShapes.get(node.name) || null;
    }
    if (node.type === NodeType.MemberExpression && !node.computed) {
      const parentShape = this.getNestedShape(node.object);
      if (parentShape === null || parentShape === true) return null;
      if (typeof parentShape === 'object' && node.property in parentShape) {
        return parentShape[node.property];
      }
      return null;
    }
    return null;
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
      
      // Computed property: { [expr]: value }
      if (p.computed) {
        const keyExpr = this.visitExpression(p.key);
        const value = this.visitExpression(p.value);
        return `[${keyExpr}]: ${value}`;
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
    
    // Auto-make arrow functions async if they contain shell blocks
    const hasShellBlock = containsShellBlock(node.body);
    const asyncPrefix = hasShellBlock ? 'async ' : '';
    
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
      return `${asyncPrefix}${paramsStr} => {\n${bodyContent}${this.getIndent()}}`;
    }
    
    const body = this.visitExpression(node.body);
    return `${asyncPrefix}${paramsStr} => ${body}`;
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
    // Generates: const composedFn = _flow(fn1, fn2, fn3);
    // This creates an async composed function that awaits each step
    const { name, functions } = node;
    
    if (functions.length === 0) {
      return `const ${name} = (x) => x`;
    }
    
    // Use the _flow helper which handles async functions
    return `const ${name} = _flow(${functions.join(', ')})`;
  }

  visitPipeExpression(node) {
    // Pipe: value ~> fn1 ~> fn2
    // Collect all pipe steps and use _pipe helper for async support
    const steps = [];
    let current = node;
    
    // Walk the pipe chain to collect all steps
    while (current.type === NodeType.PipeExpression) {
      steps.unshift(this.visitExpression(current.right));
      current = current.left;
    }
    
    // current is now the initial value
    const initial = this.visitExpression(current);
    
    // Use _pipe helper (sync when all fns are sync, async when any returns Promise)
    return `_pipe(${initial}, ${steps.join(', ')})`;
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
    const modifier = node.modifier ? `, ${JSON.stringify(node.modifier)}` : '';
    this.emitLine(`_test(${JSON.stringify(node.name)}, async () => {`);
    this.pushIndent();
    for (const stmt of node.body.body) {
      this.visitStatement(stmt);
    }
    this.popIndent();
    this.emitLine(`}${modifier});`);
  }

  visitDescribeBlock(node) {
    const modifier = node.modifier ? `, ${JSON.stringify(node.modifier)}` : '';
    this.emitLine(`_describe(${JSON.stringify(node.name)}, () => {`);
    this.pushIndent();
    for (const stmt of node.body.body) {
      this.visitStatement(stmt);
    }
    this.popIndent();
    this.emitLine(`}${modifier});`);
  }

  visitHookBlock(hookName, node) {
    this.emitLine(`${hookName}(async () => {`);
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
    const not = node.negated ? 'not.' : '';

    // Generate appropriate assertion based on matcher
    switch (matcher) {
      case 'toBe':
        this.emitLine(`_expect(${actual}).${not}toBe(${expected});`);
        break;
      case 'toEqual':
        this.emitLine(`_expect(${actual}).${not}toEqual(${expected});`);
        break;
      case 'toContain':
        this.emitLine(`_expect(${actual}).${not}toContain(${expected});`);
        break;
      case 'toBeNull':
        this.emitLine(`_expect(${actual}).${not}toBeNull();`);
        break;
      case 'toBeTruthy':
        this.emitLine(`_expect(${actual}).${not}toBeTruthy();`);
        break;
      case 'toBeFalsy':
        this.emitLine(`_expect(${actual}).${not}toBeFalsy();`);
        break;
      case 'toBeGreaterThan':
        this.emitLine(`_expect(${actual}).${not}toBeGreaterThan(${expected});`);
        break;
      case 'toBeLessThan':
        this.emitLine(`_expect(${actual}).${not}toBeLessThan(${expected});`);
        break;
      case 'toThrow':
        this.emitLine(`_expect(${actual}).${not}toThrow(${expected});`);
        break;
      case 'toMatch':
        this.emitLine(`_expect(${actual}).${not}toMatch(${expected});`);
        break;
      case 'toHaveLength':
        this.emitLine(`_expect(${actual}).${not}toHaveLength(${expected});`);
        break;
      default:
        // Generic matcher
        this.emitLine(`_expect(${actual}).${not}${matcher}(${expected});`);
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
