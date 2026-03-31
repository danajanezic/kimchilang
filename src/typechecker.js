import { NodeType } from './parser.js';

// Type definitions
export const Type = {
  Unknown: 'unknown',
  Any: 'any',
  Number: 'number',
  String: 'string',
  Boolean: 'boolean',
  Null: 'null',
  Array: 'array',
  Object: 'object',
  Function: 'function',
  Void: 'void',
  Enum: 'enum',
  Module: 'module',
  Union: 'union',
  TypeParam: 'typeParam',
};

// Global module type registry - stores the exported interface of each module
const moduleTypeRegistry = new Map();

class TypeError extends Error {
  constructor(message, node) {
    const line = node?.line || 1;
    const column = node?.column || 1;
    super(`Type Error at ${line}:${column}: ${message}`);
    this.name = 'TypeError';
    this.node = node;
    this.line = line;
    this.column = column;
  }
}

export class TypeChecker {
  constructor(options = {}) {
    this.scopes = [new Map()]; // Stack of scopes
    this.errors = [];
    this.functions = new Map(); // Function signatures
    this.enums = new Map(); // Enum definitions
    this.typeAliases = new Map();
    this._typeParamContext = [];
    this.modulePath = options.modulePath || null;
    this.moduleExports = {}; // Track exposed declarations for this module
    this.argTypes = new Map(); // Track arg declaration types
    
    this.mutVariables = new Set();
    this._insideClosure = false;
    this._insideAsync = false;

    // Register built-in globals
    this.defineVariable('error', this.createType(Type.Function));
    this.defineVariable('_obj', this.createType(Type.Object));
    this.defineVariable('_secret', this.createType(Type.Function));
    // JavaScript globals used in KimchiLang code
    this.defineVariable('new', this.createType(Type.Any));
    this.defineVariable('typeof', this.createType(Type.Any));
    this.defineVariable('Number', this.createType(Type.Function));
    this.defineVariable('String', this.createType(Type.Function));
    this.defineVariable('Boolean', this.createType(Type.Function));
    this.defineVariable('parseInt', this.createType(Type.Function));
    this.defineVariable('parseFloat', this.createType(Type.Function));
    this.defineVariable('isNaN', this.createType(Type.Function));
    this.defineVariable('isFinite', this.createType(Type.Function));
  }

  // Static methods for module type registry
  static registerModuleType(modulePath, exportType) {
    moduleTypeRegistry.set(modulePath, exportType);
  }

  static getModuleType(modulePath) {
    return moduleTypeRegistry.get(modulePath) || null;
  }

  static clearRegistry() {
    moduleTypeRegistry.clear();
  }

  check(ast) {
    this.errors = [];
    this.visitProgram(ast);
    
    // Register this module's export type if we have a module path
    if (this.modulePath && Object.keys(this.moduleExports).length > 0) {
      TypeChecker.registerModuleType(this.modulePath, this.createObjectType(this.moduleExports));
    }
    
    return this.errors;
  }

  // Scope management
  pushScope() {
    this.scopes.push(new Map());
  }

  popScope() {
    this.scopes.pop();
  }

  defineVariable(name, typeInfo) {
    this.scopes[this.scopes.length - 1].set(name, typeInfo);
  }

  lookupVariable(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) {
        return this.scopes[i].get(name);
      }
    }
    return null;
  }

  addError(message, node) {
    this.errors.push(new TypeError(message, node));
  }

  // Type utilities
  createType(kind, properties = {}) {
    return { kind, ...properties };
  }

  createObjectType(properties) {
    return { kind: Type.Object, properties };
  }

  createArrayType(elementType) {
    return { kind: Type.Array, elementType };
  }

  createFunctionType(params, returnType) {
    return { kind: Type.Function, params, returnType };
  }

  createUnionType(members) {
    // Flatten nested unions
    const flat = [];
    for (const m of members) {
      if (m.kind === Type.Union) {
        flat.push(...m.members);
      } else {
        flat.push(m);
      }
    }

    // Absorb any
    if (flat.some(m => m.kind === Type.Any)) {
      return this.createType(Type.Any);
    }

    // Deduplicate by kind
    const seen = new Set();
    const unique = [];
    for (const m of flat) {
      const key = this.typeToString(m);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(m);
      }
    }

    // Single member — unwrap
    if (unique.length === 1) return unique[0];

    return { kind: Type.Union, members: unique };
  }

  parseTypeString(str) {
    str = str.trim();

    // Union type: split on | at top level
    if (str.includes('|')) {
      let depth = 0;
      const parts = [];
      let current = '';
      for (const char of str) {
        if (char === '(' || char === '{') depth++;
        else if (char === ')' || char === '}') depth--;
        else if (char === '|' && depth === 0) {
          parts.push(current.trim());
          current = '';
          continue;
        }
        current += char;
      }
      parts.push(current.trim());

      if (parts.length > 1) {
        const members = parts.filter(p => p).map(p => this.parseTypeString(p));
        return this.createUnionType(members);
      }
    }

    // Generic instantiation: Name<arg1, arg2>
    const genericMatch = str.match(/^([A-Za-z_]\w*)<(.+)>$/);
    if (genericMatch) {
      const name = genericMatch[1];
      const argsStr = genericMatch[2];

      const args = [];
      let depth2 = 0;
      let current2 = '';
      for (const char of argsStr) {
        if (char === '<' || char === '(' || char === '{') depth2++;
        else if (char === '>' || char === ')' || char === '}') depth2--;
        else if (char === ',' && depth2 === 0) {
          args.push(current2.trim());
          current2 = '';
          continue;
        }
        current2 += char;
      }
      args.push(current2.trim());

      const alias = this.typeAliases.get(name);
      if (alias) {
        const bindings = new Map();
        for (let i = 0; i < alias.params.length; i++) {
          bindings.set(alias.params[i], args[i] ? this.parseTypeString(args[i]) : this.createType(Type.Any));
        }
        return this.substituteTypeParams(alias.body, bindings);
      }
    }

    // Type parameter reference
    if (this._typeParamContext.length > 0) {
      const currentParams = this._typeParamContext[this._typeParamContext.length - 1];
      if (currentParams.has(str)) {
        return { kind: Type.TypeParam, name: str };
      }
    }

    // Primitives
    const primitives = { 'number': Type.Number, 'string': Type.String, 'boolean': Type.Boolean, 'null': Type.Null, 'void': Type.Void, 'any': Type.Any };
    if (primitives[str]) {
      return this.createType(primitives[str]);
    }

    // Array: type[]
    if (str.endsWith('[]')) {
      const elementType = this.parseTypeString(str.slice(0, -2));
      return this.createArrayType(elementType);
    }

    // Object shape: {key: type, key: type}
    if (str.startsWith('{') && str.endsWith('}')) {
      const inner = str.slice(1, -1).trim();
      if (!inner) return this.createObjectType({});
      const properties = {};
      let depth = 0;
      let current = '';
      for (const char of inner) {
        if (char === '{') depth++;
        else if (char === '}') depth--;
        else if (char === ',' && depth === 0) {
          const colonIdx = current.indexOf(':');
          if (colonIdx !== -1) {
            const key = current.slice(0, colonIdx).trim();
            const valType = current.slice(colonIdx + 1).trim();
            if (key && valType) properties[key] = this.parseTypeString(valType);
          }
          current = '';
          continue;
        }
        current += char;
      }
      if (current.trim()) {
        const colonIdx = current.indexOf(':');
        if (colonIdx !== -1) {
          const key = current.slice(0, colonIdx).trim();
          const valType = current.slice(colonIdx + 1).trim();
          if (key && valType) properties[key] = this.parseTypeString(valType);
        }
      }
      return this.createObjectType(properties);
    }

    // Function type: (type, type) => type
    const fnMatch = str.match(/^\(([^)]*)\)\s*=>\s*(.+)$/);
    if (fnMatch) {
      const paramStrs = fnMatch[1] ? fnMatch[1].split(',').map(s => s.trim()).filter(Boolean) : [];
      const params = paramStrs.map(p => this.parseTypeString(p));
      const returnType = this.parseTypeString(fnMatch[2]);
      return this.createFunctionType(params, returnType);
    }

    // Non-generic type alias lookup
    const alias = this.typeAliases.get(str);
    if (alias && alias.params.length === 0) {
      return alias.body;
    }

    // Custom type — look up in scope, or return unknown with name
    const existing = this.lookupVariable(str);
    if (existing) return existing;
    return { kind: Type.Unknown, name: str };
  }

  typeToString(type) {
    if (!type) return 'unknown';
    if (typeof type === 'string') return type;
    if (type.kind === Type.Array) {
      return `${this.typeToString(type.elementType)}[]`;
    }
    if (type.kind === Type.Object && type.properties) {
      const props = Object.entries(type.properties)
        .map(([k, v]) => `${k}: ${this.typeToString(v)}`)
        .join(', ');
      return `{ ${props} }`;
    }
    if (type.kind === Type.Function) {
      return `(${type.params.map(p => this.typeToString(p)).join(', ')}) => ${this.typeToString(type.returnType)}`;
    }
    if (type.kind === Type.TypeParam) {
      return type.name;
    }
    if (type.kind === Type.Union) {
      return type.members.map(m => this.typeToString(m)).join(' | ');
    }
    return type.kind || 'unknown';
  }

  substituteTypeParams(type, bindings) {
    if (!type) return type;

    if (type.kind === Type.TypeParam) {
      return bindings.get(type.name) || this.createType(Type.Any);
    }

    if (type.kind === Type.Array) {
      return this.createArrayType(this.substituteTypeParams(type.elementType, bindings));
    }

    if (type.kind === Type.Object && type.properties) {
      const newProps = {};
      for (const [key, val] of Object.entries(type.properties)) {
        newProps[key] = this.substituteTypeParams(val, bindings);
      }
      return this.createObjectType(newProps);
    }

    if (type.kind === Type.Function) {
      const newParams = type.params.map(p => this.substituteTypeParams(p, bindings));
      const newReturn = this.substituteTypeParams(type.returnType, bindings);
      return this.createFunctionType(newParams, newReturn);
    }

    if (type.kind === Type.Union) {
      const newMembers = type.members.map(m => this.substituteTypeParams(m, bindings));
      return this.createUnionType(newMembers);
    }

    return type;
  }

  inferTypeParams(declaredType, actualType, bindings) {
    if (!declaredType || !actualType) return;

    if (declaredType.kind === Type.TypeParam) {
      if (!bindings.has(declaredType.name)) {
        bindings.set(declaredType.name, actualType);
      }
      return;
    }

    if (declaredType.kind === Type.Array && actualType.kind === Type.Array) {
      this.inferTypeParams(declaredType.elementType, actualType.elementType, bindings);
      return;
    }

    if (declaredType.kind === Type.Function && actualType.kind === Type.Function) {
      if (declaredType.params) {
        for (let i = 0; i < declaredType.params.length; i++) {
          if (actualType.params && actualType.params[i]) {
            this.inferTypeParams(declaredType.params[i], actualType.params[i], bindings);
          }
        }
      }
      if (declaredType.returnType && actualType.returnType) {
        this.inferTypeParams(declaredType.returnType, actualType.returnType, bindings);
      }
      return;
    }

    if (declaredType.kind === Type.Object && actualType.kind === Type.Object) {
      if (declaredType.properties && actualType.properties) {
        for (const [key, declType] of Object.entries(declaredType.properties)) {
          if (actualType.properties[key]) {
            this.inferTypeParams(declType, actualType.properties[key], bindings);
          }
        }
      }
      return;
    }

    if (declaredType.kind === Type.Union) {
      for (const member of declaredType.members) {
        if (member.kind === Type.TypeParam && !bindings.has(member.name)) {
          bindings.set(member.name, actualType);
        }
      }
      return;
    }
  }

  // Check if types are compatible
  isCompatible(expected, actual) {
    if (!expected || !actual) return true;
    if (expected.kind === Type.Any || actual.kind === Type.Any) return true;
    if (expected.kind === Type.Unknown || actual.kind === Type.Unknown) return true;
    if (expected.kind === Type.TypeParam || actual.kind === Type.TypeParam) return true;

    // When expected is a union: actual must match at least one member
    if (expected.kind === Type.Union) {
      if (actual.kind === Type.Union) {
        return actual.members.every(am =>
          expected.members.some(em => this.isCompatible(em, am))
        );
      }
      return expected.members.some(em => this.isCompatible(em, actual));
    }

    // When actual is a union but expected is not: every member must fit expected
    if (actual.kind === Type.Union) {
      return actual.members.every(am => this.isCompatible(expected, am));
    }

    // Both non-union: exact kind match
    if (expected.kind === actual.kind) {
      if (expected.kind === Type.Object) {
        if (expected.properties && actual.properties) {
          for (const [key, expectedType] of Object.entries(expected.properties)) {
            if (!(key in actual.properties)) {
              return false;
            }
            if (!this.isCompatible(expectedType, actual.properties[key])) {
              return false;
            }
          }
        }
      }
      return true;
    }
    return false;
  }

  // AST Visitors
  visitProgram(node) {
    // First pass: collect function and enum declarations
    for (const stmt of node.body) {
      if (stmt.type === NodeType.FunctionDeclaration) {
        this.registerFunction(stmt);
      } else if (stmt.type === NodeType.EnumDeclaration) {
        this.registerEnum(stmt);
      }
    }

    // Second pass: type check all statements
    for (const stmt of node.body) {
      this.visitStatement(stmt);
    }
  }

  registerFunction(node) {
    const params = node.params.map(p => ({
      name: p.name || p.argument,
      type: this.createType(Type.Any),
    }));
    
    this.functions.set(node.name, {
      params,
      returnType: this.createType(Type.Unknown),
      node,
    });
  }

  registerEnum(node) {
    const members = {};
    for (const member of node.members) {
      members[member.name] = this.createType(Type.Number);
    }
    this.enums.set(node.name, {
      kind: Type.Enum,
      name: node.name,
      members,
    });
    // Also define the enum as a variable
    this.defineVariable(node.name, this.createObjectType(members));
  }

  visitStatement(node) {
    switch (node.type) {
      case NodeType.DecDeclaration:
        this.visitDecDeclaration(node);
        break;
      case NodeType.MutDeclaration:
        this.visitMutDeclaration(node);
        break;
      case NodeType.FunctionDeclaration:
        this.visitFunctionDeclaration(node);
        break;
      case NodeType.EnumDeclaration:
        // Already registered
        break;
      case NodeType.IfStatement:
        this.visitIfStatement(node);
        break;
      case NodeType.WhileStatement:
        this.visitWhileStatement(node);
        break;
      case NodeType.ForInStatement:
        this.visitForInStatement(node);
        break;
      case NodeType.ReturnStatement:
        this.visitReturnStatement(node);
        break;
      case NodeType.TryStatement:
        this.visitTryStatement(node);
        break;
      case NodeType.ThrowStatement:
        this.visitExpression(node.argument);
        break;
      case NodeType.PatternMatch:
        this.visitPatternMatch(node);
        break;
      case NodeType.PrintStatement:
        this.visitExpression(node.argument || node.expression);
        break;
      case NodeType.ExpressionStatement:
        this.visitExpression(node.expression);
        break;
      case NodeType.BlockStatement:
        this.pushScope();
        for (const stmt of node.body) {
          this.visitStatement(stmt);
        }
        this.popScope();
        break;
      case NodeType.DepStatement:
        this.visitDepStatement(node);
        break;
      case NodeType.ArgDeclaration:
        this.visitArgDeclaration(node);
        break;
      case NodeType.EnvDeclaration:
        this.visitEnvDeclaration(node);
        break;
      case NodeType.ShellBlock:
        // Shell blocks are opaque - no type checking inside
        break;
      case NodeType.SpawnBlock:
        if (!this._insideAsync) {
          this.addError('spawn must be inside an async function', node);
        }
        break;
      case NodeType.TestBlock:
      case NodeType.DescribeBlock:
      case NodeType.ExpectStatement:
      case NodeType.AssertStatement:
        // Test constructs - visit their bodies if present
        if (node.body && node.body.body) {
          this.pushScope();
          for (const stmt of node.body.body) {
            this.visitStatement(stmt);
          }
          this.popScope();
        }
        break;
      case NodeType.BreakStatement:
      case NodeType.ContinueStatement:
        // No type checking needed
        break;
      case NodeType.GuardStatement:
        this.visitGuardStatement(node);
        break;
      case NodeType.ExternDeclaration: {
        for (const decl of node.declarations) {
          if (decl.kind === 'function') {
            const typeParams = decl.typeParams || [];

            if (typeParams.length > 0) {
              this._typeParamContext.push(new Set(typeParams));
            }

            const paramTypes = decl.params.map(p => ({
              name: p.name,
              type: this.parseTypeString(p.typeAnnotation),
            }));
            const returnType = this.parseTypeString(decl.returnType);

            if (typeParams.length > 0) {
              this._typeParamContext.pop();
            }

            this.defineVariable(decl.name, this.createFunctionType(
              paramTypes.map(p => p.type),
              returnType
            ));
            this.functions.set(decl.name, {
              typeParams,
              params: paramTypes,
              returnType,
              async: !!decl.async,
              kmdocParams: new Map(paramTypes.map(p => [p.name, p.type])),
            });
          } else if (decl.kind === 'value') {
            this.defineVariable(decl.name, this.parseTypeString(decl.valueType));
          }
        }
        break;
      }
      case NodeType.ExternDefaultDeclaration: {
        this.defineVariable(node.alias, this.parseTypeString(node.aliasType));
        break;
      }
      case NodeType.TypeDeclaration: {
        this._typeParamContext.push(new Set(node.typeParams));
        const body = this.parseTypeString(node.body);
        this._typeParamContext.pop();

        this.typeAliases.set(node.name, {
          params: node.typeParams,
          body,
        });
        break;
      }
    }
  }

  visitGuardStatement(node) {
    this.visitExpression(node.test);

    const hasExit = this.blockHasExit(node.alternate);
    if (!hasExit) {
      this.addError('guard else block must contain a return or throw statement', node);
    }

    this.pushScope();
    for (const stmt of node.alternate.body) {
      this.visitStatement(stmt);
    }
    this.popScope();

    // Type narrowing: guard x != null else { ... }
    if (node.test && node.test.type === 'BinaryExpression' && node.test.operator === '!=') {
      const { left, right } = node.test;
      let identifier = null;
      let isNullCheck = false;

      if (left.type === 'Identifier' && right.type === 'Literal' && right.value === null) {
        identifier = left.name;
        isNullCheck = true;
      } else if (right.type === 'Identifier' && left.type === 'Literal' && left.value === null) {
        identifier = right.name;
        isNullCheck = true;
      }

      if (identifier && isNullCheck) {
        const currentType = this.lookupVariable(identifier);
        if (currentType && currentType.kind === Type.Union) {
          const narrowed = currentType.members.filter(m => m.kind !== Type.Null);
          if (narrowed.length === 1) {
            this.defineVariable(identifier, narrowed[0]);
          } else if (narrowed.length > 1) {
            this.defineVariable(identifier, this.createUnionType(narrowed));
          }
        }
      }
    }
  }

  blockHasExit(block) {
    if (!block || !block.body) return false;
    for (const stmt of block.body) {
      if (stmt.type === NodeType.ReturnStatement || stmt.type === NodeType.ThrowStatement) {
        return true;
      }
    }
    return false;
  }

  visitDepStatement(node) {
    // Get the expected module type from registry
    const expectedModuleType = TypeChecker.getModuleType(node.path);
    
    // If we have overrides, validate them against the expected module interface
    if (node.overrides && expectedModuleType) {
      const overrideType = this.visitExpression(node.overrides);
      
      if (overrideType && overrideType.kind === Type.Object && overrideType.properties) {
        // Check each override property
        for (const [key, valueType] of Object.entries(overrideType.properties)) {
          // Skip dotted paths (dependency overrides like "foo.bar": mockFn)
          if (key.includes('.')) continue;
          
          // Check if this is overriding an arg or an exported member
          if (expectedModuleType.properties && key in expectedModuleType.properties) {
            const expectedType = expectedModuleType.properties[key];
            if (!this.isCompatible(expectedType, valueType)) {
              this.addError(
                `Type mismatch for '${key}' in dependency '${node.path}': expected ${this.typeToString(expectedType)}, got ${this.typeToString(valueType)}`,
                node
              );
            }
          }
        }
      }
    }
    
    // Define the dependency alias in scope with the module's type
    if (expectedModuleType) {
      this.defineVariable(node.alias, expectedModuleType);
    } else {
      // Unknown module - use Any type
      this.defineVariable(node.alias, this.createType(Type.Any));
    }
  }

  visitArgDeclaration(node) {
    let argType = this.createType(Type.Any);
    
    // Infer type from default value if present
    if (node.defaultValue) {
      argType = this.visitExpression(node.defaultValue);
    }
    
    // Store arg type for module export
    this.argTypes.set(node.name, {
      type: argType,
      required: node.required,
    });
    
    // Define the arg in scope
    this.defineVariable(node.name, argType);
    
    // Add to module exports so other modules can validate against it
    this.moduleExports[node.name] = argType;
  }

  visitEnvDeclaration(node) {
    // Env variables are always strings (or undefined if not set)
    const envType = this.createType(Type.String);
    
    // Define the env variable in scope
    this.defineVariable(node.name, envType);
  }

  visitDecDeclaration(node) {
    const initType = this.visitExpression(node.init);

    // KMDoc @type validation and override
    let effectiveType = initType;
    if (node.kmdoc && node.kmdoc.type) {
      const declaredType = this.parseTypeString(node.kmdoc.type);
      if (initType.kind !== Type.Unknown && initType.kind !== Type.Any &&
          declaredType.kind !== Type.Any && declaredType.kind !== Type.Unknown &&
          initType.kind !== declaredType.kind) {
        this.addError(
          `Variable '${node.name}' declared as ${node.kmdoc.type} but initialized with ${initType.kind}`,
          node
        );
      }
      effectiveType = declaredType;
    }

    // Track exposed declarations for module export type
    if (node.exposed) {
      this.moduleExports[node.name] = effectiveType;
    }
    
    if (node.destructuring) {
      if (node.pattern.type === NodeType.ObjectPattern) {
        // Object destructuring
        for (const prop of node.pattern.properties) {
          let propType = this.createType(Type.Unknown);
          if (initType && initType.kind === Type.Object && initType.properties) {
            if (prop.key in initType.properties) {
              propType = initType.properties[prop.key];
            } else {
              this.addError(
                `Property '${prop.key}' does not exist on type ${this.typeToString(initType)}`,
                node
              );
            }
          }
          this.defineVariable(prop.value, propType);
        }
      } else if (node.pattern.type === NodeType.ArrayPattern) {
        // Array destructuring
        for (const elem of node.pattern.elements) {
          if (elem) {
            let elemType = this.createType(Type.Unknown);
            if (initType && initType.kind === Type.Array && initType.elementType) {
              elemType = initType.elementType;
            }
            this.defineVariable(elem.name, elemType);
          }
        }
      }
    } else {
      this.defineVariable(node.name, effectiveType);
    }
  }

  visitMutDeclaration(node) {
    const initType = this.visitExpression(node.init);

    // KMDoc @type validation and override
    let effectiveType = initType;
    if (node.kmdoc && node.kmdoc.type) {
      const declaredType = this.parseTypeString(node.kmdoc.type);
      if (initType.kind !== Type.Unknown && initType.kind !== Type.Any &&
          declaredType.kind !== Type.Any && declaredType.kind !== Type.Unknown &&
          initType.kind !== declaredType.kind) {
        this.addError(
          `Variable '${node.name}' declared as ${node.kmdoc.type} but initialized with ${initType.kind}`,
          node
        );
      }
      effectiveType = declaredType;
    }

    if (node.destructuring) {
      if (node.pattern.type === NodeType.ObjectPattern) {
        for (const prop of node.pattern.properties) {
          this.defineVariable(prop.value, initType);
          this.mutVariables.add(prop.value);
        }
      } else if (node.pattern.type === NodeType.ArrayPattern) {
        for (const elem of node.pattern.elements) {
          if (elem) {
            this.defineVariable(elem.name, initType);
            this.mutVariables.add(elem.name);
          }
        }
      }
    } else {
      this.defineVariable(node.name, effectiveType);
      this.mutVariables.add(node.name);
    }
  }

  visitFunctionDeclaration(node) {
    // Track exposed functions for module export type
    if (node.exposed) {
      const fnInfo = this.functions.get(node.name);
      if (fnInfo) {
        this.moduleExports[node.name] = this.createFunctionType(
          fnInfo.params.map(p => p.type),
          fnInfo.returnType
        );
      }
    }
    
    this.pushScope();

    const previousAsync = this._insideAsync;
    this._insideAsync = !!node.async;

    // Build KMDoc param type map if available
    const kmdocParams = new Map();
    if (node.kmdoc && node.kmdoc.params) {
      for (const p of node.kmdoc.params) {
        kmdocParams.set(p.name, this.parseTypeString(p.type));
      }
    }

    // Define parameters in scope
    for (const param of node.params) {
      // Handle destructuring patterns
      if (param.destructuring === 'object' && param.pattern) {
        for (const prop of param.pattern.properties) {
          this.defineVariable(prop.key, this.createType(Type.Any));
        }
        continue;
      }
      
      if (param.destructuring === 'array' && param.pattern) {
        for (const elem of param.pattern.elements) {
          if (elem && elem.type === 'Identifier') {
            this.defineVariable(elem.name, this.createType(Type.Any));
          }
        }
        continue;
      }
      
      const name = param.name || param.argument;
      let paramType = this.createType(Type.Any);

      // KMDoc type takes priority over inference
      if (kmdocParams.has(name)) {
        paramType = kmdocParams.get(name);
      } else if (param.defaultValue) {
        paramType = this.visitExpression(param.defaultValue);
      }

      this.defineVariable(name, paramType);
    }
    
    // Visit function body
    if (node.body && node.body.body) {
      for (const stmt of node.body.body) {
        this.visitStatement(stmt);
      }
    }

    // Register function info with KMDoc types for call-site validation
    if (node.name && kmdocParams.size > 0) {
      this.functions.set(node.name, {
        params: node.params.map(p => {
          const name = p.name || p.argument;
          return { name, type: kmdocParams.get(name) || this.createType(Type.Any) };
        }),
        returnType: node.kmdoc && node.kmdoc.returns ? this.parseTypeString(node.kmdoc.returns.type) : this.createType(Type.Any),
        kmdocParams,
      });
    }

    this._insideAsync = previousAsync;
    this.popScope();
  }

  visitIfStatement(node) {
    this.visitExpression(node.test);
    
    this.pushScope();
    if (node.consequent.body) {
      for (const stmt of node.consequent.body) {
        this.visitStatement(stmt);
      }
    }
    this.popScope();
    
    if (node.alternate) {
      this.pushScope();
      if (node.alternate.body) {
        for (const stmt of node.alternate.body) {
          this.visitStatement(stmt);
        }
      } else {
        this.visitStatement(node.alternate);
      }
      this.popScope();
    }
  }

  visitWhileStatement(node) {
    this.visitExpression(node.test);
    this.pushScope();
    if (node.body.body) {
      for (const stmt of node.body.body) {
        this.visitStatement(stmt);
      }
    }
    this.popScope();
  }

  visitForInStatement(node) {
    this.pushScope();
    const iterableType = this.visitExpression(node.iterable);
    
    // Infer loop variable type from iterable
    let elemType = this.createType(Type.Any);
    if (iterableType) {
      if (iterableType.kind === Type.Array && iterableType.elementType) {
        elemType = iterableType.elementType;
      } else if (iterableType.kind === Type.String) {
        elemType = this.createType(Type.String);
      }
    }
    
    this.defineVariable(node.variable, elemType);
    
    if (node.body.body) {
      for (const stmt of node.body.body) {
        this.visitStatement(stmt);
      }
    }
    this.popScope();
  }

  visitReturnStatement(node) {
    if (node.argument) {
      this.visitExpression(node.argument);
    }
  }

  visitTryStatement(node) {
    this.pushScope();
    if (node.block.body) {
      for (const stmt of node.block.body) {
        this.visitStatement(stmt);
      }
    }
    this.popScope();
    
    if (node.handler) {
      this.pushScope();
      if (node.handler.param) {
        this.defineVariable(node.handler.param, this.createType(Type.Object));
      }
      if (node.handler.body.body) {
        for (const stmt of node.handler.body.body) {
          this.visitStatement(stmt);
        }
      }
      this.popScope();
    }
    
    if (node.finalizer) {
      this.pushScope();
      if (node.finalizer.body) {
        for (const stmt of node.finalizer.body) {
          this.visitStatement(stmt);
        }
      }
      this.popScope();
    }
  }

  visitPatternMatch(node) {
    for (const matchCase of node.cases) {
      this.visitExpression(matchCase.test);
      if (matchCase.consequent.body) {
        this.pushScope();
        for (const stmt of matchCase.consequent.body) {
          this.visitStatement(stmt);
        }
        this.popScope();
      } else {
        this.visitStatement(matchCase.consequent);
      }
    }
  }

  visitExpression(node) {
    if (!node) return this.createType(Type.Unknown);
    
    switch (node.type) {
      case NodeType.Literal:
        return this.visitLiteral(node);
      case NodeType.Identifier:
        return this.visitIdentifier(node);
      case NodeType.BinaryExpression:
        return this.visitBinaryExpression(node);
      case NodeType.UnaryExpression:
        return this.visitUnaryExpression(node);
      case NodeType.CallExpression:
        return this.visitCallExpression(node);
      case NodeType.MemberExpression:
        return this.visitMemberExpression(node);
      case NodeType.ArrayExpression:
        return this.visitArrayExpression(node);
      case NodeType.ObjectExpression:
        return this.visitObjectExpression(node);
      case NodeType.ArrowFunctionExpression:
        return this.visitArrowFunctionExpression(node);
      case NodeType.ConditionalExpression:
        return this.visitConditionalExpression(node);
      case NodeType.AssignmentExpression:
        return this.visitAssignmentExpression(node);
      case NodeType.AwaitExpression:
        return this.visitExpression(node.argument);
      case NodeType.SpreadElement:
        return this.visitExpression(node.argument);
      case NodeType.RangeExpression:
        return this.createArrayType(this.createType(Type.Number));
      case NodeType.FlowExpression:
        return this.visitFlowExpression(node);
      case NodeType.RegexLiteral:
        return this.createType(Type.Object); // RegExp is an object type
      case NodeType.MatchExpression:
        return this.visitMatchExpression(node);
      case NodeType.MatchBlock:
        return this.visitMatchBlock(node);
      case NodeType.ConditionalMethodExpression: {
        this.visitExpression(node.condition);
        const receiverType = this.visitExpression(node.receiver);
        if (node.fallback) this.visitExpression(node.fallback);
        return receiverType;
      }
      case NodeType.ConcurrentExpression: {
        if (!this._insideAsync) {
          this.addError(`${node.mode} must be inside an async function`, node);
        }
        for (const elem of node.elements) {
          this.visitExpression(elem);
        }
        return this.createType(Type.Array);
      }
      case NodeType.BindExpression: {
        this.visitExpression(node.callee);
        for (const arg of node.arguments) {
          this.visitExpression(arg);
        }
        return this.createType(Type.Function);
      }
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
      default:
        return this.createType(Type.Unknown);
    }
  }

  visitLiteral(node) {
    if (node.isNumber) return this.createType(Type.Number);
    if (node.isString) return this.createType(Type.String);
    if (typeof node.value === 'boolean') return this.createType(Type.Boolean);
    if (node.value === null) return this.createType(Type.Null);
    if (typeof node.value === 'number') return this.createType(Type.Number);
    if (typeof node.value === 'string') return this.createType(Type.String);
    return this.createType(Type.Unknown);
  }

  visitIdentifier(node) {
    if (this._insideClosure && this.mutVariables.has(node.name)) {
      this.addError(`Cannot capture mut variable '${node.name}' in closure`, node);
    }
    const varType = this.lookupVariable(node.name);
    if (varType) return varType;
    
    // Check if it's a function
    if (this.functions.has(node.name)) {
      const fn = this.functions.get(node.name);
      return this.createFunctionType(fn.params.map(p => p.type), fn.returnType);
    }
    
    // Check if it's an enum
    if (this.enums.has(node.name)) {
      return this.enums.get(node.name);
    }
    
    // Built-in globals
    const builtins = [
      'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 
      'Date', 'Promise', 'fetch', 'setTimeout', 'setInterval', 'clearTimeout', 
      'clearInterval', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI',
      'decodeURI', 'encodeURIComponent', 'decodeURIComponent', 'Error', 'TypeError',
      'RangeError', 'SyntaxError', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet',
      'Symbol', 'Proxy', 'Reflect', 'Intl', 'undefined', 'null', 'NaN', 'Infinity',
      'globalThis', 'process', 'Buffer', 'require', 'module', 'exports', '__dirname',
      '__filename', '_pipe', '_range', '_deepFreeze', 'true', 'false'
    ];
    if (builtins.includes(node.name)) {
      return this.createType(Type.Any);
    }
    
    // Report undefined identifier error
    this.addError(`Undefined identifier '${node.name}'`, node);
    
    return this.createType(Type.Unknown);
  }

  visitBinaryExpression(node) {
    const leftType = this.visitExpression(node.left);
    const rightType = this.visitExpression(node.right);
    
    const op = node.operator;
    
    // Arithmetic operators
    if (['+', '-', '*', '/', '%', '**'].includes(op)) {
      // String concatenation
      if (op === '+' && (leftType.kind === Type.String || rightType.kind === Type.String)) {
        return this.createType(Type.String);
      }
      return this.createType(Type.Number);
    }
    
    // Comparison operators
    if (['===', '!==', '==', '!=', '<', '>', '<=', '>=', 'is', 'is not'].includes(op)) {
      return this.createType(Type.Boolean);
    }
    
    // Logical operators
    if (['&&', '||'].includes(op)) {
      return this.createType(Type.Boolean);
    }
    
    // Bitwise operators
    if (['&', '|', '^', '<<', '>>'].includes(op)) {
      return this.createType(Type.Number);
    }
    
    return this.createType(Type.Unknown);
  }

  visitUnaryExpression(node) {
    this.visitExpression(node.argument);
    
    if (node.operator === '!' || node.operator === 'not') {
      return this.createType(Type.Boolean);
    }
    if (node.operator === '-' || node.operator === '~') {
      return this.createType(Type.Number);
    }
    
    return this.createType(Type.Unknown);
  }

  visitCallExpression(node) {
    const calleeType = this.visitExpression(node.callee);
    
    // Check if callee is callable
    if (calleeType && calleeType.kind !== Type.Function && calleeType.kind !== Type.Any && calleeType.kind !== Type.Unknown) {
      this.addError(
        `Type '${this.typeToString(calleeType)}' is not callable`,
        node
      );
    }
    
    // Visit arguments
    const argTypes = [];
    for (const arg of node.arguments) {
      argTypes.push(this.visitExpression(arg));
    }

    // KMDoc argument type validation
    if (node.callee && node.callee.type === 'Identifier') {
      const fnInfo = this.functions.get(node.callee.name);
      if (fnInfo && fnInfo.kmdocParams && fnInfo.kmdocParams.size > 0) {
        for (let i = 0; i < node.arguments.length; i++) {
          const arg = node.arguments[i];
          // Skip spread elements
          if (arg.type === 'SpreadElement') continue;
          const argType = argTypes[i];
          const paramInfo = fnInfo.params[i];
          if (paramInfo && fnInfo.kmdocParams.has(paramInfo.name)) {
            const expectedType = fnInfo.kmdocParams.get(paramInfo.name);
            if (argType.kind !== Type.Unknown && argType.kind !== Type.Any &&
                expectedType.kind !== Type.Any && expectedType.kind !== Type.Unknown &&
                expectedType.kind !== Type.TypeParam &&
                !this.isCompatible(expectedType, argType)) {
              this.addError(
                `Argument ${i + 1} of '${node.callee.name}': Expected ${this.typeToString(expectedType)}, got ${this.typeToString(argType)}`,
                node
              );
            }
          }
        }
      }
    }

    // Check for known function calls (with generic inference)
    if (node.callee.type === NodeType.Identifier) {
      const fnInfo = this.functions.get(node.callee.name);
      if (fnInfo) {
        if (fnInfo.typeParams && fnInfo.typeParams.length > 0) {
          const bindings = new Map();
          for (let i = 0; i < fnInfo.params.length; i++) {
            if (argTypes[i]) {
              this.inferTypeParams(fnInfo.params[i].type, argTypes[i], bindings);
            }
          }
          return this.substituteTypeParams(fnInfo.returnType, bindings);
        }
        return fnInfo.returnType;
      }
    }

    // Return the function's return type if known
    if (calleeType && calleeType.kind === Type.Function && calleeType.returnType) {
      return calleeType.returnType;
    }
    
    // Handle method calls on known types
    if (node.callee.type === NodeType.MemberExpression) {
      const objType = this.visitExpression(node.callee.object);
      const prop = node.callee.computed ? null : node.callee.property.name;
      
      // Array methods
      if (objType && objType.kind === Type.Array) {
        if (['map', 'filter', 'find', 'some', 'every'].includes(prop)) {
          if (prop === 'map') {
            return this.createArrayType(this.createType(Type.Unknown));
          }
          if (prop === 'filter') {
            return objType;
          }
          if (prop === 'find') {
            return objType.elementType || this.createType(Type.Unknown);
          }
          if (['some', 'every'].includes(prop)) {
            return this.createType(Type.Boolean);
          }
        }
        if (['reduce'].includes(prop)) {
          return this.createType(Type.Unknown);
        }
        if (['push', 'pop', 'shift', 'unshift', 'splice'].includes(prop)) {
          return this.createType(Type.Unknown);
        }
        if (['join'].includes(prop)) {
          return this.createType(Type.String);
        }
        if (['length'].includes(prop)) {
          return this.createType(Type.Number);
        }
      }
      
      // String methods
      if (objType && objType.kind === Type.String) {
        if (['split', 'toChars', 'toLines'].includes(prop)) {
          return this.createArrayType(this.createType(Type.String));
        }
        if (['trim', 'toLowerCase', 'toUpperCase', 'slice', 'substring', 'replace', 'capitalize'].includes(prop)) {
          return this.createType(Type.String);
        }
        if (['length', 'indexOf', 'lastIndexOf'].includes(prop)) {
          return this.createType(Type.Number);
        }
        if (['includes', 'startsWith', 'endsWith', 'isEmpty', 'isBlank'].includes(prop)) {
          return this.createType(Type.Boolean);
        }
      }
    }
    
    return this.createType(Type.Unknown);
  }

  visitMatchExpression(node) {
    // Match expression: subject ~ /regex/ or subject ~ /regex/ => { body }
    this.visitExpression(node.subject);
    this.visitExpression(node.pattern);
    
    if (node.body) {
      // With body: return type depends on body
      if (node.body.type === NodeType.BlockStatement) {
        this.pushScope();
        // Add $match to scope
        this.defineVariable('$match', this.createArrayType(this.createType(Type.String)));
        for (const stmt of node.body.body) {
          this.visitStatement(stmt);
        }
        this.popScope();
      } else {
        return this.visitExpression(node.body);
      }
      return this.createType(Type.Unknown);
    } else {
      // Without body: returns string (first match) or null
      return this.createType(Type.String);
    }
  }

  visitMatchBlock(node) {
    this.visitExpression(node.subject);

    let resultType = this.createType(Type.Unknown);

    for (const arm of node.arms) {
      this.pushScope();

      // Define bindings from pattern
      if (arm.pattern.type === 'BindingPattern') {
        this.defineVariable(arm.pattern.name, this.createType(Type.Any));
      } else if (arm.pattern.type === 'ObjectDestructurePattern') {
        for (const prop of arm.pattern.properties) {
          if (prop.value && prop.value.type === 'BindingPattern') {
            this.defineVariable(prop.value.name, this.createType(Type.Any));
          } else if (!prop.value) {
            // Shorthand: { data } binds data
            this.defineVariable(prop.key, this.createType(Type.Any));
          }
        }
      } else if (arm.pattern.type === 'ArrayDestructurePattern') {
        for (const elem of arm.pattern.elements) {
          if (elem && elem.type === 'BindingPattern') {
            this.defineVariable(elem.name, this.createType(Type.Any));
          }
        }
      }

      // Visit guard if present
      if (arm.guard) {
        this.visitExpression(arm.guard);
      }

      // Visit body
      if (arm.body.type === NodeType.BlockStatement) {
        for (const stmt of arm.body.body) {
          this.visitStatement(stmt);
        }
      } else {
        resultType = this.visitExpression(arm.body);
      }

      this.popScope();
    }

    // Exhaustiveness checking for enum matches
    const hasWildcard = node.arms.some(a =>
      a.pattern.type === 'WildcardPattern' || a.pattern.type === NodeType.WildcardPattern ||
      a.pattern.type === 'BindingPattern'
    );

    if (!hasWildcard) {
      // Collect MemberPattern arms that look like EnumName.Member
      const memberPatterns = node.arms
        .filter(a => a.pattern.type === 'MemberPattern')
        .map(a => a.pattern);

      if (memberPatterns.length > 0) {
        // Check if all patterns reference the same enum
        const enumName = memberPatterns[0].object;
        const allSameEnum = memberPatterns.every(p => p.object === enumName);

        if (allSameEnum && this.enums.has(enumName)) {
          const enumDef = this.enums.get(enumName);
          const coveredMembers = new Set(memberPatterns.map(p => p.property));
          const allMembers = Object.keys(enumDef.members);
          const missing = allMembers.filter(m => !coveredMembers.has(m));

          if (missing.length > 0) {
            this.addError(
              `Non-exhaustive match on enum '${enumName}': missing ${missing.map(m => `${enumName}.${m}`).join(', ')}`,
              node
            );
          }
        }
      }
    }

    return resultType;
  }

  visitMemberExpression(node) {
    const objType = this.visitExpression(node.object);
    
    // Handle computed access (array indexing)
    if (node.computed) {
      const indexType = this.visitExpression(node.property);
      
      if (objType && objType.kind === Type.Array) {
        return objType.elementType || this.createType(Type.Unknown);
      }
      if (objType && objType.kind === Type.String) {
        return this.createType(Type.String);
      }
      return this.createType(Type.Unknown);
    }
    
    // Handle property access - property can be a string directly or an object
    let propName;
    if (typeof node.property === 'string') {
      propName = node.property;
    } else if (node.property && node.property.name) {
      propName = node.property.name;
    } else if (node.property && node.property.value) {
      propName = node.property.value;
    }
    
    // Check for property on object type
    if (objType && objType.kind === Type.Object && objType.properties) {
      if (propName in objType.properties) {
        return objType.properties[propName];
      }
      // Only error if we have a known object shape and the property doesn't exist
      if (Object.keys(objType.properties).length > 0) {
        this.addError(
          `Property '${propName}' does not exist on type ${this.typeToString(objType)}`,
          node
        );
      }
    }
    
    // Check for enum member access
    if (objType && objType.kind === Type.Enum && objType.members) {
      if (propName in objType.members) {
        return objType.members[propName];
      }
      this.addError(
        `Property '${propName}' does not exist on enum '${objType.name}'`,
        node
      );
    }
    
    // Built-in properties
    if (objType) {
      if (objType.kind === Type.Array && propName === 'length') {
        return this.createType(Type.Number);
      }
      if (objType.kind === Type.String && propName === 'length') {
        return this.createType(Type.Number);
      }
    }
    
    return this.createType(Type.Unknown);
  }

  visitArrayExpression(node) {
    if (node.elements.length === 0) {
      return this.createArrayType(this.createType(Type.Unknown));
    }
    
    // Infer element type from first element
    const firstElemType = this.visitExpression(node.elements[0]);
    
    // Visit all elements
    for (let i = 1; i < node.elements.length; i++) {
      this.visitExpression(node.elements[i]);
    }
    
    return this.createArrayType(firstElemType);
  }

  visitObjectExpression(node) {
    const properties = {};
    
    for (const prop of node.properties) {
      if (prop.type === NodeType.SpreadElement) {
        const spreadType = this.visitExpression(prop.argument);
        if (spreadType && spreadType.kind === Type.Object && spreadType.properties) {
          Object.assign(properties, spreadType.properties);
        }
      } else if (prop.computed) {
        // Computed property: { [expr]: value } — visit both but don't track key statically
        this.visitExpression(prop.key);
        this.visitExpression(prop.value);
      } else {
        // Key can be a string directly, or an object with name/value
        let key;
        if (typeof prop.key === 'string') {
          key = prop.key;
        } else if (prop.key && prop.key.name) {
          key = prop.key.name;
        } else if (prop.key && prop.key.value) {
          key = prop.key.value;
        }
        const valueType = this.visitExpression(prop.value);
        if (key) {
          properties[key] = valueType;
        }
      }
    }
    
    return this.createObjectType(properties);
  }

  visitArrowFunctionExpression(node) {
    const wasInsideClosure = this._insideClosure;
    this._insideClosure = true;

    this.pushScope();

    // Define parameters
    for (const param of node.params) {
      const name = param.name || param.argument || param;
      this.defineVariable(name, this.createType(Type.Any));
    }

    // Visit body
    let returnType = this.createType(Type.Void);
    if (node.body.type === NodeType.BlockStatement) {
      for (const stmt of node.body.body) {
        this.visitStatement(stmt);
      }
    } else {
      returnType = this.visitExpression(node.body);
    }

    this._insideClosure = wasInsideClosure;
    this.popScope();

    return this.createFunctionType(
      node.params.map(() => this.createType(Type.Any)),
      returnType
    );
  }

  visitConditionalExpression(node) {
    this.visitExpression(node.test);
    const consequentType = this.visitExpression(node.consequent);
    const alternateType = this.visitExpression(node.alternate);
    
    // Return the type if both branches have the same type
    if (consequentType.kind === alternateType.kind) {
      return consequentType;
    }
    
    return this.createType(Type.Unknown);
  }

  visitAssignmentExpression(node) {
    const valueType = this.visitExpression(node.right);
    
    // Update variable type if it's a simple identifier
    if (node.left.type === NodeType.Identifier) {
      this.defineVariable(node.left.name, valueType);
    }
    
    return valueType;
  }

  visitFlowExpression(node) {
    // Flow expression: name >> fn1 fn2
    // Creates a composed function variable
    if (node.name && node.functions) {
      this.defineVariable(node.name, this.createType(Type.Function));
      return this.createType(Type.Function);
    }

    let currentType = this.visitExpression(node.left);

    if (node.right) {
      this.visitExpression(node.right);
      currentType = this.createType(Type.Unknown);
    }

    return currentType;
  }
}
