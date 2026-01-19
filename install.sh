#!/bin/bash

# KimchiLang Installer Script
# This script installs KimchiLang and makes the 'kimchi' command available globally

set -e

echo "🌶️  KimchiLang Installer"
echo "========================"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    echo "   Please install Node.js from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "⚠️  Warning: Node.js 18+ is recommended. You have $(node -v)"
fi

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is required but not installed."
    exit 1
fi

echo "✓ Node.js $(node -v) detected"
echo "✓ npm $(npm -v) detected"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Install dependencies
echo "📦 Installing dependencies..."
cd "$SCRIPT_DIR"
npm install

echo ""
echo "🔗 Linking kimchi command globally..."

# Link the package globally
npm link

echo ""
echo "✅ Installation complete!"
echo ""
echo "You can now use the 'kimchi' command from anywhere:"
echo ""
echo "  kimchi run hello.kimchi      # Run a KimchiLang file"
echo "  kimchi compile app.kimchi    # Compile to JavaScript"
echo "  kimchi convert input.js      # Convert JS to KimchiLang"
echo "  kimchi repl                  # Start interactive REPL"
echo "  kimchi help                  # Show all commands"
echo ""
echo "🌶️  Happy coding with KimchiLang!"
