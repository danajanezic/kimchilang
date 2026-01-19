// KimchiLang Test Suite

import { compile, tokenize, parse, KimchiCompiler } from '../src/index.js';
import { TypeChecker } from '../src/typechecker.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

function assertContains(str, substring, message = '') {
  if (!str.includes(substring)) {
    throw new Error(`${message}\n  Expected to contain: ${substring}\n  Actual: ${str}`);
  }
}

console.log('KimchiLang Test Suite\n');
console.log('='.repeat(50));

// Lexer Tests
console.log('\n--- Lexer Tests ---\n');

test('Tokenize numbers', () => {
  const tokens = tokenize('42 3.14 0xFF 0b1010');
  assertEqual(tokens[0].value, '42');
  assertEqual(tokens[1].value, '3.14');
  assertEqual(tokens[2].value, '0xFF');
  assertEqual(tokens[3].value, '0b1010');
});

test('Tokenize strings', () => {
  const tokens = tokenize('"hello" \'world\'');
  assertEqual(tokens[0].value, 'hello');
  assertEqual(tokens[1].value, 'world');
});

test('Tokenize identifiers and keywords', () => {
  const tokens = tokenize('dec x fn if else');
  assertEqual(tokens[0].type, 'DEC');
  assertEqual(tokens[1].type, 'IDENTIFIER');
  assertEqual(tokens[2].type, 'FN');
  assertEqual(tokens[3].type, 'IF');
  assertEqual(tokens[4].type, 'ELSE');
});

test('Tokenize operators', () => {
  const tokens = tokenize('+ - * / == != <= >= && || >>');
  assertEqual(tokens[0].type, 'PLUS');
  assertEqual(tokens[1].type, 'MINUS');
  assertEqual(tokens[2].type, 'STAR');
  assertEqual(tokens[3].type, 'SLASH');
  assertEqual(tokens[4].type, 'EQ');
  assertEqual(tokens[5].type, 'NEQ');
  assertEqual(tokens[6].type, 'LTE');
  assertEqual(tokens[7].type, 'GTE');
  assertEqual(tokens[8].type, 'AND');
  assertEqual(tokens[9].type, 'OR');
  assertEqual(tokens[10].type, 'FLOW');
});

// Parser Tests
console.log('\n--- Parser Tests ---\n');

test('Parse dec declaration', () => {
  const tokens = tokenize('dec x = 42');
  const ast = parse(tokens);
  assertEqual(ast.body[0].type, 'DecDeclaration');
  assertEqual(ast.body[0].name, 'x');
});

test('Parse function declaration', () => {
  const tokens = tokenize('fn add(a, b) { return a + b }');
  const ast = parse(tokens);
  assertEqual(ast.body[0].type, 'FunctionDeclaration');
  assertEqual(ast.body[0].name, 'add');
  assertEqual(ast.body[0].params.length, 2);
});

test('Parse if statement', () => {
  const tokens = tokenize('if x > 0 { print x }');
  const ast = parse(tokens);
  assertEqual(ast.body[0].type, 'IfStatement');
});

test('Parse while loop', () => {
  const tokens = tokenize('while x < 10 { x = x + 1 }');
  const ast = parse(tokens);
  assertEqual(ast.body[0].type, 'WhileStatement');
});

test('Parse for loop', () => {
  const tokens = tokenize('for item in items { print item }');
  const ast = parse(tokens);
  assertEqual(ast.body[0].type, 'ForInStatement');
});

test('Parse array literal', () => {
  const tokens = tokenize('dec arr = [1, 2, 3]');
  const ast = parse(tokens);
  assertEqual(ast.body[0].init.type, 'ArrayExpression');
  assertEqual(ast.body[0].init.elements.length, 3);
});

test('Parse object literal', () => {
  const tokens = tokenize('dec obj = { a: 1, b: 2 }');
  const ast = parse(tokens);
  assertEqual(ast.body[0].init.type, 'ObjectExpression');
  assertEqual(ast.body[0].init.properties.length, 2);
});

// Code Generator Tests
console.log('\n--- Code Generator Tests ---\n');

test('Generate dec declaration', () => {
  const js = compile('dec x = 42');
  assertContains(js, '_deepFreeze(42)');
});

test('Generate function declaration', () => {
  const js = compile('fn greet(name) { return "Hello " + name }');
  assertContains(js, 'function greet(name)');
  assertContains(js, 'return');
});

test('Generate print statement', () => {
  const js = compile('print "hello"');
  assertContains(js, 'console.log("hello")');
});

test('Generate if statement', () => {
  const js = compile('if x > 0 { print x }', { skipTypeCheck: true });
  assertContains(js, 'if (');
  assertContains(js, 'console.log');
});

test('Generate while loop', () => {
  const js = compile('while x < 10 { x = x + 1 }', { skipTypeCheck: true });
  assertContains(js, 'while (');
});

test('Generate for loop', () => {
  const js = compile('for item in items { print item }', { skipTypeCheck: true });
  assertContains(js, 'for (const item of items)');
});

test('Generate arrow function', () => {
  const js = compile('dec double = x => x * 2');
  assertContains(js, 'x => (x * 2)');
});

test('Generate flow expression', () => {
  const js = compile('transform >> addOne double', { skipTypeCheck: true });
  assertContains(js, 'const transform = _flow(addOne, double)');
});

test('Generate pipe expression with _pipe helper', () => {
  const js = compile('dec result = 5 ~> double ~> addOne', { skipTypeCheck: true });
  assertContains(js, '_pipe(5, double, addOne)');
});

test('Generate range expression', () => {
  const js = compile('dec nums = 0..5');
  assertContains(js, 'Array.from');
});

test('Generate ternary expression', () => {
  const js = compile('dec x = a > b ? a : b', { skipTypeCheck: true });
  assertContains(js, '?');
  assertContains(js, ':');
});

test('Generate try/catch', () => {
  const js = compile('try { risky() } catch(e) { print e }', { skipTypeCheck: true });
  assertContains(js, 'try {');
  assertContains(js, 'catch');
});

test('Generate spread operator', () => {
  const js = compile('dec arr = [...other, 1, 2]', { skipTypeCheck: true });
  assertContains(js, '...other');
});

test('Equality uses strict equality', () => {
  const js = compile('dec x = a == b', { skipTypeCheck: true });
  assertContains(js, '===');
});

test('Inequality uses strict inequality', () => {
  const js = compile('dec x = a != b', { skipTypeCheck: true });
  assertContains(js, '!==');
});

// Integration Tests
console.log('\n--- Integration Tests ---\n');

test('Compile fibonacci function', () => {
  const source = `
    fn fib(n) {
      if n <= 1 {
        return n
      }
      return fib(n - 1) + fib(n - 2)
    }
  `;
  const js = compile(source);
  assertContains(js, 'function fib(n)');
  assertContains(js, 'if (');
  assertContains(js, 'return');
});

test('Compile complex expression', () => {
  const source = 'dec result = (a + b) * (c - d) / e ** 2';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '**');
  assertContains(js, '/');
  assertContains(js, '*');
});

// Dependency System Tests
console.log('\n--- Dependency System Tests ---\n');

test('Parse dep statement', () => {
  const tokens = tokenize('as client dep project.salesforce.client');
  const ast = parse(tokens);
  assertEqual(ast.body[0].type, 'DepStatement');
  assertEqual(ast.body[0].alias, 'client');
  assertEqual(ast.body[0].path, 'project.salesforce.client');
});

test('Parse dep statement with overrides', () => {
  const tokens = tokenize('as client dep project.salesforce.client({"bar.foo": mockFn})');
  const ast = parse(tokens);
  assertEqual(ast.body[0].type, 'DepStatement');
  assertEqual(ast.body[0].alias, 'client');
  assertEqual(ast.body[0].path, 'project.salesforce.client');
  assertEqual(ast.body[0].overrides.type, 'ObjectExpression');
});

test('Generate dep statement imports module', () => {
  const js = compile('as sfdcClient dep project.salesforce.client');
  assertContains(js, "import _dep_sfdcClient from './project/salesforce/client.km'");
});

test('Generate dep statement with factory call', () => {
  const js = compile('as sfdcClient dep project.salesforce.client');
  assertContains(js, '_opts["project.salesforce.client"] || _dep_sfdcClient()');
});

test('Generate dep statement with overrides', () => {
  const js = compile('as client dep myapp.api.client({"lib.http": mockHttp})');
  assertContains(js, '"lib.http": mockHttp');
});

test('Module wraps as factory function', () => {
  const js = compile('expose fn hello() { print "hi" }');
  assertContains(js, 'export default function(_opts = {})');
  assertContains(js, 'return { hello }');
});

// Arg System Tests
console.log('\n--- Arg System Tests ---\n');

test('Parse optional arg', () => {
  const tokens = tokenize('arg clientId');
  const ast = parse(tokens);
  assertEqual(ast.body[0].type, 'ArgDeclaration');
  assertEqual(ast.body[0].name, 'clientId');
  assertEqual(ast.body[0].required, false);
  assertEqual(ast.body[0].defaultValue, null);
});

test('Parse required arg', () => {
  const tokens = tokenize('!arg apiKey');
  const ast = parse(tokens);
  assertEqual(ast.body[0].type, 'ArgDeclaration');
  assertEqual(ast.body[0].name, 'apiKey');
  assertEqual(ast.body[0].required, true);
});

test('Parse arg with default value', () => {
  const tokens = tokenize('arg timeout = 5000');
  const ast = parse(tokens);
  assertEqual(ast.body[0].type, 'ArgDeclaration');
  assertEqual(ast.body[0].name, 'timeout');
  assertEqual(ast.body[0].required, false);
  assertEqual(ast.body[0].defaultValue.type, 'Literal');
});

test('Generate optional arg extraction', () => {
  const js = compile('arg clientId');
  assertContains(js, 'const clientId = _opts["clientId"]');
});

test('Generate required arg validation', () => {
  const js = compile('!arg apiKey');
  assertContains(js, 'if (_opts["apiKey"] === undefined) throw new Error');
});

test('Generate arg with default value', () => {
  const js = compile('arg timeout = 5000');
  assertContains(js, '_opts["timeout"] !== undefined ? _opts["timeout"] : 5000');
});

test('Generate module with deps and args', () => {
  const source = `
    as http dep myapp.lib.http
    arg clientId = "default123"
    !arg apiKey
    fn doRequest() { return http.get("/api") }
  `;
  const js = compile(source);
  assertContains(js, 'import _dep_http');
  assertContains(js, 'if (_opts["apiKey"] === undefined)');
  assertContains(js, 'const clientId = _opts["clientId"] !== undefined');
  assertContains(js, 'const apiKey = _opts["apiKey"]');
  assertContains(js, 'const http = _opts["myapp.lib.http"] || _dep_http()');
});

test('Compile-time error for missing required arg in dep call', () => {
  // First, register a module with required args
  KimchiCompiler.registerModule('test.api', ['apiKey']);
  
  // Then try to use that module without providing the required arg
  let error = null;
  try {
    const compiler = new KimchiCompiler();
    compiler.compile('as api dep test.api');
  } catch (e) {
    error = e;
  }
  assertEqual(error !== null, true);
  assertContains(error.message, "Required argument 'apiKey' not provided");
});

test('No error when required arg is provided in dep call', () => {
  // Register a module with required args
  KimchiCompiler.registerModule('test.service', ['token']);
  
  // Use that module with the required arg provided
  let error = null;
  try {
    const compiler = new KimchiCompiler();
    compiler.compile('as svc dep test.service({ token: "abc123" })');
  } catch (e) {
    error = e;
  }
  assertEqual(error, null);
});

// Dec System Tests
console.log('\n--- Dec System Tests ---\n');

test('Parse dec declaration', () => {
  const tokens = tokenize('dec config = { foo: "bar" }');
  const ast = parse(tokens);
  assertEqual(ast.body[0].type, 'DecDeclaration');
  assertEqual(ast.body[0].name, 'config');
});

test('Generate dec with deepFreeze', () => {
  const js = compile('dec config = { foo: "bar" }');
  assertContains(js, 'function _deepFreeze(obj)');
  assertContains(js, 'const config = _deepFreeze({ foo: "bar" })');
});

test('Compile-time error on dec reassignment', () => {
  let error = null;
  try {
    compile('dec x = 5\nx = 10');
  } catch (e) {
    error = e;
  }
  assertEqual(error !== null, true);
  assertContains(error.message, 'deeply immutable');
});

test('Compile-time error on dec nested property reassignment', () => {
  let error = null;
  try {
    compile('dec obj = { foo: { bar: "baz" } }\nobj.foo.bar = "new"');
  } catch (e) {
    error = e;
  }
  assertEqual(error !== null, true);
  assertContains(error.message, 'deeply immutable');
});

test('Dec requires initialization', () => {
  let error = null;
  try {
    compile('dec x');
  } catch (e) {
    error = e;
  }
  assertEqual(error !== null, true);
});

// Expose System Tests
console.log('\n--- Expose System Tests ---\n');

test('Parse expose dec declaration', () => {
  const tokens = tokenize('expose dec foo = 42');
  const ast = parse(tokens);
  assertEqual(ast.body[0].type, 'DecDeclaration');
  assertEqual(ast.body[0].name, 'foo');
  assertEqual(ast.body[0].exposed, true);
});

test('Parse non-exposed dec declaration', () => {
  const tokens = tokenize('dec bar = 42');
  const ast = parse(tokens);
  assertEqual(ast.body[0].exposed, false);
});

test('Parse expose fn declaration', () => {
  const tokens = tokenize('expose fn greet() { return "hi" }');
  const ast = parse(tokens);
  assertEqual(ast.body[0].type, 'FunctionDeclaration');
  assertEqual(ast.body[0].exposed, true);
});

test('Only exposed items are exported', () => {
  const source = `
    expose fn publicFn() { return 1 }
    fn privateFn() { return 2 }
    expose dec publicVar = 10
    dec privateVar = 20
  `;
  const js = compile(source);
  assertContains(js, 'return { publicFn, publicVar }');
});

test('Private function not in exports', () => {
  const js = compile('fn privateFn() { return 1 }');
  // Should not have return statement with exports since nothing is exposed
  assertEqual(js.includes('return {'), false);
});

// Dependency Type Checking Tests
console.log('\n--- Dependency Type Checking Tests ---\n');

test('TypeChecker registers module export types', () => {
  TypeChecker.clearRegistry();
  
  // Compile a module with exposed declarations
  const source = `
    expose dec apiVersion = "1.0"
    expose fn greet(name) { return "Hello " + name }
    arg timeout = 5000
  `;
  const tokens = tokenize(source);
  const ast = parse(tokens);
  
  const checker = new TypeChecker({ modulePath: 'test.module' });
  checker.check(ast);
  
  const moduleType = TypeChecker.getModuleType('test.module');
  assertEqual(moduleType !== null, true);
  assertEqual(moduleType.kind, 'object');
  assertEqual('apiVersion' in moduleType.properties, true);
  assertEqual('greet' in moduleType.properties, true);
  assertEqual('timeout' in moduleType.properties, true);
});

test('Dep alias is defined in scope with module type', () => {
  TypeChecker.clearRegistry();
  
  // First register a module type
  TypeChecker.registerModuleType('lib.http', {
    kind: 'object',
    properties: {
      get: { kind: 'function', params: [], returnType: { kind: 'unknown' } },
      post: { kind: 'function', params: [], returnType: { kind: 'unknown' } }
    }
  });
  
  // Now compile code that uses that dependency
  const source = `
    as http dep lib.http
    dec result = http.get("/api")
  `;
  const tokens = tokenize(source);
  const ast = parse(tokens);
  
  const checker = new TypeChecker();
  const errors = checker.check(ast);
  
  // Should not have errors - http.get exists
  assertEqual(errors.length, 0);
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`\nTests: ${passed + failed} total, ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
