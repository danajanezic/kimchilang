const vscode = require('vscode');
const path = require('path');
const { spawn } = require('child_process');

let diagnosticCollection;

function activate(context) {
  console.log('KimchiLang extension activated');
  
  // Create diagnostic collection for showing errors
  diagnosticCollection = vscode.languages.createDiagnosticCollection('kimchi');
  context.subscriptions.push(diagnosticCollection);
  
  // Validate on document open
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(validateDocument)
  );
  
  // Validate on document save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(validateDocument)
  );
  
  // Validate on document change (with debounce)
  let timeout;
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      clearTimeout(timeout);
      timeout = setTimeout(() => validateDocument(event.document), 500);
    })
  );
  
  // Validate all open kimchi documents on activation
  vscode.workspace.textDocuments.forEach(validateDocument);
}

function deactivate() {
  if (diagnosticCollection) {
    diagnosticCollection.dispose();
  }
}

async function validateDocument(document) {
  // Only validate kimchi files
  if (!isKimchiFile(document)) {
    return;
  }
  
  const text = document.getText();
  const uri = document.uri;
  
  try {
    const errors = await runKimchiCheck(text, document.fileName);
    const diagnostics = errors.map(error => createDiagnostic(error, document));
    diagnosticCollection.set(uri, diagnostics);
  } catch (err) {
    console.error('KimchiLang validation error:', err);
  }
}

function isKimchiFile(document) {
  const ext = path.extname(document.fileName);
  return ['.km', '.kimchi', '.kc', '.static'].includes(ext);
}

async function runKimchiCheck(source, filePath) {
  return new Promise((resolve) => {
    // Try to find kimchi CLI
    const kimchiPath = findKimchiCli(filePath);
    
    if (!kimchiPath) {
      // Fall back to inline validation
      resolve(validateInline(source, filePath));
      return;
    }
    
    // Write source to a temp file for the check command
    const fs = require('fs');
    const os = require('os');
    const tempFile = path.join(os.tmpdir(), `kimchi_check_${Date.now()}.km`);
    
    try {
      fs.writeFileSync(tempFile, source);
    } catch (err) {
      resolve(validateInline(source, filePath));
      return;
    }
    
    // Run: node src/cli.js check <tempfile>
    const proc = spawn('node', [kimchiPath, 'check', tempFile], {
      cwd: path.dirname(kimchiPath).replace(/\/src$/, ''),
      env: { ...process.env },
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      // Clean up temp file
      try { fs.unlinkSync(tempFile); } catch {}
      
      const output = stdout + stderr;
      if (output) {
        try {
          const result = JSON.parse(output);
          resolve(result.errors || result || []);
        } catch {
          resolve(parseErrorOutput(output));
        }
      } else {
        resolve([]);
      }
    });
    
    proc.on('error', () => {
      try { fs.unlinkSync(tempFile); } catch {}
      resolve(validateInline(source, filePath));
    });
  });
}

function findKimchiCli(filePath) {
  const fs = require('fs');
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  
  if (workspaceFolder) {
    const wsPath = workspaceFolder.uri.fsPath;
    
    // Try src/cli.js (KimchiLang project structure)
    const srcCli = path.join(wsPath, 'src', 'cli.js');
    if (fs.existsSync(srcCli)) {
      return srcCli;
    }
    
    // Try node_modules/.bin/kimchi
    const localKimchi = path.join(wsPath, 'node_modules', '.bin', 'kimchi');
    if (fs.existsSync(localKimchi)) {
      return localKimchi;
    }
  }
  
  // Try global kimchi
  return null;
}

function validateInline(source, filePath) {
  const errors = [];
  
  // Try to import the compiler modules
  try {
    // Look for the compiler in the workspace
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    let compilerPath;
    
    if (workspaceFolder) {
      compilerPath = path.join(workspaceFolder.uri.fsPath, 'src', 'index.js');
    }
    
    // This is a simplified inline check - parse errors only
    // For full validation, the CLI should be used
    const lines = source.split('\n');
    
    // Check for common syntax issues
    let braceCount = 0;
    let bracketCount = 0;
    let parenCount = 0;
    let inString = false;
    let stringChar = '';
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      
      for (let col = 0; col < line.length; col++) {
        const char = line[col];
        const prevChar = col > 0 ? line[col - 1] : '';
        
        // Track string state
        if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
          if (!inString) {
            inString = true;
            stringChar = char;
          } else if (char === stringChar) {
            inString = false;
            stringChar = '';
          }
        }
        
        if (!inString) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
          if (char === '[') bracketCount++;
          if (char === ']') bracketCount--;
          if (char === '(') parenCount++;
          if (char === ')') parenCount--;
          
          // Check for unbalanced closing
          if (braceCount < 0) {
            errors.push({
              line: lineNum + 1,
              column: col + 1,
              message: 'Unexpected closing brace }',
            });
            braceCount = 0;
          }
          if (bracketCount < 0) {
            errors.push({
              line: lineNum + 1,
              column: col + 1,
              message: 'Unexpected closing bracket ]',
            });
            bracketCount = 0;
          }
          if (parenCount < 0) {
            errors.push({
              line: lineNum + 1,
              column: col + 1,
              message: 'Unexpected closing parenthesis )',
            });
            parenCount = 0;
          }
        }
      }
      
      // Check for unclosed string on line
      if (inString && stringChar !== '`') {
        errors.push({
          line: lineNum + 1,
          column: line.length,
          message: `Unclosed string literal`,
        });
        inString = false;
        stringChar = '';
      }
    }
    
    // Check for unclosed braces at end
    if (braceCount > 0) {
      errors.push({
        line: lines.length,
        column: 1,
        message: `Unclosed brace: ${braceCount} opening { without matching }`,
      });
    }
    if (bracketCount > 0) {
      errors.push({
        line: lines.length,
        column: 1,
        message: `Unclosed bracket: ${bracketCount} opening [ without matching ]`,
      });
    }
    if (parenCount > 0) {
      errors.push({
        line: lines.length,
        column: 1,
        message: `Unclosed parenthesis: ${parenCount} opening ( without matching )`,
      });
    }
    
  } catch (err) {
    // Ignore import errors
  }
  
  return errors;
}

function parseErrorOutput(output) {
  const errors = [];
  
  if (!output) return errors;
  
  // Parse error messages in various formats
  // Format 1: "Error at line:column: message"
  // Format 2: "Parse Error at line:column: message"
  // Format 3: "Type Error: message"
  // Format 4: "Lint Error [rule]: message"
  
  const patterns = [
    /(?:Parse |Lexer |Type |Compile |Lint )?Error(?: \[[\w-]+\])? at (\d+):(\d+):\s*(.+)/gi,
    /(\d+):(\d+):\s*(?:error|Error):\s*(.+)/gi,
    /line (\d+)(?:, column (\d+))?:\s*(.+)/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      errors.push({
        line: parseInt(match[1], 10),
        column: parseInt(match[2], 10) || 1,
        message: match[3].trim(),
      });
    }
  }
  
  // If no structured errors found, treat the whole output as an error
  if (errors.length === 0 && output.trim()) {
    const lines = output.trim().split('\n');
    for (const line of lines) {
      if (line.includes('Error') || line.includes('error')) {
        errors.push({
          line: 1,
          column: 1,
          message: line.trim(),
        });
      }
    }
  }
  
  return errors;
}

function createDiagnostic(error, document) {
  const line = Math.max(0, (error.line || 1) - 1);
  const column = Math.max(0, (error.column || 1) - 1);
  
  // Get the line text to determine range
  let endColumn = column;
  try {
    const lineText = document.lineAt(line).text;
    // Highlight to end of word or rest of line
    const restOfLine = lineText.substring(column);
    const wordMatch = restOfLine.match(/^\w+/);
    if (wordMatch) {
      endColumn = column + wordMatch[0].length;
    } else {
      endColumn = Math.min(column + 10, lineText.length);
    }
  } catch {
    endColumn = column + 1;
  }
  
  const range = new vscode.Range(line, column, line, endColumn);
  
  const severity = error.severity === 'warning' 
    ? vscode.DiagnosticSeverity.Warning 
    : vscode.DiagnosticSeverity.Error;
  
  const diagnostic = new vscode.Diagnostic(range, error.message, severity);
  diagnostic.source = 'kimchi';
  
  return diagnostic;
}

module.exports = {
  activate,
  deactivate,
};
