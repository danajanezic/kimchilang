// KimchiLang Interpreter — cached transpiler for direct script execution
// Note: this module does not use child_process — execution is handled by the CLI.

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { compile } from './index.js';

// Read runtime source once at module load, strip ES module syntax for inlining
const RUNTIME_SOURCE = readFileSync(new URL('./runtime.js', import.meta.url), 'utf-8');
const RUNTIME_INLINE = RUNTIME_SOURCE
  .replace(/^export /gm, '')
  .replace(/^import .+$/gm, '');

export class KimchiInterpreter {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || null;
    this.projectRoot = options.projectRoot || process.cwd();
  }

  prepare(source, options = {}) {
    const hash = createHash('sha256').update(source).digest('hex').slice(0, 16);

    // Check cache
    if (this.cacheDir) {
      const cacheFile = join(this.cacheDir, `${hash}.mjs`);
      if (existsSync(cacheFile)) {
        return readFileSync(cacheFile, 'utf-8');
      }
    }

    // Strip shebang line if present
    const cleanSource = source.startsWith('#!') ? source.replace(/^#![^\n]*\n/, '') : source;

    // Static file resolver — checks if a module path is a .static file
    const projectRoot = this.projectRoot;
    const staticFileResolver = (modulePath) => {
      const parts = modulePath.split('.');
      const staticPath = resolve(projectRoot, parts.join('/') + '.static');
      return existsSync(staticPath);
    };

    // Compile via existing pipeline
    const javascript = compile(cleanSource, {
      skipLint: options.skipLint,
      showLintWarnings: true,
      basePath: options.basePath,
      staticFileResolver,
    });

    // Resolve dependencies — compile all imported .km modules into the cache
    if (this.cacheDir) {
      this._resolveDeps(javascript, options);
    }

    // Wrap entry point: inline runtime, make callable
    const wrapped = this._wrap(javascript, hash);

    // Write to cache
    if (this.cacheDir) {
      if (!existsSync(this.cacheDir)) {
        mkdirSync(this.cacheDir, { recursive: true });
      }
      writeFileSync(join(this.cacheDir, `${hash}.mjs`), wrapped);
    }

    return wrapped;
  }

  getCachePath(source) {
    const hash = createHash('sha256').update(source).digest('hex').slice(0, 16);
    return this.cacheDir ? join(this.cacheDir, `${hash}.mjs`) : null;
  }

  // Recursively compile dependencies into the cache directory,
  // mirroring the project's directory structure so import paths resolve
  _resolveDeps(javascript, options) {
    // Handle .km module imports (static file imports use absolute paths and resolve on disk)
    const importRegex = /^import .+ from '(\.\/[^']+\.km)';$/gm;
    let match;

    while ((match = importRegex.exec(javascript)) !== null) {
      const relPath = match[1]; // e.g., './stdlib/logger.km'
      const absPath = resolve(this.projectRoot, relPath);
      const cacheRelPath = relPath.replace(/\.km$/, '.mjs');
      const cachePath = join(this.cacheDir, cacheRelPath);

      // Skip if already in cache
      if (existsSync(cachePath)) continue;

      // Find the source file (.km, .kimchi, .kc)
      let depSource = null;
      let depAbsPath = absPath;
      for (const ext of ['', '.kimchi', '.kc']) {
        const tryPath = ext ? absPath.replace(/\.km$/, ext) : absPath;
        if (existsSync(tryPath)) {
          depSource = readFileSync(tryPath, 'utf-8');
          depAbsPath = tryPath;
          break;
        }
      }

      // Try .static files
      if (!depSource) {
        const staticPath = absPath.replace(/\.km$/, '.static');
        if (existsSync(staticPath)) {
          const staticJsPath = staticPath + '.js';
          if (existsSync(staticJsPath)) {
            const cacheDir = dirname(cachePath);
            if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
            writeFileSync(cachePath, readFileSync(staticJsPath, 'utf-8'));
          }
          continue;
        }
      }

      if (!depSource) continue;

      // Strip shebang
      const cleanDep = depSource.startsWith('#!') ? depSource.replace(/^#![^\n]*\n/, '') : depSource;

      // Compile the dependency
      let depJs;
      try {
        depJs = compile(cleanDep, {
          skipLint: true,
          basePath: dirname(depAbsPath),
        });
      } catch (e) {
        continue;
      }

      // Write compiled dependency — keep export default (it's a module, not entry point)
      // Inline runtime, strip runtime import
      const depWrapped = this._wrapDep(depJs);
      const cacheDepDir = dirname(cachePath);
      if (!existsSync(cacheDepDir)) mkdirSync(cacheDepDir, { recursive: true });
      writeFileSync(cachePath, depWrapped);

      // Copy extern JS helper files referenced by this dependency
      this._copyExternHelpers(depJs, dirname(depAbsPath), cacheDepDir);

      // Recursively resolve this dependency's dependencies
      this._resolveDeps(depJs, { ...options, basePath: dirname(depAbsPath) });
    }
  }

  // Rewrite .km import paths to .mjs for cached files
  // Static file imports (.static.js) and absolute file:// URLs are left as-is
  _rewriteImports(javascript) {
    return javascript
      .replace(/^(import .+ from '[^']+)\.km';$/gm, "$1.mjs';");
  }

  // Wrap entry point: inline runtime, rewrite imports, replace export with callable
  _wrap(javascript, hash) {
    let code = javascript;
    code = code.replace(/^import .* from '.*kimchi-runtime\.js';\n?/m, '');
    code = this._rewriteImports(code);
    code = code.replace(
      /^export default (?:async )?function/m,
      'const _module = async function'
    );
    return `// kimchi-cache: ${hash}\n${RUNTIME_INLINE}\n${code}\nawait _module({});\n`;
  }

  // Copy extern JS helper files (e.g., _server_helpers.js) to the cache directory
  // so that compiled modules can import them at runtime
  _copyExternHelpers(javascript, sourceDir, cacheDir) {
    const jsImportRegex = /^import .+ from '(\.\/[^']+\.js)';$/gm;
    let match;
    while ((match = jsImportRegex.exec(javascript)) !== null) {
      const relPath = match[1]; // e.g., './_server_helpers.js'
      const srcFile = resolve(sourceDir, relPath);
      const destFile = join(cacheDir, relPath.replace(/^\.\//, ''));
      if (existsSync(srcFile) && !existsSync(destFile)) {
        const destDir = dirname(destFile);
        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
        writeFileSync(destFile, readFileSync(srcFile, 'utf-8'));
      }
    }
  }

  // Wrap dependency module: inline runtime, rewrite imports, keep export default
  _wrapDep(javascript) {
    let code = javascript;
    code = code.replace(/^import .* from '.*kimchi-runtime\.js';\n?/m, '');
    code = this._rewriteImports(code);
    return `${RUNTIME_INLINE}\n${code}`;
  }
}
