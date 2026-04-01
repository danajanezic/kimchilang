// KimchiLang Bundler — compiles .km/.kmx files to a browser-ready ES module bundle

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { compile } from './index.js';
import kmxReactPlugin from './extensions/kmx-react.js';

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

  // Collect all import statements from compiled modules (extern browser imports, jsx-runtime)
  const imports = new Set();
  const moduleCode = new Map();

  for (const modPath of sorted) {
    const mod = modules.get(modPath);
    const lines = mod.compiled.split('\n');
    const codeLines = [];
    for (const line of lines) {
      if (line.startsWith('import ')) {
        imports.add(line);
      } else {
        codeLines.push(line);
      }
    }
    moduleCode.set(modPath, codeLines.join('\n'));
  }

  const parts = [];

  // ES module imports at the top
  for (const imp of imports) {
    parts.push(imp);
  }
  if (imports.size > 0) parts.push('');

  // Runtime (inlined, no import)
  parts.push(RUNTIME_INLINE);
  parts.push('');

  // Dep modules (wrapped in closures for scoping)
  for (const modPath of sorted) {
    if (modPath === absEntry) continue;
    const mod = modules.get(modPath);
    const code = moduleCode.get(modPath);

    const varName = '_mod_' + mod.depPath.replace(/[\/\.]/g, '_');
    const exports = collectExports(mod.source);

    parts.push(`const ${varName} = (() => {`);
    parts.push(code);
    if (exports.length > 0) {
      parts.push(`  return { ${exports.join(', ')} };`);
    }
    parts.push('})();');
    parts.push('');
  }

  // Entry point (runs directly)
  parts.push(moduleCode.get(absEntry));

  return parts.join('\n') + '\n';
}

function collectModules(filePath, projectRoot, modules, visiting = new Set()) {
  if (modules.has(filePath)) return;

  if (visiting.has(filePath)) {
    throw new Error(`Circular dependency detected involving: ${filePath}`);
  }
  visiting.add(filePath);

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
    let depFilePath = resolve(projectRoot, depParts.join('/') + '.km');
    if (!existsSync(depFilePath)) {
      depFilePath = resolve(projectRoot, depParts.join('/') + '.kmx');
    }
    deps.push({ alias, depPath, filePath: depFilePath });
    collectModules(depFilePath, projectRoot, modules, visiting);
  }

  const plugins = filePath.endsWith('.kmx') ? [kmxReactPlugin] : [];

  let compiled;
  try {
    compiled = compile(cleanSource, {
      target: 'browser',
      skipLint: true,
      plugins,
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
