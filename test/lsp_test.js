import { parseMessage, serializeMessage, handleMessage } from '../src/lsp.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`);
  }
}

function assertContains(str, substr, message = '') {
  if (!str.includes(substr)) {
    throw new Error(`${message}\n  Expected string to contain: ${substr}\n  Actual: ${str}`);
  }
}

console.log('LSP Server Test Suite\n');
console.log('='.repeat(50));

// --- parseMessage tests ---
console.log('\n--- parseMessage ---\n');

test('parseMessage extracts JSON from Content-Length framed input', () => {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  const input = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
  const result = parseMessage(input);
  assertEqual(result !== null, true, 'result should not be null');
  assertEqual(result.message.method, 'initialize');
  assertEqual(result.message.id, 1);
  assertEqual(result.rest, '');
});

test('parseMessage returns null for incomplete input', () => {
  const result = parseMessage('Content-Length: 100\r\n\r\n{"partial');
  assertEqual(result, null, 'should return null for incomplete message');
});

test('parseMessage returns rest of buffer after message', () => {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'test' });
  const trailing = 'Content-Length: 5\r\n\r\n';
  const input = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}${trailing}`;
  const result = parseMessage(input);
  assertEqual(result.rest, trailing);
});

// --- serializeMessage tests ---
console.log('\n--- serializeMessage ---\n');

test('serializeMessage produces Content-Length framed output', () => {
  const obj = { jsonrpc: '2.0', id: 1, result: null };
  const output = serializeMessage(obj);
  const body = JSON.stringify(obj);
  assertContains(output, `Content-Length: ${Buffer.byteLength(body)}`);
  assertContains(output, '\r\n\r\n');
  assertContains(output, body);
});

// --- handleMessage tests ---
console.log('\n--- handleMessage ---\n');

test('handleMessage responds to initialize with capabilities', () => {
  const response = handleMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {},
  });
  assertEqual(response.id, 1);
  assertEqual(response.result.capabilities.textDocumentSync, 1);
});

test('handleMessage responds to shutdown with null result', () => {
  const response = handleMessage({
    jsonrpc: '2.0',
    id: 2,
    method: 'shutdown',
  });
  assertEqual(response.id, 2);
  assertEqual(response.result, null);
});

test('handleMessage returns null for initialized notification', () => {
  const response = handleMessage({
    jsonrpc: '2.0',
    method: 'initialized',
    params: {},
  });
  assertEqual(response, null);
});

test('handleMessage didOpen with invalid code returns diagnostics with errors', () => {
  const response = handleMessage({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        uri: 'file:///test/bad.km',
        languageId: 'kimchi',
        version: 1,
        text: 'dec = ',
      },
    },
  });
  assertEqual(response.method, 'textDocument/publishDiagnostics');
  assertEqual(response.params.uri, 'file:///test/bad.km');
  assertEqual(response.params.diagnostics.length > 0, true, 'should have diagnostics');
  assertEqual(response.params.diagnostics[0].severity, 1, 'should be error severity');
});

test('handleMessage didOpen with valid code returns diagnostics with no errors', () => {
  const response = handleMessage({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        uri: 'file:///test/good.km',
        languageId: 'kimchi',
        version: 1,
        text: 'dec x = 42\nprint x',
      },
    },
  });
  assertEqual(response.method, 'textDocument/publishDiagnostics');
  const errors = response.params.diagnostics.filter(d => d.severity === 1);
  assertEqual(errors.length, 0, 'should have no error diagnostics');
});

test('handleMessage didClose clears diagnostics', () => {
  // First open a document
  handleMessage({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        uri: 'file:///test/close.km',
        languageId: 'kimchi',
        version: 1,
        text: 'dec x = 42\nprint x',
      },
    },
  });
  // Then close it
  const response = handleMessage({
    jsonrpc: '2.0',
    method: 'textDocument/didClose',
    params: {
      textDocument: { uri: 'file:///test/close.km' },
    },
  });
  assertEqual(response.method, 'textDocument/publishDiagnostics');
  assertEqual(response.params.uri, 'file:///test/close.km');
  assertEqual(response.params.diagnostics.length, 0, 'diagnostics should be empty after close');
});

test('LSP diagnostics use 0-based line numbers', () => {
  // 'dec = ' will produce a parse error at line 1 (1-based from validator)
  const response = handleMessage({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        uri: 'file:///test/lines.km',
        languageId: 'kimchi',
        version: 1,
        text: 'dec = ',
      },
    },
  });
  const diag = response.params.diagnostics[0];
  // Validator returns line 1 (1-based), LSP should convert to 0 (0-based)
  assertEqual(diag.range.start.line, 0, 'LSP line should be 0-based (validator line 1 -> LSP line 0)');
});

console.log('\n' + '='.repeat(50));
console.log(`LSP Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
