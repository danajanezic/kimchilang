// KimchiLang Linter - Compile-time code quality checks
import { NodeType } from './parser.js';

// Lint rule severity levels
export const Severity = {
  Error: 'error',
  Warning: 'warning',
  Info: 'info',
};

class LintMessage {
  constructor(rule, message, severity, node, line, column) {
    this.rule = rule;
    this.message = message;
    this.severity = severity;
    this.node = node;
    this.line = line || (node && node.line) || 0;
    this.column = column || (node && node.column) || 0;
  }

  toString() {
    const prefix = this.severity === Severity.Error ? '❌' : 
                   this.severity === Severity.Warning ? '⚠️' : 'ℹ️';
    const location = this.line ? ` at line ${this.line}` : '';
    return `${prefix} [${this.rule}]${location}: ${this.message}`;
  }
}

export class Linter {
  constructor(options = {}) {
    this.options = {
      // Enable/disable specific rules
      rules: {
        'unused-variable': true,
        'unused-function': true,
        'unreachable-code': true,
        'empty-block': true,
        'constant-condition': true,
        'duplicate-key': true,
        'shadow-variable': true,
        'missing-return': false, // Can be noisy
        'no-console': false, // print is common in Kimchi
        // Formatting rules
        'indent': true,           // Enforce 2-space indentation
        'no-tabs': true,          // Disallow tabs
        'no-trailing-spaces': true, // Disallow trailing whitespace
        'max-line-length': false, // Disabled by default (set to number to enable)
        'newline-after-function': true, // Require blank line after function declarations
        'no-multiple-empty-lines': true, // Max 1 consecutive empty line
        ...options.rules,
      },
      // Severity overrides
      severity: {
        'unused-variable': Severity.Warning,
        'unused-function': Severity.Warning,
        'unreachable-code': Severity.Warning,
        'empty-block': Severity.Info,
        'constant-condition': Severity.Warning,
        'duplicate-key': Severity.Error,
        'shadow-variable': Severity.Warning,
        'missing-return': Severity.Info,
        // Formatting severities
        'indent': Severity.Warning,
        'no-tabs': Severity.Warning,
        'no-trailing-spaces': Severity.Warning,
        'max-line-length': Severity.Warning,
        'newline-after-function': Severity.Info,
        'no-multiple-empty-lines': Severity.Info,
        ...options.severity,
      },
      // Formatting options
      indentSize: options.indentSize || 2,
      maxLineLength: options.maxLineLength || 120,
    };
    
    this.messages = [];
    this.scopes = [];
    this.currentFunction = null;
    this.source = null;
    this.lines = [];
  }

  lint(ast, source = null) {
    this.messages = [];
    this.scopes = [{ variables: new Map(), functions: new Map() }];
    this.source = source;
    this.lines = source ? source.split('\n') : [];
    
    // Format checking pass (if source is provided)
    if (source) {
      this.checkFormatting();
    }
    
    // First pass: collect all declarations
    this.collectDeclarations(ast);
    
    // Second pass: analyze usage and detect issues
    this.analyzeProgram(ast);
    
    // Third pass: check for unused declarations
    this.checkUnused();
    
    return this.messages;
  }
  
  // Formatting checks
  checkFormatting() {
    let consecutiveEmptyLines = 0;
    let inBlockDepth = 0;
    
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      const lineNum = i + 1;
      
      // Track block depth for indentation checking
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      
      // Check for tabs
      if (this.isRuleEnabled('no-tabs') && line.includes('\t')) {
        this.addMessageAt('no-tabs', 'Tabs are not allowed, use spaces for indentation', lineNum, line.indexOf('\t') + 1);
      }
      
      // Check for trailing whitespace
      if (this.isRuleEnabled('no-trailing-spaces') && /\s+$/.test(line) && line.trim().length > 0) {
        this.addMessageAt('no-trailing-spaces', 'Trailing whitespace is not allowed', lineNum, line.length);
      }
      
      // Check max line length
      const maxLen = this.options.maxLineLength;
      if (this.options.rules['max-line-length'] && line.length > maxLen) {
        this.addMessageAt('max-line-length', `Line exceeds maximum length of ${maxLen} characters (${line.length})`, lineNum, maxLen);
      }
      
      // Check indentation (only for non-empty lines)
      if (this.isRuleEnabled('indent') && line.trim().length > 0) {
        const leadingSpaces = line.match(/^( *)/)[1].length;
        const indentSize = this.options.indentSize;
        
        // Calculate expected indent based on previous context
        // Lines starting with } should be at parent level
        const startsWithClose = line.trim().startsWith('}');
        const expectedDepth = startsWithClose ? Math.max(0, inBlockDepth - 1) : inBlockDepth;
        const expectedIndent = expectedDepth * indentSize;
        
        // Allow some flexibility - just check it's a multiple of indentSize
        if (leadingSpaces % indentSize !== 0) {
          this.addMessageAt('indent', `Indentation should be a multiple of ${indentSize} spaces (found ${leadingSpaces})`, lineNum, 1);
        }
      }
      
      // Update block depth after processing the line
      inBlockDepth += openBraces - closeBraces;
      if (inBlockDepth < 0) inBlockDepth = 0;
      
      // Check for multiple consecutive empty lines
      if (line.trim().length === 0) {
        consecutiveEmptyLines++;
        if (this.isRuleEnabled('no-multiple-empty-lines') && consecutiveEmptyLines > 1) {
          this.addMessageAt('no-multiple-empty-lines', 'Multiple consecutive empty lines are not allowed', lineNum, 1);
        }
      } else {
        consecutiveEmptyLines = 0;
      }
    }
    
    // Check for blank line after function declarations
    if (this.isRuleEnabled('newline-after-function')) {
      this.checkNewlineAfterFunctions();
    }
  }
  
  checkNewlineAfterFunctions() {
    // Find function declarations and check for blank line after closing brace
    let inFunction = false;
    let braceDepth = 0;
    let functionStartLine = 0;
    
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();
      
      // Detect function start
      if (!inFunction && (trimmed.startsWith('fn ') || trimmed.startsWith('expose fn ') || 
          trimmed.startsWith('async fn ') || trimmed.startsWith('memo ') ||
          trimmed.startsWith('expose memo ') || trimmed.startsWith('async memo '))) {
        inFunction = true;
        functionStartLine = lineNum;
        braceDepth = 0;
      }
      
      if (inFunction) {
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        braceDepth += openBraces - closeBraces;
        
        // Function ended
        if (braceDepth <= 0 && line.includes('}')) {
          inFunction = false;
          
          // Check next non-empty line
          let nextLineIdx = i + 1;
          while (nextLineIdx < this.lines.length && this.lines[nextLineIdx].trim() === '') {
            nextLineIdx++;
          }
          
          // If there's a next line and it's not EOF, check if there was a blank line
          if (nextLineIdx < this.lines.length) {
            const blankLinesBetween = nextLineIdx - i - 1;
            if (blankLinesBetween === 0) {
              // Only warn if the next line is not a closing brace or another function
              const nextLine = this.lines[nextLineIdx].trim();
              if (!nextLine.startsWith('}') && nextLine.length > 0) {
                this.addMessageAt('newline-after-function', 'Expected blank line after function declaration', lineNum, 1);
              }
            }
          }
        }
      }
    }
  }
  
  addMessageAt(rule, message, line, column) {
    if (!this.isRuleEnabled(rule)) return;
    this.messages.push(new LintMessage(rule, message, this.getSeverity(rule), null, line, column));
  }

  // Scope management
  pushScope() {
    this.scopes.push({ variables: new Map(), functions: new Map() });
  }

  popScope() {
    const scope = this.scopes.pop();
    // Check for unused variables in this scope
    if (this.isRuleEnabled('unused-variable')) {
      for (const [name, info] of scope.variables) {
        if (!info.used && !name.startsWith('_')) {
          this.addMessage('unused-variable', `Variable '${name}' is declared but never used`, info.node);
        }
      }
    }
    return scope;
  }

  currentScope() {
    return this.scopes[this.scopes.length - 1];
  }

  defineVariable(name, node) {
    const scope = this.currentScope();
    
    // Check for shadowing
    if (this.isRuleEnabled('shadow-variable')) {
      for (let i = this.scopes.length - 2; i >= 0; i--) {
        if (this.scopes[i].variables.has(name)) {
          this.addMessage('shadow-variable', `Variable '${name}' shadows a variable in an outer scope`, node);
          break;
        }
      }
    }
    
    scope.variables.set(name, { node, used: false, assigned: true });
  }

  defineFunction(name, node) {
    const scope = this.currentScope();
    scope.functions.set(name, { node, used: false, called: false });
  }

  useVariable(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].variables.has(name)) {
        this.scopes[i].variables.get(name).used = true;
        return true;
      }
      if (this.scopes[i].functions.has(name)) {
        this.scopes[i].functions.get(name).used = true;
        return true;
      }
    }
    return false;
  }

  // Rule helpers
  isRuleEnabled(rule) {
    return this.options.rules[rule] !== false;
  }

  getSeverity(rule) {
    return this.options.severity[rule] || Severity.Warning;
  }

  addMessage(rule, message, node) {
    if (!this.isRuleEnabled(rule)) return;
    this.messages.push(new LintMessage(rule, message, this.getSeverity(rule), node));
  }

  // First pass: collect declarations
  collectDeclarations(ast) {
    for (const stmt of ast.body) {
      if (stmt.type === NodeType.FunctionDeclaration) {
        this.defineFunction(stmt.name, stmt);
      } else if (stmt.type === NodeType.DecDeclaration) {
        if (stmt.destructuring) {
          this.collectDestructuringNames(stmt.pattern, stmt);
        } else {
          this.defineVariable(stmt.name, stmt);
        }
      } else if (stmt.type === NodeType.EnumDeclaration) {
        this.defineVariable(stmt.name, stmt);
      } else if (stmt.type === NodeType.ArgDeclaration) {
        this.defineVariable(stmt.name, stmt);
      } else if (stmt.type === NodeType.EnvDeclaration) {
        this.defineVariable(stmt.name, stmt);
      }
    }
  }

  collectDestructuringNames(pattern, node) {
    if (pattern.type === NodeType.ObjectPattern) {
      for (const prop of pattern.properties) {
        this.defineVariable(prop.value, node);
      }
    } else if (pattern.type === NodeType.ArrayPattern) {
      for (const elem of pattern.elements) {
        if (elem) {
          this.defineVariable(elem.name, node);
        }
      }
    }
  }

  // Second pass: analyze program
  analyzeProgram(ast) {
    for (const stmt of ast.body) {
      this.analyzeStatement(stmt);
    }
  }

  analyzeStatement(node, inUnreachable = false) {
    if (!node) return { returns: false, breaks: false };

    switch (node.type) {
      case NodeType.DecDeclaration:
        this.analyzeExpression(node.init);
        return { returns: false, breaks: false };

      case NodeType.FunctionDeclaration:
        return this.analyzeFunctionDeclaration(node);

      case NodeType.IfStatement:
        return this.analyzeIfStatement(node, inUnreachable);

      case NodeType.WhileStatement:
        return this.analyzeWhileStatement(node);

      case NodeType.ForInStatement:
        return this.analyzeForInStatement(node);

      case NodeType.ReturnStatement:
        if (node.argument) {
          this.analyzeExpression(node.argument);
        }
        return { returns: true, breaks: false };

      case NodeType.BreakStatement:
        return { returns: false, breaks: true };

      case NodeType.ContinueStatement:
        return { returns: false, breaks: false };

      case NodeType.TryStatement:
        return this.analyzeTryStatement(node);

      case NodeType.ThrowStatement:
        this.analyzeExpression(node.argument);
        return { returns: true, breaks: false }; // throw is like return for control flow

      case NodeType.PatternMatch:
        return this.analyzePatternMatch(node);

      case NodeType.PrintStatement:
        this.analyzeExpression(node.argument || node.expression);
        return { returns: false, breaks: false };

      case NodeType.ExpressionStatement:
        this.analyzeExpression(node.expression);
        return { returns: false, breaks: false };

      case NodeType.BlockStatement:
        return this.analyzeBlock(node);

      case NodeType.DepStatement:
        if (node.overrides) {
          this.analyzeExpression(node.overrides);
        }
        return { returns: false, breaks: false };

      default:
        return { returns: false, breaks: false };
    }
  }

  analyzeBlock(node, checkEmpty = true) {
    if (!node.body || node.body.length === 0) {
      if (checkEmpty && this.isRuleEnabled('empty-block')) {
        this.addMessage('empty-block', 'Empty block statement', node);
      }
      return { returns: false, breaks: false };
    }

    let hasUnreachable = false;
    let result = { returns: false, breaks: false };

    for (let i = 0; i < node.body.length; i++) {
      const stmt = node.body[i];
      
      if (hasUnreachable && this.isRuleEnabled('unreachable-code')) {
        this.addMessage('unreachable-code', 'Unreachable code detected', stmt);
      }

      const stmtResult = this.analyzeStatement(stmt, hasUnreachable);
      
      if (stmtResult.returns || stmtResult.breaks) {
        hasUnreachable = true;
        result = stmtResult;
      }
    }

    return result;
  }

  analyzeFunctionDeclaration(node) {
    const prevFunction = this.currentFunction;
    this.currentFunction = node;
    
    this.pushScope();
    
    // Define parameters
    for (const param of node.params) {
      const name = param.name || param.argument;
      if (name) {
        this.defineVariable(name, param);
      }
    }
    
    // Analyze body
    if (node.body) {
      this.analyzeBlock(node.body, false);
    }
    
    this.popScope();
    this.currentFunction = prevFunction;
    
    return { returns: false, breaks: false };
  }

  analyzeIfStatement(node, inUnreachable) {
    this.analyzeExpression(node.test);
    
    // Check for constant condition
    if (this.isRuleEnabled('constant-condition')) {
      const constValue = this.getConstantValue(node.test);
      if (constValue !== null) {
        this.addMessage('constant-condition', 
          `Condition is always ${constValue ? 'true' : 'false'}`, node);
      }
    }
    
    this.pushScope();
    const consequentResult = node.consequent ? 
      this.analyzeBlock(node.consequent) : { returns: false, breaks: false };
    this.popScope();
    
    let alternateResult = { returns: false, breaks: false };
    if (node.alternate) {
      this.pushScope();
      if (node.alternate.type === NodeType.BlockStatement) {
        alternateResult = this.analyzeBlock(node.alternate);
      } else {
        alternateResult = this.analyzeStatement(node.alternate);
      }
      this.popScope();
    }
    
    // Both branches must return/break for the if to return/break
    return {
      returns: consequentResult.returns && alternateResult.returns,
      breaks: consequentResult.breaks && alternateResult.breaks,
    };
  }

  analyzeWhileStatement(node) {
    this.analyzeExpression(node.test);
    
    // Check for constant condition
    if (this.isRuleEnabled('constant-condition')) {
      const constValue = this.getConstantValue(node.test);
      if (constValue === true) {
        this.addMessage('constant-condition', 
          'Infinite loop: condition is always true', node);
      } else if (constValue === false) {
        this.addMessage('constant-condition', 
          'Loop never executes: condition is always false', node);
      }
    }
    
    this.pushScope();
    if (node.body) {
      this.analyzeBlock(node.body);
    }
    this.popScope();
    
    return { returns: false, breaks: false };
  }

  analyzeForInStatement(node) {
    this.analyzeExpression(node.iterable);
    
    this.pushScope();
    this.defineVariable(node.variable, node);
    
    if (node.body) {
      this.analyzeBlock(node.body);
    }
    this.popScope();
    
    return { returns: false, breaks: false };
  }

  analyzeTryStatement(node) {
    this.pushScope();
    if (node.block) {
      this.analyzeBlock(node.block);
    }
    this.popScope();
    
    if (node.handler) {
      this.pushScope();
      if (node.handler.param) {
        this.defineVariable(node.handler.param, node.handler);
      }
      if (node.handler.body) {
        this.analyzeBlock(node.handler.body);
      }
      this.popScope();
    }
    
    if (node.finalizer) {
      this.pushScope();
      this.analyzeBlock(node.finalizer);
      this.popScope();
    }
    
    return { returns: false, breaks: false };
  }

  analyzePatternMatch(node) {
    let allReturn = true;
    
    for (const matchCase of node.cases) {
      this.analyzeExpression(matchCase.test);
      
      // Check for constant condition
      if (this.isRuleEnabled('constant-condition')) {
        const constValue = this.getConstantValue(matchCase.test);
        if (constValue === false) {
          this.addMessage('constant-condition', 
            'Pattern case condition is always false', matchCase);
        }
      }
      
      this.pushScope();
      let caseResult;
      if (matchCase.consequent.type === NodeType.BlockStatement) {
        caseResult = this.analyzeBlock(matchCase.consequent);
      } else {
        caseResult = this.analyzeStatement(matchCase.consequent);
      }
      this.popScope();
      
      if (!caseResult.returns) {
        allReturn = false;
      }
    }
    
    return { returns: allReturn, breaks: false };
  }

  analyzeExpression(node) {
    if (!node) return;

    switch (node.type) {
      case NodeType.Identifier:
        this.useVariable(node.name);
        break;

      case NodeType.BinaryExpression:
      case NodeType.LogicalExpression:
        this.analyzeExpression(node.left);
        this.analyzeExpression(node.right);
        break;

      case NodeType.UnaryExpression:
        this.analyzeExpression(node.argument);
        break;

      case NodeType.CallExpression:
        this.analyzeExpression(node.callee);
        for (const arg of node.arguments || []) {
          this.analyzeExpression(arg);
        }
        break;

      case NodeType.MemberExpression:
        this.analyzeExpression(node.object);
        if (node.computed) {
          this.analyzeExpression(node.property);
        }
        break;

      case NodeType.ArrayExpression:
        for (const elem of node.elements || []) {
          this.analyzeExpression(elem);
        }
        break;

      case NodeType.ObjectExpression:
        this.analyzeObjectExpression(node);
        break;

      case NodeType.ArrowFunctionExpression:
        this.analyzeArrowFunction(node);
        break;

      case NodeType.ConditionalExpression:
        this.analyzeExpression(node.test);
        this.analyzeExpression(node.consequent);
        this.analyzeExpression(node.alternate);
        break;

      case NodeType.AssignmentExpression:
        this.analyzeExpression(node.left);
        this.analyzeExpression(node.right);
        break;

      case NodeType.AwaitExpression:
        this.analyzeExpression(node.argument);
        break;

      case NodeType.SpreadElement:
        this.analyzeExpression(node.argument);
        break;

      case NodeType.RangeExpression:
        this.analyzeExpression(node.start);
        this.analyzeExpression(node.end);
        break;

      case NodeType.TemplateExpression:
        for (const expr of node.expressions || []) {
          this.analyzeExpression(expr);
        }
        break;
    }
  }

  analyzeObjectExpression(node) {
    const keys = new Set();
    
    for (const prop of node.properties || []) {
      if (prop.type === NodeType.SpreadElement) {
        this.analyzeExpression(prop.argument);
        continue;
      }
      
      // Check for duplicate keys
      let keyName;
      if (typeof prop.key === 'string') {
        keyName = prop.key;
      } else if (prop.key && prop.key.name) {
        keyName = prop.key.name;
      } else if (prop.key && prop.key.value) {
        keyName = prop.key.value;
      }
      
      if (keyName && this.isRuleEnabled('duplicate-key')) {
        if (keys.has(keyName)) {
          this.addMessage('duplicate-key', 
            `Duplicate key '${keyName}' in object literal`, prop);
        }
        keys.add(keyName);
      }
      
      this.analyzeExpression(prop.value);
    }
  }

  analyzeArrowFunction(node) {
    this.pushScope();
    
    for (const param of node.params || []) {
      const name = param.name || param.argument || param;
      if (typeof name === 'string') {
        this.defineVariable(name, param);
      }
    }
    
    if (node.body) {
      if (node.body.type === NodeType.BlockStatement) {
        this.analyzeBlock(node.body);
      } else {
        this.analyzeExpression(node.body);
      }
    }
    
    this.popScope();
  }

  // Third pass: check for unused top-level declarations
  checkUnused() {
    const topScope = this.scopes[0];
    
    if (this.isRuleEnabled('unused-function')) {
      for (const [name, info] of topScope.functions) {
        // Skip exposed functions and _describe
        if (info.node.exposed || name === '_describe' || name.startsWith('_')) {
          continue;
        }
        if (!info.used) {
          this.addMessage('unused-function', 
            `Function '${name}' is declared but never used`, info.node);
        }
      }
    }
    
    if (this.isRuleEnabled('unused-variable')) {
      for (const [name, info] of topScope.variables) {
        // Skip exposed variables and those starting with _
        if (info.node && info.node.exposed) continue;
        if (name.startsWith('_')) continue;
        
        if (!info.used) {
          this.addMessage('unused-variable', 
            `Variable '${name}' is declared but never used`, info.node);
        }
      }
    }
  }

  // Helper: get constant value of expression if determinable
  getConstantValue(node) {
    if (!node) return null;
    
    if (node.type === NodeType.Literal) {
      if (node.value === true) return true;
      if (node.value === false) return false;
      if (node.value === 'true') return true;
      if (node.value === 'false') return false;
    }
    
    if (node.type === NodeType.Identifier) {
      if (node.name === 'true') return true;
      if (node.name === 'false') return false;
    }
    
    return null;
  }

  // Format messages for output
  formatMessages() {
    const errors = this.messages.filter(m => m.severity === Severity.Error);
    const warnings = this.messages.filter(m => m.severity === Severity.Warning);
    const infos = this.messages.filter(m => m.severity === Severity.Info);
    
    let output = '';
    
    if (errors.length > 0) {
      output += '\nErrors:\n';
      output += errors.map(m => '  ' + m.toString()).join('\n');
    }
    
    if (warnings.length > 0) {
      output += '\nWarnings:\n';
      output += warnings.map(m => '  ' + m.toString()).join('\n');
    }
    
    if (infos.length > 0) {
      output += '\nInfo:\n';
      output += infos.map(m => '  ' + m.toString()).join('\n');
    }
    
    if (this.messages.length > 0) {
      output += `\n\nTotal: ${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info\n`;
    }
    
    return output;
  }

  hasErrors() {
    return this.messages.some(m => m.severity === Severity.Error);
  }
}

export function lint(ast, options = {}) {
  const linter = new Linter(options);
  return linter.lint(ast);
}
