// KimchiLang - A modern programming language that transpiles to JavaScript

import { Lexer, tokenize } from './lexer.js';
import { Parser, parse } from './parser.js';
import { CodeGenerator, generate } from './generator.js';
import { TypeChecker } from './typechecker.js';
import { Linter, Severity } from './linter.js';

// Module registry for tracking required args across modules
const moduleRegistry = new Map();

export class KimchiCompiler {
  constructor(options = {}) {
    this.options = options;
  }

  // Register a module's required args for cross-module validation
  static registerModule(modulePath, requiredArgs) {
    moduleRegistry.set(modulePath, requiredArgs);
  }

  // Get required args for a module
  static getModuleRequiredArgs(modulePath) {
    return moduleRegistry.get(modulePath) || [];
  }

  compile(source, modulePath = null) {
    // Step 1: Tokenize
    const tokens = tokenize(source);
    
    if (this.options.debug) {
      console.log('Tokens:', tokens);
    }
    
    // Step 2: Parse
    const ast = parse(tokens);
    
    if (this.options.debug) {
      console.log('AST:', JSON.stringify(ast, null, 2));
    }
    
    // Step 2.5: Extract and register required args for this module
    const argDeclarations = ast.body.filter(stmt => stmt.type === 'ArgDeclaration');
    const requiredArgs = argDeclarations.filter(a => a.required).map(a => a.name);
    if (modulePath) {
      KimchiCompiler.registerModule(modulePath, requiredArgs);
    }
    
    // Step 2.6: Validate dep calls against registered modules
    const depStatements = ast.body.filter(stmt => stmt.type === 'DepStatement');
    for (const dep of depStatements) {
      const depRequiredArgs = KimchiCompiler.getModuleRequiredArgs(dep.path);
      if (depRequiredArgs.length > 0) {
        // Check if all required args are provided in the overrides
        const providedArgs = dep.overrides ? this.extractProvidedArgs(dep.overrides) : [];
        for (const requiredArg of depRequiredArgs) {
          if (!providedArgs.includes(requiredArg)) {
            throw new Error(`Compile Error: Required argument '${requiredArg}' not provided for dependency '${dep.path}'`);
          }
        }
      }
    }
    
    // Step 2.7: Type checking
    if (!this.options.skipTypeCheck) {
      const typeChecker = new TypeChecker();
      const typeErrors = typeChecker.check(ast);
      if (typeErrors.length > 0) {
        const errorMessages = typeErrors.map(e => `Type Error: ${e.message}`).join('\n');
        throw new Error(errorMessages);
      }
    }
    
    // Step 2.8: Linting
    if (!this.options.skipLint) {
      const linter = new Linter(this.options.lintOptions || {});
      const lintMessages = linter.lint(ast, source);
      
      // Collect lint errors (not warnings/info)
      const lintErrors = lintMessages.filter(m => m.severity === Severity.Error);
      if (lintErrors.length > 0) {
        const errorMessages = lintErrors.map(m => `Lint Error [${m.rule}]: ${m.message}`).join('\n');
        throw new Error(errorMessages);
      }
      
      // Show warnings only if explicitly requested
      if (this.options.showLintWarnings && lintMessages.length > 0) {
        const warnings = lintMessages.filter(m => m.severity !== Severity.Error);
        if (warnings.length > 0) {
          console.error(linter.formatMessages());
        }
      }
    }
    
    // Step 3: Generate JavaScript
    const javascript = generate(ast, this.options);
    
    if (this.options.debug) {
      console.log('Generated JavaScript:', javascript);
    }
    
    return javascript;
  }
  
  extractProvidedArgs(overrides) {
    if (overrides.type !== 'ObjectExpression') return [];
    return overrides.properties.map(p => {
      // Key is stored as a string directly in the parser
      if (typeof p.key === 'string') return p.key;
      if (p.key.type === 'Identifier') return p.key.name;
      if (p.key.type === 'Literal') return p.key.value;
      return null;
    }).filter(Boolean);
  }

  run(source) {
    const javascript = this.compile(source);
    return eval(javascript);
  }
}

export { tokenize, parse, generate };

export function compile(source, options = {}) {
  const compiler = new KimchiCompiler(options);
  return compiler.compile(source);
}

export function run(source, options = {}) {
  const compiler = new KimchiCompiler(options);
  return compiler.run(source);
}
