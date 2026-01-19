#!/usr/bin/env node

import { mkdirSync, writeFileSync, existsSync, cpSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATE_DIR = join(__dirname, 'template');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function log(message, color = '') {
  console.log(color + message + COLORS.reset);
}

function createProject(projectName) {
  const projectPath = resolve(process.cwd(), projectName);
  
  if (existsSync(projectPath)) {
    log(`\nError: Directory "${projectName}" already exists.`, COLORS.red);
    process.exit(1);
  }
  
  log(`\n🌶️  Creating KimchiLang project: ${projectName}\n`, COLORS.bright + COLORS.cyan);
  
  // Create project directory
  mkdirSync(projectPath, { recursive: true });
  
  // Create project structure
  const dirs = ['src', 'lib', 'tests'];
  for (const dir of dirs) {
    mkdirSync(join(projectPath, dir), { recursive: true });
  }
  
  // Create project.static
  writeFileSync(join(projectPath, 'project.static'), `// KimchiLang Project Configuration
name "${projectName}"
version "1.0.0"

// External dependencies (uncomment to add)
// depend [
//   "github.com/kimchilang/stdlib"
// ]
`);
  
  // Create main entry point
  writeFileSync(join(projectPath, 'src', 'main.km'), `// ${projectName} - Main Entry Point

// Example function
expose fn greet(name) {
  return "Hello, \${name}! Welcome to KimchiLang 🌶️"
}

// Run when executed directly
dec message = greet("World")
print message
`);
  
  // Create a lib module
  writeFileSync(join(projectPath, 'lib', 'utils.km'), `// Utility functions

expose fn add(a, b) {
  return a + b
}

expose fn multiply(a, b) {
  return a * b
}

expose fn range(start, end) {
  return start..end
}
`);
  
  // Create a test file
  writeFileSync(join(projectPath, 'tests', 'utils.test.km'), `// Tests for lib/utils.km
as utils dep lib.utils

describe "Utils" {
  test "add returns correct sum" {
    expect(utils.add(2, 3)).toBe(5)
  }
  
  test "multiply returns correct product" {
    expect(utils.multiply(3, 4)).toBe(12)
  }
  
  test "range creates array" {
    dec nums = utils.range(1, 5)
    expect(nums).toHaveLength(4)
  }
}
`);
  
  // Create README
  writeFileSync(join(projectPath, 'README.md'), `# ${projectName}

A KimchiLang project.

## Getting Started

\`\`\`bash
# Run the main module
kimchi src.main

# Run tests
kimchi tests.utils.test

# Install dependencies (if any)
kimchi install
\`\`\`

## Project Structure

\`\`\`
${projectName}/
├── project.static    # Project configuration
├── src/
│   └── main.km       # Main entry point
├── lib/
│   └── utils.km      # Utility functions
└── tests/
    └── utils.test.km # Unit tests
\`\`\`

## Learn More

- [KimchiLang Documentation](https://github.com/kimchilang/kimchilang)
`);
  
  // Create .gitignore
  writeFileSync(join(projectPath, '.gitignore'), `# Dependencies
.km_modules/

# Compiled output
*.js
!*.config.js

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
`);
  
  log('  Created project structure:', COLORS.green);
  log(`    ${projectName}/`);
  log('    ├── project.static');
  log('    ├── README.md');
  log('    ├── .gitignore');
  log('    ├── src/');
  log('    │   └── main.km');
  log('    ├── lib/');
  log('    │   └── utils.km');
  log('    └── tests/');
  log('        └── utils.test.km');
  
  log('\n✨ Done! To get started:\n', COLORS.bright + COLORS.green);
  log(`  cd ${projectName}`, COLORS.cyan);
  log('  kimchi src.main', COLORS.cyan);
  log('');
}

function showHelp() {
  log('\n🌶️  create-kimchi-app\n', COLORS.bright + COLORS.cyan);
  log('Usage:');
  log('  npx create-kimchi-app <project-name>');
  log('  npx create-kimchi-app my-app\n');
  log('Options:');
  log('  --help, -h    Show this help message');
  log('  --version     Show version\n');
}

// Main
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

if (args.includes('--version')) {
  log('create-kimchi-app v1.0.0');
  process.exit(0);
}

const projectName = args[0];

if (!projectName || projectName.startsWith('-')) {
  log('\nError: Please provide a project name.', COLORS.red);
  showHelp();
  process.exit(1);
}

// Validate project name
if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(projectName)) {
  log('\nError: Project name must start with a letter and contain only letters, numbers, underscores, and hyphens.', COLORS.red);
  process.exit(1);
}

createProject(projectName);
