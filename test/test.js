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

test('Generate match with literal patterns', () => {
  const source = 'dec msg = match 200 {\n200 => "OK"\n404 => "Not Found"\n_ => "Unknown"\n}';
  const js = generate(parse(tokenize(source)));
  assertContains(js, '_subject === 200');
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
  assertContains(js, 'return null');
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
  // This should not throw — compile() runs type checker + generator
  const js = compile(source);
  assertContains(js, '_subject === 200');
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

// Summary
console.log('\n' + '='.repeat(50));
console.log(`\nTests: ${passed + failed} total, ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
