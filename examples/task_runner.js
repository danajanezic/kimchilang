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

function error(message, _id = "Error") {
  const e = new Error(message);
  e._id = _id;
  return e;
}
error.create = (_id) => {
  const fn = (message) => error(message, _id);
  fn._id = _id;
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

function _pipe(value, ...fns) {
  let result = value;
  for (let i = 0; i < fns.length; i++) {
    if (result && typeof result.then === "function") { return result.then(async r => { let v = r; for (let j = i; j < fns.length; j++) { v = await fns[j](v); } return v; }); }
    result = fns[i](result);
  }
  return result;
}

function _flow(...fns) {
  const composed = (...args) => {
    let result = fns[0](...args);
    for (let i = 1; i < fns.length; i++) {
      if (result && typeof result.then === "function") { return result.then(async r => { let v = r; for (let j = i; j < fns.length; j++) { v = await fns[j](v); } return v; }); }
      result = fns[i](result);
    }
    return result;
  };
  return composed;
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
let _hasOnly = false;
function _beforeAll(fn) { if (_currentDescribe) { _currentDescribe.beforeAll = _currentDescribe.beforeAll || []; _currentDescribe.beforeAll.push(fn); } }
function _afterAll(fn) { if (_currentDescribe) { _currentDescribe.afterAll = _currentDescribe.afterAll || []; _currentDescribe.afterAll.push(fn); } }
function _beforeEach(fn) { if (_currentDescribe) { _currentDescribe.beforeEach = _currentDescribe.beforeEach || []; _currentDescribe.beforeEach.push(fn); } }
function _afterEach(fn) { if (_currentDescribe) { _currentDescribe.afterEach = _currentDescribe.afterEach || []; _currentDescribe.afterEach.push(fn); } }
function _describe(name, fn, modifier = null) {
  const prev = _currentDescribe;
  _currentDescribe = { name, tests: [], parent: prev, modifier };
  if (modifier === "only") _hasOnly = true;
  fn();
  if (prev) { prev.tests.push(_currentDescribe); }
  else { _tests.push(_currentDescribe); }
  _currentDescribe = prev;
}
function _test(name, fn, modifier = null) {
  if (modifier === "only") _hasOnly = true;
  const test = { name, fn, describe: _currentDescribe, modifier };
  if (_currentDescribe) { _currentDescribe.tests.push(test); }
  else { _tests.push(test); }
}
function _expect(actual) {
  const matchers = {
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
    toBeDefined() { if (actual === undefined) throw new Error(`Expected value to be defined but got undefined`); },
    toBeUndefined() { if (actual !== undefined) throw new Error(`Expected undefined but got ${JSON.stringify(actual)}`); },
    toBeCloseTo(num, digits = 2) { const precision = Math.pow(10, -digits) / 2; if (Math.abs(actual - num) >= precision) throw new Error(`Expected ${actual} to be close to ${num} (precision: ${digits} digits)`); },
    toBeInstanceOf(type) { if (actual?._id !== type?._id) throw new Error(`Expected instance of ${type?._id || type} but got ${actual?._id || actual}`); },
  };
  const notMatchers = {};
  for (const [name, fn] of Object.entries(matchers)) {
    notMatchers[name] = (...args) => {
      let threw = false;
      try { fn(...args); } catch(e) { threw = true; }
      if (!threw) throw new Error(`Expected not.${name} to fail but it passed`);
    };
  }
  Object.defineProperty(matchers, "not", { get() { return notMatchers; } });
  return matchers;
}
function _assert(condition, message) { if (!condition) throw new Error(message); }
async function _runTests() {
  let passed = 0, failed = 0, skipped = 0;
  function shouldSkip(item, parentSkipped) {
    if (item.modifier === "skip" || parentSkipped) return true;
    if (_hasOnly && item.modifier !== "only") {
      if (item.tests) { return !hasOnly(item); }
      return true;
    }
    return false;
  }
  function hasOnly(item) {
    if (item.modifier === "only") return true;
    if (item.tests) return item.tests.some(t => hasOnly(t));
    return false;
  }
  async function runItem(item, indent = "", parentSkipped = false) {
    const skip = shouldSkip(item, parentSkipped);
    if (item.fn) {
      if (skip) { console.log(indent + "○ " + item.name + " (skipped)"); skipped++; return; }
      try { await item.fn(); console.log(indent + "✓ " + item.name); passed++; }
      catch (e) { console.log(indent + "✗ " + item.name); console.log(indent + "  " + e.message); failed++; }
    } else {
      console.log(indent + item.name);
      const childSkipped = skip || item.modifier === "skip";
      if (!childSkipped && item.beforeAll) { for (const h of item.beforeAll) await h(); }
      for (const t of item.tests) {
        if (!childSkipped && t.fn && !shouldSkip(t, childSkipped)) {
          if (item.beforeEach) { for (const h of item.beforeEach) await h(); }
        }
        await runItem(t, indent + "  ", childSkipped);
        if (!childSkipped && t.fn && !shouldSkip(t, childSkipped)) {
          if (item.afterEach) { for (const h of item.afterEach) await h(); }
        }
      }
      if (!childSkipped && item.afterAll) { for (const h of item.afterAll) await h(); }
    }
  }
  for (const item of _tests) await runItem(item);
  const total = passed + failed + skipped;
  const parts = [`${total} tests`, `${passed} passed`, `${failed} failed`];
  if (skipped > 0) parts.push(`${skipped} skipped`);
  console.log("\n" + parts.join(", "));
  return { passed, failed, skipped };
}

export default async function(_opts = {}) {
  const tasks = _deepFreeze([{ name: "lint", status: "pending", priority: 3, runner: "eslint", timeout: null }, { name: "typecheck", status: "pending", priority: 2, runner: "tsc", timeout: 30 }, { name: "test", status: "pending", priority: 1, runner: "jest", timeout: 60 }, { name: "build", status: "pending", priority: 1, runner: null, timeout: 120 }, { name: "deploy", status: "skipped", priority: 4, runner: "rsync", timeout: 300 }]);
  const TaskError = _deepFreeze(error?.create("TaskError"));
  const ValidationError = _deepFreeze(error?.create("ValidationError"));
  function validateTask(task) {
    if (!((task !== null))) {
      throw ValidationError("Task is null");
    }
    if (!((task?.name !== null))) {
      throw ValidationError("Task missing name");
    }
    if (!((task?.status !== null))) {
      throw ValidationError("Task missing status");
    }
    return task;
  }
  
  function getTimeoutLabel(task) {
    const seconds = _deepFreeze((task?.timeout ?? 30));
    return (() => {
      const _subject = seconds;
      if ((() => { const n = _subject; return (n <= 10); })()) {
        const n = _subject;
        return "fast";
      } else if ((() => { const n = _subject; return (n <= 60); })()) {
        const n = _subject;
        return "normal";
      } else if ((() => { const n = _subject; return (n > 60); })()) {
        const n = _subject;
        return "slow";
      } else {
        return "unknown";
      }
    })();
  }
  
  function describeTask(task) {
    const runner = _deepFreeze((task?.runner ?? "default"));
    const timeout = _deepFreeze((task?.timeout ?? 30));
    const speed = _deepFreeze(getTimeoutLabel(task));
    const urgent = _deepFreeze((((task?.priority === 1)) ? "URGENT" : ""));
    return { name: task?.name, runner, timeout, speed, urgent, status: task?.status };
  }
  
  function shouldRun(task) {
    return (() => {
      const _subject = task?.status;
      if (_subject === "pending") {
        return true;
      } else if (_subject === "failed") {
        return true;
      } else {
        return false;
      }
    })();
  }
  
  function runTask(task) {
    const described = _deepFreeze(describeTask(task));
    const prefix = _deepFreeze((((described?.urgent !== "")) ? `[${described?.urgent}]` : "[  ]"));
    console.log(`${prefix} Running ${described?.name} (${described?.runner}, ${described?.speed})`);
    return (() => {
      const _subject = task;
      if (_subject?.runner === null && 'name' in (_subject || {})) {
        const name = _subject.name;
        console.log(`  WARNING: no runner for '${name}', using fallback`);
        return { ...described, status: "done", note: "used fallback runner" };
      } else if (_subject?.priority === 1) {
        console.log("  Priority task — running with extra checks");
        return { ...described, status: "done", note: "priority run" };
      } else {
        return { ...described, status: "done", note: null };
      }
    })();
  }
  
  function main() {
    console.log("=== Task Runner ===");
    console.log("");
    const validated = _deepFreeze(tasks?.map(t => validateTask(t)));
    const runnable = _deepFreeze(validated?.filter(t => shouldRun(t)));
    console.log(`Tasks to run: ${runnable?.length} of ${tasks?.length}`);
    console.log("");
    let results = [];
    let passed = 0;
    let failed = 0;
    for (const task of runnable) {
      try {
        const result = _deepFreeze(runTask(task));
        results = [...results, result];
        passed = (passed + 1);
      } catch (e) {
        console.log(`  FAILED: ${e?.message}`);
        failed = (failed + 1);
        results = [...results, { name: task?.name, status: "failed" }];
      }
    }
    console.log("");
    console.log("=== Results ===");
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log("");
    for (const result of results) {
      const note = _deepFreeze((result?.note ?? "no notes"));
      const marker = _deepFreeze((((result?.status === "done")) ? "*" : "x"));
      console.log(`  [${marker}] ${result?.name}: ${note}`);
    }
    console.log("");
    const allPassed = _deepFreeze((((failed === 0)) ? "ALL TASKS PASSED" : "SOME TASKS FAILED"));
    console.log(allPassed);
  }
  
  main();
}
