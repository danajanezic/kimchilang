// KimchiLang Test Suite

import { compile, tokenize, parse, generate, KimchiCompiler } from '../src/index.js';
import { TypeChecker } from '../src/typechecker.js';
import { Linter } from '../src/linter.js';
import { convertJS } from '../src/js2km.js';
import { format } from '../src/formatter.js';
import { bundle } from '../src/bundler.js';
import kmxReactPlugin from '../src/extensions/kmx-react.js';
import sqlPlugin from '../src/extensions/sql.js';
import queryPlugin from '../src/extensions/query.js';
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync } from 'fs';

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
  // Test arithmetic operators with operands (/ after identifier is division)
  const tokens1 = tokenize('a + b - c * d / e');
  assertEqual(tokens1[0].type, 'IDENTIFIER');
  assertEqual(tokens1[1].type, 'PLUS');
  assertEqual(tokens1[2].type, 'IDENTIFIER');
  assertEqual(tokens1[3].type, 'MINUS');
  assertEqual(tokens1[4].type, 'IDENTIFIER');
  assertEqual(tokens1[5].type, 'STAR');
  assertEqual(tokens1[6].type, 'IDENTIFIER');
  assertEqual(tokens1[7].type, 'SLASH');
  assertEqual(tokens1[8].type, 'IDENTIFIER');
  
  // Test comparison and logical operators
  const tokens2 = tokenize('a == b != c <= d >= e && f || g >> h');
  assertEqual(tokens2[1].type, 'EQ');
  assertEqual(tokens2[3].type, 'NEQ');
  assertEqual(tokens2[5].type, 'LTE');
  assertEqual(tokens2[7].type, 'GTE');
  assertEqual(tokens2[9].type, 'AND');
  assertEqual(tokens2[11].type, 'OR');
  assertEqual(tokens2[13].type, 'FLOW');
});

test('Tokenize collect keyword', () => {
  const tokens = tokenize('collect [a, b]');
  assertEqual(tokens[0].type, 'COLLECT');
  assertEqual(tokens[0].value, 'collect');
});

test('Tokenize hoard keyword', () => {
  const tokens = tokenize('hoard [a, b]');
  assertEqual(tokens[0].type, 'HOARD');
  assertEqual(tokens[0].value, 'hoard');
});

test('Tokenize race keyword', () => {
  const tokens = tokenize('race [a, b]');
  assertEqual(tokens[0].type, 'RACE');
  assertEqual(tokens[0].value, 'race');
});

test('Tokenize extern keyword', () => {
  const tokens = tokenize('extern "node:fs" { }');
  assertEqual(tokens[0].type, 'EXTERN');
  assertEqual(tokens[0].value, 'extern');
});

test('Tokenize worker keyword', () => {
  const tokens = tokenize('worker() { return 1 }');
  assertEqual(tokens[0].type, 'WORKER');
  assertEqual(tokens[0].value, 'worker');
});

test('Tokenize spawn keyword with raw content', () => {
  const tokens = tokenize('spawn { ls -la }');
  assertEqual(tokens[0].type, 'SPAWN');
  assertEqual(tokens[0].value, 'spawn');
  // spawn captures raw content like shell
  assertEqual(tokens[2].type, 'SPAWN_CONTENT');
  assertEqual(tokens[2].value, 'ls -la');
});

test('Tokenize spawn with inputs', () => {
  const tokens = tokenize('spawn(dir) { ls $dir }');
  assertEqual(tokens[0].type, 'SPAWN');
  assertEqual(tokens[1].type, 'LPAREN');
  assertEqual(tokens[2].type, 'IDENTIFIER');
  assertEqual(tokens[2].value, 'dir');
  assertEqual(tokens[3].type, 'RPAREN');
  assertEqual(tokens[5].type, 'SPAWN_CONTENT');
  assertEqual(tokens[5].value, 'ls $dir');
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
  assertContains(js, 'const x = 42;');
  assertEqual(js.includes('_deepFreeze'), false, 'Should not use _deepFreeze');
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

test('Null comparison uses loose equality to catch undefined', () => {
  const js = compile('dec x = a == null', { skipTypeCheck: true });
  assertContains(js, '== null');
  const js2 = compile('dec x = a != null', { skipTypeCheck: true });
  assertContains(js2, '!= null');
});

test('Null on left side also uses loose equality', () => {
  const js = compile('dec x = null == a', { skipTypeCheck: true });
  assertContains(js, '== a');
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
  assertContains(js, '_opts["project.salesforce.client"] || await _dep_sfdcClient()');
});

test('Generate dep statement with overrides', () => {
  const js = compile('as client dep myapp.api.client({"lib.http": mockHttp})');
  assertContains(js, '"lib.http": mockHttp');
});

test('Module wraps as factory function', () => {
  const js = compile('expose fn hello() { print "hi" }');
  assertContains(js, 'export default async function(_opts = {})');
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
  assertContains(js, 'const http = _opts["myapp.lib.http"] || await _dep_http()');
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

test('Generate dec with object', () => {
  const js = compile('dec config = { foo: "bar" }');
  assertEqual(js.includes('function _deepFreeze'), false, 'Should not emit _deepFreeze function');
  assertContains(js, 'const config =');
  assertEqual(js.includes('_deepFreeze'), false, 'Should not use _deepFreeze');
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
  // Should not have return { privateFn } since nothing is exposed
  assertEqual(js.includes('return { privateFn'), false);
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

// Regex Pattern Matching Tests
console.log('\n--- Regex Pattern Matching Tests ---\n');

test('Tokenize regex literal', () => {
  const tokens = tokenize('/hello/');
  assertEqual(tokens[0].type, 'REGEX');
  assertEqual(tokens[0].value.pattern, 'hello');
  assertEqual(tokens[0].value.flags, '');
});

test('Tokenize regex literal with flags', () => {
  const tokens = tokenize('/hello/gi');
  assertEqual(tokens[0].type, 'REGEX');
  assertEqual(tokens[0].value.pattern, 'hello');
  assertEqual(tokens[0].value.flags, 'gi');
});

test('Tokenize regex with escaped characters', () => {
  const tokens = tokenize('/\\d+\\.\\d+/');
  assertEqual(tokens[0].type, 'REGEX');
  assertEqual(tokens[0].value.pattern, '\\d+\\.\\d+');
});

test('Tokenize match operator', () => {
  const tokens = tokenize('input ~ /hello/');
  assertEqual(tokens[0].type, 'IDENTIFIER');
  assertEqual(tokens[1].type, 'MATCH');
  assertEqual(tokens[2].type, 'REGEX');
});

test('Parse simple match expression', () => {
  const tokens = tokenize('dec result = "hello world" ~ /hello/');
  const ast = parse(tokens);
  assertEqual(ast.body[0].type, 'DecDeclaration');
  assertEqual(ast.body[0].init.type, 'MatchExpression');
  assertEqual(ast.body[0].init.subject.type, 'Literal');
  assertEqual(ast.body[0].init.pattern.type, 'RegexLiteral');
  assertEqual(ast.body[0].init.pattern.pattern, 'hello');
  assertEqual(ast.body[0].init.body, null);
});

test('Parse match expression with body', () => {
  const tokens = tokenize('dec result = "hello" ~ /hello/ => { return "bar" }');
  const ast = parse(tokens);
  assertEqual(ast.body[0].type, 'DecDeclaration');
  assertEqual(ast.body[0].init.type, 'MatchExpression');
  assertEqual(ast.body[0].init.body.type, 'BlockStatement');
});

test('Generate simple match expression', () => {
  const source = 'dec foo = "test foo" ~ /foo/';
  const tokens = tokenize(source);
  const ast = parse(tokens);
  const code = generate(ast);
  assertEqual(code.includes('/foo/.exec'), true);
  assertEqual(code.includes('|| [])[0]'), true);
});

test('Generate match expression with body', () => {
  const source = 'dec foo = "test" ~ /test/ => { return "bar" }';
  const tokens = tokenize(source);
  const ast = parse(tokens);
  const code = generate(ast);
  assertEqual(code.includes('$match'), true);
  assertEqual(code.includes('return "bar"'), true);
});

test('Regex literal in expression', () => {
  const source = 'dec pattern = /\\w+/g';
  const tokens = tokenize(source);
  const ast = parse(tokens);
  assertEqual(ast.body[0].init.type, 'RegexLiteral');
  assertEqual(ast.body[0].init.pattern, '\\w+');
  assertEqual(ast.body[0].init.flags, 'g');
});

// --- Mut Tests ---
console.log('\n--- Mut Tests ---\n');

test('Tokenize mut keyword', () => {
  const tokens = tokenize('mut x = 5');
  assertEqual(tokens[0].type, 'MUT');
  assertEqual(tokens[1].type, 'IDENTIFIER');
  assertEqual(tokens[1].value, 'x');
});

test('Parse mut declaration', () => {
  const ast = parse(tokenize('mut x = 42'));
  assertEqual(ast.body[0].type, 'MutDeclaration');
  assertEqual(ast.body[0].name, 'x');
  assertEqual(ast.body[0].init.value, 42);
});

test('Parse mut with object destructuring', () => {
  const ast = parse(tokenize('mut { a, b } = obj'));
  assertEqual(ast.body[0].type, 'MutDeclaration');
  assertEqual(ast.body[0].destructuring, true);
});

test('Mut allows reassignment (parser does not error)', () => {
  const ast = parse(tokenize('mut x = 0\nx = x + 1'));
  assertEqual(ast.body[0].type, 'MutDeclaration');
  assertEqual(ast.body[1].type, 'ExpressionStatement');
  assertEqual(ast.body[1].expression.type, 'AssignmentExpression');
});

test('Dec still blocks reassignment', () => {
  let threw = false;
  try {
    parse(tokenize('dec x = 0\nx = 1'));
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, true, 'dec reassignment should throw parse error');
});

test('Generate mut declaration', () => {
  const js = compile('mut x = 42');
  assertContains(js, 'let x = 42;');
});

test('Generate mut does not deepFreeze', () => {
  const js = compile('mut x = { a: 1 }');
  assertContains(js, 'let x =');
  // The output should NOT have _deepFreeze wrapping the mut variable's init
  // (Note: _deepFreeze function definition may exist in output, but the variable assignment should not use it)
});

test('Generate mut reassignment', () => {
  const js = compile('mut x = 0\nx = x + 1', { skipTypeCheck: true });
  assertContains(js, 'let x = 0;');
  assertContains(js, 'x = (x + 1)');
});

test('Type checker: mut variable closure capture error', () => {
  const source = 'fn bad() {\n  mut x = 0\n  dec inc = () => { x = x + 1 }\n}';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  const errors = checker.check(ast);
  assertEqual(errors.length > 0, true, 'Should have error for mut capture in closure');
});

test('Type checker: mut variable without closure is fine', () => {
  const source = 'fn good() {\n  mut x = 0\n  x = x + 1\n  return x\n}';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  const errors = checker.check(ast);
  // Filter out errors unrelated to mut
  const mutErrors = errors.filter(e => e.message.includes('mut') || e.message.includes('capture'));
  assertEqual(mutErrors.length, 0, 'No mut-related errors for simple mut usage');
});

test('Linter: warns on mut never reassigned', () => {
  const source = 'mut x = 5\nprint x';
  const ast = parse(tokenize(source));
  const linter = new Linter({ rules: { 'mut-never-reassigned': true } });
  const messages = linter.lint(ast, source);
  const hasMutWarning = messages.some(m => m.rule === 'mut-never-reassigned');
  assertEqual(hasMutWarning, true, 'Should warn about mut variable never reassigned');
});

// --- Nullish Coalescing Tests ---
console.log('\n--- Nullish Coalescing Tests ---\n');

test('Tokenize ?? operator', () => {
  const tokens = tokenize('a ?? b');
  assertEqual(tokens[1].type, 'NULLISH');
  assertEqual(tokens[1].value, '??');
});

test('Parse ?? expression', () => {
  const ast = parse(tokenize('dec x = a ?? b'));
  const init = ast.body[0].init;
  assertEqual(init.type, 'BinaryExpression');
  assertEqual(init.operator, '??');
});

test('Generate ?? operator', () => {
  const js = compile('dec x = a ?? "default"', { skipTypeCheck: true });
  assertContains(js, '??');
  assertContains(js, '"default"');
});

test('Chained ?? operators', () => {
  const ast = parse(tokenize('dec x = a ?? b ?? c'));
  assertEqual(ast.body[0].init.type, 'BinaryExpression');
  assertEqual(ast.body[0].init.operator, '??');
});

// --- Guard Tests ---
console.log('\n--- Guard Tests ---\n');

test('Tokenize guard keyword', () => {
  const tokens = tokenize('guard x else { return null }');
  assertEqual(tokens[0].type, 'GUARD');
});

test('Parse guard statement', () => {
  const ast = parse(tokenize('guard x != null else { return null }'));
  assertEqual(ast.body[0].type, 'GuardStatement');
  assertEqual(ast.body[0].test.type, 'BinaryExpression');
  assertEqual(ast.body[0].alternate.type, 'BlockStatement');
});

test('Generate guard statement', () => {
  const js = compile('fn foo(x) {\n  guard x != null else { return null }\n  return x\n}');
  assertContains(js, 'if (!(');
  assertContains(js, 'return null');
});

test('Type checker: guard else must have return or throw', () => {
  const source = 'guard x != null else { print "oops" }';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  const errors = checker.check(ast);
  const guardError = errors.some(e => e.message.includes('guard') && e.message.includes('return'));
  assertEqual(guardError, true, 'Should error when guard else has no exit');
});

test('Type checker: guard with return is fine', () => {
  const source = 'fn foo(x) {\n  guard x != null else { return null }\n  return x\n}';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  const errors = checker.check(ast);
  const guardError = errors.some(e => e.message.includes('guard'));
  assertEqual(guardError, false, 'Should not error when guard else has return');
});

// --- Match Expression Tests ---
console.log('\n--- Match Expression (new) Tests ---\n');

test('Tokenize match keyword', () => {
  const tokens = tokenize('match x { 1 => "one" }');
  assertEqual(tokens[0].type, 'MATCH_KEYWORD');
});

test('Tokenize when keyword', () => {
  const tokens = tokenize('n when n >= 90');
  assertEqual(tokens[1].type, 'WHEN');
});

test('Parse match with literal patterns', () => {
  const source = 'dec result = match status {\n200 => "OK"\n404 => "Not Found"\n_ => "Unknown"\n}';
  const ast = parse(tokenize(source));
  const matchExpr = ast.body[0].init;
  assertEqual(matchExpr.type, 'MatchBlock');
  assertEqual(matchExpr.arms.length, 3);
  assertEqual(matchExpr.arms[0].pattern.type, 'LiteralPattern');
  assertEqual(matchExpr.arms[0].pattern.value, 200);
  assertEqual(matchExpr.arms[2].pattern.type, 'WildcardPattern');
});

test('Parse match with when guard', () => {
  const source = 'dec tier = match score {\nn when n >= 90 => "A"\n_ => "F"\n}';
  const ast = parse(tokenize(source));
  const matchExpr = ast.body[0].init;
  assertEqual(matchExpr.arms[0].pattern.type, 'BindingPattern');
  assertEqual(matchExpr.arms[0].pattern.name, 'n');
  assertEqual(matchExpr.arms[0].guard !== null, true, 'First arm should have a guard');
});

test('Parse match with object destructuring', () => {
  const source = 'dec r = match obj {\n{ status: 200, data } => data\n_ => null\n}';
  const ast = parse(tokenize(source));
  const matchExpr = ast.body[0].init;
  assertEqual(matchExpr.arms[0].pattern.type, 'ObjectDestructurePattern');
  assertEqual(matchExpr.arms[0].pattern.properties.length, 2);
  assertEqual(matchExpr.arms[0].pattern.properties[0].key, 'status');
});

test('Parse match with is pattern', () => {
  const source = 'dec r = match err {\nis NotFoundError => "not found"\n_ => "other"\n}';
  const ast = parse(tokenize(source));
  const matchExpr = ast.body[0].init;
  assertEqual(matchExpr.arms[0].pattern.type, 'IsPattern');
  assertEqual(matchExpr.arms[0].pattern.typeName, 'NotFoundError');
});

test('Parse match with is Type.String pattern', () => {
  const source = 'dec r = match val {\nis Type.String => "string"\n_ => "other"\n}';
  const ast = parse(tokenize(source));
  const matchExpr = ast.body[0].init;
  assertEqual(matchExpr.arms[0].pattern.type, 'IsPattern');
  assertEqual(matchExpr.arms[0].pattern.typeName, 'Type.String');
});

test('Parse match with array destructuring', () => {
  const source = 'dec label = match point {\n[0, 0] => "origin"\n[x, y] => "point"\n}';
  const ast = parse(tokenize(source));
  const matchExpr = ast.body[0].init;
  assertEqual(matchExpr.arms[0].pattern.type, 'ArrayDestructurePattern');
  assertEqual(matchExpr.arms[0].pattern.elements.length, 2);
});

// --- Match Expression Generator Tests ---
console.log('\n--- Match Expression Generator Tests ---\n');

test('Generate match with literal patterns (ternary)', () => {
  const source = 'dec msg = match 200 {\n200 => "OK"\n404 => "Not Found"\n_ => "Unknown"\n}';
  const js = generate(parse(tokenize(source)));
  // Simple literal match compiles to ternary chain
  assertContains(js, '=== 200');
  assertContains(js, '"OK"');
  assertContains(js, '"Not Found"');
  assertContains(js, '"Unknown"');
});

test('Generate match with when guard', () => {
  const source = 'dec tier = match 95 {\nn when n >= 90 => "A"\n_ => "F"\n}';
  const js = generate(parse(tokenize(source)));
  assertContains(js, '>= 90');
  assertContains(js, '"A"');
});

test('Generate match with object destructuring', () => {
  const source = 'dec r = match obj {\n{ status: 200, data } => data\n_ => null\n}';
  const js = generate(parse(tokenize(source)));
  assertContains(js, '=== 200');
  assertContains(js, 'data');
});

test('Generate match with is pattern', () => {
  const source = 'dec r = match err {\nis NotFoundError => "not found"\n_ => "other"\n}';
  const js = generate(parse(tokenize(source)));
  assertContains(js, '_subject instanceof NotFoundError');
});

test('Generate match with array destructuring', () => {
  const source = 'dec label = match point {\n[0, 0] => "origin"\n[x, y] => "point"\n}';
  const js = generate(parse(tokenize(source)));
  assertContains(js, 'Array.isArray');
  assertContains(js, '_subject[0] === 0');
});

test('Parse match with regex pattern', () => {
  const source = 'dec r = match input {\n/^hello/ => "greeting"\n_ => "other"\n}';
  const js = generate(parse(tokenize(source)));
  assertContains(js, '/^hello/.test(_subject)');
  assertContains(js, '"greeting"');
});

test('Generate match with regex pattern', () => {
  const source = 'dec r = match input {\n/^hello/ => "greeting"\n/^\\d+/ => "number"\n_ => "other"\n}';
  const js = generate(parse(tokenize(source)));
  assertContains(js, '/^hello/.test(_subject)');
  assertContains(js, '"greeting"');
});

test('Generate match with regex pattern and flags', () => {
  const source = 'dec r = match input {\n/^hello/i => "greeting"\n_ => "other"\n}';
  const js = generate(parse(tokenize(source)));
  assertContains(js, '/^hello/i.test(_subject)');
});

test('Generate match with regex pattern and guard', () => {
  const source = 'dec r = match input {\n/^hello/ when input.length > 10 => "long greeting"\n_ => "other"\n}';
  const js = generate(parse(tokenize(source)));
  assertContains(js, '/^hello/.test(_subject)');
  assertContains(js, '> 10');
});

// --- Contract pattern: type + guard + is ---

test('Guard is narrows type — direct property access after guard', () => {
  const source = 'type Point = {x: number, y: number}\nfn dist(p) {\nguard p is Point else { return 0 }\nreturn p.x + p.y\n}';
  const js = compile(source);
  // After guard, p should use . not ?.
  assertContains(js, 'p.x');
  assertContains(js, 'p.y');
  // The guard itself checks the shape via duck typing
  assertContains(js, "'x' in p");
  assertContains(js, "'y' in p");
});

test('Guard is composes — sequential guards merge shapes', () => {
  const source = 'type HasName = {name: string}\ntype HasEmail = {email: string}\nfn profile(u) {\nguard u is HasName else { return null }\nguard u is HasEmail else { return null }\nreturn u.name + u.email\n}';
  const js = compile(source);
  assertContains(js, 'u.name');
  assertContains(js, 'u.email');
});

test('Guard is with type alias produces duck type check', () => {
  const source = 'type Cacheable = {key: string, ttl: number}\nfn cache(item) {\nguard item is Cacheable else { return null }\nreturn item.key\n}';
  const js = compile(source);
  assertContains(js, "'key' in item");
  assertContains(js, "'ttl' in item");
  assertContains(js, 'item.key');
});

test('Guard is with primitive type narrows correctly', () => {
  const source = 'fn process(x) {\nguard x is Type.String else { return null }\nreturn x.length\n}';
  const js = compile(source);
  assertContains(js, "typeof x === 'string'");
});

test('Guard is with multiple types — intersection', () => {
  const source = 'type HasName = {name: string}\ntype HasEmail = {email: string}\nfn profile(u) {\nguard u is HasName, HasEmail else { return null }\nreturn u.name\n}';
  const js = compile(source);
  // Should check both shapes with AND
  assertContains(js, "'name' in u");
  assertContains(js, "'email' in u");
  assertContains(js, '&&');
  // After guard, direct access
  assertContains(js, 'u.name');
});

test('fn...is ReturnType — declared return type', () => {
  const source = 'type User = {name: string, email: string}\nfn createUser(n, e) is User {\nreturn {name: n, email: e}\n}\ndec u = createUser("a", "b")\nprint u.name';
  const js = compile(source);
  // Should parse without errors and produce valid JS
  assertContains(js, 'function createUser');
  assertContains(js, 'u.name');
});

test('Return type inference from object literal', () => {
  const source = 'fn makePoint(x, y) {\nreturn {x: x, y: y}\n}\ndec p = makePoint(1, 2)\nprint p.x';
  const js = compile(source);
  assertContains(js, 'function makePoint');
  assertContains(js, 'p.x');
});

test('Guard in with multiple types — union', () => {
  const source = 'type Circle = {radius: number}\ntype Rect = {width: number}\nfn describe(s) {\nguard s in Circle, Rect else { return null }\nreturn s\n}';
  const js = compile(source);
  // Should check either shape with OR
  assertContains(js, "'radius' in s");
  assertContains(js, "'width' in s");
  assertContains(js, '||');
});

test('Generate match returns null when no default arm', () => {
  const source = 'dec r = match x {\n1 => "one"\n}';
  const js = generate(parse(tokenize(source)));
  // Simple match without default appends null to ternary
  assertContains(js, 'null');
});

test('Type checker: match expression accepted', () => {
  const source = 'dec x = match 1 {\n1 => "one"\n_ => "other"\n}';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  const errors = checker.check(ast);
  assertEqual(errors.length, 0, 'match expression should type check without errors');
});

test('Full compile: match expression works end-to-end', () => {
  const source = 'dec msg = match 200 {\n200 => "OK"\n_ => "Unknown"\n}';
  const js = compile(source);
  assertContains(js, '=== 200');
  assertContains(js, '"OK"');
});

// --- Conditional Method (.if/.else) Tests ---
console.log('\n--- Conditional Method (.if/.else) Tests ---\n');

test('Parse .if() expression', () => {
  const source = 'dec x = 5.if(true)';
  const ast = parse(tokenize(source));
  assertEqual(ast.body[0].init.type, 'ConditionalMethodExpression');
  assertEqual(ast.body[0].init.fallback, null);
});

test('Parse .if().else() expression', () => {
  const source = 'dec x = "yes".if(true).else("no")';
  const ast = parse(tokenize(source));
  const expr = ast.body[0].init;
  assertEqual(expr.type, 'ConditionalMethodExpression');
  assertEqual(expr.fallback.value, 'no');
});

test('Generate .if().else()', () => {
  const js = compile('dec x = "premium".if(true).else("standard")');
  assertContains(js, '?');
  assertContains(js, '"premium"');
  assertContains(js, '"standard"');
});

test('Generate .if() without else returns null', () => {
  const js = compile('dec x = 500.if(true)');
  assertContains(js, '?');
  assertContains(js, 'null');
});

// --- Integration Tests for New Features ---
console.log('\n--- Integration Tests (New Features) ---\n');

test('Mut with for loop accumulator', () => {
  const js = compile(`
    fn sum(numbers) {
      mut total = 0
      for n in numbers {
        total = total + n
      }
      return total
    }
  `);
  assertContains(js, 'let total = 0');
  assertContains(js, 'total + n');
});

test('Guard with nullish coalescing', () => {
  const js = compile(`
    fn process(input) {
      guard input != null else { return null }
      dec name = input.name ?? "Anonymous"
      return name
    }
  `);
  assertContains(js, 'if (!(');
  assertContains(js, '??');
});

test('Match with .if().else()', () => {
  const js = compile(`
    fn categorize(score) {
      dec tier = match score {
        n when n >= 90 => "gold"
        n when n >= 70 => "silver"
        _ => "bronze"
      }
      dec label = "VIP".if(true).else("Regular")
      return label
    }
  `);
  assertContains(js, '_subject');
  assertContains(js, '?');
  assertContains(js, '"VIP"');
});

test('All features combined', () => {
  const js = generate(parse(tokenize(`
    fn processUsers(rawUsers) {
      guard rawUsers != null else { return null }
      dec defaultRole = config.defaultRole ?? "viewer"
      mut results = []
      for user in rawUsers {
        dec role = match user {
          { isAdmin: true } => "admin"
          _ => defaultRole
        }
        results = [...results, { name: user.name, role: role }]
      }
      return results
    }
  `)));
  assertContains(js, 'if (!(');
  assertContains(js, '??');
  assertContains(js, 'let results');
  assertContains(js, '_subject');
});

// --- Testing Framework Enhancement Tests ---
console.log('\n--- Testing Framework Enhancements ---\n');

test('Runtime: new matchers in compiled output', () => {
  const js = generate(parse(tokenize('test "x" { expect(1).toBeDefined() }')));
  assertContains(js, 'toBeDefined');
  assertContains(js, 'toBeUndefined');
  assertContains(js, 'toBeCloseTo');
  assertContains(js, 'toBeInstanceOf');
});

test('Runtime: .not modifier in compiled output', () => {
  const js = generate(parse(tokenize('test "x" { expect(1).toBe(1) }')));
  assertContains(js, 'not');
  assertContains(js, 'notMatchers');
});

test('Parse expect with .not modifier', () => {
  const ast = parse(tokenize('expect(x).not.toBe(5)'));
  const stmt = ast.body[0];
  assertEqual(stmt.type, 'ExpectStatement');
  assertEqual(stmt.negated, true);
  assertEqual(stmt.matcher, 'toBe');
});

test('Parse expect without .not', () => {
  const ast = parse(tokenize('expect(x).toBe(5)'));
  const stmt = ast.body[0];
  assertEqual(stmt.negated || false, false);
});

test('Generate expect with .not', () => {
  const js = generate(parse(tokenize('expect(x).not.toBe(5)')));
  assertContains(js, '.not.toBe(');
});

test('Parse test.only', () => {
  const ast = parse(tokenize('test.only "critical" { assert true }'));
  assertEqual(ast.body[0].type, 'TestBlock');
  assertEqual(ast.body[0].modifier, 'only');
});

test('Parse test.skip', () => {
  const ast = parse(tokenize('test.skip "todo" { assert true }'));
  assertEqual(ast.body[0].type, 'TestBlock');
  assertEqual(ast.body[0].modifier, 'skip');
});

test('Parse test without modifier', () => {
  const ast = parse(tokenize('test "normal" { assert true }'));
  assertEqual(ast.body[0].modifier, null);
});

test('Parse describe.only', () => {
  const ast = parse(tokenize('describe.only "Auth" { test "login" { assert true } }'));
  assertEqual(ast.body[0].type, 'DescribeBlock');
  assertEqual(ast.body[0].modifier, 'only');
});

test('Parse describe.skip', () => {
  const ast = parse(tokenize('describe.skip "Legacy" { test "old" { assert true } }'));
  assertEqual(ast.body[0].type, 'DescribeBlock');
  assertEqual(ast.body[0].modifier, 'skip');
});

test('Generate test.only passes modifier', () => {
  const js = generate(parse(tokenize('test.only "critical" { assert true }')));
  assertContains(js, '"only"');
});

test('Generate test.skip passes modifier', () => {
  const js = generate(parse(tokenize('test.skip "todo" { assert true }')));
  assertContains(js, '"skip"');
});

test('Generate describe.only passes modifier', () => {
  const js = generate(parse(tokenize('describe.only "Auth" { test "login" { assert true } }')));
  assertContains(js, '"only"');
});

test('Runtime has skip/only support', () => {
  const js = generate(parse(tokenize('test "x" { assert true }')));
  assertContains(js, '_hasOnly');
  assertContains(js, 'skipped');
  assertContains(js, 'shouldSkip');
});

test('Tokenize beforeEach keyword', () => {
  const tokens = tokenize('beforeEach { }');
  assertEqual(tokens[0].type, 'BEFORE_EACH');
});

test('Tokenize afterAll keyword', () => {
  const tokens = tokenize('afterAll { }');
  assertEqual(tokens[0].type, 'AFTER_ALL');
});

test('Parse beforeEach block', () => {
  const ast = parse(tokenize('describe "x" { beforeEach { dec x = 1 } test "t" { assert true } }'));
  const body = ast.body[0].body.body;
  assertEqual(body[0].type, 'BeforeEachBlock');
});

test('Parse all four hook types', () => {
  const source = 'describe "x" { beforeAll { } afterAll { } beforeEach { } afterEach { } test "t" { assert true } }';
  const ast = parse(tokenize(source));
  const body = ast.body[0].body.body;
  assertEqual(body[0].type, 'BeforeAllBlock');
  assertEqual(body[1].type, 'AfterAllBlock');
  assertEqual(body[2].type, 'BeforeEachBlock');
  assertEqual(body[3].type, 'AfterEachBlock');
});

test('Generate beforeEach hook', () => {
  const js = generate(parse(tokenize('describe "x" { beforeEach { dec x = 1 } test "t" { assert true } }')));
  assertContains(js, '_beforeEach(');
});

test('Generate afterAll hook', () => {
  const js = generate(parse(tokenize('describe "x" { afterAll { print "done" } test "t" { assert true } }')));
  assertContains(js, '_afterAll(');
});

test('Runtime includes hook registration functions', () => {
  const js = generate(parse(tokenize('test "x" { assert true }')));
  assertContains(js, 'function _beforeAll');
  assertContains(js, 'function _afterAll');
  assertContains(js, 'function _beforeEach');
  assertContains(js, 'function _afterEach');
});

test('Runtime executes hooks in describe', () => {
  const js = generate(parse(tokenize('test "x" { assert true }')));
  assertContains(js, 'item.beforeAll');
  assertContains(js, 'item.afterAll');
  assertContains(js, 'item.beforeEach');
  assertContains(js, 'item.afterEach');
});

// --- KMDocs Tests ---
console.log('\n--- KMDocs Tests ---\n');

test('Lexer: tokenize doc comment as DOC_COMMENT', () => {
  const tokens = tokenize('/** @param {number} x */\ndec x = 1');
  const docToken = tokens.find(t => t.type === 'DOC_COMMENT');
  assertEqual(docToken !== undefined, true, 'Should have a DOC_COMMENT token');
  assertContains(docToken.value, '@param');
});

test('Lexer: regular block comment is still filtered', () => {
  const tokens = tokenize('/* regular comment */\ndec x = 1');
  const docToken = tokens.find(t => t.type === 'DOC_COMMENT');
  assertEqual(docToken, undefined, 'Regular block comment should not produce DOC_COMMENT');
});

test('Lexer: line comment unchanged', () => {
  const tokens = tokenize('// line comment\ndec x = 1');
  const docToken = tokens.find(t => t.type === 'DOC_COMMENT');
  assertEqual(docToken, undefined, 'Line comment should not produce DOC_COMMENT');
});

test('Lexer: multiline doc comment', () => {
  const source = '/**\n * Does something.\n * @param {string} name\n */\nfn foo(name) { return name }';
  const tokens = tokenize(source);
  const docToken = tokens.find(t => t.type === 'DOC_COMMENT');
  assertEqual(docToken !== undefined, true);
  assertContains(docToken.value, '@param');
  assertContains(docToken.value, 'string');
});

test('Parser: attach kmdoc to function declaration', () => {
  const source = '/** @param {number} a */\nfn add(a) { return a }';
  const ast = parse(tokenize(source));
  const fn = ast.body[0];
  assertEqual(fn.type, 'FunctionDeclaration');
  assertEqual(fn.kmdoc !== undefined, true, 'Should have kmdoc');
  assertEqual(fn.kmdoc.params.length, 1);
  assertEqual(fn.kmdoc.params[0].name, 'a');
  assertEqual(fn.kmdoc.params[0].type, 'number');
});

test('Parser: attach kmdoc with @returns', () => {
  const source = '/**\n * @param {string} name\n * @returns {string}\n */\nfn greet(name) { return "Hi " + name }';
  const ast = parse(tokenize(source));
  const fn = ast.body[0];
  assertEqual(fn.kmdoc.returns.type, 'string');
});

test('Parser: attach @type to dec', () => {
  const source = '/** @type {number[]} */\ndec nums = [1, 2, 3]';
  const ast = parse(tokenize(source));
  const dec = ast.body[0];
  assertEqual(dec.kmdoc.type, 'number[]');
});

test('Parser: kmdoc with description', () => {
  const source = '/**\n * Adds two numbers.\n * @param {number} a - First\n * @param {number} b - Second\n * @returns {number} The sum\n */\nfn add(a, b) { return a + b }';
  const ast = parse(tokenize(source));
  const fn = ast.body[0];
  assertEqual(fn.kmdoc.description, 'Adds two numbers.');
  assertEqual(fn.kmdoc.params.length, 2);
  assertEqual(fn.kmdoc.params[0].description, 'First');
  assertEqual(fn.kmdoc.returns.description, 'The sum');
});

test('Parser: no kmdoc when no doc comment', () => {
  const ast = parse(tokenize('fn add(a, b) { return a + b }'));
  assertEqual(ast.body[0].kmdoc, undefined);
});

test('Parser: kmdoc before expose fn', () => {
  const source = '/** @param {number} x */\nexpose fn double(x) { return x * 2 }';
  const ast = parse(tokenize(source));
  assertEqual(ast.body[0].kmdoc.params[0].type, 'number');
});

test('Parse collect expression', () => {
  const ast = parse(tokenize('dec result = collect [a, b]'));
  const init = ast.body[0].init;
  assertEqual(init.type, 'ConcurrentExpression');
  assertEqual(init.mode, 'collect');
  assertEqual(init.elements.length, 2);
  assertEqual(init.elements[0].name, 'a');
  assertEqual(init.elements[1].name, 'b');
});

test('Parse hoard expression', () => {
  const ast = parse(tokenize('dec result = hoard [a, b, c]'));
  const init = ast.body[0].init;
  assertEqual(init.type, 'ConcurrentExpression');
  assertEqual(init.mode, 'hoard');
  assertEqual(init.elements.length, 3);
});

test('Parse race expression', () => {
  const ast = parse(tokenize('dec winner = race [a, b]'));
  const init = ast.body[0].init;
  assertEqual(init.type, 'ConcurrentExpression');
  assertEqual(init.mode, 'race');
  assertEqual(init.elements.length, 2);
});

test('Parse bind expression', () => {
  const ast = parse(tokenize('dec x = collect [fetchUser.(1)]'));
  const init = ast.body[0].init;
  assertEqual(init.type, 'ConcurrentExpression');
  const elem = init.elements[0];
  assertEqual(elem.type, 'BindExpression');
  assertEqual(elem.callee.name, 'fetchUser');
  assertEqual(elem.arguments.length, 1);
  assertEqual(elem.arguments[0].value, 1);
});

test('Parse bind expression with multiple args', () => {
  const ast = parse(tokenize('dec x = collect [fetch.("url", opts)]'));
  const elem = ast.body[0].init.elements[0];
  assertEqual(elem.type, 'BindExpression');
  assertEqual(elem.callee.name, 'fetch');
  assertEqual(elem.arguments.length, 2);
});

test('Parse mixed identifiers and bind expressions', () => {
  const ast = parse(tokenize('dec x = collect [fetchAll, fetchOne.(1)]'));
  const init = ast.body[0].init;
  assertEqual(init.elements[0].type, 'Identifier');
  assertEqual(init.elements[1].type, 'BindExpression');
});

test('Type checker: parseTypeString number', () => {
  const checker = new TypeChecker();
  const t = checker.parseTypeString('number');
  assertEqual(t.kind, 'number');
});

test('Type checker: parseTypeString string[]', () => {
  const checker = new TypeChecker();
  const t = checker.parseTypeString('string[]');
  assertEqual(t.kind, 'array');
  assertEqual(t.elementType.kind, 'string');
});

test('Type checker: parseTypeString object shape', () => {
  const checker = new TypeChecker();
  const t = checker.parseTypeString('{name: string, age: number}');
  assertEqual(t.kind, 'object');
  assertEqual(t.properties.name.kind, 'string');
  assertEqual(t.properties.age.kind, 'number');
});

test('Type checker: parseTypeString function type', () => {
  const checker = new TypeChecker();
  const t = checker.parseTypeString('(number, string) => boolean');
  assertEqual(t.kind, 'function');
  assertEqual(t.params.length, 2);
  assertEqual(t.params[0].kind, 'number');
  assertEqual(t.returnType.kind, 'boolean');
});

test('Type checker: parseTypeString any', () => {
  const checker = new TypeChecker();
  const t = checker.parseTypeString('any');
  assertEqual(t.kind, 'any');
});

test('Type checker: parseTypeString custom type', () => {
  const checker = new TypeChecker();
  const t = checker.parseTypeString('User');
  assertEqual(t.kind, 'unknown');
  assertEqual(t.name, 'User');
});

test('Type checker: KMDoc param type catches wrong argument', () => {
  const source = '/** @param {number} x */\nfn double(x) { return x * 2 }\ndouble("hello")';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  const errors = checker.check(ast);
  const callError = errors.find(e => e.message.includes('expects number') || e.message.includes('Argument'));
  assertEqual(callError !== undefined, true, 'Should error on wrong argument type');
});

test('Type checker: KMDoc param type allows correct argument', () => {
  const source = '/** @param {number} x */\nfn double(x) { return x * 2 }\ndouble(5)';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  const errors = checker.check(ast);
  const callError = errors.find(e => e.message.includes('expects') || e.message.includes('Argument'));
  assertEqual(callError, undefined, 'Should not error on correct argument type');
});

test('Type checker: function without KMDoc still works', () => {
  const source = 'fn add(a, b) { return a + b }\nadd(1, 2)';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  const errors = checker.check(ast);
  assertEqual(errors.length, 0);
});

test('Type checker: partial KMDoc — some params annotated', () => {
  const source = '/** @param {string} name */\nfn greet(name, count) { return name }\ngreet("hi", 5)';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  const errors = checker.check(ast);
  assertEqual(errors.length, 0, 'Partial annotation should work without errors');
});

test('Type checker: @type on dec validates init value', () => {
  const source = '/** @type {string} */\ndec x = 42';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  const errors = checker.check(ast);
  const typeError = errors.find(e => e.message.includes('declared as'));
  assertEqual(typeError !== undefined, true, 'Should error when init type mismatches @type');
});

test('Type checker: @type on dec accepts matching type', () => {
  const source = '/** @type {number} */\ndec x = 42';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  const errors = checker.check(ast);
  const typeErrors = errors.filter(e => e.message.includes('declared as'));
  assertEqual(typeErrors.length, 0, 'Matching type should not error');
});

test('Type checker: @type on mut', () => {
  const source = '/** @type {number} */\nmut count = 0';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  const errors = checker.check(ast);
  const typeErrors = errors.filter(e => e.message.includes('declared as'));
  assertEqual(typeErrors.length, 0, 'Matching mut type should not error');
});

// --- Codegen Optimization Tests ---
console.log('\n--- Codegen Optimization Tests ---\n');

test('Opt1: dec emits const without _deepFreeze', () => {
  const js = compile('dec x = 42');
  assertContains(js, 'const x = 42;');
  assertEqual(js.includes('_deepFreeze'), false, 'Should not use _deepFreeze');
});

test('Opt1: dec object emits const without _deepFreeze', () => {
  const js = compile('dec obj = { a: 1 }');
  assertContains(js, 'const obj =');
  assertEqual(js.includes('_deepFreeze'), false, 'Should not use _deepFreeze on objects');
});

test('Opt1: _deepFreeze function not in output', () => {
  const js = compile('dec x = 1');
  assertEqual(js.includes('function _deepFreeze'), false, 'Should not emit _deepFreeze function');
});

test('js {} is removed — produces parse error', () => {
  let threw = false;
  try {
    compile('js { console.log("hi"); }');
  } catch(e) {
    threw = true;
  }
  assertEqual(threw, true);
});

test('Opt2: known literal dec uses . not ?.', () => {
  const js = compile('dec obj = { name: "Alice" }\nprint obj.name');
  assertContains(js, 'obj.name');
  assertEqual(js.includes('obj?.name'), false, 'Known object should use . not ?.');
});

test('Opt2: nested known shape uses . throughout', () => {
  const js = compile('dec obj = { a: { b: 1 } }\nprint obj.a.b');
  assertContains(js, 'obj.a.b');
  assertEqual(js.includes('obj?.'), false, 'Fully known shape should not use obj?.');
  assertEqual(js.includes('obj.a?.'), false, 'Fully known nested shape should not use obj.a?.');
});

test('Opt2: unknown property uses ?.', () => {
  const js = compile('fn foo(x) { return x.name }');
  assertContains(js, '?.name');
});

test('Opt2: number literal known non-null', () => {
  const js = compile('dec x = 42\nprint x.toString()');
  assertEqual(js.includes('x?.toString'), false, 'Number should not use ?.');
});

test('Opt3: match as statement has no IIFE', () => {
  const js = generate(parse(tokenize('fn foo(x) {\nmatch x {\n1 => "one"\n_ => "other"\n}\n}')));
  // Should NOT contain the IIFE wrapper (() =>
  assertEqual(js.includes('(() => {'), false, 'Statement match should not have IIFE');
  assertContains(js, 'const _subject');
});

test('Opt3: simple match as expression uses ternary', () => {
  const js = generate(parse(tokenize('dec result = match x {\n1 => "one"\n_ => "other"\n}')));
  // Simple literal match compiles to ternary, not IIFE
  assertContains(js, '=== 1');
  assertContains(js, '?');
  assertContains(js, '"one"');
});

test('Opt3: complex match as expression still has IIFE', () => {
  const js = generate(parse(tokenize('dec result = match obj {\n{ status: 200 } => "ok"\n_ => "other"\n}')));
  assertContains(js, '(() => {');
});

test('Opt4: hello world has no _pipe or _flow', () => {
  const js = compile('print "hello"');
  assertEqual(js.includes('function _pipe'), false, 'Should not emit _pipe');
  assertEqual(js.includes('function _flow'), false, 'Should not emit _flow');
  assertEqual(js.includes('function _shell'), false, 'Should not emit _shell');
  assertEqual(js.includes('class _Secret'), false, 'Should not emit _Secret');
  assertEqual(js.includes('const _tests'), false, 'Should not emit test runtime');
});

test('Opt4: pipe code includes _pipe but not _flow', () => {
  const js = compile('fn double(x) { return x * 2 }\ndec result = 5 ~> double');
  assertContains(js, 'function _pipe');
  assertEqual(js.includes('function _flow'), false, 'Should not emit _flow when unused');
});

test('Opt4: test code includes test runtime', () => {
  const js = generate(parse(tokenize('test "x" { expect(1).toBe(1) }')));
  assertContains(js, 'const _tests');
  assertContains(js, 'function _expect');
});

test('Opt4: secret code includes _Secret', () => {
  const js = generate(parse(tokenize('secret dec key = "abc"')));
  assertContains(js, 'class _Secret');
});

test('Opt4: flow code includes _flow but not _pipe', () => {
  const js = compile('fn double(x) { return x * 2 }\ntransform >> double');
  assertContains(js, 'function _flow');
  assertEqual(js.includes('function _pipe'), false, 'Should not emit _pipe when unused');
});

test('collect works without async fn keyword', () => {
  const js = compile('fn main() { dec x = collect [a, b] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.all(');
  assertContains(js, 'async function main()');
});

test('sleep auto-makes function async', () => {
  const js = compile('fn main() { sleep 500 }', { skipTypeCheck: true });
  assertContains(js, 'async function main()');
});

test('async fn produces parse error', () => {
  let threw = false;
  try {
    compile('async fn main() { sleep 1000 }');
  } catch(e) {
    threw = true;
  }
  assertEqual(threw, true);
});

// === Generator: collect and race ===

test('Generate collect expression with bare identifiers', () => {
  const js = compile('fn main() { dec x = collect [a, b] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.all([a(), b()])');

});

test('Generate collect with bind expressions', () => {
  const js = compile('fn main() { dec x = collect [fetch.(1), fetch.(2)] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.all([fetch(1), fetch(2)])');
});

test('Generate collect with mixed identifiers and bind', () => {
  const js = compile('fn main() { dec x = collect [fetchAll, fetchOne.(1)] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.all([fetchAll(), fetchOne(1)])');
});

test('Generate race expression', () => {
  const js = compile('fn main() { dec x = race [a, b] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.race([a(), b()])');
});

test('Generate race with bind expressions', () => {
  const js = compile('fn main() { dec x = race [fast.("url1"), fast.("url2")] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.race([fast("url1"), fast("url2")])');
});

// === Generator: hoard with STATUS enum ===

test('Generate hoard expression', () => {
  const js = compile('fn main() { dec x = hoard [a, b] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.allSettled([a(), b()])');
  assertContains(js, 'STATUS.OK');
  assertContains(js, 'STATUS.REJECTED');
});

test('Generate hoard emits STATUS enum', () => {
  const js = compile('fn main() { dec x = hoard [a, b] }', { skipTypeCheck: true });
  assertContains(js, 'const STATUS = Object.freeze({ OK: "OK", REJECTED: "REJECTED" })');
});

test('STATUS enum not emitted without hoard', () => {
  const js = compile('fn main() { dec x = collect [a, b] }', { skipTypeCheck: true });
  const hasStatus = js.includes('const STATUS');
  assertEqual(hasStatus, false);
});

test('Generate worker inside collect without double await', () => {
  const source = `fn main() {
  dec [a, b] = collect [
    worker(x) { return x * 2 },
    worker(y) { return y + 1 }
  ]
}`;
  const js = compile(source, { skipTypeCheck: true });
  // Worker inside collect should NOT have await — collect handles it
  assertContains(js, 'Promise.all([');
  assertContains(js, '_worker(');
  // The worker calls inside Promise.all should not be individually awaited
  const workerInAll = js.match(/Promise\.all\(\[([^\]]+)\]/);
  assertEqual(workerInAll !== null, true);
  const insideAll = workerInAll[1];
  assertEqual(insideAll.includes('await'), false);
});

test('Generate spawn inside collect without double await', () => {
  const source = `fn main() {
  dec [a, b] = collect [
    spawn { cmd1 },
    spawn { cmd2 }
  ]
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'Promise.all([');
  assertContains(js, '_spawn(');
  const spawnInAll = js.match(/Promise\.all\(\[([^\]]+)\]/);
  assertEqual(spawnInAll !== null, true);
  const insideAll = spawnInAll[1];
  assertEqual(insideAll.includes('await'), false);
});

// === E2E: Concurrency Primitives ===

test('E2E: collect compiles to working Promise.all', () => {
  const source = `
fn fetchA() { return 1 }
fn fetchB() { return 2 }
fn main() {
  dec [a, b] = collect [fetchA, fetchB]
  print a
  print b
}
main()`;
  const js = compile(source);
  assertContains(js, 'await Promise.all([fetchA(), fetchB()])');
});

test('E2E: hoard compiles with STATUS mapping', () => {
  const source = `
fn ok() { return "yes" }
fn fail() { throw error("no") }
fn main() {
  dec results = hoard [ok, fail]
  print results
}
main()`;
  const js = compile(source);
  assertContains(js, 'await Promise.allSettled([ok(), fail()])');
  assertContains(js, 'STATUS.OK');
  assertContains(js, 'const STATUS = Object.freeze');
});

test('E2E: race compiles to Promise.race', () => {
  const source = `
fn fast() { return "first" }
fn slow() { return "second" }
fn main() {
  dec winner = race [fast, slow]
  print winner
}
main()`;
  const js = compile(source);
  assertContains(js, 'await Promise.race([fast(), slow()])');
});

test('E2E: bind expression with args in collect', () => {
  const source = `
fn fetch(id) { return id }
fn main() {
  dec [a, b] = collect [fetch.(1), fetch.(2)]
  print a
  print b
}
main()`;
  const js = compile(source);
  assertContains(js, 'await Promise.all([fetch(1), fetch(2)])');
});

test('E2E: bind expression standalone compiles to arrow', () => {
  const js = compile('fn main() { dec f = fetch.(1, 2) }', { skipTypeCheck: true });
  assertContains(js, '() => fetch(1, 2)');
});


// === Worker and Spawn parsing tests ===

test('Parse worker expression with inputs', () => {
  const ast = parse(tokenize('dec x = worker(data) { return data }'));
  const init = ast.body[0].init;
  assertEqual(init.type, 'WorkerExpression');
  assertEqual(init.inputs.length, 1);
  assertEqual(init.inputs[0], 'data');
  assertEqual(init.body.type, 'BlockStatement');
});

test('Parse worker expression with no inputs', () => {
  const ast = parse(tokenize('dec x = worker() { return 42 }'));
  const init = ast.body[0].init;
  assertEqual(init.type, 'WorkerExpression');
  assertEqual(init.inputs.length, 0);
});

test('Parse worker expression with multiple inputs', () => {
  const ast = parse(tokenize('dec x = worker(a, b) { return a + b }'));
  const init = ast.body[0].init;
  assertEqual(init.type, 'WorkerExpression');
  assertEqual(init.inputs.length, 2);
  assertEqual(init.inputs[0], 'a');
  assertEqual(init.inputs[1], 'b');
});

test('Parse spawn expression', () => {
  const ast = parse(tokenize('dec x = spawn { ls -la }'));
  const init = ast.body[0].init;
  assertEqual(init.type, 'SpawnBlock');
  assertEqual(init.command, 'ls -la');
  assertEqual(init.inputs.length, 0);
});

test('Parse spawn expression with inputs', () => {
  const ast = parse(tokenize('dec x = spawn(dir) { ls $dir }'));
  const init = ast.body[0].init;
  assertEqual(init.type, 'SpawnBlock');
  assertEqual(init.inputs.length, 1);
  assertEqual(init.inputs[0], 'dir');
  assertEqual(init.command, 'ls $dir');
});

test('Parse spawn as statement', () => {
  const ast = parse(tokenize('spawn { echo hello }'));
  const stmt = ast.body[0];
  assertEqual(stmt.type, 'SpawnBlock');
  assertEqual(stmt.command, 'echo hello');
});


// --- Generator: spawn tests ---

test('Generate spawn expression', () => {
  const js = compile('fn main() { dec x = spawn { ls -la } }', { skipTypeCheck: true });
  assertContains(js, 'await _spawn("ls -la")');
});

test('Generate spawn expression with inputs', () => {
  const js = compile('fn main() { dec x = spawn(dir) { ls $dir } }', { skipTypeCheck: true });
  assertContains(js, 'await _spawn("ls $dir", { dir })');
});

test('Generate spawn as statement', () => {
  const js = compile('fn main() { spawn { echo hello } }', { skipTypeCheck: true });
  assertContains(js, 'await _spawn("echo hello")');
});

test('Generate spawn emits _spawn helper', () => {
  const js = compile('fn main() { dec x = spawn { ls } }', { skipTypeCheck: true });
  assertContains(js, 'async function _spawn(');
});

test('_spawn helper not emitted without spawn', () => {
  const js = compile('fn main() { dec x = 1 }', { skipTypeCheck: true });
  const hasSpawn = js.includes('function _spawn');
  assertEqual(hasSpawn, false);
});

// --- Generator: worker tests ---

test('Generate worker expression with inputs', () => {
  const js = compile('fn main() { dec x = worker(data) { return data * 2 } }', { skipTypeCheck: true });
  assertContains(js, 'await _worker(');
  assertContains(js, 'data * 2');
});

test('Generate worker expression with no inputs', () => {
  const js = compile('fn main() { dec x = worker() { return 42 } }', { skipTypeCheck: true });
  assertContains(js, 'await _worker(');
  assertContains(js, 'return 42');
});

test('Generate worker expression with multiple inputs', () => {
  const js = compile('fn main() { dec x = worker(a, b) { return a + b } }', { skipTypeCheck: true });
  assertContains(js, 'await _worker(');
  assertContains(js, '[a, b]');
});

test('Generate worker emits _worker helper', () => {
  const js = compile('fn main() { dec x = worker() { return 1 } }', { skipTypeCheck: true });
  assertContains(js, 'async function _worker(');
});

test('_worker helper not emitted without worker', () => {
  const js = compile('fn main() { dec x = 1 }', { skipTypeCheck: true });
  const hasWorker = js.includes('function _worker');
  assertEqual(hasWorker, false);
});

// === E2E: worker and spawn ===

test('E2E: worker compiles with type checking', () => {
  const source = `
fn main() {
  dec result = worker(x) {
    return x * 2
  }
  print result
}
main()`;
  const js = compile(source);
  assertContains(js, 'await _worker(');
  assertContains(js, 'async function _worker(');
});

test('E2E: spawn compiles with type checking', () => {
  const source = `
fn main() {
  dec result = spawn { echo hello }
  print result.stdout
}
main()`;
  const js = compile(source);
  assertContains(js, 'await _spawn("echo hello")');
  assertContains(js, 'async function _spawn(');
});


test('E2E: worker and spawn with collect', () => {
  const source = `
fn main() {
  dec [computed, listed] = collect [
    worker(n) { return n * n },
    spawn { ls }
  ]
  print computed
  print listed.stdout
}
main()`;
  const js = compile(source);
  assertContains(js, 'Promise.all([');
  assertContains(js, '_worker(');
  assertContains(js, '_spawn(');
});

test('E2E: spawn with input variables compiles correctly', () => {
  const source = `
fn main() {
  dec dir = "/tmp"
  dec result = spawn(dir) { ls $dir }
  print result.stdout
}
main()`;
  const js = compile(source);
  assertContains(js, 'await _spawn("ls $dir", { dir })');
});

// --- Sleep Statement Tests ---
console.log('\n--- Sleep Statement Tests ---\n');

test('Tokenize sleep keyword', () => {
  const tokens = tokenize('sleep 1000');
  assertEqual(tokens[0].type, 'SLEEP');
});

test('Parse sleep statement', () => {
  const ast = parse(tokenize('fn main() { sleep 1000 }'));
  const stmt = ast.body[0].body.body[0];
  assertEqual(stmt.type, 'SleepStatement');
  assertEqual(stmt.duration.value, 1000);
});

test('Parse sleep with expression', () => {
  const ast = parse(tokenize('fn main() { sleep x * 1000 }'));
  const stmt = ast.body[0].body.body[0];
  assertEqual(stmt.type, 'SleepStatement');
  assertEqual(stmt.duration.type, 'BinaryExpression');
});

test('Generate sleep statement', () => {
  const js = compile('fn main() { sleep 1000 }', { skipTypeCheck: true });
  assertContains(js, 'await new Promise(resolve => setTimeout(resolve, 1000))');
});

// Extern Declaration Tests
console.log('\n--- Extern Declaration Tests ---\n');

test('Parse named extern with functions', () => {
  const source = 'extern "node:fs" {\n  fn readFileSync(path: string): string\n  fn existsSync(path: string): boolean\n}';
  const ast = parse(tokenize(source));
  const ext = ast.body[0];
  assertEqual(ext.type, 'ExternDeclaration');
  assertEqual(ext.source, 'node:fs');
  assertEqual(ext.declarations.length, 2);
  assertEqual(ext.declarations[0].kind, 'function');
  assertEqual(ext.declarations[0].name, 'readFileSync');
  assertEqual(ext.declarations[0].params.length, 1);
  assertEqual(ext.declarations[0].params[0].name, 'path');
  assertEqual(ext.declarations[0].params[0].typeAnnotation, 'string');
  assertEqual(ext.declarations[0].returnType, 'string');
  assertEqual(ext.declarations[1].name, 'existsSync');
});

test('Parse named extern with values', () => {
  const source = 'extern "node:process" {\n  dec env: any\n  dec pid: number\n}';
  const ast = parse(tokenize(source));
  const ext = ast.body[0];
  assertEqual(ext.type, 'ExternDeclaration');
  assertEqual(ext.source, 'node:process');
  assertEqual(ext.declarations.length, 2);
  assertEqual(ext.declarations[0].kind, 'value');
  assertEqual(ext.declarations[0].name, 'env');
  assertEqual(ext.declarations[0].valueType, 'any');
  assertEqual(ext.declarations[1].name, 'pid');
  assertEqual(ext.declarations[1].valueType, 'number');
});

test('Parse named extern with mixed fn and dec', () => {
  const source = 'extern "pg" {\n  fn query(sql: string): any\n  dec Pool: any\n}';
  const ast = parse(tokenize(source));
  const ext = ast.body[0];
  assertEqual(ext.declarations.length, 2);
  assertEqual(ext.declarations[0].kind, 'function');
  assertEqual(ext.declarations[1].kind, 'value');
});

test('Parse extern fn with no params', () => {
  const source = 'extern "mod" {\n  fn now(): number\n}';
  const ast = parse(tokenize(source));
  assertEqual(ast.body[0].declarations[0].params.length, 0);
  assertEqual(ast.body[0].declarations[0].returnType, 'number');
});

test('Parse extern fn with multiple params', () => {
  const source = 'extern "mod" {\n  fn write(path: string, data: string, enc: string): void\n}';
  const ast = parse(tokenize(source));
  const fn = ast.body[0].declarations[0];
  assertEqual(fn.params.length, 3);
  assertEqual(fn.params[2].name, 'enc');
  assertEqual(fn.params[2].typeAnnotation, 'string');
  assertEqual(fn.returnType, 'void');
});

test('Parse extern default declaration', () => {
  const source = 'extern default "express" as express: any';
  const ast = parse(tokenize(source));
  const ext = ast.body[0];
  assertEqual(ext.type, 'ExternDefaultDeclaration');
  assertEqual(ext.source, 'express');
  assertEqual(ext.alias, 'express');
  assertEqual(ext.aliasType, 'any');
});

test('Parse extern default with complex type', () => {
  const source = 'extern default "pg" as pg: {Pool: any, Client: any}';
  const ast = parse(tokenize(source));
  const ext = ast.body[0];
  assertEqual(ext.type, 'ExternDefaultDeclaration');
  assertEqual(ext.source, 'pg');
  assertEqual(ext.alias, 'pg');
  assertEqual(ext.aliasType, '{Pool: any, Client: any}');
});

test('Parse extern with node platform', () => {
  const source = 'extern node "node:fs" {\n  fn readFileSync(path: string): string\n}';
  const ast = parse(tokenize(source));
  assertEqual(ast.body[0].platform, 'node');
  assertEqual(ast.body[0].source, 'node:fs');
});

test('Parse extern with browser platform', () => {
  const source = 'extern browser "react" {\n  dec createElement: any\n}';
  const ast = parse(tokenize(source));
  assertEqual(ast.body[0].platform, 'browser');
  assertEqual(ast.body[0].source, 'react');
});

test('Parse extern without platform (universal)', () => {
  const source = 'extern "lodash" {\n  fn map(arr: any, callback: any): any\n}';
  const ast = parse(tokenize(source));
  assertEqual(ast.body[0].platform, null);
});

test('Parse extern default with browser platform', () => {
  const source = 'extern browser default "react-dom" as ReactDOM: any';
  const ast = parse(tokenize(source));
  assertEqual(ast.body[0].platform, 'browser');
  assertEqual(ast.body[0].alias, 'ReactDOM');
});

test('Parse extern dec with alias', () => {
  const source = 'extern "react" {\n  dec memo as memoize: any\n}';
  const ast = parse(tokenize(source));
  const decl = ast.body[0].declarations[0];
  assertEqual(decl.name, 'memo');
  assertEqual(decl.alias, 'memoize');
});

test('Parse extern fn with alias', () => {
  const source = 'extern "mod" {\n  fn original as renamed(x: any): any\n}';
  const ast = parse(tokenize(source));
  const decl = ast.body[0].declarations[0];
  assertEqual(decl.name, 'original');
  assertEqual(decl.alias, 'renamed');
});

test('Generate extern alias import', () => {
  const source = 'extern "react" {\n  dec memo as memoize: any\n}\ndec x = memoize({})';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'import { memo as memoize }');
});

test('Extern alias keyword rejected', () => {
  let threw = false;
  try {
    parse(tokenize('extern "mod" {\n  dec foo as match: any\n}'));
  } catch(e) {
    threw = true;
    assertContains(e.message, 'keyword');
  }
  assertEqual(threw, true);
});

test('Type checker: extern fn registers in scope', () => {
  const source = 'extern "mod" {\n  fn greet(name: string): string\n}\ndec x = greet("hi")';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const greetErrors = errors.filter(e => e.message.includes('greet'));
  assertEqual(greetErrors.length, 0);
});

test('Type checker: extern dec registers in scope', () => {
  const source = 'extern "mod" {\n  dec config: any\n}\ndec x = config';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const configErrors = errors.filter(e => e.message.includes('config'));
  assertEqual(configErrors.length, 0);
});

test('Type checker: extern default registers in scope', () => {
  const source = 'extern default "express" as express: any\ndec app = express()';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const expressErrors = errors.filter(e => e.message.includes('express'));
  assertEqual(expressErrors.length, 0);
});

test('Type checker: extern fn validates param types', () => {
  const source = 'extern "mod" {\n  fn readFile(path: string): string\n}\ndec x = readFile(123)';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const typeErrors = errors.filter(e => e.message.includes('Expected string'));
  assertEqual(typeErrors.length, 1);
});

test('Generate extern named import for used symbol', () => {
  const source = 'extern "node:fs" {\n  fn readFileSync(path: string): string\n}\ndec x = readFileSync("file.txt")';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, "import { readFileSync } from 'node:fs'");
});

test('Generate extern does not import unused symbols', () => {
  const source = 'extern "node:fs" {\n  fn readFileSync(path: string): string\n  fn writeFileSync(path: string, data: string): void\n}\ndec x = readFileSync("file.txt")';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, "import { readFileSync } from 'node:fs'");
  const importLine = js.split('\n').find(l => l.includes('import') && l.includes('node:fs'));
  assertEqual(importLine.includes('writeFileSync'), false);
});

test('Generate extern default import', () => {
  const source = 'extern default "express" as express: any\ndec app = express()';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, "import express from 'express'");
});

test('Generate extern default not imported if unused', () => {
  const source = 'extern default "express" as express: any\ndec x = 1';
  const js = compile(source, { skipTypeCheck: true });
  const hasImport = js.includes("import express from");
  assertEqual(hasImport, false);
});

test('Generate extern imports before runtime import', () => {
  const source = 'extern "node:fs" {\n  fn readFileSync(path: string): string\n}\ndec x = readFileSync("f")';
  const js = compile(source, { skipTypeCheck: true });
  const fsImportIdx = js.indexOf("import { readFileSync }");
  const runtimeImportIdx = js.indexOf("import { _obj, error }");
  assertEqual(fsImportIdx < runtimeImportIdx, true);
});

test('Generate extern produces no runtime code for the block itself', () => {
  const source = 'extern "node:fs" {\n  fn readFileSync(path: string): string\n}';
  const js = compile(source, { skipTypeCheck: true });
  const hasRead = js.includes('readFileSync');
  assertEqual(hasRead, false);
});

test('Generate multiple extern blocks from same module', () => {
  const source = 'extern "node:fs" {\n  fn readFileSync(path: string): string\n}\nextern "node:fs" {\n  fn existsSync(path: string): boolean\n}\ndec a = readFileSync("f")\ndec b = existsSync("f")';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'readFileSync');
  assertContains(js, 'existsSync');
  assertContains(js, "from 'node:fs'");
});

test('E2E: extern named fn compiles with type checking', () => {
  const source = `
extern "node:fs" {
  fn readFileSync(path: string): string
  fn existsSync(path: string): boolean
}

fn main() {
  dec content = readFileSync("file.txt")
  dec exists = existsSync("file.txt")
  print content
}
main()`;
  const js = compile(source);
  assertContains(js, "import { readFileSync, existsSync } from 'node:fs'");
  assertContains(js, 'readFileSync("file.txt")');
  assertContains(js, 'existsSync("file.txt")');
});

test('E2E: extern default compiles with type checking', () => {
  const source = `
extern default "express" as express: any

fn main() {
  dec app = express()
  print app
}
main()`;
  const js = compile(source);
  assertContains(js, "import express from 'express'");
  assertContains(js, 'express()');
});

test('E2E: extern dec value compiles with type checking', () => {
  const source = `
extern "node:process" {
  dec argv: any
}

fn main() {
  dec args = argv
  print args
}
main()`;
  const js = compile(source);
  assertContains(js, "import { argv } from 'node:process'");
});

test('E2E: extern with async and collect', () => {
  const source = `
extern "node:fs/promises" {
  fn readFile(path: string): any
}

fn main() {
  dec [a, b] = collect [readFile.("a.txt"), readFile.("b.txt")]
  print a
}
main()`;
  const js = compile(source);
  assertContains(js, "import { readFile } from 'node:fs/promises'");
  assertContains(js, 'Promise.all([readFile("a.txt"), readFile("b.txt")])');
});

test('E2E: extern unused symbols not imported', () => {
  const source = `
extern "node:fs" {
  fn readFileSync(path: string): string
  fn writeFileSync(path: string, data: string): void
}

fn main() {
  dec x = readFileSync("f")
}
main()`;
  const js = compile(source);
  assertContains(js, "import { readFileSync } from 'node:fs'");
  const importLine = js.split('\n').find(l => l.includes("from 'node:fs'"));
  assertEqual(importLine.includes('writeFileSync'), false);
});

// --- Foo.new() Constructor Syntax Tests ---
console.log('\n--- Constructor Syntax Tests ---\n');

test('Generate Foo.new() compiles to new Foo()', () => {
  const js = compile('dec x = Date.new()', { skipTypeCheck: true });
  assertContains(js, 'new Date()');
});

test('Generate Foo.new(args) compiles to new Foo(args)', () => {
  const js = compile('dec x = Pool.new({host: "localhost"})', { skipTypeCheck: true });
  assertContains(js, 'new Pool(');
  assertContains(js, 'host: "localhost"');
});

test('Generate Foo.new().method() chains correctly', () => {
  const js = compile('dec x = Date.new().toISOString()', { skipTypeCheck: true });
  assertContains(js, 'new Date()');
  assertContains(js, 'toISOString()');
});

test('Generate Foo.new() with multiple args', () => {
  const js = compile('dec x = Error.new("something failed")', { skipTypeCheck: true });
  assertContains(js, 'new Error("something failed")');
});

test('Generate Foo.new() with extern', () => {
  const source = 'extern "pg" {\n  dec Pool: any\n}\ndec pool = Pool.new({host: "localhost"})';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, "import { Pool } from 'pg'");
  assertContains(js, 'new Pool(');
});

// --- Reverse Compiler (js2km) Tests ---
console.log('\n--- Reverse Compiler Tests ---\n');

test('js2km: named imports become extern block', () => {
  const km = convertJS('import { readFileSync, writeFileSync } from "node:fs";');
  assertContains(km, 'extern "node:fs" {');
  assertContains(km, 'dec readFileSync: any');
  assertContains(km, 'dec writeFileSync: any');
});

test('js2km: default import becomes extern default', () => {
  const km = convertJS('import express from "express";');
  assertContains(km, 'extern default "express" as express: any');
});

test('js2km: require becomes extern default', () => {
  const km = convertJS('const pg = require("pg");');
  assertContains(km, 'extern default "pg" as pg: any');
});

test('js2km: new expression emits Foo.new()', () => {
  const km = convertJS('const d = new Date();');
  assertContains(km, 'Date.new()');
});

test('js2km: async function converted without async keyword', () => {
  const km = convertJS('async function fetchData(url) { return await fetch(url); }');
  assertContains(km, 'fn fetchData(url)');
  const hasAsync = km.includes('async');
  assertEqual(hasAsync, false);
});

test('js2km: async arrow function converted without async keyword', () => {
  const km = convertJS('const f = async (x) => { return x; };');
  assertContains(km, 'fn(x)');
  const hasAsync = km.includes('async');
  assertEqual(hasAsync, false);
});

test('js2km: Express app reverse compiles', () => {
  const km = convertJS(`
import express from 'express';
import { json } from 'express';
import { Pool } from 'pg';

const app = express();
app.use(json());

const pool = new Pool({ host: 'localhost' });

app.get('/users', async (req, res) => {
  const result = await pool.query('SELECT * FROM users');
  res.json(result.rows);
});

app.listen(3000, () => {
  console.log('running');
});
`);
  // Extern declarations
  assertContains(km, 'extern default "express" as express: any');
  assertContains(km, 'extern "express" {');
  assertContains(km, 'dec json: any');
  assertContains(km, 'extern "pg" {');
  assertContains(km, 'dec Pool: any');
  // App setup
  assertContains(km, 'dec app = express()');
  assertContains(km, 'app.use(json())');
  // new Pool emits Foo.new()
  assertContains(km, 'Pool.new(');
  // Route handler has no async keyword
  assertContains(km, 'fn(req, res)');
  // Await stripped — just the call
  assertContains(km, 'pool.query(');
  // console.log becomes print
  assertContains(km, 'print');
});

// --- Type.Union tests ---

test('Type checker: parseTypeString parses union type', () => {
  const tc = new TypeChecker();
  const type = tc.parseTypeString('string | null');
  assertEqual(type.kind, 'union');
  assertEqual(type.members.length, 2);
  assertEqual(type.members[0].kind, 'string');
  assertEqual(type.members[1].kind, 'null');
});

test('Type checker: parseTypeString parses union without spaces', () => {
  const tc = new TypeChecker();
  const type = tc.parseTypeString('string|null');
  assertEqual(type.kind, 'union');
  assertEqual(type.members.length, 2);
});

test('Type checker: parseTypeString parses triple union', () => {
  const tc = new TypeChecker();
  const type = tc.parseTypeString('string | number | boolean');
  assertEqual(type.kind, 'union');
  assertEqual(type.members.length, 3);
});

test('Type checker: parseTypeString deduplicates union members', () => {
  const tc = new TypeChecker();
  const type = tc.parseTypeString('string | string');
  assertEqual(type.kind, 'string');
});

test('Type checker: parseTypeString absorbs any in union', () => {
  const tc = new TypeChecker();
  const type = tc.parseTypeString('string | any');
  assertEqual(type.kind, 'any');
});

test('Type checker: parseTypeString handles array union', () => {
  const tc = new TypeChecker();
  const type = tc.parseTypeString('string[] | null');
  assertEqual(type.kind, 'union');
  assertEqual(type.members[0].kind, 'array');
  assertEqual(type.members[1].kind, 'null');
});

test('Type checker: typeToString formats union', () => {
  const tc = new TypeChecker();
  const type = tc.parseTypeString('string | null');
  const str = tc.typeToString(type);
  assertEqual(str, 'string | null');
});

test('Type checker: string is compatible with string | null', () => {
  const tc = new TypeChecker();
  const union = tc.parseTypeString('string | null');
  const str = tc.parseTypeString('string');
  assertEqual(tc.isCompatible(union, str), true);
});

test('Type checker: null is compatible with string | null', () => {
  const tc = new TypeChecker();
  const union = tc.parseTypeString('string | null');
  const nul = tc.parseTypeString('null');
  assertEqual(tc.isCompatible(union, nul), true);
});

test('Type checker: number is NOT compatible with string | null', () => {
  const tc = new TypeChecker();
  const union = tc.parseTypeString('string | null');
  const num = tc.parseTypeString('number');
  assertEqual(tc.isCompatible(union, num), false);
});

test('Type checker: string | null is NOT compatible with string', () => {
  const tc = new TypeChecker();
  const str = tc.parseTypeString('string');
  const union = tc.parseTypeString('string | null');
  assertEqual(tc.isCompatible(str, union), false);
});

test('Type checker: string | null is compatible with string | null', () => {
  const tc = new TypeChecker();
  const union1 = tc.parseTypeString('string | null');
  const union2 = tc.parseTypeString('string | null');
  assertEqual(tc.isCompatible(union1, union2), true);
});

test('Type checker: string is compatible with string | number', () => {
  const tc = new TypeChecker();
  const union = tc.parseTypeString('string | number');
  const str = tc.parseTypeString('string');
  assertEqual(tc.isCompatible(union, str), true);
});

test('Type checker: string | null NOT compatible with string | number', () => {
  const tc = new TypeChecker();
  const expected = tc.parseTypeString('string | number');
  const actual = tc.parseTypeString('string | null');
  assertEqual(tc.isCompatible(expected, actual), false);
});

// Task 3: Union types in extern declarations

test('Type checker: extern fn with union param validates correctly', () => {
  const source = 'extern "mod" {\n  fn read(path: string | null): string\n}\ndec x = read("file")';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const readErrors = errors.filter(e => e.message.includes('read'));
  assertEqual(readErrors.length, 0);
});

test('Type checker: extern fn with union param rejects wrong type', () => {
  const source = 'extern "mod" {\n  fn read(path: string | null): string\n}\ndec x = read(123)';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const typeErrors = errors.filter(e => e.message.includes('Expected'));
  assertEqual(typeErrors.length, 1);
});

test('Type checker: extern fn with union return type', () => {
  const source = 'extern "mod" {\n  fn find(id: number): string | null\n}\ndec x = find(1)';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length, 0);
});

// Task 4: Union types in KMDocs

test('Type checker: KMDoc union param validates correctly', () => {
  const source = '/** @param {string | null} name */\nfn greet(name) { return name }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length, 0);
});

test('Type checker: KMDoc union param rejects wrong type at call site', () => {
  const source = '/** @param {string | null} name */\nfn greet(name) { return name }\ndec x = greet(123)';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const typeErrors = errors.filter(e => e.message.includes('Expected'));
  assertEqual(typeErrors.length, 1);
});

test('Type checker: KMDoc union return type', () => {
  const source = '/** @returns {string | null} */\nfn find(id) { return null }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length, 0);
});

// Task 5: Guard-based type narrowing

test('Type checker: guard narrows string | null to string', () => {
  const source = `
extern "mod" {
  fn find(id: number): string | null
}
fn main() {
  dec x = find(1)
  guard x != null else { return null }
  dec y = x
}`;
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length, 0);
});

test('Type checker: without guard, union stays wide', () => {
  const source = `
/** @param {string | null} name */
fn greet(name) {
  return name
}`;
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length, 0);
});

test('Type checker: guard narrows object | null to object', () => {
  const source = `
extern "mod" {
  fn findUser(id: number): {name: string} | null
}
fn main() {
  dec user = findUser(1)
  guard user != null else { return null }
  print user.name
}`;
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length, 0);
});

// Task 6: Union-aware argument error messages

test('Type checker: error message includes union type', () => {
  const source = 'extern "mod" {\n  fn read(path: string | null): string\n}\ndec x = read(123)';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length >= 1, true);
  assertContains(errors[0].message, 'string | null');
});

// Task 7: End-to-end tests for union types

test('E2E: extern with union types compiles', () => {
  const source = `
extern "node:fs" {
  fn readFileSync(path: string, encoding: string | null): string | null
}
fn main() {
  dec content = readFileSync("file.txt", null)
  guard content != null else { return null }
  print content
}
main()`;
  const js = compile(source);
  assertContains(js, "import { readFileSync } from 'node:fs'");
  assertContains(js, 'readFileSync("file.txt", null)');
});

test('E2E: KMDoc union types compile', () => {
  const source = `
/** @param {string | null} name */
fn greet(name) {
  guard name != null else { return "anonymous" }
  return "hello " + name
}
dec result = greet(null)
print result`;
  const js = compile(source);
  assertContains(js, 'function greet(name)');
});

test('E2E: union type error is caught at compile time', () => {
  const source = 'extern "mod" {\n  fn read(path: string | null): string\n}\ndec x = read(123)';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length >= 1, true);
  assertContains(errors[0].message, 'string | null');
});

// === Type declarations and generic params ===

test('Tokenize type keyword', () => {
  const tokens = tokenize('type Result = any');
  assertEqual(tokens[0].type, 'TYPE');
  assertEqual(tokens[0].value, 'type');
});

test('Parse type declaration without params', () => {
  const ast = parse(tokenize('type UserId = number'));
  const decl = ast.body[0];
  assertEqual(decl.type, 'TypeDeclaration');
  assertEqual(decl.name, 'UserId');
  assertEqual(decl.typeParams.length, 0);
  assertEqual(decl.body, 'number');
});

test('Parse type declaration with one param', () => {
  const ast = parse(tokenize('type Optional<T> = T | null'));
  const decl = ast.body[0];
  assertEqual(decl.type, 'TypeDeclaration');
  assertEqual(decl.name, 'Optional');
  assertEqual(decl.typeParams.length, 1);
  assertEqual(decl.typeParams[0], 'T');
});

test('Parse type declaration with multiple params', () => {
  const ast = parse(tokenize('type Pair<A, B> = {first: A, second: B}'));
  const decl = ast.body[0];
  assertEqual(decl.name, 'Pair');
  assertEqual(decl.typeParams.length, 2);
  assertEqual(decl.typeParams[0], 'A');
  assertEqual(decl.typeParams[1], 'B');
});

test('Parse extern fn with type params', () => {
  const source = 'extern "mod" {\n  fn identity<T>(value: T): T\n}';
  const ast = parse(tokenize(source));
  const fn = ast.body[0].declarations[0];
  assertEqual(fn.kind, 'function');
  assertEqual(fn.name, 'identity');
  assertEqual(fn.typeParams.length, 1);
  assertEqual(fn.typeParams[0], 'T');
  assertEqual(fn.params[0].typeAnnotation, 'T');
  assertEqual(fn.returnType, 'T');
});

test('Parse extern fn with multiple type params', () => {
  const source = 'extern "mod" {\n  fn map<T, U>(arr: T[], f: (T) => U): U[]\n}';
  const ast = parse(tokenize(source));
  const fn = ast.body[0].declarations[0];
  assertEqual(fn.typeParams.length, 2);
  assertEqual(fn.typeParams[0], 'T');
  assertEqual(fn.typeParams[1], 'U');
});

test('Parse extern fn without type params still works', () => {
  const source = 'extern "mod" {\n  fn read(path: string): string\n}';
  const ast = parse(tokenize(source));
  const fn = ast.body[0].declarations[0];
  assertEqual(fn.typeParams.length, 0);
});

test('Parse extern async fn', () => {
  const source = 'extern "pg" {\n  async fn query(sql: string): any\n  fn escape(str: string): string\n}';
  const ast = parse(tokenize(source));
  const decls = ast.body[0].declarations;
  assertEqual(decls[0].async, true);
  assertEqual(decls[0].name, 'query');
  assertEqual(decls[1].async, false);
  assertEqual(decls[1].name, 'escape');
});

// --- Generics: Type Aliases & Substitution (Task 3) ---
console.log('\n--- Generics: Type Aliases & Substitution ---\n');

test('Type checker: register and instantiate type alias', () => {
  const source = 'type Optional<T> = T | null';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  tc.check(ast);
  assertEqual(tc.typeAliases.has('Optional'), true);
});

test('Type checker: parseTypeString resolves type alias', () => {
  const source = 'type Optional<T> = T | null';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  tc.check(ast);
  const type = tc.parseTypeString('Optional<string>');
  assertEqual(type.kind, 'union');
  assertEqual(type.members.length, 2);
  assertEqual(type.members[0].kind, 'string');
  assertEqual(type.members[1].kind, 'null');
});

test('Type checker: parseTypeString resolves nested generic', () => {
  const source = 'type Result<T> = {ok: boolean, value: T}';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  tc.check(ast);
  const type = tc.parseTypeString('Result<number>');
  assertEqual(type.kind, 'object');
  assertEqual(type.properties.ok.kind, 'boolean');
  assertEqual(type.properties.value.kind, 'number');
});

test('Type checker: parseTypeString with multiple type args', () => {
  const source = 'type Pair<A, B> = {first: A, second: B}';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  tc.check(ast);
  const type = tc.parseTypeString('Pair<string, number>');
  assertEqual(type.kind, 'object');
  assertEqual(type.properties.first.kind, 'string');
  assertEqual(type.properties.second.kind, 'number');
});

test('Type checker: type alias without params', () => {
  const source = 'type UserId = number';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  tc.check(ast);
  const type = tc.parseTypeString('UserId');
  assertEqual(type.kind, 'number');
});

// --- Generics: Generic Extern Functions (Task 4) ---
console.log('\n--- Generics: Generic Extern Functions ---\n');

test('Type checker: generic extern fn registers with type params', () => {
  const source = 'extern "mod" {\n  fn identity<T>(value: T): T\n}\ndec x = identity("hello")';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length, 0);
  const fnInfo = tc.functions.get('identity');
  assertEqual(fnInfo.typeParams.length, 1);
  assertEqual(fnInfo.typeParams[0], 'T');
});

// --- Generics: Type Parameter Inference (Task 5) ---
console.log('\n--- Generics: Type Parameter Inference ---\n');

test('Type checker: infer generic return type from args', () => {
  const source = `
extern "mod" {
  fn identity<T>(value: T): T
}
dec x = identity("hello")`;
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  tc.check(ast);
  const xType = tc.lookupVariable('x');
  assertEqual(xType.kind, 'string');
});

test('Type checker: infer array element type', () => {
  const source = `
extern "mod" {
  fn first<T>(arr: T[]): T | null
}
dec nums = [1, 2, 3]
dec x = first(nums)`;
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  tc.check(ast);
  const xType = tc.lookupVariable('x');
  assertEqual(xType.kind, 'union');
});

test('Type checker: generic fn with no inference defaults to any', () => {
  const source = `
extern "mod" {
  fn create<T>(): T
}
dec x = create()`;
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  tc.check(ast);
  const xType = tc.lookupVariable('x');
  assertEqual(xType.kind, 'any');
});

test('Type checker: generic fn validates non-generic params', () => {
  const source = `
extern "mod" {
  fn find<T>(arr: T[], pred: string): T | null
}
dec x = find([1, 2], 123)`;
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const typeErrors = errors.filter(e => e.message.includes('Expected'));
  assertEqual(typeErrors.length, 1);
});

// --- Generics: End-to-End Tests (Task 6) ---
console.log('\n--- Generics: End-to-End Tests ---\n');

test('E2E: type declaration compiles (produces no JS)', () => {
  const source = `
type Optional<T> = T | null
type Result<T> = {ok: boolean, value: T}

fn main() {
  dec x = 1
  print x
}
main()`;
  const js = compile(source);
  const hasTypeDec = js.includes('Optional') || js.includes('Result');
  assertEqual(hasTypeDec, false);
  assertContains(js, 'function main()');
});

test('E2E: extern generic fn compiles with type checking', () => {
  const source = `
extern "mod" {
  fn identity<T>(value: T): T
}
fn main() {
  dec x = identity("hello")
  print x
}
main()`;
  const js = compile(source);
  assertContains(js, "import { identity } from 'mod'");
  assertContains(js, 'identity("hello")');
});

test('E2E: type alias used in extern', () => {
  const source = `
type Result<T> = {ok: boolean, value: T}

extern "mod" {
  fn query(sql: string): Result<string>
}

fn main() {
  dec r = query("SELECT 1")
  print r.ok
}
main()`;
  const js = compile(source);
  assertContains(js, "import { query } from 'mod'");
});

test('E2E: generic + union types compose', () => {
  const source = `
type Optional<T> = T | null

extern "mod" {
  fn find<T>(arr: T[]): Optional<T>
}

fn main() {
  dec nums = [1, 2, 3]
  dec x = find(nums)
  guard x != null else { return null }
  print x
}
main()`;
  const js = compile(source);
  assertContains(js, "import { find } from 'mod'");
});

// ==================== Auto-async detection ====================

test('Auto-async: function with shell is async', () => {
  const js = compile('fn main() { dec x = shell { ls } }', { skipTypeCheck: true });
  assertContains(js, 'async function main()');
});

test('Auto-async: function with sleep is async', () => {
  const js = compile('fn main() { sleep 1000 }', { skipTypeCheck: true });
  assertContains(js, 'async function main()');
});

test('Auto-async: function with collect is async', () => {
  const js = compile('fn main() { dec x = collect [a, b] }', { skipTypeCheck: true });
  assertContains(js, 'async function main()');
});

test('Auto-async: pure function is NOT async', () => {
  const js = compile('fn add(a, b) { return a + b }', { skipTypeCheck: true });
  const hasAsync = js.includes('async function add');
  assertEqual(hasAsync, false);
});

test('Auto-async: transitive — caller of async fn is async', () => {
  const source = 'fn inner() { sleep 1000 }\nfn outer() { inner() }';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'async function inner()');
  assertContains(js, 'async function outer()');
});

test('Auto-async: transitive inserts await on call', () => {
  const source = 'fn inner() { sleep 1000 }\nfn outer() { dec x = inner() }';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'await inner()');
});

test('Auto-async: extern async fn call is awaited', () => {
  const source = 'extern "mod" {\n  async fn fetch(url: string): any\n}\nfn main() { dec x = fetch("url") }';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'async function main()');
  assertContains(js, 'await fetch("url")');
});

test('Auto-async: extern non-async fn call is NOT awaited', () => {
  const source = 'extern "mod" {\n  fn parse(s: string): any\n}\nfn main() { dec x = parse("data") }';
  const js = compile(source, { skipTypeCheck: true });
  const hasAwait = js.includes('await parse(');
  assertEqual(hasAwait, false);
});

test('Tokenize module keyword', () => {
  const tokens = tokenize('module singleton');
  assertEqual(tokens[0].type, 'MODULE');
  assertEqual(tokens[0].value, 'module');
});

test('Parse module singleton directive', () => {
  const ast = parse(tokenize('module singleton\nfn main() { return 1 }'));
  assertEqual(ast.body[0].type, 'ModuleDirective');
  assertEqual(ast.body[0].directive, 'singleton');
});

test('Parse module with unknown directive errors', () => {
  let threw = false;
  try {
    parse(tokenize('module foobar'));
  } catch(e) {
    threw = true;
  }
  assertEqual(threw, true);
});

// Generator: module singleton tests

test('Generate module singleton has cache variable', () => {
  const source = 'module singleton\nexpose fn hello() { return "hi" }';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'let _singletonCache;');
});

test('Generate module singleton has cache check', () => {
  const source = 'module singleton\nexpose fn hello() { return "hi" }';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '_singletonCache');
  assertContains(js, 'return _singletonCache');
});

test('Generate module singleton caches result', () => {
  const source = 'module singleton\nexpose fn hello() { return "hi" }';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '_singletonCache =');
});

test('Generate module singleton bypasses cache with overrides', () => {
  const source = 'module singleton\nexpose fn hello() { return "hi" }';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '_hasOverrides');
});

test('Generate non-singleton module has no cache', () => {
  const source = 'expose fn hello() { return "hi" }';
  const js = compile(source, { skipTypeCheck: true });
  const hasCache = js.includes('_singletonCache');
  assertEqual(hasCache, false);
});

test('Generate module singleton with deps', () => {
  const source = 'module singleton\nas db dep myapp.db\nexpose fn query() { return db.run() }';
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '_singletonCache');
  assertContains(js, '_dep_db');
});

test('E2E: module singleton compiles with type checking', () => {
  const source = `
module singleton

expose fn greet(name) {
  return "hello " + name
}`;
  const js = compile(source);
  assertContains(js, 'let _singletonCache;');
  assertContains(js, 'if (_singletonCache && !_hasOverrides) return _singletonCache;');
  assertContains(js, 'function greet(name)');
});

test('E2E: module singleton with args compiles', () => {
  const source = `
module singleton

!arg dbUrl

expose fn getUrl() {
  return dbUrl
}`;
  const js = compile(source);
  assertContains(js, '_singletonCache');
  assertContains(js, "Required argument 'dbUrl'");
});

test('E2E: module singleton with extern compiles', () => {
  const source = `
module singleton

extern "pg" {
  dec Pool: any
}

dec pool = Pool.new({host: "localhost"})

expose fn query(sql) {
  return pool
}`;
  const js = compile(source);
  assertContains(js, '_singletonCache');
  assertContains(js, "import { Pool } from 'pg'");
});

// Is Operator Type Resolution Tests
console.log('\n--- Is Operator Type Resolution Tests ---\n');

test('Type checker annotates is Type.String as primitive', () => {
  const source = 'dec x = "hello"\ndec r = x is Type.String';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  checker.check(ast);
  // Find the binary expression node
  const binExpr = ast.body[1].init;
  assertEqual(binExpr.isKind, 'primitive');
  assertEqual(binExpr.isPrimitive, 'string');
});

test('Type checker annotates is with type alias as shape', () => {
  const source = 'type Point = {x: number, y: number}\ndec p = {x: 1, y: 2}\ndec r = p is Point';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  checker.check(ast);
  const binExpr = ast.body[2].init;
  assertEqual(binExpr.isKind, 'shape');
  assertEqual(binExpr.isKeys.join(','), 'x,y');
});

test('Type checker annotates is with unknown name as instanceof', () => {
  const source = 'dec e = error("oops")\ndec r = e is TypeError';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  checker.check(ast);
  const binExpr = ast.body[1].init;
  assertEqual(binExpr.isKind, 'instanceof');
});

test('Type checker annotates is not as negated', () => {
  const source = 'dec x = 42\ndec r = x is not Type.Number';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  checker.check(ast);
  const binExpr = ast.body[1].init;
  assertEqual(binExpr.isKind, 'primitive');
  assertEqual(binExpr.isPrimitive, 'number');
});

// IsPattern Type Resolution Tests
console.log('\n--- IsPattern Type Resolution Tests ---\n');

test('Type checker annotates IsPattern with type alias as shape', () => {
  const source = 'type Resp = {status: number, body: any}\ndec r = match val {\nis Resp => "response"\n_ => "other"\n}';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  checker.check(ast);
  const pattern = ast.body[1].init.arms[0].pattern;
  assertEqual(pattern.isKind, 'shape');
  assertEqual(pattern.isKeys.join(','), 'status,body');
});

test('Type checker annotates IsPattern Type.String as primitive', () => {
  const source = 'dec r = match val {\nis Type.String => "string"\n_ => "other"\n}';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  checker.check(ast);
  const pattern = ast.body[0].init.arms[0].pattern;
  assertEqual(pattern.isKind, 'primitive');
  assertEqual(pattern.isPrimitive, 'string');
});

test('Type checker annotates IsPattern with unknown name as instanceof', () => {
  const source = 'dec r = match err {\nis TypeError => "type error"\n_ => "other"\n}';
  const ast = parse(tokenize(source));
  const checker = new TypeChecker();
  checker.check(ast);
  const pattern = ast.body[0].init.arms[0].pattern;
  assertEqual(pattern.isKind, 'instanceof');
});

// Is Operator Generator Tests
console.log('\n--- Is Operator Generator Tests ---\n');

test('Generate is Type.String as typeof check', () => {
  const source = 'type Dummy = {a: number}\ndec x = "hi"\ndec r = x is Type.String';
  const js = compile(source);
  assertContains(js, "typeof x === 'string'");
});

test('Generate is Type.Array as Array.isArray', () => {
  const source = 'dec x = [1, 2]\ndec r = x is Type.Array';
  const js = compile(source);
  assertContains(js, 'Array.isArray(x)');
});

test('Generate is Type.Null as null check', () => {
  const source = 'dec x = null\ndec r = x is Type.Null';
  const js = compile(source);
  assertContains(js, 'x === null');
});

test('Generate is Type.Object as typeof object check', () => {
  const source = 'dec x = {a: 1}\ndec r = x is Type.Object';
  const js = compile(source);
  assertContains(js, "typeof x === 'object'");
  assertContains(js, '!Array.isArray(x)');
});

test('Generate is with type alias as key-in checks', () => {
  const source = 'type Point = {x: number, y: number}\ndec p = {x: 1, y: 2}\ndec r = p is Point';
  const js = compile(source);
  assertContains(js, "typeof p === 'object'");
  assertContains(js, "'x' in p");
  assertContains(js, "'y' in p");
});

test('Generate is with unknown name as instanceof', () => {
  const source = 'dec e = error("oops")\ndec r = e is TypeError';
  const js = compile(source);
  assertContains(js, 'e instanceof TypeError');
});

test('Generate is not negates the check', () => {
  const source = 'dec x = "hi"\ndec r = x is not Type.String';
  const js = compile(source);
  assertContains(js, "typeof x !== 'string'");
});

test('Generate is not with type alias negates shape check', () => {
  const source = 'type Point = {x: number, y: number}\ndec p = {x: 1}\ndec r = p is not Point';
  const js = compile(source);
  assertContains(js, '!(');
});

test('Generate is not with unknown name as negated instanceof', () => {
  const source = 'dec e = error("oops")\ndec r = e is not TypeError';
  const js = compile(source);
  assertContains(js, 'e instanceof TypeError');
  assertContains(js, '!(');
});

// Match Is Pattern Generator Tests
console.log('\n--- Match Is Pattern Generator Tests ---\n');

test('Generate match is Type.String pattern', () => {
  const source = 'dec val = "hello"\ndec r = match val {\nis Type.String => "string"\n_ => "other"\n}';
  const js = compile(source);
  assertContains(js, "typeof _subject === 'string'");
});

test('Generate match is type alias pattern', () => {
  const source = 'type Point = {x: number, y: number}\ndec val = {x: 1, y: 2}\ndec r = match val {\nis Point => "point"\n_ => "other"\n}';
  const js = compile(source);
  assertContains(js, "'x' in _subject");
  assertContains(js, "'y' in _subject");
});

test('Generate match is unknown name pattern as instanceof', () => {
  const source = 'dec r = match err {\nis TypeError => "type error"\n_ => "other"\n}';
  const js = generate(parse(tokenize(source)));
  assertContains(js, '_subject instanceof TypeError');
});

// Formatter Tests
console.log('\n--- Formatter Tests ---\n');

test('Formatter: converts tabs to spaces', () => {
  const result = format('\tfn main() {\n\t\treturn 1\n\t}');
  assertEqual(result.includes('\t'), false);
});

test('Formatter: strips trailing whitespace', () => {
  const result = format('fn main() {   \n  return 1   \n}');
  assertEqual(result.includes('   '), false);
});

test('Formatter: fixes indentation', () => {
  const result = format('fn main() {\n      return 1\n}');
  assertContains(result, '  return 1');
});

test('Formatter: adds blank line after shebang', () => {
  const result = format('#!/usr/bin/env kimchi\nfn main() {}');
  assertContains(result, '#!/usr/bin/env kimchi\n\nfn main()');
});

test('Formatter: collapses multiple empty lines', () => {
  const result = format('dec a = 1\n\n\n\ndec b = 2');
  const emptyCount = result.split('\n').filter(l => l === '').length;
  assertEqual(emptyCount <= 2, true);
});

test('Formatter: blank line after top-level closing brace', () => {
  const result = format('fn a() {\n  return 1\n}\nfn b() {\n  return 2\n}');
  assertContains(result, '}\n\nfn b()');
});

// === module pure tests ===

test('module pure: compiles without errors', () => {
  const source = 'module pure\nexpose fn add(a, b) { return a + b }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length, 0);
});

test('module pure: rejects env declaration', () => {
  const source = 'module pure\nenv FOO';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const pureErrors = errors.filter(e => e.message.includes('pure'));
  assertEqual(pureErrors.length >= 1, true);
});

test('module pure: rejects print', () => {
  const source = 'module pure\nprint "hello"';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const pureErrors = errors.filter(e => e.message.includes('pure'));
  assertEqual(pureErrors.length >= 1, true);
});

test('module pure: rejects sleep', () => {
  const source = 'module pure\nfn main() { sleep 1000 }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const pureErrors = errors.filter(e => e.message.includes('pure'));
  assertEqual(pureErrors.length >= 1, true);
});

test('module pure: rejects module-level mut', () => {
  const source = 'module pure\nmut x = 0';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const pureErrors = errors.filter(e => e.message.includes('pure'));
  assertEqual(pureErrors.length >= 1, true);
});

test('module pure: allows mut inside functions', () => {
  const source = 'module pure\nexpose fn counter() { mut i = 0\ni += 1\nreturn i }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const pureErrors = errors.filter(e => e.message.includes('pure'));
  assertEqual(pureErrors.length, 0);
});

test('module pure + singleton: errors', () => {
  const source = 'module pure\nmodule singleton\nexpose fn add(a, b) { return a + b }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const conflictErrors = errors.filter(e => e.message.includes('both'));
  assertEqual(conflictErrors.length >= 1, true);
});

// === lazy dep tests ===

test('Parse lazy dep', () => {
  const ast = parse(tokenize('lazy as db dep myapp.db'));
  const dep = ast.body[0];
  assertEqual(dep.type, 'DepStatement');
  assertEqual(dep.lazy, true);
  assertEqual(dep.alias, 'db');
});

test('Generate lazy dep at end of module', () => {
  const source = 'as http dep myapp.http\nlazy as db dep myapp.db\nexpose fn test() { return 1 }';
  const js = compile(source, { skipTypeCheck: true });
  // The await resolution of http should be before function declarations
  // The await resolution of db should be after function declarations
  const httpResolveIdx = js.indexOf('const http = _opts["myapp.http"] || await _dep_http()');
  const dbResolveIdx = js.indexOf('const db = _opts["myapp.db"] || await _dep_db()');
  const fnIdx = js.indexOf('function test');
  assertEqual(httpResolveIdx < fnIdx, true);
  assertEqual(dbResolveIdx > fnIdx, true);
});

// Browser target tests
test('Browser target: no export default wrapper', () => {
  const js = compile('dec x = 1\nprint x', { skipTypeCheck: true, target: 'browser' });
  const hasExport = js.includes('export default');
  assertEqual(hasExport, false);
});

test('Browser target: no import statements', () => {
  const js = compile('dec x = 1', { skipTypeCheck: true, target: 'browser' });
  const hasImport = js.includes('import ');
  assertEqual(hasImport, false);
});

test('Browser target: functions compile normally', () => {
  const js = compile('fn add(a, b) { return a + b }\nprint add(1, 2)', { skipTypeCheck: true, target: 'browser' });
  assertContains(js, 'function add(a, b)');
  assertContains(js, 'console.log(add(1, 2))');
});

test('Browser target: errors on arg declaration', () => {
  let threw = false;
  try { compile('!arg apiKey', { skipTypeCheck: true, target: 'browser' }); }
  catch(e) { threw = true; }
  assertEqual(threw, true);
});

test('Browser target: errors on extern node', () => {
  let threw = false;
  try { compile('extern node "node:fs" {\n  fn readFileSync(path: string): string\n}', { skipTypeCheck: true, target: 'browser' }); }
  catch(e) { threw = true; }
  assertEqual(threw, true);
});

test('Browser target: dep becomes module variable reference', () => {
  const js = compile('as utils dep lib.utils\nprint utils.add(1, 2)', { skipTypeCheck: true, target: 'browser' });
  assertContains(js, '_mod_lib_utils');
  assertEqual(js.includes('import '), false);
});

// Bundler Tests
console.log('\n--- Bundler Tests ---\n');

test('Bundler: single file produces ES module', () => {
  writeFileSync('/tmp/test_bundle.km', 'dec x = 1\nprint x');
  const result = bundle('/tmp/test_bundle.km');
  assertContains(result, 'console.log');
  assertEqual(result.includes('export default'), false);
  unlinkSync('/tmp/test_bundle.km');
});

test('Bundler: multi-file bundle', () => {
  mkdirSync('/tmp/tb_proj/lib', { recursive: true });
  writeFileSync('/tmp/tb_proj/lib/math.km', 'expose fn add(a, b) { return a + b }');
  writeFileSync('/tmp/tb_proj/app.km', 'as math dep lib.math\nprint math.add(1, 2)');
  const result = bundle('/tmp/tb_proj/app.km');
  assertContains(result, '_mod_lib_math');
  assertContains(result, 'function add');
  unlinkSync('/tmp/tb_proj/app.km');
  unlinkSync('/tmp/tb_proj/lib/math.km');
  rmdirSync('/tmp/tb_proj/lib');
  rmdirSync('/tmp/tb_proj');
});

test('Bundler: circular dependency detected', () => {
  mkdirSync('/tmp/tb_circ', { recursive: true });
  writeFileSync('/tmp/tb_circ/a.km', 'as b dep b\nprint 1');
  writeFileSync('/tmp/tb_circ/b.km', 'as a dep a\nexpose dec x = 1');
  let threw = false;
  try { bundle('/tmp/tb_circ/a.km'); } catch(e) {
    threw = true;
    assertContains(e.message, 'Circular');
  }
  assertEqual(threw, true);
  unlinkSync('/tmp/tb_circ/a.km');
  unlinkSync('/tmp/tb_circ/b.km');
  rmdirSync('/tmp/tb_circ');
});

test('Bundler: handles .kmx files', () => {
  writeFileSync('/tmp/tb_kmx.kmx', 'fn App() { return <div>hello</div> }');
  const result = bundle('/tmp/tb_kmx.kmx');
  assertContains(result, 'jsx("div"');
  assertContains(result, "import { jsx, jsxs, Fragment } from 'react/jsx-runtime'");
  unlinkSync('/tmp/tb_kmx.kmx');
});

// ===== Plugin System Tests =====

test('Plugin system: compile accepts plugins option', () => {
  const noopPlugin = { name: 'test-noop' };
  const js = compile('dec x = 1', { skipTypeCheck: true, plugins: [noopPlugin] });
  assertContains(js, 'const x = 1');
});

test('Plugin system: parser calls plugin parserRules', () => {
  let called = false;
  const testPlugin = {
    name: 'test-parser',
    parserRules(parser) { called = true; return null; }
  };
  compile('dec x = 1', { skipTypeCheck: true, plugins: [testPlugin] });
  assertEqual(called, true);
});

// ==================== KMX-React Plugin Tests ====================

test('KMX: simple element compiles to jsx()', () => {
  const js = compile('<div>hello</div>', { skipTypeCheck: true, plugins: [kmxReactPlugin] });
  assertContains(js, 'jsx("div"');
  assertContains(js, '"hello"');
});

test('KMX: element with string attribute', () => {
  const js = compile('<div className="foo">bar</div>', { skipTypeCheck: true, plugins: [kmxReactPlugin] });
  assertContains(js, 'jsx("div"');
  assertContains(js, 'className: "foo"');
});

test('KMX: self-closing element', () => {
  const js = compile('<br />', { skipTypeCheck: true, plugins: [kmxReactPlugin] });
  assertContains(js, 'jsx("br"');
});

test('KMX: component (uppercase) uses identifier', () => {
  const js = compile('<Header title="hi" />', { skipTypeCheck: true, plugins: [kmxReactPlugin] });
  assertContains(js, 'jsx(Header');
  assertContains(js, 'title: "hi"');
});

test('KMX: multiple children uses jsxs()', () => {
  const js = compile('<div><span>a</span><span>b</span></div>', { skipTypeCheck: true, plugins: [kmxReactPlugin] });
  assertContains(js, 'jsxs("div"');
  assertContains(js, 'children: [');
});

test('KMX: expression in children', () => {
  const js = compile('<div>{x + 1}</div>', { skipTypeCheck: true, plugins: [kmxReactPlugin] });
  assertContains(js, 'jsx("div"');
  assertContains(js, 'x + 1');
});

test('KMX: expression attribute', () => {
  const js = compile('<button onClick={handler}>click</button>', { skipTypeCheck: true, plugins: [kmxReactPlugin] });
  assertContains(js, 'onClick: handler');
});

test('KMX: key extracted to third argument', () => {
  const js = compile('<li key="k1">item</li>', { skipTypeCheck: true, plugins: [kmxReactPlugin] });
  assertContains(js, '"k1"');
});

test('KMX: nested elements', () => {
  const js = compile('<div><p><span>deep</span></p></div>', { skipTypeCheck: true, plugins: [kmxReactPlugin] });
  assertContains(js, 'jsx("div"');
  assertContains(js, 'jsx("p"');
  assertContains(js, 'jsx("span"');
});

test('KMX: JSX inside function', () => {
  const js = compile('fn App() {\n  return <div>hello</div>\n}', { skipTypeCheck: true, plugins: [kmxReactPlugin] });
  assertContains(js, 'function App()');
  assertContains(js, 'jsx("div"');
});

test('KMX: boolean attribute', () => {
  const js = compile('<input disabled />', { skipTypeCheck: true, plugins: [kmxReactPlugin] });
  assertContains(js, 'disabled: true');
});

test('KMX: fragment', () => {
  const js = compile('<><span>a</span><span>b</span></>', { skipTypeCheck: true, plugins: [kmxReactPlugin] });
  assertContains(js, 'jsxs(Fragment');
  assertContains(js, 'children: [');
});

test('KMX: auto-imports jsx-runtime', () => {
  const js = compile('fn App() { return <div>hi</div> }', { skipTypeCheck: true, plugins: [kmxReactPlugin] });
  assertContains(js, "import { jsx, jsxs, Fragment } from 'react/jsx-runtime'");
});

test('KMX: no jsx-runtime import without JSX', () => {
  const js = compile('dec x = 1', { skipTypeCheck: true, plugins: [kmxReactPlugin] });
  const hasJsxImport = js.includes('jsx-runtime');
  assertEqual(hasJsxImport, false);
});

// ==================== SQL Plugin Tests ====================

console.log('\n--- SQL Plugin Tests ---\n');

test('SQL: basic query without params', () => {
  const js = compile('dec r = sql { SELECT * FROM users }', { skipTypeCheck: true, plugins: [sqlPlugin] });
  assertContains(js, 'await db.query("SELECT * FROM users")');
});

test('SQL: parameterized query', () => {
  const js = compile('dec r = sql { SELECT * FROM users WHERE id = $id AND name = $name }', { skipTypeCheck: true, plugins: [sqlPlugin] });
  assertContains(js, '$1');
  assertContains(js, '$2');
  assertContains(js, '[id, name]');
});

test('SQL: is type annotation', () => {
  const js = compile('dec r = sql is User { SELECT * FROM users }', { skipTypeCheck: true, plugins: [sqlPlugin] });
  assertContains(js, 'await db.query("SELECT * FROM users")');
});

test('SQL: in type annotation with multiple types', () => {
  const js = compile('dec r = sql in Admin, User { SELECT * FROM accounts }', { skipTypeCheck: true, plugins: [sqlPlugin] });
  assertContains(js, 'await db.query("SELECT * FROM accounts")');
});

test('SQL: custom connection variable', () => {
  const js = compile('dec r = sql(pg) { SELECT 1 }', { skipTypeCheck: true, plugins: [sqlPlugin] });
  assertContains(js, 'await pg.query');
});

test('SQL: custom connection with type', () => {
  const js = compile('dec r = sql(myDb) is User { SELECT * FROM users }', { skipTypeCheck: true, plugins: [sqlPlugin] });
  assertContains(js, 'await myDb.query');
});

test('fn...in return type — union declaration', () => {
  const source = 'type Ok = {data: any}\ntype Err = {error: string}\nfn fetch(id) in Ok, Err {\nreturn {data: "x"}\n}';
  const js = compile(source);
  assertContains(js, 'function fetch');
});

test('fn...is return type — intersection with multiple types', () => {
  const source = 'type A = {x: number}\ntype B = {y: number}\nfn make() is A, B {\nreturn {x: 1, y: 2}\n}';
  const js = compile(source);
  assertContains(js, 'function make');
});

test('Expression: x is A, B — intersection', () => {
  const source = 'type A = {x: number}\ntype B = {y: number}\nfn test(obj) {\nreturn obj is A, B\n}';
  const js = compile(source);
  assertContains(js, "'x' in obj");
  assertContains(js, "'y' in obj");
  assertContains(js, '&&');
});

test('Expression: x in A, B — union', () => {
  const source = 'type C = {r: number}\ntype D = {w: number}\nfn test(obj) {\nreturn obj in C, D\n}';
  const js = compile(source);
  assertContains(js, "'r' in obj");
  assertContains(js, "'w' in obj");
  assertContains(js, '||');
});

test('Match with is multi-type pattern — intersection', () => {
  const source = 'type A = {x: number}\ntype B = {y: number}\nfn test(obj) {\nreturn match obj {\nis A, B => "both"\nis A => "just A"\n_ => "none"\n}\n}';
  const js = compile(source);
  assertContains(js, "'x' in _subject");
  assertContains(js, "'y' in _subject");
  assertContains(js, '&&');
});

test('Match with in multi-type pattern — union', () => {
  const source = 'type C = {r: number}\ntype D = {w: number}\nfn test(obj) {\nreturn match obj {\nin C, D => "shape"\n_ => "other"\n}\n}';
  const js = compile(source);
  assertContains(js, "'r' in _subject");
  assertContains(js, "'w' in _subject");
  assertContains(js, '||');
});

// ==================== Query Plugin Tests ====================

console.log('\n--- Query Plugin Tests ---\n');

test('Query: find by id', () => {
  const js = compile('dec u = query User { find 42 }', { skipTypeCheck: true, plugins: [queryPlugin] });
  assertContains(js, 'query.find("user", 42)');
});

test('Query: all', () => {
  const js = compile('dec u = query User { all }', { skipTypeCheck: true, plugins: [queryPlugin] });
  assertContains(js, 'query.all("user")');
});

test('Query: first and last', () => {
  const js = compile('dec f = query User { first }', { skipTypeCheck: true, plugins: [queryPlugin] });
  assertContains(js, 'query.first("user")');
  const js2 = compile('dec l = query User { last }', { skipTypeCheck: true, plugins: [queryPlugin] });
  assertContains(js2, 'query.last("user")');
});

test('Query: count', () => {
  const js = compile('dec n = query User { count }', { skipTypeCheck: true, plugins: [queryPlugin] });
  assertContains(js, 'query.count("user")');
});

test('Query: where with conditions', () => {
  const js = compile('dec u = query User { where {role: "admin", active: true} }', { skipTypeCheck: true, plugins: [queryPlugin] });
  assertContains(js, 'query.where("user"');
  assertContains(js, '"role": "admin"');
  assertContains(js, '"active": true');
});

test('Query: where + sortBy + limit + offset', () => {
  const js = compile('dec u = query User { where {active: true} sortBy "name" asc limit 10 offset 20 }', { skipTypeCheck: true, plugins: [queryPlugin] });
  assertContains(js, 'sortBy: "name"');
  assertContains(js, 'order: "asc"');
  assertContains(js, 'limit: 10');
  assertContains(js, 'offset: 20');
});

test('Query: create', () => {
  const js = compile('dec u = query User { create {name: "Alice", email: "a@test.com"} }', { skipTypeCheck: true, plugins: [queryPlugin] });
  assertContains(js, 'query.create("user"');
  assertContains(js, '"name": "Alice"');
});

test('Query: update', () => {
  const js = compile('query User { update 42 {name: "Bob"} }', { skipTypeCheck: true, plugins: [queryPlugin] });
  assertContains(js, 'query.update("user", 42');
  assertContains(js, '"name": "Bob"');
});

test('Query: remove', () => {
  const js = compile('query User { remove 42 }', { skipTypeCheck: true, plugins: [queryPlugin] });
  assertContains(js, 'query.remove("user", 42)');
});

test('Query: connection override', () => {
  const js = compile('dec u = query(analytics) User { find 1 }', { skipTypeCheck: true, plugins: [queryPlugin] });
  assertContains(js, 'analytics.find("user", 1)');
});

test('Query: variable interpolation', () => {
  const js = compile('dec u = query User { where {age: $minAge} }', { skipTypeCheck: true, plugins: [queryPlugin] });
  assertContains(js, '"age": minAge');
});

test('Query: include', () => {
  const js = compile('dec u = query User { find 42 include Post }', { skipTypeCheck: true, plugins: [queryPlugin] });
  assertContains(js, 'query.find("user", 42)');
  assertContains(js, 'query._include("post"');
  assertContains(js, '"user_id"');
});

// ==================== Annotations & Field Modifiers ====================

console.log('\n--- Annotations & Field Modifiers ---\n');

test('Annotation: @query.table parsed on type declaration', () => {
  const ast = parse(tokenize('@query.table({id: {primaryKey: true}})\ntype User = {id: number}'));
  const td = ast.body[0];
  assertEqual(td.type, 'TypeDeclaration');
  assertEqual(td.annotation.name, 'query.table');
});

test('Field modifier: optional ? skipped in is check', () => {
  const js = compile('type T = {name: string, bio: string?}\nfn f(x) {\nguard x is T else { return null }\nreturn x.name\n}');
  assertContains(js, "'name' in x");
  assertEqual(js.includes("'bio' in x"), false);
});

test('Field modifier: required ! included in is check', () => {
  const js = compile('type T = {name: string!}\nfn f(x) {\nguard x is T else { return null }\nreturn x.name\n}');
  assertContains(js, "'name' in x");
});

test('Query: @query.table annotation sets primary key column', () => {
  const js = compile('@query.table({id: {col: "user_id", primaryKey: true}})\ntype User = {id: number, name: string}\ndec u = query User { find 42 }', { skipTypeCheck: true, plugins: [queryPlugin] });
  assertContains(js, '"user_id"');
});

// ==================== Is Operator End-to-End Tests ====================

console.log('\n--- Is Operator End-to-End Tests ---\n');

test('is Type.String returns true for strings', () => {
  const source = 'dec x = "hello"\ndec r = x is Type.String\nprint r';
  const js = compile(source);
  assertContains(js, "typeof x === 'string'");
});

test('is with type alias duck types correctly', () => {
  const source = 'type Dog = {name: string, bark: string}\ndec d = {name: "Rex", bark: "woof"}\ndec r = d is Dog';
  const js = compile(source);
  assertContains(js, "'name' in d");
  assertContains(js, "'bark' in d");
});

test('is with empty object type checks typeof only', () => {
  const source = 'type Empty = {}\ndec x = {}\ndec r = x is Empty';
  const js = compile(source);
  assertContains(js, "typeof x === 'object'");
  assertContains(js, 'x !== null');
});

test('is with generic type alias checks keys only', () => {
  const source = 'type Result<T> = {ok: boolean, value: T}\ndec val = {ok: true, value: 1}\ndec r = match val {\nis Result => "result"\n_ => "other"\n}';
  const js = compile(source);
  assertContains(js, "'ok' in _subject");
  assertContains(js, "'value' in _subject");
});

test('is in catch pattern works with instanceof', () => {
  const source = `fn doSomething() {
  try {
    throw "oops"
  } catch(e) {
    |e is TypeError| => { return "type error" }
    |true| => { return "other" }
  }
}`;
  const js = compile(source);
  assertContains(js, 'instanceof TypeError');
});

test('is not Type.Number negates typeof check', () => {
  const source = 'dec x = "hi"\ndec r = x is not Type.Number';
  const js = compile(source);
  assertContains(js, "typeof x !== 'number'");
});

test('is not with type alias negates shape check', () => {
  const source = 'type Point = {x: number, y: number}\ndec p = 42\ndec r = p is not Point';
  const js = compile(source);
  assertContains(js, '!(');
  assertContains(js, "'x' in p");
});

// === Generator tests ===

test('Tokenize gen keyword', () => {
  const tokens = tokenize('gen { yield 1 }');
  assertEqual(tokens[0].type, 'GEN');
  assertEqual(tokens[2].type, 'YIELD');
});

test('Tokenize done keyword', () => {
  const tokens = tokenize('done');
  assertEqual(tokens[0].type, 'DONE');
});

test('Parse done literal', () => {
  const tokens = tokenize('dec x = done');
  const ast = parse(tokens);
  const decl = ast.body[0];
  assertEqual(decl.init.type, 'Literal');
  assertEqual(decl.init.value, 'done');
  assertEqual(decl.init.raw, 'done');
});

// === yield + gen block parsing tests ===

test('Parse yield expression', () => {
  const tokens = tokenize('dec next = gen { yield 42 }');
  const ast = parse(tokens);
  const genExpr = ast.body[0].init;
  const yieldExpr = genExpr.body.body[0].expression;
  assertEqual(yieldExpr.type, 'YieldExpression');
  assertEqual(yieldExpr.argument.value, 42);
});

test('Parse bare yield (no argument)', () => {
  const tokens = tokenize('dec next = gen { yield }');
  const ast = parse(tokens);
  const genExpr = ast.body[0].init;
  const yieldExpr = genExpr.body.body[0].expression;
  assertEqual(yieldExpr.type, 'YieldExpression');
  assertEqual(yieldExpr.argument, null);
});

test('Parse gen block with no params', () => {
  const tokens = tokenize('dec next = gen { yield 1 }');
  const ast = parse(tokens);
  const genExpr = ast.body[0].init;
  assertEqual(genExpr.type, 'GeneratorExpression');
  assertEqual(genExpr.params.length, 0);
  assertEqual(genExpr.body.body.length, 1);
});

test('Parse gen block with empty parens', () => {
  const tokens = tokenize('dec next = gen () { yield 1 }');
  const ast = parse(tokens);
  const genExpr = ast.body[0].init;
  assertEqual(genExpr.type, 'GeneratorExpression');
  assertEqual(genExpr.params.length, 0);
  assertEqual(genExpr.body.body.length, 1);
});

test('Parse gen block with params', () => {
  const tokens = tokenize('dec next = gen (max) { yield max }');
  const ast = parse(tokens);
  const genExpr = ast.body[0].init;
  assertEqual(genExpr.type, 'GeneratorExpression');
  assertEqual(genExpr.params.length, 1);
  assertEqual(genExpr.params[0], 'max');
});

// Task 5: done literal compilation
test('Generate done literal', () => {
  const js = compile('dec x = done', { skipTypeCheck: true });
  assertContains(js, 'const DONE = Object.freeze(Symbol("done"))');
  assertContains(js, 'const x = DONE');
});

test('done sentinel is tree-shaken when not used', () => {
  const js = compile('dec x = 42', { skipTypeCheck: true });
  assertEqual(js.includes('DONE'), false);
});

// Task 6: is Type.Done and is Type.Generator compilation
test('Generate is Type.Done check', () => {
  const source = `fn check(val) {
  return val is Type.Done
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '=== DONE');
});

test('Generate is done keyword check', () => {
  const source = `fn check(val) {
  return val is done
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '=== DONE');
});

test('Generate is not done keyword check', () => {
  const source = `fn check(val) {
  return val is not done
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '!==');
  assertContains(js, 'DONE');
});

test('Generate is not Type.Done check', () => {
  const source = `fn check(val) {
  return val is not Type.Done
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '!==');
  assertContains(js, 'DONE');
});

test('Generate is Type.Generator check', () => {
  const source = `fn check(val) {
  return val is Type.Generator
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '_isGenerator');
});

// Task 7: Type Checker support for done, generator, and is done
console.log('\n--- Task 7: Type Checker - done, generator, is done ---\n');

test('Type check gen block', () => {
  // Should not throw (compile without skipTypeCheck)
  const js = compile(`
dec pull = gen { yield 1 }
dec val = pull()
  `);
  assertContains(js, 'function*');
});

test('Type check done literal', () => {
  const js = compile('dec x = done');
  assertContains(js, 'DONE');
});

test('Type check is Type.Done', () => {
  const js = compile(`
fn check(val) {
  guard val is not Type.Done else { return }
  return val
}
  `);
  assertContains(js, 'DONE');
});

test('Type check is Type.Generator', () => {
  const js = compile(`
fn check(val) {
  return val is Type.Generator
}
  `);
  assertContains(js, '_isGenerator');
});

console.log('\n--- Gen Block Compilation Tests ---\n');

test('Generate basic gen block with IIFE wrapper', () => {
  const source = `dec pull = gen {
  yield 1
  yield 2
  yield 3
}`;
  const js = compile(source);
  assertContains(js, 'function*');
  assertContains(js, 'yield 1');
  assertContains(js, 'yield 2');
  assertContains(js, 'yield 3');
  assertContains(js, 'DONE');
  assertContains(js, '.next(');
  assertContains(js, '_isGenerator');
  assertContains(js, 'Symbol.iterator');
});

test('Generate gen block with params', () => {
  const source = `dec pull = gen (max) {
  mut i = 0
  while i < max {
    yield i
    i += 1
  }
}`;
  const js = compile(source);
  assertContains(js, 'function*(max)');
  assertContains(js, 'yield i');
  assertContains(js, '_isGenerator');
});

test('Generate yield as expression (receives value)', () => {
  const source = `dec pull = gen {
  mut val = yield "ready"
  yield val
}`;
  const js = compile(source);
  assertContains(js, 'yield "ready"');
  assertContains(js, '_sendValue');
});

test('Generate gen with empty parens', () => {
  const source = `dec pull = gen () {
  yield 42
}`;
  const js = compile(source);
  assertContains(js, 'function*()');
  assertContains(js, 'DONE');
  assertContains(js, '_isGenerator');
});

test('Generate async gen block', () => {
  const source = `dec pull = gen {
  sleep 100
  yield 1
  sleep 200
  yield 2
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'async function*');
  assertContains(js, 'await _iter.next(');
  assertContains(js, 'Symbol.asyncIterator');
});

// Task 10: Pipe composition with generators
console.log('\n--- Task 10: Pipe composition with generators ---\n');

test('Generate gen piped through function returns lazy wrapper', () => {
  const source = `fn double(x) { return x * 2 }
dec pull = gen {
  yield 1
  yield 2
  yield 3
}
dec doubled = pull ~> double`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '_pipe(');
  assertContains(js, '_isGenerator');
  assertContains(js, 'DONE');
});

// Task 11: for...in integration with generators
console.log('\n--- Task 11: for...in integration with generators ---\n');

test('for...in consumes generator via Symbol.iterator', () => {
  const source = `dec pull = gen {
  yield 1
  yield 2
  yield 3
}
for val in pull {
  print val
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, 'for (const val of');
  assertContains(js, 'Symbol.iterator');
});

// Task 12: Linter rules for generators
console.log('\n--- Task 12: Linter rules for generators ---\n');

test('Linter warns on yield outside gen block', () => {
  const source = `fn foo() { yield 1 }`;
  const linter = new Linter();
  const ast = parse(tokenize(source));
  const messages = linter.lint(ast, source);
  const yieldWarning = messages.find(m => m.rule === 'yield-outside-gen');
  assertEqual(yieldWarning !== undefined, true);
});

test('Linter warns on gen block without yield', () => {
  const source = `dec x = gen { dec y = 1 }`;
  const linter = new Linter();
  const ast = parse(tokenize(source));
  const messages = linter.lint(ast, source);
  const noYieldWarning = messages.find(m => m.rule === 'gen-without-yield');
  assertEqual(noYieldWarning !== undefined, true);
});

// Task 13: End-to-end integration tests for generators
console.log('\n--- Task 13: End-to-end integration tests for generators ---\n');

test('End-to-end: gen block produces values and done', () => {
  const source = `
dec pull = gen {
  yield 1
  yield 2
  yield 3
}
dec a = pull()
dec b = pull()
dec c = pull()
dec d = pull()
print a
print b
print c
print d is Type.Done
`;
  const js = compile(source);
  assertContains(js, 'function*');
  assertContains(js, 'DONE');
});

test('End-to-end: gen with params', () => {
  const source = `
dec pull = gen (start, end) {
  mut i = start
  while i < end {
    yield i
    i += 1
  }
}
for val in pull {
  print val
}
`;
  const js = compile(source);
  assertContains(js, 'function*(start, end)');
});

test('End-to-end: yield receives caller value', () => {
  const source = `
dec pull = gen {
  mut val = yield "ready"
  yield val + 1
}
dec first = pull()
dec second = pull(10)
print first
print second
`;
  const js = compile(source);
  assertContains(js, 'yield "ready"');
});

test('End-to-end: guard with is done keyword', () => {
  const source = `
dec pull = gen { yield 42 }
dec val = pull()
guard val is not done else { return }
print val
`;
  const js = compile(source);
  assertContains(js, 'DONE');
});

test('End-to-end: is done and is Type.Done are equivalent', () => {
  const source = `
fn check(val) {
  dec a = val is done
  dec b = val is Type.Done
  return a
}
`;
  const js = compile(source);
  const doneChecks = js.match(/=== DONE/g);
  assertEqual(doneChecks.length, 2);
});

test('End-to-end: gen with empty parens', () => {
  const source = `
dec pull = gen () {
  yield 1
  yield 2
}
dec a = pull()
print a
`;
  const js = compile(source);
  assertContains(js, 'DONE');
});

test('End-to-end: gen() result is Type.Generator', () => {
  const source = `
dec pull = gen { yield 1 }
print pull is Type.Generator
`;
  const js = compile(source);
  assertContains(js, '_isGenerator');
});

test('End-to-end: inline gen in for...in', () => {
  const source = `
for val in gen { yield 1
yield 2
yield 3 } {
  print val
}
`;
  const js = compile(source);
  assertContains(js, 'for (const val of');
  assertContains(js, 'function*');
});

test('End-to-end: inline gen() in for...in', () => {
  const source = `
for val in gen () { yield 10
yield 20 } {
  print val
}
`;
  const js = compile(source);
  assertContains(js, 'for (const val of');
  assertContains(js, 'function*');
});

test('End-to-end: match with done keyword', () => {
  const source = `
fn consume(pull) {
  match pull() {
    v is done => "exhausted"
    v => v
  }
}
`;
  const js = compile(source);
  assertContains(js, 'DONE');
});

test('Match-only is done triggers DONE sentinel', () => {
  const source = `
fn consume(pull) {
  match pull() {
    v is done => "exhausted"
    v => v
  }
}
`;
  const js = compile(source);
  assertContains(js, 'const DONE');
  assertContains(js, '=== DONE');
});

test('String "done" does not trigger DONE sentinel', () => {
  const source = 'dec x = "done"';
  const js = compile(source);
  assertEqual(js.includes('const DONE'), false);
  assertContains(js, '"done"');
});

test('Parameterized gen for...in without args throws', () => {
  const source = `dec pull = gen (max) {
  mut i = 0
  while i < max {
    yield i
    i += 1
  }
}`;
  const js = compile(source);
  assertContains(js, 'requires arguments');
});

// === Nested destructuring tests ===

test('Parse nested object destructuring', () => {
  const ast = parse(tokenize('dec { user: { name, age } } = data'));
  const decl = ast.body[0];
  assertEqual(decl.destructuring, true);
  const userProp = decl.pattern.properties[0];
  assertEqual(userProp.key, 'user');
  assertEqual(userProp.value.type, 'ObjectPattern');
  assertEqual(userProp.value.properties[0].key, 'name');
  assertEqual(userProp.value.properties[1].key, 'age');
});

test('Parse nested array destructuring', () => {
  const ast = parse(tokenize('dec [first, [a, b]] = matrix'));
  const decl = ast.body[0];
  assertEqual(decl.destructuring, true);
  const nested = decl.pattern.elements[1];
  assertEqual(nested.type, 'ArrayPattern');
  assertEqual(nested.elements[0].name, 'a');
  assertEqual(nested.elements[1].name, 'b');
});

test('Parse object with default value', () => {
  const ast = parse(tokenize('dec { role = "viewer" } = user'));
  const decl = ast.body[0];
  const prop = decl.pattern.properties[0];
  assertEqual(prop.key, 'role');
  assertEqual(prop.defaultValue.value, 'viewer');
});

test('Parse nested object with default', () => {
  const ast = parse(tokenize('dec { address: { city = "unknown" } } = user'));
  const decl = ast.body[0];
  const addrProp = decl.pattern.properties[0];
  assertEqual(addrProp.key, 'address');
  assertEqual(addrProp.value.type, 'ObjectPattern');
  const cityProp = addrProp.value.properties[0];
  assertEqual(cityProp.key, 'city');
  assertEqual(cityProp.defaultValue.value, 'unknown');
});

test('Parse array with default values', () => {
  const ast = parse(tokenize('dec [a = 0, b = 1] = arr'));
  const decl = ast.body[0];
  assertEqual(decl.pattern.elements[0].defaultValue.value, 0);
  assertEqual(decl.pattern.elements[1].defaultValue.value, 1);
});

test('Parse mixed nesting: object inside array', () => {
  const ast = parse(tokenize('dec [{ name }, { name: n2 }] = users'));
  const decl = ast.body[0];
  assertEqual(decl.pattern.elements[0].type, 'ObjectPattern');
  assertEqual(decl.pattern.elements[0].properties[0].key, 'name');
  assertEqual(decl.pattern.elements[1].type, 'ObjectPattern');
  assertEqual(decl.pattern.elements[1].properties[0].value, 'n2');
});

test('Parse array inside object', () => {
  const ast = parse(tokenize('dec { scores: [first, second] } = data'));
  const decl = ast.body[0];
  const scoresProp = decl.pattern.properties[0];
  assertEqual(scoresProp.key, 'scores');
  assertEqual(scoresProp.value.type, 'ArrayPattern');
  assertEqual(scoresProp.value.elements[0].name, 'first');
});

// Code Generation: Recursive Pattern Tests
console.log('\n--- Code Generation: Recursive Pattern Tests ---\n');

test('Generate nested object destructuring', () => {
  const js = compile('dec { user: { name, age } } = data', { skipTypeCheck: true });
  assertContains(js, 'const { user: { name, age } } = data');
});

test('Generate nested array destructuring', () => {
  const js = compile('dec [first, [a, b]] = matrix', { skipTypeCheck: true });
  assertContains(js, 'const [first, [a, b]] = matrix');
});

test('Generate object destructuring with default', () => {
  const js = compile('dec { role = "viewer" } = user', { skipTypeCheck: true });
  assertContains(js, 'const { role = "viewer" } = user');
});

test('Generate nested object with default', () => {
  const js = compile('dec { address: { city = "unknown" } } = user', { skipTypeCheck: true });
  assertContains(js, 'const { address: { city = "unknown" } } = user');
});

test('Generate array with defaults', () => {
  const js = compile('dec [a = 0, b = 1] = arr', { skipTypeCheck: true });
  assertContains(js, 'const [a = 0, b = 1] = arr');
});

test('Generate mixed nesting', () => {
  const js = compile('dec { scores: [first, second] } = data', { skipTypeCheck: true });
  assertContains(js, 'const { scores: [first, second] } = data');
});

test('Generate mut nested destructuring', () => {
  const js = compile('mut { user: { name } } = data', { skipTypeCheck: true });
  assertContains(js, 'let { user: { name } } = data');
});

test('Generate function param nested destructuring', () => {
  const source = `fn greet({ name, address: { city = "unknown" } }) {
  print name
}`;
  const js = compile(source, { skipTypeCheck: true });
  assertContains(js, '{ name, address: { city = "unknown" } }');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`\nTests: ${passed + failed} total, ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
