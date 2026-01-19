// KimchiLang stdlib extensions
if (!Array.prototype._kmExtended) {
  Array.prototype._kmExtended = true;
  Array.prototype.first = function() { return this[0]; };
  Array.prototype.last = function() { return this[this.length - 1]; };
  Array.prototype.isEmpty = function() { return this.length === 0; };
  Array.prototype.sum = function() { return this.reduce((a, b) => a + b, 0); };
  Array.prototype.product = function() { return this.reduce((a, b) => a * b, 1); };
  Array.prototype.average = function() { return this.reduce((a, b) => a + b, 0) / this.length; };
  Array.prototype.max = function() { return Math.max(...this); };
  Array.prototype.min = function() { return Math.min(...this); };
  Array.prototype.take = function(n) { return this.slice(0, n); };
  Array.prototype.drop = function(n) { return this.slice(n); };
  Array.prototype.flatten = function() { return this.flat(Infinity); };
  Array.prototype.unique = function() { return [...new Set(this)]; };
}
if (!String.prototype._kmExtended) {
  String.prototype._kmExtended = true;
  String.prototype.isEmpty = function() { return this.length === 0; };
  String.prototype.isBlank = function() { return this.trim().length === 0; };
  String.prototype.toChars = function() { return this.split(""); };
  String.prototype.toLines = function() { return this.split("\n"); };
  String.prototype.capitalize = function() { return this.length === 0 ? this : this[0].toUpperCase() + this.slice(1); };
}
const _obj = {
  keys: (o) => Object.keys(o),
  values: (o) => Object.values(o),
  entries: (o) => Object.entries(o),
  fromEntries: (arr) => Object.fromEntries(arr),
  has: (o, k) => Object.hasOwn(o, k),
  freeze: (o) => Object.freeze(o),
  isEmpty: (o) => Object.keys(o).length === 0,
  size: (o) => Object.keys(o).length,
};

function error(message, name = "Error") {
  const e = new Error(message);
  e.name = name;
  return e;
}
error.create = (name) => {
  const fn = (message) => error(message, name);
  Object.defineProperty(fn, "name", { value: name, writable: false });
  return fn;
};

class _Secret {
  constructor(value) { this._value = value; }
  toString() { return "********"; }
  valueOf() { return this._value; }
  get value() { return this._value; }
  [Symbol.toPrimitive](hint) { return hint === "string" ? "********" : this._value; }
}
function _secret(value) { return new _Secret(value); }

function _deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  Object.keys(obj).forEach(key => _deepFreeze(obj[key]));
  return Object.freeze(obj);
}

async function _shell(command, inputs = {}) {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  // Interpolate inputs into command
  let cmd = command;
  for (const [key, value] of Object.entries(inputs)) {
    cmd = cmd.replace(new RegExp("\\$" + key + "\\b", "g"), String(value));
  }
  try {
    const { stdout, stderr } = await execAsync(cmd);
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (error) {
    return { stdout: error.stdout?.trim() || "", stderr: error.stderr?.trim() || error.message, exitCode: error.code || 1 };
  }
}

// Testing framework
const _tests = [];
let _currentDescribe = null;
function _describe(name, fn) {
  const prev = _currentDescribe;
  _currentDescribe = { name, tests: [], parent: prev };
  fn();
  if (prev) { prev.tests.push(_currentDescribe); }
  else { _tests.push(_currentDescribe); }
  _currentDescribe = prev;
}
function _test(name, fn) {
  const test = { name, fn, describe: _currentDescribe };
  if (_currentDescribe) { _currentDescribe.tests.push(test); }
  else { _tests.push(test); }
}
function _expect(actual) {
  return {
    toBe(expected) { if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`); },
    toEqual(expected) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)} to equal ${JSON.stringify(actual)}`); },
    toContain(item) { if (!actual.includes(item)) throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`); },
    toBeNull() { if (actual !== null) throw new Error(`Expected null but got ${JSON.stringify(actual)}`); },
    toBeTruthy() { if (!actual) throw new Error(`Expected truthy but got ${JSON.stringify(actual)}`); },
    toBeFalsy() { if (actual) throw new Error(`Expected falsy but got ${JSON.stringify(actual)}`); },
    toBeGreaterThan(n) { if (actual <= n) throw new Error(`Expected ${actual} > ${n}`); },
    toBeLessThan(n) { if (actual >= n) throw new Error(`Expected ${actual} < ${n}`); },
    toHaveLength(n) { if (actual.length !== n) throw new Error(`Expected length ${n} but got ${actual.length}`); },
    toMatch(pattern) { if (!pattern.test(actual)) throw new Error(`Expected ${JSON.stringify(actual)} to match ${pattern}`); },
    toThrow(msg) { try { actual(); throw new Error("Expected to throw"); } catch(e) { if (msg && !e.message.includes(msg)) throw new Error(`Expected error containing "${msg}" but got "${e.message}"`); } },
  };
}
function _assert(condition, message) { if (!condition) throw new Error(message); }
async function _runTests() {
  let passed = 0, failed = 0;
  async function runItem(item, indent = "") {
    if (item.fn) {
      try { await item.fn(); console.log(indent + "✓ " + item.name); passed++; }
      catch (e) { console.log(indent + "✗ " + item.name); console.log(indent + "  " + e.message); failed++; }
    } else {
      console.log(indent + item.name);
      for (const t of item.tests) await runItem(t, indent + "  ");
    }
  }
  for (const item of _tests) await runItem(item);
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

export default function(_opts = {}) {
  async function listFiles() {
    const result = _deepFreeze(await _shell("ls -la"));
    console.log(result?.stdout);
  }
  
  async function getDate() {
    const result = _deepFreeze(await _shell("date"));
    return result?.stdout;
  }
  
  async function findFiles(pattern) {
    const result = _deepFreeze(await _shell("find . -name \"$pattern\"", { pattern }));
    return result?.stdout;
  }
  
  listFiles();
}
