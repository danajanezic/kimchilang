// KimchiLang LSP Server — JSON-RPC 2.0 over stdio

import { KimchiValidator } from './validator.js';

const validator = new KimchiValidator();
const documents = new Map(); // uri -> { text, version }

/**
 * Parse a JSON-RPC message from Content-Length framed input.
 * Returns { message, rest } where message is the parsed JSON object
 * and rest is the remaining buffer, or null if incomplete.
 */
export function parseMessage(buffer) {
  const headerEnd = buffer.indexOf('\r\n\r\n');
  if (headerEnd === -1) return null;

  const header = buffer.slice(0, headerEnd);
  const match = header.match(/Content-Length:\s*(\d+)/i);
  if (!match) return null;

  const contentLength = parseInt(match[1], 10);
  const contentStart = headerEnd + 4;

  if (buffer.length < contentStart + contentLength) return null;

  const content = buffer.slice(contentStart, contentStart + contentLength);
  const rest = buffer.slice(contentStart + contentLength);

  return { message: JSON.parse(content), rest };
}

/**
 * Serialize a JSON-RPC message with Content-Length header framing.
 */
export function serializeMessage(obj) {
  const body = JSON.stringify(obj);
  return `Content-Length: ${Buffer.byteLength(body, 'utf-8')}\r\n\r\n${body}`;
}

/**
 * Convert validator diagnostics to LSP diagnostics.
 * Validator uses 1-based lines; LSP uses 0-based.
 */
function toLspDiagnostics(diagnostics, lineOffset = 0) {
  return diagnostics.map(d => {
    const line = (d.line || 1) - 1 + lineOffset;
    const character = (d.column || 1) - 1;
    let severity;
    switch (d.severity) {
      case 'error': severity = 1; break;
      case 'warning': severity = 2; break;
      case 'info': severity = 3; break;
      default: severity = 4; break;
    }
    return {
      range: {
        start: { line, character },
        end: { line, character },
      },
      severity,
      message: d.message,
      source: d.source || 'kimchi',
    };
  });
}

/**
 * For .sp files, extract the code from ## test and ## impl sections,
 * stripping the spec section, HTML comments, and code fences.
 * Returns { code, lineOffset } where lineOffset is the number of lines
 * before the code starts in the original file (for mapping diagnostics back).
 */
function extractSpCode(text) {
  const testMatch = text.match(/^## test\s*$/m);
  if (!testMatch) return null;

  const codeStart = testMatch.index;
  const lineOffset = text.slice(0, codeStart).split('\n').length - 1;

  let code = text.slice(codeStart);
  // Strip section headings, HTML comments, code fences, markdown comments
  code = code
    .replace(/^## (test|impl)\s*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^```\w*\s*$/gm, '')
    .replace(/^# .+$/gm, (m) => '//' + m.slice(1))
    .trim();

  return { code, lineOffset };
}

/**
 * Publish diagnostics for a given document URI.
 */
function publishDiagnostics(uri, text) {
  const isSp = uri.endsWith('.sp');
  let result;
  let lineOffset = 0;

  if (isSp) {
    const extracted = extractSpCode(text);
    if (!extracted || !extracted.code) {
      // No code sections yet — clear diagnostics
      return {
        jsonrpc: '2.0',
        method: 'textDocument/publishDiagnostics',
        params: { uri, diagnostics: [] },
      };
    }
    result = validator.validate(extracted.code);
    lineOffset = extracted.lineOffset;
  } else {
    result = validator.validate(text);
  }

  const diagnostics = toLspDiagnostics(result.diagnostics, lineOffset);
  return {
    jsonrpc: '2.0',
    method: 'textDocument/publishDiagnostics',
    params: { uri, diagnostics },
  };
}

/**
 * Handle a single JSON-RPC message.
 * Returns a response object, a notification object, or null.
 */
export function handleMessage(msg) {
  const method = msg.method;

  // Requests (have an id)
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        capabilities: {
          textDocumentSync: 1,
        },
      },
    };
  }

  if (method === 'shutdown') {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: null,
    };
  }

  // Notifications (no id expected back)
  if (method === 'initialized') {
    return null;
  }

  if (method === 'exit') {
    process.exit(0);
  }

  if (method === 'textDocument/didOpen') {
    const { uri, text, version } = msg.params.textDocument;
    documents.set(uri, { text, version });
    return publishDiagnostics(uri, text);
  }

  if (method === 'textDocument/didChange') {
    const { uri, version } = msg.params.textDocument;
    // Full sync: last contentChanges entry has the full text
    const changes = msg.params.contentChanges;
    const text = changes[changes.length - 1].text;
    documents.set(uri, { text, version });
    return publishDiagnostics(uri, text);
  }

  if (method === 'textDocument/didClose') {
    const { uri } = msg.params.textDocument;
    documents.delete(uri);
    // Clear diagnostics by publishing empty array
    return {
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: { uri, diagnostics: [] },
    };
  }

  if (method === 'textDocument/didSave') {
    const { uri } = msg.params.textDocument;
    const doc = documents.get(uri);
    if (doc) {
      return publishDiagnostics(uri, doc.text);
    }
    return null;
  }

  // Unknown method with id -> return method not found
  if (msg.id !== undefined) {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: 'Method not found' },
    };
  }

  return null;
}

/**
 * Start the LSP server, reading JSON-RPC from stdin and writing to stdout.
 */
export function startServer() {
  let buffer = '';

  process.stdin.setEncoding('utf-8');

  process.stdin.on('data', (chunk) => {
    buffer += chunk;

    let parsed;
    while ((parsed = parseMessage(buffer)) !== null) {
      buffer = parsed.rest;
      const response = handleMessage(parsed.message);
      if (response) {
        process.stdout.write(serializeMessage(response));
      }
    }
  });

  process.stdin.on('end', () => {
    process.exit(0);
  });
}

// Auto-start when run directly
if (process.argv[1] && process.argv[1].endsWith('lsp.js')) {
  startServer();
}
