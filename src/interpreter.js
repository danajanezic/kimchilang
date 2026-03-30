// KimchiLang Interpreter — cached transpiler for direct script execution

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { compile } from './index.js';

// Read runtime source once at module load, strip ES module syntax for inlining
const RUNTIME_SOURCE = readFileSync(new URL('./runtime.js', import.meta.url), 'utf-8');
const RUNTIME_INLINE = RUNTIME_SOURCE
  .replace(/^export /gm, '')
  .replace(/^import .+$/gm, '');

export class KimchiInterpreter {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || null;
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

    // Compile via existing pipeline
    const javascript = compile(cleanSource, {
      skipLint: options.skipLint,
      showLintWarnings: true,
      basePath: options.basePath,
    });

    // Wrap: inline runtime, remove imports, make callable
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

  _wrap(javascript, hash) {
    const withoutImport = javascript.replace(/^import .* from '.*kimchi-runtime\.js';\n?/m, '');
    const withoutExport = withoutImport.replace(
      /^export default (?:async )?function/m,
      'const _module = async function'
    );
    return `// kimchi-cache: ${hash}\n${RUNTIME_INLINE}\n${withoutExport}\nawait _module({});\n`;
  }
}
