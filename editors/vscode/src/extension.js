const { LanguageClient, TransportKind } = require('vscode-languageclient/node');
const path = require('path');
const fs = require('fs');
const vscode = require('vscode');

let client;

function activate(context) {
  const serverCommand = findServerCommand(context);
  if (!serverCommand) {
    vscode.window.showWarningMessage(
      'KimchiLang: Could not find kimchi CLI. Install with npm link in the kimchilang directory.'
    );
    return;
  }

  const serverOptions = {
    command: serverCommand.command,
    args: serverCommand.args,
    transport: TransportKind.stdio,
  };

  const clientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'kimchi' },
    ],
  };

  client = new LanguageClient(
    'kimchilang',
    'KimchiLang Language Server',
    serverOptions,
    clientOptions
  );

  client.start();
}

function deactivate() {
  if (client) {
    return client.stop();
  }
}

function findServerCommand(context) {
  // Check user setting
  const config = vscode.workspace.getConfiguration('kimchi');
  const customPath = config.get('lspPath');
  if (customPath && fs.existsSync(customPath)) {
    return { command: customPath, args: ['lsp'] };
  }

  // Check workspace for src/cli.js
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      const cliPath = path.join(folder.uri.fsPath, 'src', 'cli.js');
      if (fs.existsSync(cliPath)) {
        return { command: 'node', args: [cliPath, 'lsp'] };
      }
    }
  }

  // Try global kimchi command
  return { command: 'kimchi', args: ['lsp'] };
}

module.exports = { activate, deactivate };
