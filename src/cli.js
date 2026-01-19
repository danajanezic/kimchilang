#!/usr/bin/env node

// KimchiLang CLI - Command line interface for the KimchiLang compiler

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, basename, extname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import { compile } from './index.js';
import { convertJS } from './js2km.js';
import { Linter, Severity } from './linter.js';
import { tokenize, parse } from './index.js';
import { parseStaticFile, generateStaticCode } from './static-parser.js';
import { installDependencies, cleanDependencies, parseProjectFile } from './package-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VERSION = '1.0.1';

const HELP = `
KimchiLang v${VERSION}

Usage:
  kimchi <module.path> [--arg value] [--dep module=path]
  kimchi <command> [options] <file>

Module Execution:
  kimchi <module.path>              Run a module (e.g., salesforce.client)
  kimchi <module> --arg value       Pass args to module (converts to camelCase)
  kimchi <module> --dep name=path   Inject dependency
  kimchi help <module.path>         Show module help (_describe, args, deps, _help)

Commands:
  ls [path]         List modules (--verbose for descriptions, --recursive for tree)
  compile <file>    Compile a .kimchi file to JavaScript
  run <file>        Compile and run a .kimchi file
  test <file>       Run tests in a .kimchi file
  lint <file>       Run linter on a .kimchi file
  check <file>      Check a file for errors (for editor integration)
  convert <file>    Convert a JavaScript file to KimchiLang
  npm <args>        Run npm and convert installed packages to pantry/
  build <dir>       Compile all .kimchi files in a directory
  install           Install dependencies from project.static
  clean             Remove installed dependencies
  repl              Start an interactive REPL session
  help              Show this help message
  version           Show version information

Options:
  -o, --output <file>    Output file path (for compile command)
  -d, --debug            Enable debug output
  --no-lint              Skip linting during compilation
  --verbose, -v          Show module descriptions (for ls command)
  --recursive, -r        Recurse into subdirectories (for ls command)
  --dep <name=path>      Inject dependency (can be used multiple times)

Examples:
  kimchi ls
  kimchi ls ./lib --verbose --recursive
  kimchi salesforce.client --client-id ABC123
  kimchi help salesforce.client
  kimchi compile app.kimchi -o dist/app.js

File Extension: .kimchi, .km, or .kc
`;

function parseArgs(args) {
  const result = {
    command: null,
    file: null,
    output: null,
    debug: false,
    watch: false,
    help: false,
    verbose: false,
    recursive: false,
    skipLint: false,
    moduleArgs: {},  // Args to pass to module (--arg-name value)
    deps: {},        // Dependency injections (--dep name=path)
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '-d' || arg === '--debug') {
      result.debug = true;
    } else if (arg === '--no-lint') {
      result.skipLint = true;
    } else if (arg === '-v' || arg === '--verbose') {
      result.verbose = true;
    } else if (arg === '-r' || arg === '--recursive') {
      result.recursive = true;
    } else if (arg === '-w' || arg === '--watch') {
      result.watch = true;
    } else if (arg === '-o' || arg === '--output') {
      result.output = args[++i];
    } else if (arg === '--dep') {
      // --dep name=path
      const depArg = args[++i];
      if (depArg && depArg.includes('=')) {
        const [name, path] = depArg.split('=');
        result.deps[name] = path;
      }
    } else if (arg.startsWith('--')) {
      // Module arg: --arg-name value -> argName: value
      const argName = arg.slice(2);
      const camelName = argName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const value = args[++i];
      result.moduleArgs[camelName] = value;
    } else if (!result.command) {
      result.command = arg;
    } else if (!result.file) {
      result.file = arg;
    }

    i++;
  }

  return result;
}

// Convert module path to file path: salesforce.client -> ./salesforce/client.km
function modulePathToFilePath(modulePath) {
  const parts = modulePath.split('.');
  const filePath = './' + parts.join('/');
  
  // Try different extensions (including .static for static data files)
  const extensions = ['.km', '.kimchi', '.kc', '.static'];
  for (const ext of extensions) {
    const fullPath = resolve(filePath + ext);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }
  
  // Try as directory with index
  for (const ext of extensions) {
    const indexPath = resolve(filePath, 'index' + ext);
    if (existsSync(indexPath)) {
      return indexPath;
    }
  }
  
  return null;
}

// Extract module metadata (args, deps) from source
function extractModuleMetadata(source) {
  const metadata = {
    args: [],
    deps: [],
    hasDescribe: false,
    hasHelp: false,
  };
  
  // Find arg declarations
  const argRegex = /(!?)arg\s+(\w+)(?:\s*=\s*(.+))?/g;
  let match;
  while ((match = argRegex.exec(source)) !== null) {
    metadata.args.push({
      name: match[2],
      required: match[1] === '!',
      default: match[3] || null,
    });
  }
  
  // Find dep statements
  const depRegex = /as\s+(\w+)\s+dep\s+([\w.]+)/g;
  while ((match = depRegex.exec(source)) !== null) {
    metadata.deps.push({
      alias: match[1],
      path: match[2],
    });
  }
  
  // Check for _describe and _help functions
  metadata.hasDescribe = /fn\s+_describe\s*\(/.test(source) || /expose\s+fn\s+_describe\s*\(/.test(source);
  metadata.hasHelp = /fn\s+_help\s*\(/.test(source) || /expose\s+fn\s+_help\s*\(/.test(source);
  
  return metadata;
}

// Run a module with args and dep injections
async function runModule(modulePath, moduleArgs, deps, options) {
  const filePath = modulePathToFilePath(modulePath);
  
  if (!filePath) {
    console.error(`Error: Module not found: ${modulePath}`);
    console.error(`Looked for: ./${modulePath.split('.').join('/')}.[km|kimchi|kc]`);
    process.exit(1);
  }
  
  const source = readFileSync(filePath, 'utf-8');
  const metadata = extractModuleMetadata(source);
  
  // Validate required args
  for (const arg of metadata.args) {
    if (arg.required && !moduleArgs[arg.name]) {
      console.error(`Error: Required argument '${arg.name}' not provided`);
      console.error(`Usage: kimchi ${modulePath} --${arg.name.replace(/([A-Z])/g, '-$1').toLowerCase()} <value>`);
      process.exit(1);
    }
  }
  
  try {
    // Compile the module
    let javascript = compile(source, { debug: options.debug });
    
    // Build the args object to pass
    const argsObj = { ...moduleArgs };
    
    // Add defaults for missing optional args
    for (const arg of metadata.args) {
      if (!argsObj[arg.name] && arg.default) {
        argsObj[arg.name] = arg.default;
      }
    }
    
    if (options.debug) {
      console.log('\n--- Module Args ---');
      console.log(argsObj);
      console.log('\n--- Dep Injections ---');
      console.log(deps);
      console.log('\n--- Generated JavaScript ---\n');
      console.log(javascript);
      console.log('\n--- Output ---\n');
    }
    
    // Write to temp file and execute as ES module
    const os = await import('os');
    const crypto = await import('crypto');
    const tempDir = os.default.tmpdir();
    const tempFile = join(tempDir, `kimchi_${crypto.default.randomBytes(8).toString('hex')}.mjs`);
    
    // Replace "export default function" with just "const _module = function" so we can call it
    const modifiedCode = javascript.replace(
      /^export default function/m, 
      'const _module = function'
    );
    
    // Wrap the code to call the factory with args
    const wrappedCode = `
${modifiedCode}

// Call the module factory
_module(${JSON.stringify(argsObj)});
`;
    
    writeFileSync(tempFile, wrappedCode);
    
    try {
      // Execute the temp file
      const { execSync: execSyncImport } = await import('child_process');
      execSyncImport(`node "${tempFile}"`, { 
        stdio: 'inherit',
        cwd: dirname(filePath)
      });
    } finally {
      // Clean up temp file
      try {
        const fs = await import('fs');
        fs.default.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Show help for a module
async function showModuleHelp(modulePath, options) {
  const filePath = modulePathToFilePath(modulePath);
  
  if (!filePath) {
    console.error(`Error: Module not found: ${modulePath}`);
    process.exit(1);
  }
  
  const source = readFileSync(filePath, 'utf-8');
  const metadata = extractModuleMetadata(source);
  
  console.log(`\nModule: ${modulePath}`);
  console.log(`File: ${filePath}`);
  console.log('');
  
  // Try to call _describe if it exists
  if (metadata.hasDescribe) {
    try {
      const javascript = compile(source, { debug: false });
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const wrappedCode = `
        ${javascript}
        if (typeof _describe === 'function') {
          return _describe();
        }
        return null;
      `;
      const fn = new AsyncFunction(wrappedCode);
      const description = await fn();
      if (description) {
        console.log('Description:');
        console.log(`  ${description}`);
        console.log('');
      }
    } catch (e) {
      // Ignore errors in _describe
    }
  }
  
  // Show args
  if (metadata.args.length > 0) {
    console.log('Arguments:');
    for (const arg of metadata.args) {
      const flag = '--' + arg.name.replace(/([A-Z])/g, '-$1').toLowerCase();
      const required = arg.required ? ' (required)' : '';
      const defaultVal = arg.default ? ` [default: ${arg.default}]` : '';
      console.log(`  ${flag}${required}${defaultVal}`);
    }
    console.log('');
  }
  
  // Show dependencies
  if (metadata.deps.length > 0) {
    console.log('Dependencies:');
    for (const dep of metadata.deps) {
      console.log(`  ${dep.alias} <- ${dep.path}`);
    }
    console.log('');
    console.log('Inject dependencies with: --dep <alias>=<path>');
    console.log('');
  }
  
  // Try to call _help if it exists
  if (metadata.hasHelp) {
    try {
      const javascript = compile(source, { debug: false });
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const wrappedCode = `
        ${javascript}
        if (typeof _help === 'function') {
          return _help();
        }
        return null;
      `;
      const fn = new AsyncFunction(wrappedCode);
      const helpText = await fn();
      if (helpText) {
        console.log('Additional Help:');
        console.log(helpText);
      }
    } catch (e) {
      // Ignore errors in _help
    }
  }
  
  // Usage example
  console.log('Usage:');
  let usage = `  kimchi ${modulePath}`;
  for (const arg of metadata.args) {
    const flag = '--' + arg.name.replace(/([A-Z])/g, '-$1').toLowerCase();
    if (arg.required) {
      usage += ` ${flag} <value>`;
    }
  }
  console.log(usage);
}

// Get description from a module by calling _describe if it exists
async function getModuleDescription(filePath) {
  try {
    const source = readFileSync(filePath, 'utf-8');
    const hasDescribe = /fn\s+_describe\s*\(/.test(source) || /expose\s+fn\s+_describe\s*\(/.test(source);
    
    if (!hasDescribe) {
      return null;
    }
    
    const javascript = compile(source, { debug: false });
    
    // Replace export default with const so we can call it
    const modifiedCode = javascript.replace(
      /^export default function/m, 
      'const _module = function'
    );
    
    // Remove the required arg check so we can call _describe without args
    // Replace: if (_opts["name"] === undefined) throw new Error(...);
    const noArgCheckCode = modifiedCode.replace(
      /if \(_opts\["\w+"\] === undefined\) throw new Error\([^)]+\);\s*/g,
      ''
    );
    
    // Suppress console.log to avoid side effects when getting description
    const wrappedCode = `
const _originalLog = console.log;
console.log = () => {};
try {
  ${noArgCheckCode}
  
  const result = _module({});
  console.log = _originalLog;
  if (result && typeof result._describe === 'function') {
    return result._describe();
  }
  return null;
} finally {
  console.log = _originalLog;
}
`;
    
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction(wrappedCode);
    return await fn();
  } catch (e) {
    return null;
  }
}

// Convert file path to module path: /base/foo/bar.km -> foo.bar
function filePathToModulePath(filePath, baseDir) {
  const relativePath = relative(baseDir, filePath);
  const ext = extname(relativePath);
  const withoutExt = relativePath.slice(0, -ext.length);
  return withoutExt.replace(/[\/]/g, '.');
}

// List modules in a directory
async function listModules(searchPath, options) {
  const targetDir = searchPath ? resolve(searchPath) : process.cwd();
  
  if (!existsSync(targetDir)) {
    console.error(`Error: Directory not found: ${targetDir}`);
    process.exit(1);
  }
  
  const stat = statSync(targetDir);
  if (!stat.isDirectory()) {
    console.error(`Error: Not a directory: ${targetDir}`);
    process.exit(1);
  }
  
  console.log(`\nModules in ${targetDir}:\n`);
  
  if (options.recursive) {
    await listModulesRecursive(targetDir, '', options, targetDir);
  } else {
    await listModulesFlat(targetDir, options, targetDir);
  }
}

// List modules in a single directory (non-recursive)
async function listModulesFlat(dir, options, baseDir) {
  const entries = readdirSync(dir);
  const extensions = ['.km', '.kimchi', '.kc'];
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isFile()) {
      const ext = extname(entry);
      if (extensions.includes(ext)) {
        const moduleName = basename(entry, ext);
        const modulePath = filePathToModulePath(fullPath, baseDir);
        
        if (options.verbose) {
          const description = await getModuleDescription(fullPath);
          if (description) {
            console.log(`  ${moduleName}`);
            console.log(`    ${modulePath}`);
            console.log(`    ${description}`);
            console.log('');
          } else {
            console.log(`  ${moduleName}`);
            console.log(`    ${modulePath}`);
            console.log('');
          }
        } else {
          console.log(`  ${moduleName}`);
        }
      }
    }
  }
}

// List modules recursively with tree format
async function listModulesRecursive(dir, prefix, options, baseDir) {
  const entries = readdirSync(dir).sort();
  const extensions = ['.km', '.kimchi', '.kc'];
  
  // Separate files and directories
  const files = [];
  const dirs = [];
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
      dirs.push(entry);
    } else if (stat.isFile()) {
      const ext = extname(entry);
      if (extensions.includes(ext)) {
        files.push(entry);
      }
    }
  }
  
  const totalItems = files.length + dirs.length;
  let itemIndex = 0;
  
  // List files first
  for (const file of files) {
    itemIndex++;
    const isLast = itemIndex === totalItems;
    const connector = isLast ? '└── ' : '├── ';
    const ext = extname(file);
    const moduleName = basename(file, ext);
    const fullPath = join(dir, file);
    const modulePath = filePathToModulePath(fullPath, baseDir);
    
    if (options.verbose) {
      const description = await getModuleDescription(fullPath);
      console.log(`${prefix}${connector}${moduleName}`);
      console.log(`${prefix}${isLast ? '    ' : '│   '}  ${modulePath}`);
      if (description) {
        console.log(`${prefix}${isLast ? '    ' : '│   '}  ${description}`);
      }
    } else {
      console.log(`${prefix}${connector}${moduleName}`);
    }
  }
  
  // Then recurse into directories
  for (const subdir of dirs) {
    itemIndex++;
    const isLast = itemIndex === totalItems;
    const connector = isLast ? '└── ' : '├── ';
    const newPrefix = prefix + (isLast ? '    ' : '│   ');
    const fullPath = join(dir, subdir);
    
    console.log(`${prefix}${connector}${subdir}/`);
    await listModulesRecursive(fullPath, newPrefix, options, baseDir);
  }
}

function compileFile(filePath, options = {}) {
  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  // Reject kebab-case file names
  const fileName = basename(filePath);
  if (/-/.test(fileName) && /\.(km|kimchi|kc)$/.test(fileName)) {
    console.error(`Error: Kebab-case file names are not allowed: ${fileName}`);
    console.error(`Please rename to use underscores: ${fileName.replace(/-/g, '_')}`);
    process.exit(1);
  }

  const source = readFileSync(filePath, 'utf-8');
  
  // Static file resolver - checks if a module path resolves to a .static file
  const staticFileResolver = (modulePath) => {
    const parts = modulePath.split('.');
    const baseFilePath = './' + parts.join('/');
    const staticPath = resolve(baseFilePath + '.static');
    return existsSync(staticPath);
  };
  
  try {
    const javascript = compile(source, { 
      debug: options.debug,
      skipLint: options.skipLint,
      showLintWarnings: true,
      staticFileResolver,
      basePath: options.basePath,
    });
    return javascript;
  } catch (error) {
    console.error(`Compilation Error in ${filePath}:`);
    console.error(error.message);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

function compileStaticFile(filePath, options = {}) {
  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const source = readFileSync(filePath, 'utf-8');
  
  try {
    const declarations = parseStaticFile(source, filePath);
    const javascript = generateStaticCode(declarations, filePath);
    return javascript;
  } catch (error) {
    console.error(`Static File Compilation Error in ${filePath}:`);
    console.error(error.message);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

function checkFile(source, filePath = null) {
  // Check file for errors and return JSON-compatible error array
  const errors = [];
  
  try {
    // Step 1: Tokenize
    const tokens = tokenize(source);
    
    // Step 2: Parse
    const ast = parse(tokens);
    
    // Step 3: Lint
    const linter = new Linter();
    const lintMessages = linter.lint(ast, source);
    
    for (const msg of lintMessages) {
      if (msg.severity === Severity.Error) {
        errors.push({
          line: msg.line || 1,
          column: msg.column || 1,
          message: `[${msg.rule}] ${msg.message}`,
          severity: 'error',
        });
      }
    }
    
    // Step 4: Type check (compile without generating code)
    compile(source, { skipLint: true });
    
  } catch (error) {
    // Parse error format: "Parse Error at line:column: message"
    const match = error.message.match(/(?:Parse |Lexer |Type |Compile )?Error at (\d+):(\d+):\s*(.+)/i);
    if (match) {
      errors.push({
        line: parseInt(match[1], 10),
        column: parseInt(match[2], 10),
        message: match[3],
        severity: 'error',
      });
    } else {
      // Generic error
      errors.push({
        line: 1,
        column: 1,
        message: error.message,
        severity: 'error',
      });
    }
  }
  
  return errors;
}

function lintFile(filePath, options = {}) {
  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const source = readFileSync(filePath, 'utf-8');
  
  try {
    const tokens = tokenize(source);
    const ast = parse(tokens);
    
    const linter = new Linter();
    const messages = linter.lint(ast, source);
    
    if (messages.length === 0) {
      console.log(`✅ ${basename(filePath)}: No lint issues found`);
    } else {
      console.log(`\n📋 Lint results for ${basename(filePath)}:`);
      console.log(linter.formatMessages());
      
      if (linter.hasErrors()) {
        process.exit(1);
      }
    }
  } catch (error) {
    console.error(`Error linting ${filePath}:`);
    console.error(error.message);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

async function runTests(filePath, options = {}) {
  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const javascript = compileFile(filePath, options);
  
  if (options.debug) {
    console.log('\n--- Generated JavaScript ---\n');
    console.log(javascript);
    console.log('\n--- Running Tests ---\n');
  }

  try {
    const os = await import('os');
    const crypto = await import('crypto');
    const tempDir = os.default.tmpdir();
    const tempFile = join(tempDir, `kimchi_test_${crypto.default.randomBytes(8).toString('hex')}.mjs`);
    
    const modifiedCode = javascript.replace(
      /^export default function/m, 
      'const _module = function'
    );
    
    const wrappedCode = `
${modifiedCode}

// Call the module factory to register tests
_module({});

// Run all registered tests
await _runTests();
`;
    
    writeFileSync(tempFile, wrappedCode);
    
    try {
      execSync(`node "${tempFile}"`, { 
        stdio: 'inherit',
        cwd: dirname(filePath)
      });
    } finally {
      try {
        const fs = await import('fs');
        fs.default.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('Test Error:');
    console.error(error.message);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

async function runFile(filePath, options = {}) {
  // Pass basePath for absolute path resolution of static files
  const javascript = compileFile(filePath, { ...options, basePath: dirname(resolve(filePath)) });
  
  if (options.debug) {
    console.log('\n--- Generated JavaScript ---\n');
    console.log(javascript);
    console.log('\n--- Output ---\n');
  }

  try {
    // Write to temp file and execute as ES module
    const os = await import('os');
    const crypto = await import('crypto');
    const tempDir = os.default.tmpdir();
    const tempFile = join(tempDir, `kimchi_${crypto.default.randomBytes(8).toString('hex')}.mjs`);
    
    // Replace export default with const so we can call it
    const modifiedCode = javascript.replace(
      /^export default function/m, 
      'const _module = function'
    );
    
    const wrappedCode = `
${modifiedCode}

// Call the module factory
_module({});
`;
    
    writeFileSync(tempFile, wrappedCode);
    
    try {
      execSync(`node "${tempFile}"`, { 
        stdio: 'inherit',
        cwd: dirname(filePath)
      });
    } finally {
      try {
        const fs = await import('fs');
        fs.default.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('Runtime Error:');
    console.error(error.message);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

async function startRepl() {
  const readline = await import('readline');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'kimchi> ',
  });

  console.log(`KimchiLang REPL v${VERSION}`);
  console.log('Type "exit" or press Ctrl+C to quit.\n');

  rl.prompt();

  let multilineBuffer = '';
  let braceCount = 0;

  rl.on('line', (line) => {
    if (line.trim() === 'exit') {
      rl.close();
      return;
    }

    multilineBuffer += line + '\n';
    braceCount += (line.match(/{/g) || []).length;
    braceCount -= (line.match(/}/g) || []).length;

    if (braceCount > 0) {
      process.stdout.write('... ');
      return;
    }

    if (multilineBuffer.trim()) {
      try {
        const javascript = compile(multilineBuffer.trim());
        const result = eval(javascript);
        if (result !== undefined) {
          console.log(result);
        }
      } catch (error) {
        console.error('Error:', error.message);
      }
    }

    multilineBuffer = '';
    braceCount = 0;
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\nGoodbye!');
    process.exit(0);
  });
}

function getAllJsFiles(dir, files = []) {
  const entries = readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Skip certain directories
      if (entry === '.bin' || entry === '.cache') continue;
      getAllJsFiles(fullPath, files);
    } else if (entry.endsWith('.js') && !entry.endsWith('.min.js')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function getPackageMainFile(packageDir) {
  const packageJsonPath = join(packageDir, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      // Try main, then module, then index.js
      const mainFile = pkg.main || pkg.module || 'index.js';
      const mainPath = join(packageDir, mainFile);
      if (existsSync(mainPath)) {
        return mainPath;
      }
      // Try adding .js extension
      if (existsSync(mainPath + '.js')) {
        return mainPath + '.js';
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
  }
  
  // Fallback to index.js
  const indexPath = join(packageDir, 'index.js');
  if (existsSync(indexPath)) {
    return indexPath;
  }
  
  return null;
}

async function runNpmAndConvert(npmArgs, options) {
  const cwd = process.cwd();
  const nodeModulesDir = join(cwd, 'node_modules');
  const pantryDir = join(cwd, 'pantry');
  
  // Run npm with the provided arguments
  console.log(`Running: npm ${npmArgs.join(' ')}`);
  
  try {
    const npmProcess = spawn('npm', npmArgs, {
      cwd,
      stdio: 'inherit',
    });
    
    await new Promise((resolve, reject) => {
      npmProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm exited with code ${code}`));
        }
      });
      npmProcess.on('error', reject);
    });
  } catch (error) {
    console.error('npm command failed:', error.message);
    process.exit(1);
  }
  
  // Only convert if this was an install command
  if (!npmArgs.includes('install') && !npmArgs.includes('i') && !npmArgs.includes('add')) {
    return;
  }
  
  // Create pantry directory
  if (!existsSync(pantryDir)) {
    mkdirSync(pantryDir, { recursive: true });
  }
  
  // Find installed packages
  if (!existsSync(nodeModulesDir)) {
    console.log('No node_modules directory found');
    return;
  }
  
  const packages = readdirSync(nodeModulesDir).filter(name => {
    // Skip hidden files and scoped packages for now
    if (name.startsWith('.') || name.startsWith('@')) return false;
    const pkgPath = join(nodeModulesDir, name);
    return statSync(pkgPath).isDirectory();
  });
  
  console.log(`\nConverting ${packages.length} packages to pantry/...`);
  
  let converted = 0;
  let failed = 0;
  
  for (const pkgName of packages) {
    const pkgDir = join(nodeModulesDir, pkgName);
    const mainFile = getPackageMainFile(pkgDir);
    
    if (!mainFile) {
      if (options.debug) {
        console.log(`  Skipping ${pkgName}: no main file found`);
      }
      continue;
    }
    
    try {
      const jsSource = readFileSync(mainFile, 'utf-8');
      const kimchiCode = convertJS(jsSource);
      
      // Create package directory in pantry
      const pantryPkgDir = join(pantryDir, pkgName);
      if (!existsSync(pantryPkgDir)) {
        mkdirSync(pantryPkgDir, { recursive: true });
      }
      
      // Write the converted file
      const outputFile = join(pantryPkgDir, 'index.km');
      writeFileSync(outputFile, kimchiCode);
      
      converted++;
      if (options.debug) {
        console.log(`  ✓ ${pkgName}`);
      }
    } catch (error) {
      failed++;
      if (options.debug) {
        console.log(`  ✗ ${pkgName}: ${error.message}`);
      }
    }
  }
  
  console.log(`\nPantry: ${converted} packages converted, ${failed} failed`);
  console.log(`Use: as <alias> dep pantry.<package>`);
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help || args.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  switch (options.command) {
    case 'version':
    case '-v':
    case '--version':
      console.log(`KimchiLang v${VERSION}`);
      break;

    case 'help':
      // Check if help is for a specific module
      if (options.file) {
        // Try to find the module
        const helpFilePath = modulePathToFilePath(options.file);
        if (helpFilePath) {
          await showModuleHelp(options.file, options);
        } else {
          console.log(HELP);
        }
      } else {
        console.log(HELP);
      }
      break;

    case 'ls': {
      // List modules in directory
      await listModules(options.file, options);
      break;
    }

    case 'compile': {
      if (!options.file) {
        console.error('Error: No input file specified');
        process.exit(1);
      }

      const filePath = resolve(options.file);
      
      // Check if it's a static file
      if (filePath.endsWith('.static')) {
        const javascript = compileStaticFile(filePath, options);
        if (options.output) {
          writeFileSync(options.output, javascript);
          console.log(`Compiled: ${options.file} -> ${options.output}`);
        } else {
          const outputPath = filePath.replace(/\.static$/, '.static.js');
          writeFileSync(outputPath, javascript);
          console.log(`Compiled: ${options.file} -> ${basename(outputPath)}`);
        }
      } else {
        const javascript = compileFile(filePath, options);
        if (options.output) {
          writeFileSync(options.output, javascript);
          console.log(`Compiled: ${options.file} -> ${options.output}`);
        } else {
          const outputPath = filePath.replace(/\.(kimchi|kc)$/, '.js');
          writeFileSync(outputPath, javascript);
          console.log(`Compiled: ${options.file} -> ${basename(outputPath)}`);
        }
      }
      break;
    }

    case 'run': {
      if (!options.file) {
        console.error('Error: No input file specified');
        process.exit(1);
      }

      const filePath = resolve(options.file);
      runFile(filePath, options);
      break;
    }

    case 'lint': {
      if (!options.file) {
        console.error('Error: No input file specified');
        process.exit(1);
      }

      const filePath = resolve(options.file);
      lintFile(filePath, options);
      break;
    }

    case 'check': {
      // Check command for editor integration - outputs JSON errors
      let source;
      let filePath = options.file ? resolve(options.file) : null;
      
      // Read from stdin if --json flag or no file
      if (process.stdin.isTTY === false) {
        // Read from stdin
        const chunks = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        source = Buffer.concat(chunks).toString('utf-8');
      } else if (filePath && existsSync(filePath)) {
        source = readFileSync(filePath, 'utf-8');
      } else {
        console.log(JSON.stringify({ errors: [] }));
        break;
      }
      
      const errors = checkFile(source, filePath);
      console.log(JSON.stringify({ errors }));
      break;
    }

    case 'test': {
      if (!options.file) {
        console.error('Error: No input file specified');
        process.exit(1);
      }

      const filePath = resolve(options.file);
      await runTests(filePath, options);
      break;
    }

    case 'repl':
      await startRepl();
      break;

    case 'convert': {
      if (!options.file) {
        console.error('Error: No input file specified');
        process.exit(1);
      }

      const filePath = resolve(options.file);
      if (!existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }

      const jsSource = readFileSync(filePath, 'utf-8');
      
      try {
        const kimchiCode = convertJS(jsSource);
        
        if (options.output) {
          writeFileSync(options.output, kimchiCode);
          console.log(`Converted: ${options.file} -> ${options.output}`);
        } else {
          const outputPath = filePath.replace(/\.js$/, '.km');
          writeFileSync(outputPath, kimchiCode);
          console.log(`Converted: ${options.file} -> ${basename(outputPath)}`);
        }
      } catch (error) {
        console.error(`Conversion Error in ${filePath}:`);
        console.error(error.message);
        if (options.debug) {
          console.error(error.stack);
        }
        process.exit(1);
      }
      break;
    }

    case 'npm': {
      // Pass all remaining args to npm
      const npmArgs = process.argv.slice(3);
      await runNpmAndConvert(npmArgs, options);
      break;
    }

    case 'install': {
      // Install dependencies from project.static
      console.log('KimchiLang Package Manager\n');
      installDependencies('.');
      break;
    }

    case 'clean': {
      // Remove installed dependencies
      console.log('Cleaning dependencies...\n');
      cleanDependencies('.');
      break;
    }

    default:
      // Check if it's a file to run directly
      if (options.command && (options.command.endsWith('.kimchi') || options.command.endsWith('.kc') || options.command.endsWith('.km'))) {
        const filePath = resolve(options.command);
        runFile(filePath, options);
      } 
      // Check if it's a module path (contains dots but not a file extension)
      else if (options.command && options.command.includes('.') && !options.command.match(/\.(kimchi|kc|km|js)$/)) {
        await runModule(options.command, options.moduleArgs, options.deps, options);
      }
      else if (options.command) {
        // Try as a simple module name (single word)
        const filePath = modulePathToFilePath(options.command);
        if (filePath) {
          await runModule(options.command, options.moduleArgs, options.deps, options);
        } else {
          console.error(`Unknown command or module: ${options.command}`);
          console.log(HELP);
          process.exit(1);
        }
      } else {
        console.log(HELP);
      }
  }
}

main().catch(error => {
  console.error('Fatal Error:', error.message);
  process.exit(1);
});
