// KimchiLang Test Suite

import { compile, tokenize, parse, generate, KimchiCompiler } from '../src/index.js';
import { TypeChecker } from '../src/typechecker.js';
import { Linter } from '../src/linter.js';

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
  assertContains(js, '_id');
});

test('Generate match with array destructuring', () => {
  const source = 'dec label = match point {\n[0, 0] => "origin"\n[x, y] => "point"\n}';
  const js = generate(parse(tokenize(source)));
  assertContains(js, 'Array.isArray');
  assertContains(js, '_subject[0] === 0');
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

test('Opt1b: dec var passed to js() is Object.freeze-d', () => {
  const js = compile('dec config = { a: 1 }\njs(config) { console.log(config); }');
  assertContains(js, 'Object.freeze(config)');
});

test('Opt1b: mut var passed to js() is NOT frozen', () => {
  const js = generate(parse(tokenize('mut config = { a: 1 }\njs(config) { console.log(config); }')));
  assertEqual(js.includes('Object.freeze(config)'), false, 'mut should not be frozen');
});

test('Opt1b: js block without params has no freeze at call site', () => {
  // Check that no variable is wrapped with Object.freeze at the IIFE call site
  // The preamble always contains Object.freeze in _obj helper, so check the body portion
  const js = generate(parse(tokenize('js { console.log("hi"); }')));
  // Simple IIFE with no args: })(); — no variable should appear wrapped in Object.freeze(...)
  assertContains(js, '})();');
  // The IIFE call args should be empty (no Object.freeze wrapping)
  assertEqual(/\}\)\(Object\.freeze/.test(js), false, 'parameterless js block should not call with Object.freeze');
});

test('Opt1b: dec var in js expression is frozen', () => {
  const js = compile('dec nums = [1, 2, 3]\ndec sum = js(nums) { return nums.reduce((a, b) => a + b, 0); }');
  assertContains(js, 'Object.freeze(nums)');
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

test('Type checker: collect inside async fn is valid', () => {
  const source = 'async fn main() { dec x = collect [a, b] }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  // Should not have an error about collect outside async
  const concurrencyErrors = errors.filter(e => e.message.includes('must be inside an async function'));
  assertEqual(concurrencyErrors.length, 0);
});

test('Type checker: collect outside async fn is an error', () => {
  const source = 'fn main() { dec x = collect [a, b] }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const concurrencyErrors = errors.filter(e => e.message.includes('must be inside an async function'));
  assertEqual(concurrencyErrors.length, 1);
});

test('Type checker: hoard outside async fn is an error', () => {
  const source = 'fn main() { dec x = hoard [a, b] }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const concurrencyErrors = errors.filter(e => e.message.includes('must be inside an async function'));
  assertEqual(concurrencyErrors.length, 1);
});

test('Type checker: race outside async fn is an error', () => {
  const source = 'fn main() { dec x = race [a, b] }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const concurrencyErrors = errors.filter(e => e.message.includes('must be inside an async function'));
  assertEqual(concurrencyErrors.length, 1);
});

test('Type checker: collect at top level is an error', () => {
  const source = 'dec x = collect [a, b]';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const concurrencyErrors = errors.filter(e => e.message.includes('must be inside an async function'));
  assertEqual(concurrencyErrors.length, 1);
});

// === Generator: collect and race ===

test('Generate collect expression with bare identifiers', () => {
  const js = compile('async fn main() { dec x = collect [a, b] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.all([a(), b()])');
});

test('Generate collect with bind expressions', () => {
  const js = compile('async fn main() { dec x = collect [fetch.(1), fetch.(2)] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.all([fetch(1), fetch(2)])');
});

test('Generate collect with mixed identifiers and bind', () => {
  const js = compile('async fn main() { dec x = collect [fetchAll, fetchOne.(1)] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.all([fetchAll(), fetchOne(1)])');
});

test('Generate race expression', () => {
  const js = compile('async fn main() { dec x = race [a, b] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.race([a(), b()])');
});

test('Generate race with bind expressions', () => {
  const js = compile('async fn main() { dec x = race [fast.("url1"), fast.("url2")] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.race([fast("url1"), fast("url2")])');
});

// === Generator: hoard with STATUS enum ===

test('Generate hoard expression', () => {
  const js = compile('async fn main() { dec x = hoard [a, b] }', { skipTypeCheck: true });
  assertContains(js, 'await Promise.allSettled([a(), b()])');
  assertContains(js, 'STATUS.OK');
  assertContains(js, 'STATUS.REJECTED');
});

test('Generate hoard emits STATUS enum', () => {
  const js = compile('async fn main() { dec x = hoard [a, b] }', { skipTypeCheck: true });
  assertContains(js, 'const STATUS = Object.freeze({ OK: "OK", REJECTED: "REJECTED" })');
});

test('STATUS enum not emitted without hoard', () => {
  const js = compile('async fn main() { dec x = collect [a, b] }', { skipTypeCheck: true });
  const hasStatus = js.includes('const STATUS');
  assertEqual(hasStatus, false);
});

// === E2E: Concurrency Primitives ===

test('E2E: collect compiles to working Promise.all', () => {
  const source = `
async fn fetchA() { return 1 }
async fn fetchB() { return 2 }
async fn main() {
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
async fn ok() { return "yes" }
async fn fail() { throw error("no") }
async fn main() {
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
async fn fast() { return "first" }
async fn slow() { return "second" }
async fn main() {
  dec winner = race [fast, slow]
  print winner
}
main()`;
  const js = compile(source);
  assertContains(js, 'await Promise.race([fast(), slow()])');
});

test('E2E: bind expression with args in collect', () => {
  const source = `
async fn fetch(id) { return id }
async fn main() {
  dec [a, b] = collect [fetch.(1), fetch.(2)]
  print a
  print b
}
main()`;
  const js = compile(source);
  assertContains(js, 'await Promise.all([fetch(1), fetch(2)])');
});

test('E2E: bind expression standalone compiles to arrow', () => {
  const js = compile('async fn main() { dec f = fetch.(1, 2) }', { skipTypeCheck: true });
  assertContains(js, '() => fetch(1, 2)');
});

test('E2E: collect outside async fn produces type error', () => {
  const source = 'fn main() { dec x = collect [a, b] }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  assertEqual(errors.length >= 1, true);
  assertContains(errors[0].message, 'must be inside an async function');
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

test('Type checker: worker inside async fn is valid', () => {
  const source = 'async fn main() { dec x = worker(data) { return data } }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const workerErrors = errors.filter(e => e.message.includes('must be inside an async function'));
  assertEqual(workerErrors.length, 0);
});

test('Type checker: worker outside async fn is an error', () => {
  const source = 'fn main() { dec x = worker(data) { return data } }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const workerErrors = errors.filter(e => e.message.includes('must be inside an async function'));
  assertEqual(workerErrors.length, 1);
});

test('Type checker: spawn outside async fn is an error', () => {
  const source = 'fn main() { dec x = spawn { ls } }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const spawnErrors = errors.filter(e => e.message.includes('must be inside an async function'));
  assertEqual(spawnErrors.length, 1);
});

test('Type checker: spawn inside async fn is valid', () => {
  const source = 'async fn main() { dec x = spawn { ls } }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const spawnErrors = errors.filter(e => e.message.includes('must be inside an async function'));
  assertEqual(spawnErrors.length, 0);
});

// --- Generator: spawn tests ---

test('Generate spawn expression', () => {
  const js = compile('async fn main() { dec x = spawn { ls -la } }', { skipTypeCheck: true });
  assertContains(js, 'await _spawn("ls -la")');
});

test('Generate spawn expression with inputs', () => {
  const js = compile('async fn main() { dec x = spawn(dir) { ls $dir } }', { skipTypeCheck: true });
  assertContains(js, 'await _spawn("ls $dir", { dir })');
});

test('Generate spawn as statement', () => {
  const js = compile('async fn main() { spawn { echo hello } }', { skipTypeCheck: true });
  assertContains(js, 'await _spawn("echo hello")');
});

test('Generate spawn emits _spawn helper', () => {
  const js = compile('async fn main() { dec x = spawn { ls } }', { skipTypeCheck: true });
  assertContains(js, 'async function _spawn(');
});

test('_spawn helper not emitted without spawn', () => {
  const js = compile('fn main() { dec x = 1 }', { skipTypeCheck: true });
  const hasSpawn = js.includes('function _spawn');
  assertEqual(hasSpawn, false);
});

// --- Generator: worker tests ---

test('Generate worker expression with inputs', () => {
  const js = compile('async fn main() { dec x = worker(data) { return data * 2 } }', { skipTypeCheck: true });
  assertContains(js, 'await _worker(');
  assertContains(js, 'data * 2');
});

test('Generate worker expression with no inputs', () => {
  const js = compile('async fn main() { dec x = worker() { return 42 } }', { skipTypeCheck: true });
  assertContains(js, 'await _worker(');
  assertContains(js, 'return 42');
});

test('Generate worker expression with multiple inputs', () => {
  const js = compile('async fn main() { dec x = worker(a, b) { return a + b } }', { skipTypeCheck: true });
  assertContains(js, 'await _worker(');
  assertContains(js, '[a, b]');
});

test('Generate worker emits _worker helper', () => {
  const js = compile('async fn main() { dec x = worker() { return 1 } }', { skipTypeCheck: true });
  assertContains(js, 'async function _worker(');
});

test('_worker helper not emitted without worker', () => {
  const js = compile('fn main() { dec x = 1 }', { skipTypeCheck: true });
  const hasWorker = js.includes('function _worker');
  assertEqual(hasWorker, false);
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`\nTests: ${passed + failed} total, ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
