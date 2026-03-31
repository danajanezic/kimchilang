// KimchiLang Validator — structured diagnostics for editors and LLMs

import { tokenize } from './lexer.js';
import { parse } from './parser.js';
import { TypeChecker } from './typechecker.js';
import { Linter, Severity } from './linter.js';

export class KimchiValidator {
  constructor(options = {}) {
    this.options = options;
  }

  validate(source, modulePath = null) {
    const diagnostics = [];

    if (!source || !source.trim()) {
      return { diagnostics, success: true };
    }

    // Strip shebang line if present
    const cleanSource = source.startsWith('#!') ? source.replace(/^#![^\n]*\n/, '') : source;
    source = cleanSource;

    // Phase 1: Tokenize
    let tokens;
    try {
      tokens = tokenize(source);
    } catch (error) {
      diagnostics.push(this._parseErrorToDiagnostic(error, 'kimchi-lexer'));
      return { diagnostics, success: false };
    }

    // Phase 2: Parse
    let ast;
    try {
      ast = parse(tokens);
    } catch (error) {
      diagnostics.push(this._parseErrorToDiagnostic(error, 'kimchi-parser'));
      return { diagnostics, success: false };
    }

    // Phase 3: Type check
    let hasErrors = false;
    try {
      const typeChecker = new TypeChecker({ modulePath });
      const typeErrors = typeChecker.check(ast);
      for (const err of typeErrors) {
        diagnostics.push({
          line: err.line || 1,
          column: err.column || 1,
          severity: 'error',
          message: err.message.replace(/^Type Error at \d+:\d+:\s*/, ''),
          source: 'kimchi-typechecker',
        });
        hasErrors = true;
      }
    } catch (error) {
      diagnostics.push(this._parseErrorToDiagnostic(error, 'kimchi-typechecker'));
      hasErrors = true;
    }

    // Phase 4: Lint
    try {
      const linter = new Linter(this.options.lintOptions || {});
      const lintMessages = linter.lint(ast, source);
      for (const msg of lintMessages) {
        const severity = msg.severity === Severity.Error ? 'error'
          : msg.severity === Severity.Warning ? 'warning'
          : 'info';
        diagnostics.push({
          line: msg.line || 1,
          column: msg.column || 1,
          severity,
          message: msg.message,
          source: 'kimchi-linter',
          code: msg.rule,
        });
        if (severity === 'error') hasErrors = true;
      }
    } catch (error) {
      // Linter errors shouldn't crash validation
    }

    return { diagnostics, success: !hasErrors };
  }

  validateAll(files) {
    const results = new Map();

    // Pass 1: register module types from all files
    for (const [filePath, source] of files) {
      try {
        const tokens = tokenize(source);
        const ast = parse(tokens);
        const typeChecker = new TypeChecker({ modulePath: filePath });
        typeChecker.check(ast);
      } catch (e) {
        // Ignore pass 1 errors
      }
    }

    // Pass 2: full validation per file
    for (const [filePath, source] of files) {
      results.set(filePath, this.validate(source, filePath));
    }

    return results;
  }

  _parseErrorToDiagnostic(error, source) {
    const match = error.message.match(/at (\d+):(\d+):\s*(.+)/);
    if (match) {
      return {
        line: parseInt(match[1], 10),
        column: parseInt(match[2], 10),
        severity: 'error',
        message: match[3],
        source,
      };
    }
    return {
      line: 1,
      column: 1,
      severity: 'error',
      message: error.message,
      source,
    };
  }
}

// Helper to format diagnostics as human/LLM-readable string
export function formatDiagnostics(diagnostics) {
  return diagnostics.map(d => {
    const loc = `Line ${d.line}, col ${d.column}`;
    const sev = d.severity;
    const src = d.source ? ` [${d.source}]` : '';
    const code = d.code ? ` (${d.code})` : '';
    return `${loc}: ${sev}${src}${code} ${d.message}`;
  }).join('\n');
}
