// SpecScript Compiler — orchestrates all compilation stages

import { splitSections } from './section-splitter.js';
import { parseSpec } from './spec-parser.js';
import { computeSpecHash, extractHash } from './hasher.js';
import { tokenize } from './lexer.js';
import { parse } from './parser.js';
import { generate } from './generator.js';

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

    const testTokens = tokenize(sections.test);
    const implTokens = tokenize(sections.impl);
    const testAst = parse(testTokens);
    const implAst = parse(implTokens);

    const combinedAst = {
      type: 'Program',
      body: [...implAst.body, ...testAst.body],
    };
    const js = generate(combinedAst);

    return { js, spec, hash: specHash, testAst, implAst };
  }
}

export function compile(source, options = {}) {
  const compiler = new SpecScriptCompiler(options);
  return compiler.compile(source);
}
