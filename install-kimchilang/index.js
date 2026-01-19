#!/usr/bin/env node

import { execSync } from 'child_process';

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

function run(command, options = {}) {
  try {
    execSync(command, { stdio: 'inherit', ...options });
    return true;
  } catch (error) {
    return false;
  }
}

function showHelp() {
  log('\n🌶️  install-kimchilang\n', COLORS.bright + COLORS.cyan);
  log('Install KimchiLang globally on your system.\n');
  log('Usage:');
  log('  npx install-kimchilang');
  log('  npx install-kimchilang --help\n');
}

// Main
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

log('\n🌶️  Installing KimchiLang...\n', COLORS.bright + COLORS.cyan);

// Install kimchilang globally
log('Installing kimchilang globally...', COLORS.yellow);

if (run('npm install -g kimchilang')) {
  log('\n✨ KimchiLang installed successfully!\n', COLORS.bright + COLORS.green);
  log('You can now use:', COLORS.cyan);
  log('  kimchi --help              Show help');
  log('  kimchi src.main            Run a module');
  log('  kimchi compile app.km      Compile a file');
  log('  npx create-kimchi-app      Create a new project\n');
} else {
  log('\n❌ Installation failed.\n', COLORS.red);
  log('Try running with sudo:', COLORS.yellow);
  log('  sudo npm install -g kimchilang\n');
  process.exit(1);
}
