# KimchiLang VS Code Extension

Syntax highlighting and language support for KimchiLang.

## Features

- Syntax highlighting for `.km`, `.kimchi`, and `.kc` files
- Bracket matching and auto-closing
- Comment toggling (line comments with `//`)
- Code folding

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
