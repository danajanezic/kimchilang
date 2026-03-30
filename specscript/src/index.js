// SpecScript Compiler — orchestrates all compilation stages
// Uses KimchiLang's compiler for code transpilation (lexer, parser, generator)

import { splitSections } from './section-splitter.js';
import { parseSpec } from './spec-parser.js';
import { computeSpecHash, extractHash } from './hasher.js';
import { KimchiCompiler } from '../../src/index.js';

function stripHtmlComments(code) {
  return code.replace(/<!--[\s\S]*?-->/g, '');
}

function stripCodeFences(code) {
  return code.replace(/^```\w*\s*$/gm, '');
}

function stripMarkdownComments(code) {
  // Convert lines starting with # (not ##) to KimchiLang comments
  // But only outside of strings — simple heuristic: lines that start with #
  return code.replace(/^# .+$/gm, (match) => '//' + match.slice(1));
}

export class SpecScriptCompiler {
  constructor(options = {}) {
    this.options = options;
  }

  computeHash(specContent) {
    return computeSpecHash(specContent);
  }

  compile(source) {
    const sections = splitSections(source);
    const spec = parseSpec(sections.spec);
    const specHash = computeSpecHash(sections.spec);
    const testHash = extractHash(sections.test);
    const implHash = extractHash(sections.impl);

    if (!testHash) {
      throw new Error(
        'Compile Error: Missing spec-hash in ## test section. ' +
        'Add <!-- spec-hash: ' + specHash + ' --> to the test section.'
      );
    }
    if (!implHash) {
      throw new Error(
        'Compile Error: Missing spec-hash in ## impl section. ' +
        'Add <!-- spec-hash: ' + specHash + ' --> to the impl section.'
      );
    }

    // Invalid state: test stale but impl fresh
    if (testHash !== specHash && implHash === specHash) {
      throw new Error(
        'Compile Error: ## test section hash is stale but ## impl hash is fresh. ' +
        'Tests must be regenerated before impl. This is an invalid state.'
      );
    }

    if (testHash !== specHash) {
      throw new Error(
        'Compile Error: ## test section is stale. Spec has changed. ' +
        `Expected hash ${specHash}, found ${testHash}. ` +
        'Regenerate tests with: sp regen <file> --test'
      );
    }

    if (implHash !== specHash) {
      throw new Error(
        'Compile Error: ## impl section is stale. Spec has changed. ' +
        `Expected hash ${specHash}, found ${implHash}. ` +
        'Regenerate impl with: sp regen <file> --impl'
      );
    }

    // Strip HTML comments, code fences, and markdown comments, then combine for KimchiLang
    const implCode = stripMarkdownComments(stripCodeFences(stripHtmlComments(sections.impl)));
    const testCode = stripMarkdownComments(stripCodeFences(stripHtmlComments(sections.test)));
    const combinedCode = implCode.trim() + '\n\n' + testCode.trim();

    // Transpile using KimchiLang (type checker + linter enabled)
    const kimchi = new KimchiCompiler({
      ...this.options,
    });
    const js = kimchi.compile(combinedCode);

    return { js, spec, hash: specHash };
  }
}

export function compile(source, options = {}) {
  const compiler = new SpecScriptCompiler(options);
  return compiler.compile(source);
}
