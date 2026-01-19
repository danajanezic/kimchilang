# KimchiLang VS Code Extension

Syntax highlighting, error checking, and language support for KimchiLang.

## Features

- **Syntax highlighting** for `.km`, `.kimchi`, `.kc`, and `.static` files
- **Real-time error checking** - See compile-time errors as you type
- **Diagnostics on save** - Errors are highlighted with red squiggles
- Bracket matching and auto-closing
- Comment toggling (line comments with `//`)
- Code folding

## Error Checking

The extension provides real-time error checking for KimchiLang files:

- **Parse errors** - Syntax issues like unclosed braces, brackets, or strings
- **Type errors** - Type mismatches caught by the type checker
- **Lint errors** - Code quality issues

Errors appear as red squiggly underlines in the editor, and are listed in the Problems panel (`Ctrl+Shift+M` / `Cmd+Shift+M`).

### Configuration

You can configure error checking in VS Code settings:

- `kimchi.validateOnSave` - Validate files when saved (default: true)
- `kimchi.validateOnChange` - Validate files as you type (default: true)

## Installation

### From VSIX (Recommended)

1. Package the extension:
   ```bash
   cd editors/vscode
   npx vsce package
   ```

2. Install in VS Code:
   - Open VS Code
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type "Install from VSIX"
   - Select the generated `.vsix` file

### Manual Installation

1. Copy the `editors/vscode` folder to your VS Code extensions directory:
   - **Windows**: `%USERPROFILE%\.vscode\extensions\kimchilang`
   - **macOS**: `~/.vscode/extensions/kimchilang`
   - **Linux**: `~/.vscode/extensions/kimchilang`

2. Restart VS Code

## Syntax Highlighting

The extension highlights:

- **Keywords**: `fn`, `dec`, `if`, `else`, `for`, `while`, `return`, `try`, `catch`, `throw`
- **Storage**: `fn`, `dec`, `as`, `expose`
- **Control**: `dep`, `arg`, `print`, `new`
- **Constants**: `true`, `false`, `null`, `undefined`
- **Operators**: `=>`, `|>`, `..`, `...`, comparison, arithmetic
- **Pattern Matching**: `|condition| => { ... }`
- **Strings**: Double quotes, single quotes, template literals
- **Numbers**: Integers, floats, hex
- **Comments**: Line (`//`) and block (`/* */`)

## Example

```kimchi
// KimchiLang example
dec nums = [1, 2, 3, 4, 5]

fn double(x) {
  return x * 2
}

dec doubled = nums.map((x) => x * 2)
print "Sum: " + nums.sum()

|nums.length > 0| => {
  print "Array has items"
}
```

## License

MIT
