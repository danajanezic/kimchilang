# Editor Extensions

[Back to README](../README.md)

KimchiLang provides syntax highlighting and LSP support for popular editors. Extensions are in the `editors/` directory.

## VS Code / Windsurf

**Option 1: Install from VSIX (Recommended)**

```bash
# Pre-built VSIX at: editors/vscode/kimchilang-1.0.0.vsix
# 1. Open VS Code / Windsurf
# 2. Cmd+Shift+P -> "Extensions: Install from VSIX..."
# 3. Select editors/vscode/kimchilang-1.0.0.vsix
# 4. Reload
```

**Option 2: Copy to extensions folder**

```bash
# VS Code
cp -r editors/vscode ~/.vscode/extensions/kimchilang

# Windsurf
cp -r editors/vscode ~/.windsurf/extensions/kimchilang
```

**Option 3: Build fresh VSIX**

```bash
cd editors/vscode
npm install -g @vscode/vsce
vsce package
```

After installation, syntax highlighting activates for `.km`, `.kimchi`, and `.kc` files.

## LSP Server

Real-time diagnostics via `kimchi lsp` (JSON-RPC 2.0 over stdio):

```bash
kimchi lsp
```

Supports: textDocument/didOpen, didChange, didClose, didSave.

## Other Editors

See `editors/README.md` for:
- **Sublime Text** - Syntax definition in `editors/sublime/`
- **Vim/Neovim** - Syntax file and configuration
- **Emacs** - Major mode configuration
