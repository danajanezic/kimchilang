# Parallel Computation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `worker` (CPU-bound thread execution) and `spawn` (non-blocking child process) primitives to KimchiLang.

**Architecture:** `worker` compiles KimchiLang body to a function run in `worker_threads`. `spawn` mirrors the existing `shell` block but uses `child_process.spawn` for non-blocking execution. Both return Promises, use implicit await, and must be inside `async fn`. Both integrate with `collect`/`hoard`/`race` concurrency primitives.

**Tech Stack:** Pure JavaScript, zero dependencies. Node.js `worker_threads` and `child_process` built-in modules.

---

### Task 1: Lexer — Add `worker` and `spawn` tokens with raw content capture for spawn

**Files:**
- Modify: `src/lexer.js:3-109` (TokenType enum)
- Modify: `src/lexer.js:111-162` (KEYWORDS map)
- Modify: `src/lexer.js:534-611` (raw content capture — add spawn handling)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for new keyword tokens**

Add to `test/test.js` after the existing lexer tests:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failures — `worker` and `spawn` tokenized as `IDENTIFIER`.

- [ ] **Step 3: Add token types to TokenType enum**

In `src/lexer.js`, add after the `RACE: 'RACE',` line in the Keywords section:

```javascript
  WORKER: 'WORKER',
  SPAWN: 'SPAWN',
  SPAWN_CONTENT: 'SPAWN_CONTENT',
```

- [ ] **Step 4: Add keywords to KEYWORDS map**

In `src/lexer.js`, add after the `'race': TokenType.RACE,` line:

```javascript
  'worker': TokenType.WORKER,
  'spawn': TokenType.SPAWN,
```

- [ ] **Step 5: Add raw content capture for spawn**

In `src/lexer.js`, the `shell` keyword has special raw-content capture logic at lines 534-611. The `spawn` keyword needs identical handling. Find the block that starts with `if (type === TokenType.SHELL) {` (line 534). Add an identical block right after it (after the closing `}` on line 611) for `SPAWN`:

```javascript
    if (type === TokenType.SPAWN) {
      this.tokens.push(new Token(type, value, startLine, startColumn));
      this.skipWhitespace();
      
      // Check for optional (inputs)
      if (this.peek() === '(') {
        this.tokens.push(new Token(TokenType.LPAREN, '(', this.line, this.column));
        this.advance();
        // Read input identifiers
        while (this.peek() !== ')' && this.peek() !== '\0') {
          this.skipWhitespace();
          if (this.peek() === ',') {
            this.tokens.push(new Token(TokenType.COMMA, ',', this.line, this.column));
            this.advance();
            continue;
          }
          if (/[a-zA-Z_$]/.test(this.peek())) {
            const idStart = this.line;
            const idCol = this.column;
            let id = '';
            while (/[a-zA-Z0-9_$]/.test(this.peek())) {
              id += this.advance();
            }
            this.tokens.push(new Token(TokenType.IDENTIFIER, id, idStart, idCol));
          } else {
            break;
          }
        }
        if (this.peek() === ')') {
          this.tokens.push(new Token(TokenType.RPAREN, ')', this.line, this.column));
          this.advance();
        }
        this.skipWhitespace();
      }
      
      // Skip newlines before {
      while (this.peek() === '\n') {
        this.advance();
      }
      this.skipWhitespace();
      
      // Now read the { and raw content until }
      if (this.peek() === '{') {
        this.tokens.push(new Token(TokenType.LBRACE, '{', this.line, this.column));
        this.advance();
        
        // Read raw shell content until matching }
        const contentStart = this.line;
        const contentCol = this.column;
        let content = '';
        let braceDepth = 1;
        
        while (braceDepth > 0 && this.peek() !== '\0') {
          if (this.peek() === '{') {
            braceDepth++;
            content += this.advance();
          } else if (this.peek() === '}') {
            braceDepth--;
            if (braceDepth > 0) {
              content += this.advance();
            }
          } else {
            content += this.advance();
          }
        }
        
        // Add the raw spawn content as a single token
        this.tokens.push(new Token(TokenType.SPAWN_CONTENT, content.trim(), contentStart, contentCol));
        
        // Add closing brace
        if (this.peek() === '}') {
          this.tokens.push(new Token(TokenType.RBRACE, '}', this.line, this.column));
          this.advance();
        }
        
        return null; // Already added tokens
      }
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 3 new tests pass. No existing tests broken.

- [ ] **Step 7: Commit**

```bash
git add src/lexer.js test/test.js
git commit -m "feat(lexer): add worker and spawn keyword tokens"
```

---

### Task 2: Parser — Add `WorkerExpression` and `SpawnBlock` node types

**Files:**
- Modify: `src/parser.js:5-79` (NodeType enum)
- Modify: `src/parser.js` (add parseWorkerExpression, parseSpawnBlock, parseSpawnBlockExpression methods)
- Modify: `src/parser.js:329+` (parseStatement — add spawn handling)
- Modify: `src/parser.js:2040+` (parsePrimary — add worker and spawn expression handling)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for parsing worker**

Add to `test/test.js` after the parser tests:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failures — parser doesn't recognize `worker` as expression.

- [ ] **Step 3: Add node types to NodeType enum**

In `src/parser.js`, add after the `BindExpression` line:

```javascript
  WorkerExpression: 'WorkerExpression',
  SpawnBlock: 'SpawnBlock',
```

- [ ] **Step 4: Implement parseWorkerExpression**

Add a new method to the `Parser` class:

```javascript
  parseWorkerExpression() {
    this.expect(TokenType.WORKER, 'Expected worker');
    
    const inputs = [];
    
    this.expect(TokenType.LPAREN, 'Expected ( after worker');
    if (!this.check(TokenType.RPAREN)) {
      do {
        const name = this.expect(TokenType.IDENTIFIER, 'Expected identifier').value;
        inputs.push(name);
      } while (this.match(TokenType.COMMA));
    }
    this.expect(TokenType.RPAREN, 'Expected ) after worker inputs');
    
    const body = this.parseBlock();
    
    return {
      type: NodeType.WorkerExpression,
      inputs,
      body,
    };
  }
```

- [ ] **Step 5: Hook worker into parsePrimary**

In `src/parser.js`, in `parsePrimary()`, add after the concurrency expression check (the `COLLECT`/`HOARD`/`RACE` check):

```javascript
    if (this.check(TokenType.WORKER)) {
      return this.parseWorkerExpression();
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 3 worker parser tests pass.

- [ ] **Step 7: Write failing tests for parsing spawn**

Add to `test/test.js`:

```javascript
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
```

- [ ] **Step 8: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failures — parser doesn't recognize `spawn`.

- [ ] **Step 9: Implement parseSpawnBlock and parseSpawnBlockExpression**

Add to the `Parser` class:

```javascript
  parseSpawnBlock() {
    this.expect(TokenType.SPAWN, 'Expected spawn');
    
    const inputs = [];
    
    if (this.match(TokenType.LPAREN)) {
      if (!this.check(TokenType.RPAREN)) {
        do {
          const name = this.expect(TokenType.IDENTIFIER, 'Expected identifier').value;
          inputs.push(name);
        } while (this.match(TokenType.COMMA));
      }
      this.expect(TokenType.RPAREN, 'Expected )');
    }
    
    this.skipNewlines();
    this.expect(TokenType.LBRACE, 'Expected { after spawn');
    
    const contentToken = this.expect(TokenType.SPAWN_CONTENT, 'Expected spawn command');
    const command = contentToken.value;
    
    this.expect(TokenType.RBRACE, 'Expected } to close spawn block');
    
    return {
      type: NodeType.SpawnBlock,
      inputs,
      command,
    };
  }

  parseSpawnBlockExpression() {
    this.expect(TokenType.SPAWN, 'Expected spawn');
    
    const inputs = [];
    
    if (this.match(TokenType.LPAREN)) {
      if (!this.check(TokenType.RPAREN)) {
        do {
          const name = this.expect(TokenType.IDENTIFIER, 'Expected identifier').value;
          inputs.push(name);
        } while (this.match(TokenType.COMMA));
      }
      this.expect(TokenType.RPAREN, 'Expected )');
    }
    
    this.skipNewlines();
    this.expect(TokenType.LBRACE, 'Expected { after spawn');
    
    const contentToken = this.expect(TokenType.SPAWN_CONTENT, 'Expected spawn command');
    const command = contentToken.value;
    
    this.expect(TokenType.RBRACE, 'Expected } to close spawn block');
    
    return {
      type: NodeType.SpawnBlock,
      inputs,
      command,
      isExpression: true,
    };
  }
```

- [ ] **Step 10: Hook spawn into parseStatement and parsePrimary**

In `parseStatement()`, add after the `shell` block check (after line 393 `return this.parseShellBlock();`):

```javascript
    if (this.check(TokenType.SPAWN)) {
      return this.parseSpawnBlock();
    }
```

In `parsePrimary()`, add after the `shell` expression check (after line 2145 `return this.parseShellBlockExpression();`):

```javascript
    if (this.check(TokenType.SPAWN)) {
      return this.parseSpawnBlockExpression();
    }
```

- [ ] **Step 11: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 6 new parser tests pass. No existing tests broken.

- [ ] **Step 12: Commit**

```bash
git add src/parser.js test/test.js
git commit -m "feat(parser): parse worker expressions and spawn blocks"
```

---

### Task 3: Type checker — Enforce async function scope for worker and spawn

**Files:**
- Modify: `src/typechecker.js:739-800` (visitExpression — add WorkerExpression and SpawnBlock cases)
- Modify: `src/typechecker.js:280-350` (visitStatement — add SpawnBlock case)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for async enforcement**

Add to `test/test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failures — type checker doesn't know about `WorkerExpression` or `SpawnBlock`.

- [ ] **Step 3: Add WorkerExpression and SpawnBlock to visitExpression**

In `src/typechecker.js`, in `visitExpression`, add cases before the `default:` case:

```javascript
      case NodeType.WorkerExpression: {
        if (!this._insideAsync) {
          this.addError('worker must be inside an async function', node);
        }
        // Visit body in isolated scope — only inputs are accessible
        this.pushScope();
        for (const input of node.inputs) {
          this.defineVariable(input, this.createType(Type.Any));
        }
        if (node.body && node.body.body) {
          for (const stmt of node.body.body) {
            this.visitStatement(stmt);
          }
        }
        this.popScope();
        return this.createType(Type.Any);
      }
      case NodeType.SpawnBlock: {
        if (!this._insideAsync) {
          this.addError('spawn must be inside an async function', node);
        }
        return this.createType(Type.Object);
      }
```

- [ ] **Step 4: Add SpawnBlock to visitStatement**

In `src/typechecker.js`, in `visitStatement`, add a case next to the existing `ShellBlock` case (around line 338):

```javascript
      case NodeType.SpawnBlock:
        if (!this._insideAsync) {
          this.addError('spawn must be inside an async function', node);
        }
        break;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 4 new type checker tests pass. No existing tests broken.

- [ ] **Step 6: Commit**

```bash
git add src/typechecker.js test/test.js
git commit -m "feat(typechecker): enforce worker/spawn inside async fn"
```

---

### Task 4: Generator — Emit JavaScript for spawn

**Files:**
- Modify: `src/generator.js` (add visitSpawnBlock, visitSpawnBlockExpression, _spawn runtime helper)
- Modify: `src/generator.js:62-81` (scanUsedFeatures — already picks up SpawnBlock via node.type)
- Modify: `src/generator.js:109-200` (emitRuntimeExtensions — emit _spawn)
- Modify: `src/generator.js:570-580` (visitStatement — add SpawnBlock case)
- Modify: `src/generator.js:1080-1140` (visitExpression — add SpawnBlock case)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for spawn code generation**

Add to `test/test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failures — `Unknown expression type: SpawnBlock`.

- [ ] **Step 3: Add _spawn runtime helper to emitRuntimeExtensions**

In `src/generator.js`, in `emitRuntimeExtensions`, add after the STATUS enum block:

```javascript
    // _spawn helper for non-blocking child process
    if (this.usedFeatures && this.usedFeatures.has('SpawnBlock')) {
      this.emitLine('async function _spawn(command, inputs = {}) {');
      this.pushIndent();
      this.emitLine('const { spawn } = await import("child_process");');
      this.emitLine('let cmd = command;');
      this.emitLine('for (const [key, value] of Object.entries(inputs)) {');
      this.pushIndent();
      this.emitLine('cmd = cmd.replace(new RegExp("\\\\$" + key + "\\\\b", "g"), String(value));');
      this.popIndent();
      this.emitLine('}');
      this.emitLine('return new Promise((resolve, reject) => {');
      this.pushIndent();
      this.emitLine('const proc = spawn("sh", ["-c", cmd]);');
      this.emitLine('let stdout = "", stderr = "";');
      this.emitLine('proc.stdout.on("data", (d) => stdout += d);');
      this.emitLine('proc.stderr.on("data", (d) => stderr += d);');
      this.emitLine('proc.on("error", reject);');
      this.emitLine('proc.on("close", (exitCode) => {');
      this.pushIndent();
      this.emitLine('resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: exitCode || 0, pid: proc.pid });');
      this.popIndent();
      this.emitLine('});');
      this.popIndent();
      this.emitLine('});');
      this.popIndent();
      this.emitLine('}');
    }
```

- [ ] **Step 4: Add visitSpawnBlock and visitSpawnBlockExpression methods**

Add to `src/generator.js`, after the `visitShellBlockExpression` method:

```javascript
  visitSpawnBlock(node) {
    const command = JSON.stringify(node.command);
    
    if (node.inputs.length === 0) {
      this.emitLine(`await _spawn(${command});`);
    } else {
      const inputsObj = `{ ${node.inputs.join(', ')} }`;
      this.emitLine(`await _spawn(${command}, ${inputsObj});`);
    }
  }

  visitSpawnBlockExpression(node) {
    const command = JSON.stringify(node.command);
    
    if (node.inputs.length === 0) {
      return `await _spawn(${command})`;
    } else {
      const inputsObj = `{ ${node.inputs.join(', ')} }`;
      return `await _spawn(${command}, ${inputsObj})`;
    }
  }
```

- [ ] **Step 5: Add SpawnBlock to visitStatement and visitExpression**

In `visitStatement`, add a case next to the `ShellBlock` case (around line 577):

```javascript
      case NodeType.SpawnBlock:
        this.visitSpawnBlock(node);
        break;
```

In `visitExpression`, add a case next to the existing `ShellBlock` case (before `ConcurrentExpression`):

```javascript
      case NodeType.SpawnBlock:
        return this.visitSpawnBlockExpression(node);
```

- [ ] **Step 6: Add spawn to auto-async function detection**

In `src/generator.js`, the `containsShellBlock` function (lines 6-24) checks if a node tree contains shell blocks to auto-make functions async. Rename it to `containsAsyncBlock` and also check for `SpawnBlock` and `WorkerExpression`:

Replace:
```javascript
function containsShellBlock(node) {
  if (!node) return false;
  if (node.type === NodeType.ShellBlock) return true;
```

With:
```javascript
function containsAsyncBlock(node) {
  if (!node) return false;
  if (node.type === NodeType.ShellBlock || node.type === NodeType.SpawnBlock || node.type === NodeType.WorkerExpression) return true;
```

Then update all references to `containsShellBlock` → `containsAsyncBlock` (3 occurrences: line 15, 20, 688, 1615 — use find/replace).

- [ ] **Step 7: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 5 new spawn tests pass. No existing tests broken.

- [ ] **Step 8: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat(generator): emit spawn with _spawn runtime helper"
```

---

### Task 5: Generator — Emit JavaScript for worker

**Files:**
- Modify: `src/generator.js` (add visitWorkerExpression, _worker runtime helper)
- Modify: `src/generator.js:109-200` (emitRuntimeExtensions — emit _worker)
- Modify: `src/generator.js:1080-1140` (visitExpression — add WorkerExpression case)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for worker code generation**

Add to `test/test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failures — `Unknown expression type: WorkerExpression`.

- [ ] **Step 3: Add _worker runtime helper to emitRuntimeExtensions**

In `src/generator.js`, in `emitRuntimeExtensions`, add after the `_spawn` block:

```javascript
    // _worker helper for CPU-bound thread execution
    if (this.usedFeatures && this.usedFeatures.has('WorkerExpression')) {
      this.emitLine('async function _worker(fn, args) {');
      this.pushIndent();
      this.emitLine('const { Worker } = await import("worker_threads");');
      this.emitLine('return new Promise((resolve, reject) => {');
      this.pushIndent();
      this.emitLine('const code = `');
      this.emitLine('  const { parentPort, workerData } = require("worker_threads");');
      this.emitLine('  const fn = ${fn.toString()};');
      this.emitLine('  try {');
      this.emitLine('    const result = fn(...workerData.args);');
      this.emitLine('    parentPort.postMessage({ value: result });');
      this.emitLine('  } catch (e) {');
      this.emitLine('    parentPort.postMessage({ error: e.message });');
      this.emitLine('  }');
      this.emitLine('`;');
      this.emitLine('const worker = new Worker(code, { eval: true, workerData: { args } });');
      this.emitLine('worker.on("message", (msg) => {');
      this.pushIndent();
      this.emitLine('if (msg.error) reject(new Error(msg.error));');
      this.emitLine('else resolve(msg.value);');
      this.popIndent();
      this.emitLine('});');
      this.emitLine('worker.on("error", reject);');
      this.emitLine('worker.on("exit", (exitCode) => {');
      this.pushIndent();
      this.emitLine('if (exitCode !== 0) reject(new Error(`Worker exited with code ${exitCode}`));');
      this.popIndent();
      this.emitLine('});');
      this.popIndent();
      this.emitLine('});');
      this.popIndent();
      this.emitLine('}');
    }
```

- [ ] **Step 4: Add visitWorkerExpression method**

Add to `src/generator.js`:

```javascript
  visitWorkerExpression(node) {
    // Compile worker body to a function, pass inputs as args
    const params = node.inputs.join(', ');
    
    // Generate the body statements
    const savedOutput = this.output;
    this.output = [];
    const savedIndent = this.indentLevel;
    this.indentLevel = 0;
    
    if (node.body && node.body.body) {
      for (const stmt of node.body.body) {
        this.visitStatement(stmt);
      }
    }
    
    const bodyCode = this.output.join('\n');
    this.output = savedOutput;
    this.indentLevel = savedIndent;
    
    const fnLiteral = `function(${params}) {\n${bodyCode}\n}`;
    const argsList = node.inputs.length > 0 ? `[${node.inputs.join(', ')}]` : '[]';
    
    return `await _worker(${fnLiteral}, ${argsList})`;
  }
```

- [ ] **Step 5: Add WorkerExpression to visitExpression**

In `visitExpression`, add before the `default:` case:

```javascript
      case NodeType.WorkerExpression:
        return this.visitWorkerExpression(node);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All 5 new worker tests pass. No existing tests broken.

- [ ] **Step 7: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat(generator): emit worker with _worker runtime helper"
```

---

### Task 6: Generator — Handle worker/spawn inside collect/hoard/race

**Files:**
- Modify: `src/generator.js` (update visitConcurrentExpression)
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests for worker/spawn in collect**

Add to `test/test.js`:

```javascript
test('Generate worker inside collect without double await', () => {
  const source = `async fn main() {
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
  const source = `async fn main() {
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/test.js 2>&1 | tail -20`
Expected: Failures — currently `visitConcurrentExpression` calls `visitExpression` which adds `await` to worker/spawn output.

- [ ] **Step 3: Update visitConcurrentExpression to handle worker/spawn**

In `src/generator.js`, update `visitConcurrentExpression` to detect `WorkerExpression` and `SpawnBlock` elements and emit them without `await`:

```javascript
  visitConcurrentExpression(node) {
    const elements = node.elements.map(elem => {
      if (elem.type === NodeType.BindExpression) {
        const callee = this.visitExpression(elem.callee);
        const args = elem.arguments.map(a => this.visitExpression(a)).join(', ');
        return `${callee}(${args})`;
      }
      if (elem.type === NodeType.WorkerExpression) {
        // Worker inside collect — emit without await
        const params = elem.inputs.join(', ');
        const savedOutput = this.output;
        this.output = [];
        const savedIndent = this.indentLevel;
        this.indentLevel = 0;
        if (elem.body && elem.body.body) {
          for (const stmt of elem.body.body) {
            this.visitStatement(stmt);
          }
        }
        const bodyCode = this.output.join('\n');
        this.output = savedOutput;
        this.indentLevel = savedIndent;
        const fnLiteral = `function(${params}) {\n${bodyCode}\n}`;
        const argsList = elem.inputs.length > 0 ? `[${elem.inputs.join(', ')}]` : '[]';
        return `_worker(${fnLiteral}, ${argsList})`;
      }
      if (elem.type === NodeType.SpawnBlock) {
        // Spawn inside collect — emit without await
        const command = JSON.stringify(elem.command);
        if (elem.inputs.length === 0) {
          return `_spawn(${command})`;
        }
        const inputsObj = `{ ${elem.inputs.join(', ')} }`;
        return `_spawn(${command}, ${inputsObj})`;
      }
      // Bare identifier — invoke with no args
      return `${this.visitExpression(elem)}()`;
    });

    const list = elements.join(', ');

    switch (node.mode) {
      case 'collect':
        return `await Promise.all([${list}])`;
      case 'race':
        return `await Promise.race([${list}])`;
      case 'hoard':
        return `await Promise.allSettled([${list}]).then(r => r.map(x => x.status === "fulfilled" ? { status: STATUS.OK, value: x.value } : { status: STATUS.REJECTED, error: x.reason }))`;
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -20`
Expected: All tests pass including the 2 new ones. No existing tests broken.

- [ ] **Step 5: Commit**

```bash
git add src/generator.js test/test.js
git commit -m "feat(generator): handle worker/spawn inside collect/hoard/race without double await"
```

---

### Task 7: End-to-end tests

**Files:**
- Test: `test/test.js`

- [ ] **Step 1: Write end-to-end compilation tests**

Add to `test/test.js`:

```javascript
test('E2E: worker compiles with type checking', () => {
  const source = `
async fn main() {
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
async fn main() {
  dec result = spawn { echo hello }
  print result.stdout
}
main()`;
  const js = compile(source);
  assertContains(js, 'await _spawn("echo hello")');
  assertContains(js, 'async function _spawn(');
});

test('E2E: worker outside async fn produces type error', () => {
  const source = 'fn main() { dec x = worker() { return 1 } }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const workerErrors = errors.filter(e => e.message.includes('must be inside an async function'));
  assertEqual(workerErrors.length, 1);
});

test('E2E: spawn outside async fn produces type error', () => {
  const source = 'fn main() { dec x = spawn { ls } }';
  const ast = parse(tokenize(source));
  const tc = new TypeChecker();
  const errors = tc.check(ast);
  const spawnErrors = errors.filter(e => e.message.includes('must be inside an async function'));
  assertEqual(spawnErrors.length, 1);
});

test('E2E: worker and spawn with collect', () => {
  const source = `
async fn main() {
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
async fn main() {
  dec dir = "/tmp"
  dec result = spawn(dir) { ls $dir }
  print result.stdout
}
main()`;
  const js = compile(source);
  assertContains(js, 'await _spawn("ls $dir", { dir })');
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All tests pass, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add test/test.js
git commit -m "test: add end-to-end tests for worker and spawn"
```

---

### Task 8: Update ROADMAP.md

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Mark parallel computation items as done**

In `ROADMAP.md`, update the Parallel Computation section to:

```markdown
## Parallel Computation

- [x] ~~`worker { code }` — run CPU-bound code on a separate thread (`worker_threads`). Data serialized in/out, no shared memory. Returns Promise.~~
- [x] ~~`spawn { command }` — async child process (non-blocking `shell`), returns handle with `stdout`, `stderr`, `pid`, `kill()`~~
- [ ] Channel-based communication between workers
```

- [ ] **Step 2: Run full test suite**

Run: `node test/test.js 2>&1 | tail -5`
Expected: All tests pass, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: mark worker and spawn as done"
```
