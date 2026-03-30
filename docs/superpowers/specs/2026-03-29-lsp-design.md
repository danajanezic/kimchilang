# KimchiLang LSP — Design Spec

A programmatic validation core (`KimchiValidator`) with an LSP server wrapper. Usable by both editors and LLMs (specscript generator).

## Feature 1: KimchiValidator — The Core

### API

```javascript
import { KimchiValidator } from './src/validator.js';

const validator = new KimchiValidator();

// Single file
const result = validator.validate(source);
// {
//   diagnostics: [{
//     line: 5,
//     column: 12,
//     endLine: 5,        // optional
//     endColumn: 20,     // optional
//     severity: "error" | "warning" | "info",
//     message: "Cannot reassign 'x': variable is deeply immutable",
//     source: "kimchi-typechecker",
//     code: "immutable-reassign",  // optional
//   }],
//   success: boolean,  // true if no errors (warnings OK)
// }

// Multiple files (cross-module type checking)
const results = validator.validateAll(files);
// files: Map<filePath, source>
// Returns: Map<filePath, { diagnostics, success }>
```

### Implementation

Wraps the existing compiler pipeline: lexer, parser, type checker, linter. Catches thrown errors and collects linter messages. Normalizes into the diagnostics format above.

`validateAll` does a two-pass compile: pass 1 registers module types from all files (skipLint), pass 2 validates each file fully with type checker and linter.

### Source Phase Values

- `"kimchi-lexer"` — tokenization errors
- `"kimchi-parser"` — syntax errors
- `"kimchi-typechecker"` — type errors
- `"kimchi-linter"` — code quality warnings

---

## Feature 2: LSP Server

Thin adapter (~200-300 lines) that speaks LSP protocol over stdio, delegating to `KimchiValidator`. Zero dependencies — JSON-RPC 2.0 framing implemented manually (Content-Length headers over stdin/stdout).

### LSP Methods

| Method | Behavior |
|--------|----------|
| `initialize` | Return capabilities: `textDocumentSync: 1` (full sync) |
| `initialized` | No-op |
| `textDocument/didOpen` | Validate, publish diagnostics |
| `textDocument/didChange` | Validate (debounced 300ms), publish diagnostics |
| `textDocument/didClose` | Clear diagnostics |
| `textDocument/didSave` | Validate, publish diagnostics |
| `shutdown` | Clean up |
| `exit` | `process.exit()` |

### Not Implemented (v1)

Go-to-definition, hover, completion, formatting, rename, references. The server is extensible for these later.

### Document Sync

Full document sync — client sends entire file on every change. Debounced at 300ms.

### Launch

`kimchi lsp` or `node src/lsp.js` — spawned by editors as a child process.

---

## Feature 3: Specscript Integration

Replace `tryTranspile` and `tryTranspileAll` in `specscript/src/llm.js` with `KimchiValidator`.

### Before

```javascript
const result = tryTranspile(generatedContent);
// { success: boolean, error: string }
```

### After

```javascript
const validator = new KimchiValidator();
const result = validator.validate(cleanCode);
// { success: boolean, diagnostics: [...] }
```

Structured diagnostics give LLMs multiple errors per pass, severity levels, and source phase info. `validateAll` used in multi-file regen flow.

`tryTranspile` and `tryTranspileAll` are removed — `KimchiValidator` replaces them. A `formatDiagnostics(diagnostics)` helper formats the diagnostics array into a human/LLM-readable string for `buildTranspileFixPrompt`.

---

## Feature 4: VS Code Extension Update

Replace CLI-based diagnostics with standard LSP client.

Extension spawns `kimchi lsp` once on activation, communicates over stdio. Uses `vscode-languageclient` npm package (dev dependency of the extension, not of KimchiLang).

Extension.js shrinks to ~30 lines. Document selectors for `.km`, `.kimchi`, `.kc`.

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `src/validator.js` | `KimchiValidator` class |
| `src/lsp.js` | LSP server |

### Modified Files

| File | Change |
|------|--------|
| `src/cli.js` | Add `lsp` subcommand |
| `specscript/src/llm.js` | Replace tryTranspile/tryTranspileAll with KimchiValidator |
| `editors/vscode/src/extension.js` | Replace CLI diagnostics with LSP client |
| `editors/vscode/package.json` | Add vscode-languageclient, declare LSP server |

### Unchanged

All compiler files (lexer, parser, typechecker, linter, generator, index). `kimchi check` CLI command still works.
