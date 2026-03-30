#!/usr/bin/env node

// install-kimchilang — installs KimchiLang globally via npm
// The execSync call uses a hardcoded command string (no user input), so shell injection is not a concern.

import { execSync } from 'child_process';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('\n  install-kimchilang\n');
  console.log('  Install KimchiLang globally.\n');
  console.log('  Usage: npx install-kimchilang\n');
  process.exit(0);
}

console.log('\nInstalling KimchiLang...\n');

try {
  execSync('npm install -g kimchilang', { stdio: 'inherit' });
  console.log('\nKimchiLang installed.\n');
  console.log('Usage:');
  console.log('  kimchi run script.km         Run a script (cached transpilation)');
  console.log('  kimchi compile app.km        Compile to JavaScript');
  console.log('  kimchi test tests.km         Run tests');
  console.log('  echo \'print "hi"\' | kimchi   Execute from stdin');
  console.log('  npx create-kimchi-app        Create a new project');
  console.log('');
  console.log('Shebang scripts:');
  console.log('  #!/usr/bin/env kimchi');
  console.log('  print "Hello, World!"');
  console.log('');
} catch (error) {
  console.error('\nInstallation failed.\n');
  console.error('Try: sudo npm install -g kimchilang');
  process.exit(1);
}
