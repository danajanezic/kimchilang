#!/bin/bash

# KimchiLang Installer Script
# This script installs KimchiLang and makes the 'kimchi' command available globally

set -e

echo "KimchiLang Installer"
echo "===================="
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required but not installed."
    echo "  Install Node.js 22+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    echo "Warning: Node.js 22+ is recommended for V8 bytecode caching. You have $(node -v)"
fi

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "Error: npm is required but not installed."
    exit 1
fi

echo "  Node.js $(node -v)"
echo "  npm $(npm -v)"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Install dependencies
echo "Installing dependencies..."
cd "$SCRIPT_DIR"
npm install

echo ""
echo "Linking kimchi command globally..."

# Link the package globally
npm link

echo ""

# Verify installation
if command -v kimchi &> /dev/null; then
    echo "Installation complete!"
    echo ""
    echo "The 'kimchi' command is now available globally."
    echo ""
    echo "  kimchi run hello.km            Run a script (cached)"
    echo "  kimchi compile app.km -o out   Compile to JavaScript"
    echo "  kimchi test tests.km           Run tests"
    echo "  kimchi cache clear             Clear transpilation cache"
    echo "  echo 'print 1' | kimchi        Execute from stdin"
    echo ""
    echo "Shebang scripts:"
    echo ""
    echo "  #!/usr/bin/env kimchi"
    echo "  print \"Hello, World!\""
    echo ""
    echo "  chmod +x script.km && ./script.km"
else
    echo "Warning: 'kimchi' command not found in PATH."
    echo "You may need to restart your shell or add npm's global bin to PATH."
fi
