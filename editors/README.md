# KimchiLang Editor Support

Syntax highlighting packages for various editors.

## VS Code / Windsurf

The `vscode/` folder contains a VS Code extension that provides:
- Syntax highlighting for `.km`, `.kimchi`, `.kc` files
- Bracket matching and auto-closing
- Comment toggling

### Installation

**Option 1: Copy to extensions folder**
```bash
cp -r editors/vscode ~/.vscode/extensions/kimchilang
# or for Windsurf:
cp -r editors/vscode ~/.windsurf/extensions/kimchilang
```

**Option 2: Package as VSIX**
```bash
cd editors/vscode
npm install -g @vscode/vsce
vsce package
# Then install the .vsix file in VS Code/Windsurf
```

## Sublime Text

The `sublime/` folder contains a Sublime Text syntax definition.

### Installation

Copy `KimchiLang.sublime-syntax` to your Sublime Text packages folder:
- **macOS**: `~/Library/Application Support/Sublime Text/Packages/User/`
- **Linux**: `~/.config/sublime-text/Packages/User/`
- **Windows**: `%APPDATA%\Sublime Text\Packages\User\`

## Vim/Neovim

Create `~/.vim/syntax/kimchi.vim` or `~/.config/nvim/syntax/kimchi.vim`:

```vim
" KimchiLang syntax file
if exists("b:current_syntax")
  finish
endif

" Keywords
syn keyword kimchiKeyword fn dec as dep arg expose
syn keyword kimchiControl if else for while return try catch throw in await async
syn keyword kimchiBuiltin print new
syn keyword kimchiBoolean true false
syn keyword kimchiNull null undefined

" Strings
syn region kimchiString start=/"/ skip=/\\"/ end=/"/
syn region kimchiString start=/'/ skip=/\\'/ end=/'/

" Numbers
syn match kimchiNumber "\<\d\+\>"
syn match kimchiNumber "\<\d\+\.\d\+\>"
syn match kimchiNumber "\<0x[0-9a-fA-F]\+\>"

" Comments
syn match kimchiComment "//.*$"
syn region kimchiComment start="/\*" end="\*/"

" Operators
syn match kimchiOperator "=>"
syn match kimchiOperator "|>"
syn match kimchiOperator "\.\."
syn match kimchiOperator "\.\.\."

" Pattern matching
syn region kimchiPattern start="|" end="|" contains=kimchiString,kimchiNumber,kimchiBoolean

" Highlighting
hi def link kimchiKeyword Keyword
hi def link kimchiControl Conditional
hi def link kimchiBuiltin Function
hi def link kimchiBoolean Boolean
hi def link kimchiNull Constant
hi def link kimchiString String
hi def link kimchiNumber Number
hi def link kimchiComment Comment
hi def link kimchiOperator Operator
hi def link kimchiPattern Special

let b:current_syntax = "kimchi"
```

Add to `~/.vimrc` or `~/.config/nvim/init.vim`:
```vim
au BufRead,BufNewFile *.km,*.kimchi,*.kc set filetype=kimchi
```

## Emacs

Add to your Emacs config:

```elisp
(define-derived-mode kimchi-mode prog-mode "Kimchi"
  "Major mode for editing KimchiLang files."
  (setq-local comment-start "// ")
  (setq-local comment-end "")
  
  (setq font-lock-defaults
        '((("\\<\\(fn\\|dec\\|as\\|dep\\|arg\\|expose\\)\\>" . font-lock-keyword-face)
           ("\\<\\(if\\|else\\|for\\|while\\|return\\|try\\|catch\\|throw\\|in\\)\\>" . font-lock-keyword-face)
           ("\\<\\(true\\|false\\|null\\|undefined\\)\\>" . font-lock-constant-face)
           ("\\<\\(print\\|new\\)\\>" . font-lock-builtin-face)
           ("\"[^\"]*\"" . font-lock-string-face)
           ("//.*$" . font-lock-comment-face)
           ("\\<[0-9]+\\>" . font-lock-constant-face)))))

(add-to-list 'auto-mode-alist '("\\.km\\'" . kimchi-mode))
(add-to-list 'auto-mode-alist '("\\.kimchi\\'" . kimchi-mode))
(add-to-list 'auto-mode-alist '("\\.kc\\'" . kimchi-mode))
```
