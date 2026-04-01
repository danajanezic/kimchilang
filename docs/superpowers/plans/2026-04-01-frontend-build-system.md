# Frontend Build System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `kimchi build entry.km -o dist/bundle.js` — compiles KimchiLang to browser-ready JavaScript bundled as an IIFE.

**Architecture:** Three components: (1) Parser update for `extern node`/`extern browser` platform annotations, (2) Generator update for `--target browser` compilation mode, (3) New bundler module that resolves deps, topologically sorts, and concatenates into an IIFE. The bundler calls the existing compiler with `{ target: 'browser' }`.

**Tech Stack:** Pure JavaScript, zero dependencies. Uses existing compiler pipeline.

---

### Task 1: Parser — Extern platform annotations

**Files:**
- Modify: `src/parser.js`
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/test.js`:

```javascript
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
  const source = 'extern "lodash" {\n  fn map(arr: any, fn: any): any\n}';
  const ast = parse(tokenize(source));
  assertEqual(ast.body[0].platform, null);
});

test('Parse extern default with browser platform', () => {
  const source = 'extern browser default "react-dom" as ReactDOM: any';
  const ast = parse(tokenize(source));
  assertEqual(ast.body[0].platform, 'browser');
  assertEqual(ast.body[0].alias, 'ReactDOM');
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Update parseExternDeclaration for platform**

In `src/parser.js`, in `parseExternDeclaration` (line ~1512), after consuming `extern`, add platform detection. The current code checks for `default` via `this.peek().value === 'default'`. Add a similar check for `node`/`browser`:

After `this.expect(TokenType.EXTERN, 'Expected extern');`, add:

```javascript
    // Check for platform annotation: extern node/browser
    let platform = null;
    if (this.check(TokenType.IDENTIFIER) && (this.peek().value === 'node' || this.peek().value === 'browser')) {
      const nextNext = this.tokens[this.pos + 1];
      if (nextNext && (nextNext.type === TokenType.STRING || (nextNext.type === TokenType.IDENTIFIER && nextNext.value === 'default'))) {
        platform = this.advance().value;
      }
    }
```

Then pass `platform` to the `parseExternDefaultDeclaration` call:

```javascript
    if (this.check(TokenType.IDENTIFIER) && this.peek().value === 'default') {
      return this.parseExternDefaultDeclaration(platform);
    }
```

Add `platform` to the named extern return object:

```javascript
    return {
      type: NodeType.ExternDeclaration,
      source,
      declarations,
      platform,
    };
```

Update `parseExternDefaultDeclaration` to accept and return `platform`:

Change signature: `parseExternDefaultDeclaration(platform = null) {`
Add to return: `platform,`

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add src/parser.js test/test.js
git commit -m "feat(parser): add node/browser platform annotations to extern declarations"
```

---

### Task 2: Generator — Browser compilation target

**Files:**
- Modify: `src/generator.js`
- Modify: `src/index.js`
- Test: `test/test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/test.js`:

```javascript
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
  try {
    compile('!arg apiKey', { skipTypeCheck: true, target: 'browser' });
  } catch(e) { threw = true; }
  assertEqual(threw, true);
});

test('Browser target: errors on extern node', () => {
  let threw = false;
  try {
    compile('extern node "node:fs" {\n  fn readFileSync(path: string): string\n}\ndec x = readFileSync("f")', { skipTypeCheck: true, target: 'browser' });
  } catch(e) { threw = true; }
  assertEqual(threw, true);
});

test('Browser target: dep becomes module variable reference', () => {
  const js = compile('as utils dep lib.utils\nprint utils.add(1, 2)', { skipTypeCheck: true, target: 'browser' });
  assertContains(js, '_mod_lib_utils');
  const hasImport = js.includes('import ');
  assertEqual(hasImport, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Pass target through to generator**

In `src/index.js`, find the `compile` function. Ensure `target` is passed through to the generator. Find where `generate(ast, ...)` is called and add `target: options.target` to the options.

- [ ] **Step 4: Add browser branch to visitProgram**

In `src/generator.js`, at the top of `visitProgram` (line ~552), add browser target checks and branching:

```javascript
  visitProgram(node) {
    const isBrowser = this.options.target === 'browser';
    
    // Browser target: validate no unsupported features
    if (isBrowser) {
      for (const stmt of node.body) {
        if (stmt.type === NodeType.ArgDeclaration) throw new Error('arg declarations are not available in browser builds');
        if (stmt.type === NodeType.EnvDeclaration) throw new Error('env declarations are not available in browser builds');
        if (stmt.type === NodeType.ExternDeclaration && stmt.platform === 'node') throw new Error(`extern node "${stmt.source}" is not available in browser builds`);
        if (stmt.type === NodeType.ExternDefaultDeclaration && stmt.platform === 'node') throw new Error(`extern node "${stmt.source}" is not available in browser builds`);
        if ((stmt.type === NodeType.ExternDeclaration || stmt.type === NodeType.ExternDefaultDeclaration) && stmt.source && stmt.source.startsWith('node:')) throw new Error(`extern "${stmt.source}" is not available in browser builds`);
      }
    }
    
    // Separate deps, args, env, dec declarations, and other statements
    const depStatements = node.body.filter(stmt => stmt.type === NodeType.DepStatement);
    // ... existing code ...
```

After the existing `otherStatements` filter, add the browser branch:

```javascript
    if (isBrowser) {
      // Scan AST for used features
      this.usedFeatures = this.scanUsedFeatures(node);
      this.asyncFunctions = this.buildAsyncMap(node);
      
      // Browser: no imports, no factory wrapper
      // Dep references become module variable names
      for (const dep of depStatements) {
        const modVar = '_mod_' + dep.pathParts.join('_');
        this.emitLine(`var ${dep.alias} = ${modVar};`);
      }
      if (depStatements.length > 0) this.emitLine();
      
      // Emit all statements directly (no export wrapper)
      for (const stmt of otherStatements) {
        this.visitStatement(stmt, true);
      }
      return;
    }
```

- [ ] **Step 5: Run tests to verify they pass**

- [ ] **Step 6: Commit**

```bash
git add src/generator.js src/index.js test/test.js
git commit -m "feat(generator): add browser compilation target"
```

---

### Task 3: Bundler — Dep graph, topological sort, IIFE output

**Files:**
- Create: `src/bundler.js`
- Test: `test/test.js`

- [ ] **Step 1: Create src/bundler.js**

```javascript
// KimchiLang Bundler — compiles .km files to a browser-ready IIFE bundle

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { compile } from './index.js';

const RUNTIME_SOURCE = readFileSync(new URL('./runtime.js', import.meta.url), 'utf-8');
const RUNTIME_INLINE = RUNTIME_SOURCE
  .replace(/^export /gm, '')
  .replace(/^import .+$/gm, '');

export function bundle(entryPath) {
  const absEntry = resolve(entryPath);
  const projectRoot = dirname(absEntry);
  
  const modules = new Map();
  collectModules(absEntry, projectRoot, modules);
  
  const sorted = topologicalSort(modules, absEntry);
  
  const parts = [];
  parts.push(RUNTIME_INLINE);
  parts.push('');
  
  for (const modPath of sorted) {
    const mod = modules.get(modPath);
    if (modPath === absEntry) continue;
    
    const varName = '_mod_' + mod.depPath.replace(/[\/\.]/g, '_');
    const exports = collectExports(mod.source);
    
    parts.push(`var ${varName} = (function() {`);
    parts.push(mod.compiled);
    if (exports.length > 0) {
      parts.push(`  return { ${exports.join(', ')} };`);
    }
    parts.push('})();');
    parts.push('');
  }
  
  const entry = modules.get(absEntry);
  parts.push(entry.compiled);
  
  const body = parts.join('\n');
  return `(function() {\n${body}\n})();\n`;
}

function collectModules(filePath, projectRoot, modules) {
  if (modules.has(filePath)) return;
  
  if (!existsSync(filePath)) {
    throw new Error(`Module not found: ${filePath}`);
  }
  
  const source = readFileSync(filePath, 'utf-8');
  const cleanSource = source.startsWith('#!') ? source.replace(/^#![^\n]*\n/, '') : source;
  
  const depRegex = /(?:lazy\s+)?as\s+(\w+)\s+dep\s+([\w.]+)/gm;
  let match;
  const deps = [];
  
  while ((match = depRegex.exec(cleanSource)) !== null) {
    const alias = match[1];
    const depPath = match[2];
    const depParts = depPath.split('.');
    const depFilePath = resolve(projectRoot, depParts.join('/') + '.km');
    deps.push({ alias, depPath, filePath: depFilePath });
    collectModules(depFilePath, projectRoot, modules);
  }
  
  let compiled;
  try {
    compiled = compile(cleanSource, {
      target: 'browser',
      skipLint: true,
    });
  } catch (e) {
    throw new Error(`Failed to compile ${filePath}: ${e.message}`);
  }
  
  const relPath = filePath.replace(projectRoot + '/', '').replace(/\.km$/, '');
  const depPath = relPath.replace(/\//g, '.');
  
  modules.set(filePath, { source: cleanSource, deps, compiled, depPath });
}

function topologicalSort(modules, entryPath) {
  const sorted = [];
  const visited = new Set();
  const visiting = new Set();
  
  function visit(path) {
    if (visited.has(path)) return;
    if (visiting.has(path)) {
      throw new Error(`Circular dependency detected involving: ${path}`);
    }
    visiting.add(path);
    const mod = modules.get(path);
    if (mod) {
      for (const dep of mod.deps) {
        visit(dep.filePath);
      }
    }
    visiting.delete(path);
    visited.add(path);
    sorted.push(path);
  }
  
  for (const path of modules.keys()) {
    visit(path);
  }
  
  return sorted;
}

function collectExports(source) {
  const exports = [];
  const regex = /^expose\s+(?:fn|dec)\s+(\w+)/gm;
  let match;
  while ((match = regex.exec(source)) !== null) {
    exports.push(match[1]);
  }
  return exports;
}
```

- [ ] **Step 2: Write tests**

Add to `test/test.js` (import `bundle` at the top alongside other imports, and import fs utilities):

```javascript
import { bundle } from '../src/bundler.js';
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync } from 'fs';
```

Add tests:

```javascript
test('Bundler: single file produces IIFE', () => {
  writeFileSync('/tmp/test_bundle.km', 'dec x = 1\nprint x');
  const result = bundle('/tmp/test_bundle.km');
  assertContains(result, '(function() {');
  assertContains(result, '})();');
  assertContains(result, 'console.log');
  assertEqual(result.includes('import '), false);
  assertEqual(result.includes('export '), false);
  unlinkSync('/tmp/test_bundle.km');
});

test('Bundler: multi-file bundle', () => {
  mkdirSync('/tmp/tb_proj/lib', { recursive: true });
  writeFileSync('/tmp/tb_proj/lib/math.km', 'expose fn add(a, b) { return a + b }');
  writeFileSync('/tmp/tb_proj/app.km', 'as math dep lib.math\nprint math.add(1, 2)');
  const result = bundle('/tmp/tb_proj/app.km');
  assertContains(result, '_mod_lib_math');
  assertContains(result, 'function add');
  assertContains(result, '(function() {');
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
```

- [ ] **Step 3: Run tests to verify they pass**

- [ ] **Step 4: Commit**

```bash
git add src/bundler.js test/test.js
git commit -m "feat: add bundler — dep graph, topological sort, IIFE output"
```

---

### Task 4: CLI — `kimchi build` subcommand

**Files:**
- Modify: `src/cli.js`

- [ ] **Step 1: Add build subcommand**

In `src/cli.js`, find the main command switch. Add:

```javascript
    case 'build': {
      const entry = args.file || args._[0];
      if (!entry) {
        console.error('Usage: kimchi build <entry.km> [-o output.js]');
        process.exit(1);
      }
      const output = args.o || args.output || 'dist/bundle.js';
      
      const { bundle } = await import('./bundler.js');
      
      try {
        const result = bundle(resolve(entry));
        const outDir = dirname(resolve(output));
        if (!existsSync(outDir)) {
          mkdirSync(outDir, { recursive: true });
        }
        writeFileSync(resolve(output), result);
        const sizeKb = (result.length / 1024).toFixed(1);
        console.log(`Bundle: ${output} (${sizeKb} KB)`);
      } catch (e) {
        console.error('Build error:', e.message);
        process.exit(1);
      }
      break;
    }
```

Add `build` to the help text.

- [ ] **Step 2: Test the CLI**

```bash
echo 'print "Hello from the browser!"' > /tmp/test_cli_build.km
node src/cli.js build /tmp/test_cli_build.km -o /tmp/test_output.js
node /tmp/test_output.js
rm /tmp/test_cli_build.km /tmp/test_output.js
```

Expected: prints "Hello from the browser!"

- [ ] **Step 3: Commit**

```bash
git add src/cli.js
git commit -m "feat(cli): add kimchi build subcommand for frontend bundling"
```

---

### Task 5: Update docs and roadmap

**Files:**
- Modify: `ROADMAP.md`
- Modify: `docs/cli.md`

- [ ] **Step 1: Mark build system as done on roadmap**

Find the frontend build system line and mark it done.

- [ ] **Step 2: Add build command to docs/cli.md**

Add a Build section:

```markdown
## Build (Frontend Bundle)

```bash
kimchi build src/app.km -o dist/bundle.js
```

Compiles KimchiLang files for the browser. Follows all `dep` imports, bundles into a single IIFE JavaScript file. No `import`/`export` in output — works with `<script src="bundle.js">`.

### Platform annotations

```kimchi
extern node "node:fs" { fn readFileSync(path: string): string }    // Node only — error in build
extern browser "react" { dec createElement: any }                    // Browser only
extern "lodash" { fn map(arr: any, fn: any): any }                  // Universal
```
```

- [ ] **Step 3: Run full test suite**

```bash
node test/test.js 2>&1 | tail -5
node test/stdlib_test.js 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add ROADMAP.md docs/cli.md
git commit -m "docs: mark frontend build system as done, add build command to CLI docs"
```
