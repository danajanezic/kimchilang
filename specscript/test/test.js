// specscript/test/test.js
import { SpecScriptCompiler } from '../src/index.js';
import { parseArgs } from '../src/cli.js';
import { splitSections } from '../src/section-splitter.js';
import { parseSpec } from '../src/spec-parser.js';
import { computeSpecHash, extractHash, normalizeSpec } from '../src/hasher.js';
import { tokenize, TokenType } from '../src/lexer.js';
import { parse, NodeType } from '../src/parser.js';
import { generate } from '../src/generator.js';
import { DependencyGraph } from '../src/dependency-graph.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(
      `${message ? message + ': ' : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertDeepEqual(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(
      `${message ? message + ': ' : ''}Expected ${b}, got ${a}`
    );
  }
}

function assertContains(str, substring, message = '') {
  if (!str.includes(substring)) {
    throw new Error(
      `${message ? message + ': ' : ''}Expected "${str}" to contain "${substring}"`
    );
  }
}

function assertThrows(fn, expectedMessage = null) {
  try {
    fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (error) {
    if (error.message === 'Expected function to throw, but it did not') {
      throw error;
    }
    if (expectedMessage && !error.message.includes(expectedMessage)) {
      throw new Error(
        `Expected error containing "${expectedMessage}", got "${error.message}"`
      );
    }
  }
}

// --- Tests will be added by subsequent tasks ---

console.log('\n--- SpecScript Test Suite ---\n');

// (test calls will be added here by each task)

console.log('--- Section Splitter Tests ---');

test('splits a valid .sp file into three sections', () => {
  const source = `## spec

# MyModule

**intent:** Does something

## test

<!-- spec-hash: sha256:abc123 -->

test "it works" {
  expect(1).toBe(1)
}

## impl

<!-- spec-hash: sha256:abc123 -->

fn doSomething() {
  return 1
}`;

  const sections = splitSections(source);
  assertEqual(sections.spec.trim().startsWith('# MyModule'), true);
  assertContains(sections.test, 'spec-hash: sha256:abc123');
  assertContains(sections.impl, 'fn doSomething');
});

test('rejects file missing ## spec section', () => {
  assertThrows(
    () => splitSections('## test\n\n## impl\n'),
    '## spec'
  );
});

test('rejects file missing ## test section', () => {
  assertThrows(
    () => splitSections('## spec\n\n## impl\n'),
    '## test'
  );
});

test('rejects file missing ## impl section', () => {
  assertThrows(
    () => splitSections('## spec\n\n## test\n'),
    '## impl'
  );
});

test('rejects file with sections out of order (impl before test)', () => {
  assertThrows(
    () => splitSections('## spec\n\n## impl\n\n## test\n'),
    'order'
  );
});

test('rejects file exceeding 500 lines', () => {
  const longFile = '## spec\n' + 'line\n'.repeat(499) + '## test\n\n## impl\n';
  assertThrows(
    () => splitSections(longFile),
    '500'
  );
});

test('accepts file at exactly 500 lines', () => {
  const lines = [];
  lines.push('## spec');
  for (let i = 0; i < 494; i++) lines.push('x');
  lines.push('## test');
  lines.push('test content');
  lines.push('## impl');
  lines.push('impl content');
  lines.push('end');
  const source = lines.join('\n');
  const sections = splitSections(source);
  assertEqual(typeof sections.spec, 'string');
});

console.log('--- Spec Parser Tests ---');

test('parses module name from # heading', () => {
  const spec = `# OrderProcessor

**intent:** Process orders
**reason:** Replaces manual handling`;
  const result = parseSpec(spec);
  assertEqual(result.module, 'OrderProcessor');
});

test('parses intent and reason', () => {
  const spec = `# Mod

**intent:** Does things
**reason:** Because reasons`;
  const result = parseSpec(spec);
  assertEqual(result.intent, 'Does things');
  assertEqual(result.reason, 'Because reasons');
});

test('parses requires list', () => {
  const spec = `# Mod

**intent:** x
**reason:** y

### requires

- First requirement
- Second requirement
- Third requirement`;
  const result = parseSpec(spec);
  assertEqual(result.requires.length, 3);
  assertEqual(result.requires[0], 'First requirement');
  assertEqual(result.requires[2], 'Third requirement');
});

test('parses type definitions', () => {
  const spec = `# Mod

**intent:** x
**reason:** y

### types

- Order :: { items: [Item], customer: Customer }
- Status :: Active | Inactive`;
  const result = parseSpec(spec);
  assertEqual(result.types.length, 2);
  assertEqual(result.types[0].name, 'Order');
  assertContains(result.types[0].definition, '{ items: [Item]');
  assertEqual(result.types[1].name, 'Status');
});

test('parses depends list', () => {
  const spec = `# Mod

**intent:** x
**reason:** y

### depends

- inventory.stock :: checkInventory
- payment.gateway :: processPayment, rollbackPayment`;
  const result = parseSpec(spec);
  assertEqual(result.depends.length, 2);
  assertEqual(result.depends[0].module, 'inventory.stock');
  assertDeepEqual(result.depends[0].functions, ['checkInventory']);
  assertDeepEqual(result.depends[1].functions, ['processPayment', 'rollbackPayment']);
});

test('parses expose function declarations', () => {
  const spec = `# Mod

**intent:** x
**reason:** y

### expose processOrder :: (Order) -> OrderResult

**intent:** Validate and process an order`;
  const result = parseSpec(spec);
  assertEqual(result.functions.length, 1);
  assertEqual(result.functions[0].name, 'processOrder');
  assertEqual(result.functions[0].visibility, 'expose');
  assertEqual(result.functions[0].params, '(Order)');
  assertEqual(result.functions[0].returnType, 'OrderResult');
  assertEqual(result.functions[0].intent, 'Validate and process an order');
});

test('parses internal function declarations', () => {
  const spec = `# Mod

**intent:** x
**reason:** y

### internal helper :: (String) -> Number

**intent:** Convert string to number`;
  const result = parseSpec(spec);
  assertEqual(result.functions[0].visibility, 'internal');
  assertEqual(result.functions[0].name, 'helper');
});

test('rejects spec missing module name', () => {
  assertThrows(() => parseSpec('**intent:** x\n**reason:** y'), 'module name');
});

test('rejects spec missing intent', () => {
  assertThrows(() => parseSpec('# Mod\n**reason:** y'), 'intent');
});

test('rejects spec missing reason', () => {
  assertThrows(() => parseSpec('# Mod\n**intent:** x'), 'reason');
});

test('parses full spec with all sections', () => {
  const spec = `# OrderProcessor

**intent:** Process customer orders
**reason:** Automate order handling

### requires

- Validate items against inventory
- Process payment before reserving

### types

- Order :: { items: [Item] }
- Result :: Success | Failure

### depends

- inventory.stock :: checkInventory

### expose processOrder :: (Order) -> Result

**intent:** Main order processing

### internal validate :: (Order) -> Boolean

**intent:** Validate order data`;
  const result = parseSpec(spec);
  assertEqual(result.module, 'OrderProcessor');
  assertEqual(result.requires.length, 2);
  assertEqual(result.types.length, 2);
  assertEqual(result.depends.length, 1);
  assertEqual(result.functions.length, 2);
  assertEqual(result.functions[0].visibility, 'expose');
  assertEqual(result.functions[1].visibility, 'internal');
});

console.log('--- Hasher Tests ---');

test('normalizeSpec collapses whitespace', () => {
  const a = normalizeSpec('# Mod\n\n\n**intent:** x\n  **reason:** y');
  const b = normalizeSpec('# Mod\n**intent:** x\n**reason:** y');
  assertEqual(a, b);
});

test('normalizeSpec trims lines', () => {
  const a = normalizeSpec('  # Mod  \n  **intent:** x  ');
  const b = normalizeSpec('# Mod\n**intent:** x');
  assertEqual(a, b);
});

test('computeSpecHash returns consistent hash for same content', () => {
  const hash1 = computeSpecHash('# Mod\n**intent:** x\n**reason:** y');
  const hash2 = computeSpecHash('# Mod\n**intent:** x\n**reason:** y');
  assertEqual(hash1, hash2);
});

test('computeSpecHash returns different hash for different content', () => {
  const hash1 = computeSpecHash('# Mod\n**intent:** x\n**reason:** y');
  const hash2 = computeSpecHash('# Mod\n**intent:** z\n**reason:** y');
  const different = hash1 !== hash2;
  assertEqual(different, true);
});

test('computeSpecHash ignores whitespace differences', () => {
  const hash1 = computeSpecHash('# Mod\n**intent:** x\n**reason:** y');
  const hash2 = computeSpecHash('# Mod\n\n  **intent:** x  \n\n**reason:** y\n\n');
  assertEqual(hash1, hash2);
});

test('computeSpecHash returns sha256: prefixed string', () => {
  const hash = computeSpecHash('# Mod');
  assertEqual(hash.startsWith('sha256:'), true);
  assertEqual(hash.length, 7 + 64);
});

test('extractHash finds hash in HTML comment', () => {
  const section = '<!-- spec-hash: sha256:abc123def456 -->\n\nsome code';
  const hash = extractHash(section);
  assertEqual(hash, 'sha256:abc123def456');
});

test('extractHash returns null when no hash present', () => {
  const hash = extractHash('just some code\nno hash here');
  assertEqual(hash, null);
});

console.log('--- Lexer Tests ---');

test('tokenizes keywords', () => {
  const tokens = tokenize('dec fn return if else');
  assertEqual(tokens[0].type, TokenType.DEC);
  assertEqual(tokens[1].type, TokenType.FN);
  assertEqual(tokens[2].type, TokenType.RETURN);
  assertEqual(tokens[3].type, TokenType.IF);
  assertEqual(tokens[4].type, TokenType.ELSE);
});

test('tokenizes identifiers', () => {
  const tokens = tokenize('myVar foo_bar');
  assertEqual(tokens[0].type, TokenType.IDENTIFIER);
  assertEqual(tokens[0].value, 'myVar');
  assertEqual(tokens[1].type, TokenType.IDENTIFIER);
  assertEqual(tokens[1].value, 'foo_bar');
});

test('tokenizes numbers', () => {
  const tokens = tokenize('42 3.14');
  assertEqual(tokens[0].type, TokenType.NUMBER);
  assertEqual(tokens[0].value, '42');
  assertEqual(tokens[1].type, TokenType.NUMBER);
  assertEqual(tokens[1].value, '3.14');
});

test('tokenizes strings', () => {
  const tokens = tokenize('"hello world"');
  assertEqual(tokens[0].type, TokenType.STRING);
  assertEqual(tokens[0].value, 'hello world');
});

test('tokenizes operators', () => {
  const tokens = tokenize('= == != => ~> >> + - * /');
  assertEqual(tokens[0].type, TokenType.ASSIGN);
  assertEqual(tokens[1].type, TokenType.EQ);
  assertEqual(tokens[2].type, TokenType.NEQ);
  assertEqual(tokens[3].type, TokenType.FAT_ARROW);
  assertEqual(tokens[4].type, TokenType.PIPE);
  assertEqual(tokens[5].type, TokenType.FLOW);
});

test('tokenizes delimiters', () => {
  const tokens = tokenize('( ) { } [ ] , .');
  assertEqual(tokens[0].type, TokenType.LPAREN);
  assertEqual(tokens[1].type, TokenType.RPAREN);
  assertEqual(tokens[2].type, TokenType.LBRACE);
  assertEqual(tokens[3].type, TokenType.RBRACE);
  assertEqual(tokens[4].type, TokenType.LBRACKET);
  assertEqual(tokens[5].type, TokenType.RBRACKET);
  assertEqual(tokens[6].type, TokenType.COMMA);
  assertEqual(tokens[7].type, TokenType.DOT);
});

test('tokenizes test block keywords', () => {
  const tokens = tokenize('test expect');
  assertEqual(tokens[0].type, TokenType.TEST);
  assertEqual(tokens[1].type, TokenType.EXPECT);
});

test('tokenizes logical operators', () => {
  const tokens = tokenize('and or not');
  assertEqual(tokens[0].type, TokenType.AND);
  assertEqual(tokens[1].type, TokenType.OR);
  assertEqual(tokens[2].type, TokenType.NOT);
});

test('tokenizes boolean literals', () => {
  const tokens = tokenize('true false');
  assertEqual(tokens[0].type, TokenType.BOOLEAN);
  assertEqual(tokens[0].value, 'true');
  assertEqual(tokens[1].type, TokenType.BOOLEAN);
  assertEqual(tokens[1].value, 'false');
});

test('tokenizes pipe operator in expression', () => {
  const tokens = tokenize('items ~> filter(x => x > 0)');
  assertEqual(tokens[0].type, TokenType.IDENTIFIER);
  assertEqual(tokens[1].type, TokenType.PIPE);
  assertEqual(tokens[2].type, TokenType.IDENTIFIER);
});

test('tracks line and column', () => {
  const tokens = tokenize('dec x = 1\ndec y = 2');
  assertEqual(tokens[0].line, 1);
  assertEqual(tokens[0].column, 1);
  const yToken = tokens.find(t => t.value === 'y');
  assertEqual(yToken.line, 2);
});

test('skips comments', () => {
  const tokens = tokenize('dec x = 1 // this is a comment\ndec y = 2');
  const identifiers = tokens.filter(t => t.type === TokenType.IDENTIFIER);
  assertEqual(identifiers.length, 2);
});

test('skips HTML comments (hash lines)', () => {
  const tokens = tokenize('<!-- spec-hash: sha256:abc -->\nfn foo() {}');
  assertEqual(tokens[0].type, TokenType.FN);
});

test('ends with EOF', () => {
  const tokens = tokenize('dec x = 1');
  assertEqual(tokens[tokens.length - 1].type, TokenType.EOF);
});

console.log('--- Parser Tests ---');

// Use the already-imported tokenize function as tok
const tok = tokenize;

test('parses dec declaration', () => {
  const ast = parse(tok('dec x = 42'));
  assertEqual(ast.body[0].type, NodeType.DecDeclaration);
  assertEqual(ast.body[0].name, 'x');
  assertEqual(ast.body[0].init.value, 42);
});

test('parses fn declaration', () => {
  const ast = parse(tok('fn add(a, b) { return a + b }'));
  assertEqual(ast.body[0].type, NodeType.FunctionDeclaration);
  assertEqual(ast.body[0].name, 'add');
  assertEqual(ast.body[0].params.length, 2);
});

test('parses if/else', () => {
  const ast = parse(tok('if x > 0 { return 1 } else { return 0 }'));
  assertEqual(ast.body[0].type, NodeType.IfStatement);
  assertEqual(ast.body[0].alternate.type, NodeType.BlockStatement);
});

test('parses for/in loop', () => {
  const ast = parse(tok('for item in items { print(item) }'));
  assertEqual(ast.body[0].type, NodeType.ForInStatement);
  assertEqual(ast.body[0].variable, 'item');
});

test('parses test block', () => {
  const ast = parse(tok('test "it works" { expect(1).toBe(1) }'));
  assertEqual(ast.body[0].type, NodeType.TestBlock);
  assertEqual(ast.body[0].name, 'it works');
});

test('parses expect expression', () => {
  const ast = parse(tok('expect(x).toBe(5)'));
  const expr = ast.body[0].expression;
  assertEqual(expr.type, NodeType.CallExpression);
  assertEqual(expr.callee.property, 'toBe');
});

test('parses arrow function', () => {
  const ast = parse(tok('dec f = x => x * 2'));
  assertEqual(ast.body[0].init.type, NodeType.ArrowFunctionExpression);
});

test('parses pipe operator', () => {
  const ast = parse(tok('dec result = items ~> filter(x => x > 0)'));
  assertEqual(ast.body[0].init.type, NodeType.PipeExpression);
});

test('parses object literal', () => {
  const ast = parse(tok('dec obj = { name: "alice", age: 30 }'));
  assertEqual(ast.body[0].init.type, NodeType.ObjectExpression);
  assertEqual(ast.body[0].init.properties.length, 2);
});

test('parses array literal', () => {
  const ast = parse(tok('dec arr = [1, 2, 3]'));
  assertEqual(ast.body[0].init.type, NodeType.ArrayExpression);
  assertEqual(ast.body[0].init.elements.length, 3);
});

test('parses member access', () => {
  const ast = parse(tok('dec x = obj.name'));
  assertEqual(ast.body[0].init.type, NodeType.MemberExpression);
  assertEqual(ast.body[0].init.property, 'name');
});

test('parses function call', () => {
  const ast = parse(tok('doSomething(1, "two", three)'));
  const expr = ast.body[0].expression;
  assertEqual(expr.type, NodeType.CallExpression);
  assertEqual(expr.arguments.length, 3);
});

test('parses enum declaration', () => {
  const ast = parse(tok('enum Color { Red, Green, Blue }'));
  assertEqual(ast.body[0].type, NodeType.EnumDeclaration);
  assertEqual(ast.body[0].name, 'Color');
  assertEqual(ast.body[0].variants.length, 3);
});

test('parses try/catch', () => {
  const ast = parse(tok('try { risky() } catch e { handle(e) }'));
  assertEqual(ast.body[0].type, NodeType.TryStatement);
  assertEqual(ast.body[0].param, 'e');
});

test('parses object destructuring', () => {
  const ast = parse(tok('dec { name, age } = person'));
  assertEqual(ast.body[0].type, NodeType.DecDeclaration);
  assertEqual(ast.body[0].pattern.type, NodeType.ObjectPattern);
});

test('parses array destructuring', () => {
  const ast = parse(tok('dec [a, b] = pair'));
  assertEqual(ast.body[0].type, NodeType.DecDeclaration);
  assertEqual(ast.body[0].pattern.type, NodeType.ArrayPattern);
});

test('parses named constructor (enum variant with fields)', () => {
  const ast = parse(tok('dec x = Confirmed { orderId: 123 }'));
  assertEqual(ast.body[0].init.type, NodeType.NamedConstructor);
  assertEqual(ast.body[0].init.name, 'Confirmed');
});

console.log('--- Generator Tests ---');

function gen(code) {
  return generate(parse(tokenize(code)));
}

test('generates dec with deep freeze', () => {
  const js = gen('dec x = 42');
  assertContains(js, 'const x = _deepFreeze(42)');
});

test('generates fn declaration', () => {
  const js = gen('fn add(a, b) { return a + b }');
  assertContains(js, 'function add(a, b)');
  assertContains(js, 'return a + b');
});

test('generates strict equality for ==', () => {
  const js = gen('dec x = a == b');
  assertContains(js, '===');
});

test('generates strict inequality for !=', () => {
  const js = gen('dec x = a != b');
  assertContains(js, '!==');
});

test('generates optional chaining for member access', () => {
  const js = gen('dec x = obj.name');
  assertContains(js, 'obj?.name');
});

test('generates logical operators', () => {
  const js = gen('dec x = a and b or not c');
  assertContains(js, '&&');
  assertContains(js, '||');
  assertContains(js, '!');
});

test('generates if/else', () => {
  const js = gen('if x > 0 { return 1 } else { return 0 }');
  assertContains(js, 'if (');
  assertContains(js, '} else {');
});

test('generates for/in loop', () => {
  const js = gen('for item in items { print(item) }');
  assertContains(js, 'for (const item of');
});

test('generates arrow function', () => {
  const js = gen('dec f = x => x * 2');
  assertContains(js, '(x) => ');
});

test('generates object literal', () => {
  const js = gen('dec obj = { name: "alice" }');
  assertContains(js, '"name": "alice"');
});

test('generates array literal', () => {
  const js = gen('dec arr = [1, 2, 3]');
  assertContains(js, '[1, 2, 3]');
});

test('generates test block', () => {
  const js = gen('test "it works" { expect(1).toBe(1) }');
  assertContains(js, '_test("it works"');
});

test('generates enum as frozen object', () => {
  const js = gen('enum Color { Red, Green, Blue }');
  assertContains(js, 'const Color = Object.freeze');
});

test('generates try/catch', () => {
  const js = gen('try { risky() } catch e { handle(e) }');
  assertContains(js, 'try {');
  assertContains(js, 'catch (e)');
});

test('generates pipe operator', () => {
  const js = gen('dec result = items ~> filter(x => x > 0)');
  assertContains(js, '_pipe(');
});

test('generates runtime helpers at top', () => {
  const js = gen('dec x = 1');
  assertContains(js, 'function _deepFreeze');
  assertContains(js, 'function _test');
  assertContains(js, 'function _expect');
});

test('generates named constructor', () => {
  const js = gen('dec x = Confirmed { orderId: 123 }');
  assertContains(js, '_deepFreeze({');
  assertContains(js, '"_type": "Confirmed"');
});

console.log('--- Compiler Tests ---');

function makeFile(spec, testSection, implSection) {
  return `## spec\n\n${spec}\n\n## test\n\n${testSection}\n\n## impl\n\n${implSection}`;
}

test('compiles a valid .sp file to JavaScript', () => {
  const compiler = new SpecScriptCompiler();
  const spec = `# Adder\n\n**intent:** Add numbers\n**reason:** Math is useful`;
  const hash = compiler.computeHash(spec);

  const source = makeFile(
    spec,
    `<!-- spec-hash: ${hash} -->\n\ntest "adds" { expect(add(1, 2)).toBe(3) }`,
    `<!-- spec-hash: ${hash} -->\n\nfn add(a, b) { return a + b }`
  );

  const result = compiler.compile(source);
  assertContains(result.js, 'function add(a, b)');
});

test('rejects stale test hash', () => {
  const spec = `# Mod\n\n**intent:** x\n**reason:** y`;
  const staleHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
  const source = makeFile(
    spec,
    `<!-- spec-hash: ${staleHash} -->\n\ntest "x" { expect(1).toBe(1) }`,
    `<!-- spec-hash: ${staleHash} -->\n\nfn x() { return 1 }`
  );

  const compiler = new SpecScriptCompiler();
  assertThrows(() => compiler.compile(source), 'stale');
});

test('rejects missing test hash', () => {
  const spec = `# Mod\n\n**intent:** x\n**reason:** y`;
  const source = makeFile(
    spec,
    'test "x" { expect(1).toBe(1) }',
    '<!-- spec-hash: sha256:abc -->\n\nfn x() { return 1 }'
  );

  const compiler = new SpecScriptCompiler();
  assertThrows(() => compiler.compile(source), 'hash');
});

test('rejects stale impl hash when test is fresh', () => {
  const compiler = new SpecScriptCompiler();
  const spec = `# Mod\n\n**intent:** x\n**reason:** y`;
  const hash = compiler.computeHash(spec);
  const staleHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

  const source = makeFile(
    spec,
    `<!-- spec-hash: ${hash} -->\n\ntest "x" { expect(1).toBe(1) }`,
    `<!-- spec-hash: ${staleHash} -->\n\nfn x() { return 1 }`
  );

  assertThrows(() => compiler.compile(source), 'stale');
});

test('rejects file where test hash is stale but impl hash is fresh (invalid state)', () => {
  const compiler = new SpecScriptCompiler();
  const spec = `# Mod\n\n**intent:** x\n**reason:** y`;
  const hash = compiler.computeHash(spec);
  const staleHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

  const source = makeFile(
    spec,
    `<!-- spec-hash: ${staleHash} -->\n\ntest "x" { expect(1).toBe(1) }`,
    `<!-- spec-hash: ${hash} -->\n\nfn x() { return 1 }`
  );

  assertThrows(() => compiler.compile(source), 'test');
});

test('returns parsed spec metadata alongside compiled JS', () => {
  const compiler = new SpecScriptCompiler();
  const spec = `# Calculator\n\n**intent:** Do math\n**reason:** Math needed\n\n### expose add :: (Number, Number) -> Number\n\n**intent:** Add two numbers`;
  const hash = compiler.computeHash(spec);

  const source = makeFile(
    spec,
    `<!-- spec-hash: ${hash} -->\n\ntest "adds" { expect(add(1, 2)).toBe(3) }`,
    `<!-- spec-hash: ${hash} -->\n\nfn add(a, b) { return a + b }`
  );

  const result = compiler.compile(source);
  assertEqual(result.spec.module, 'Calculator');
  assertEqual(result.spec.functions.length, 1);
  assertEqual(result.hash, hash);
});

console.log('--- CLI Tests ---');

test('parseArgs recognizes compile command', () => {
  const args = parseArgs(['compile', 'myfile.sp']);
  assertEqual(args.command, 'compile');
  assertEqual(args.file, 'myfile.sp');
});

test('parseArgs recognizes check command', () => {
  const args = parseArgs(['check', 'myfile.sp']);
  assertEqual(args.command, 'check');
});

test('parseArgs recognizes run command', () => {
  const args = parseArgs(['run', 'myfile.sp']);
  assertEqual(args.command, 'run');
});

test('parseArgs recognizes stale command with directory', () => {
  const args = parseArgs(['stale', './src']);
  assertEqual(args.command, 'stale');
  assertEqual(args.file, './src');
});

test('parseArgs recognizes regen command with flags', () => {
  const args = parseArgs(['regen', 'myfile.sp', '--test']);
  assertEqual(args.command, 'regen');
  assertEqual(args.regenTarget, 'test');
});

test('parseArgs recognizes regen --impl', () => {
  const args = parseArgs(['regen', 'myfile.sp', '--impl']);
  assertEqual(args.regenTarget, 'impl');
});

test('parseArgs recognizes regen --all', () => {
  const args = parseArgs(['regen', 'myfile.sp', '--all']);
  assertEqual(args.regenTarget, 'all');
});

test('parseArgs recognizes init command', () => {
  const args = parseArgs(['init']);
  assertEqual(args.command, 'init');
});

test('parseArgs recognizes build command', () => {
  const args = parseArgs(['build', './src']);
  assertEqual(args.command, 'build');
});

test('parseArgs recognizes -o output flag', () => {
  const args = parseArgs(['compile', 'myfile.sp', '-o', 'dist/out.js']);
  assertEqual(args.output, 'dist/out.js');
});

test('parseArgs recognizes --debug flag', () => {
  const args = parseArgs(['compile', 'myfile.sp', '--debug']);
  assertEqual(args.debug, true);
});

console.log('--- Dependency Graph Tests ---');

test('registers modules and their spec hashes', () => {
  const graph = new DependencyGraph();
  graph.register('order.processor', { hash: 'sha256:aaa', depends: ['inventory.stock'] });
  graph.register('inventory.stock', { hash: 'sha256:bbb', depends: [] });
  assertEqual(graph.getHash('order.processor'), 'sha256:aaa');
  assertEqual(graph.getHash('inventory.stock'), 'sha256:bbb');
});

test('detects stale consumers when dependency hash changes', () => {
  const graph = new DependencyGraph();
  graph.register('inventory.stock', { hash: 'sha256:old', depends: [] });
  graph.register('order.processor', {
    hash: 'sha256:aaa',
    depends: ['inventory.stock'],
    depHashes: { 'inventory.stock': 'sha256:old' },
  });
  graph.register('inventory.stock', { hash: 'sha256:new', depends: [] });
  const stale = graph.findStaleConsumers('inventory.stock');
  assertEqual(stale.length, 1);
  assertEqual(stale[0], 'order.processor');
});

test('does not flag consumers when dependency hash unchanged', () => {
  const graph = new DependencyGraph();
  graph.register('inventory.stock', { hash: 'sha256:same', depends: [] });
  graph.register('order.processor', {
    hash: 'sha256:aaa',
    depends: ['inventory.stock'],
    depHashes: { 'inventory.stock': 'sha256:same' },
  });
  const stale = graph.findStaleConsumers('inventory.stock');
  assertEqual(stale.length, 0);
});

test('tracks transitive dependencies', () => {
  const graph = new DependencyGraph();
  graph.register('storage.db', { hash: 'sha256:111', depends: [] });
  graph.register('inventory.stock', {
    hash: 'sha256:222',
    depends: ['storage.db'],
    depHashes: { 'storage.db': 'sha256:111' },
  });
  graph.register('order.processor', {
    hash: 'sha256:333',
    depends: ['inventory.stock'],
    depHashes: { 'inventory.stock': 'sha256:222' },
  });
  graph.register('storage.db', { hash: 'sha256:444', depends: [] });
  const stale = graph.findStaleConsumers('storage.db');
  assertContains(stale.join(','), 'inventory.stock');
});

test('getAllStale returns all stale module paths', () => {
  const graph = new DependencyGraph();
  graph.register('a', { hash: 'sha256:1', depends: [] });
  graph.register('b', {
    hash: 'sha256:2',
    depends: ['a'],
    depHashes: { 'a': 'sha256:1' },
  });
  graph.register('a', { hash: 'sha256:changed', depends: [] });
  const all = graph.getAllStale();
  assertContains(all.join(','), 'b');
});

console.log('--- Integration Tests ---');

test('full pipeline: compile valid source with correct hashes', () => {
  const compiler = new SpecScriptCompiler();

  const spec = `# Calculator

**intent:** Provide basic arithmetic operations
**reason:** Foundation for math-dependent modules

### requires

- Support addition of two numbers
- Support subtraction of two numbers
- Support multiplication of two numbers
- Return numeric results for all operations

### types

- Operation :: Add | Subtract | Multiply

### expose add :: (Number, Number) -> Number

**intent:** Add two numbers together

### expose subtract :: (Number, Number) -> Number

**intent:** Subtract second number from first

### expose multiply :: (Number, Number) -> Number

**intent:** Multiply two numbers together`;

  const hash = compiler.computeHash(spec);

  const source = `## spec

${spec}

## test

<!-- spec-hash: ${hash} -->

test "add returns sum" {
  expect(add(2, 3)).toBe(5)
}

test "subtract returns difference" {
  expect(subtract(10, 4)).toBe(6)
}

test "multiply returns product" {
  expect(multiply(3, 4)).toBe(12)
}

## impl

<!-- spec-hash: ${hash} -->

fn add(a, b) {
  return a + b
}

fn subtract(a, b) {
  return a - b
}

fn multiply(a, b) {
  return a * b
}`;

  const result = compiler.compile(source);

  assertEqual(result.spec.module, 'Calculator');
  assertEqual(result.spec.functions.length, 3);
  assertEqual(result.spec.requires.length, 4);

  assertContains(result.js, 'function add(a, b)');
  assertContains(result.js, 'function subtract(a, b)');
  assertContains(result.js, 'function multiply(a, b)');
  assertContains(result.js, '_test(');
  assertContains(result.js, '_deepFreeze');
  assertContains(result.js, '_runTests()');
});

test('full pipeline: spec change invalidates everything', () => {
  const compiler = new SpecScriptCompiler();
  const oldHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

  const source = `## spec

# Changed

**intent:** This was modified
**reason:** Testing staleness

## test

<!-- spec-hash: ${oldHash} -->

test "x" { expect(1).toBe(1) }

## impl

<!-- spec-hash: ${oldHash} -->

fn x() { return 1 }`;

  assertThrows(() => compiler.compile(source), 'stale');
});

test('full pipeline: rejects file over 500 lines', () => {
  const lines = ['## spec', '', '# Big', '', '**intent:** x', '**reason:** y'];
  while (lines.length < 495) lines.push('// padding');
  lines.push('', '## test', '', '<!-- spec-hash: sha256:abc123 -->', '', '## impl', '', '<!-- spec-hash: sha256:abc123 -->');

  assertThrows(() => {
    const compiler = new SpecScriptCompiler();
    compiler.compile(lines.join('\n'));
  }, '500');
});

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
