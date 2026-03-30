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
  console.log("Hello, KimchiLang!");
  function greet(name) {
    return (("Welcome, " + name) + "!");
  }
  
  console.log(greet("Developer"));
  const name = _deepFreeze("Alice");
  const PI = _deepFreeze(3.14159);
  const config = _deepFreeze({ api: { url: "https://api.example.com", timeout: 5000 } });
  const person = _deepFreeze({ name: "Alice", age: 30, city: "NYC" });
  const { name: personName, age } = _deepFreeze(person);
  const numbers = _deepFreeze([1, 2, 3, 4, 5]);
  const [first, second, third] = _deepFreeze(numbers);
  const internalConfig = _deepFreeze({ key: "hidden" });
  function helperFn() {
    return "internal";
  }
  
  const API_VERSION = _deepFreeze("1.0");
  function greetExposed(n) {
    return ("Hello, " + n);
  }
  
  function add(a, b) {
    return (a + b);
  }
  
  function greetDefault(n = "World") {
    return ("Hello, " + n);
  }
  
  console.log(greetDefault());
  console.log(greetDefault("Alice"));
  function sum(...nums) {
    return nums?.reduce((acc, n) => (acc + n), 0);
  }
  
  console.log(sum(1, 2, 3, 4, 5));
  function log(prefix, separator = ": ", ...messages) {
    return ((prefix + separator) + messages?.join(", "));
  }
  
  const Color = Object.freeze({
    Red: 0,
    Green: 1,
    Blue: 2
  });
  
  console.log(Color?.Red);
  console.log(Color?.Green);
  const HttpStatus = Object.freeze({
    OK: 200,
    NotFound: 404,
    ServerError: 500
  });
  
  const Priority = Object.freeze({
    Low: 0,
    Medium: 1,
    High: 10,
    Critical: 11
  });
  
  function getStatusMessage(status) {
    return (() => {
      const _subject = status;
      if (_subject === 200) {
        return "Success";
      } else if (_subject === 404) {
        return "Not Found";
      } else {
        return "Unknown";
      }
    })();
  }
  
  console.log(getStatusMessage(200));
  const double = _deepFreeze(x => (x * 2));
  const addArrow = _deepFreeze((a, b) => (a + b));
  const process = _deepFreeze(x => {
    const result = _deepFreeze((x * 2));
    return (result + 1);
  });
  const numbersArr = _deepFreeze([1, 2, 3, 4, 5]);
  const doubled = _deepFreeze(numbersArr?.map(x => (x * 2)));
  const sumArr = _deepFreeze(numbersArr?.reduce((acc, n) => (acc + n), 0));
  const score = _deepFreeze(85);
  const grade = _deepFreeze((() => {
    const _subject = score;
    if ((() => { const n = _subject; return (n >= 90); })()) {
      const n = _subject;
      return "A";
    } else if ((() => { const n = _subject; return (n >= 80); })()) {
      const n = _subject;
      return "B";
    } else if ((() => { const n = _subject; return (n >= 70); })()) {
      const n = _subject;
      return "C";
    } else {
      return "F";
    }
  })());
  console.log(grade);
  const items = _deepFreeze(["a", "b", "c"]);
  for (const item of items) {
    console.log(item);
  }
  for (const i of Array.from({ length: 5 - 0 }, (_, i) => 0 + i)) {
    console.log(i);
  }
  function addOne(x) {
    return (x + 1);
  }
  
  function doubleNum(x) {
    return (x * 2);
  }
  
  function square(x) {
    return (x * x);
  }
  
  const transform = _flow(addOne, doubleNum, square);
  const flowResult = _deepFreeze(transform(5));
  console.log(`Flow result: ${flowResult}`);
  function handleStatus(status) {
    if ((status === 200)) {
      console.log("OK");
      return;
    } else if ((status === 404)) {
      console.log("Not Found");
      return;
    } else if ((status === 500)) {
      console.log("Server Error");
      return;
    } else if (true) {
      console.log("Unknown");
      return;
    }
  }
  
  handleStatus(200);
  const nums = _deepFreeze([1, 2, 3, 4, 5]);
  const personObj = _deepFreeze({ name: "Bob", age: 30 });
  const more = _deepFreeze([...nums, 6, 7, 8]);
  const updated = _deepFreeze({ ...personObj, age: 31 });
  const obj = _deepFreeze({ a: { b: { c: 1 } } });
  console.log(obj?.a?.b?.c);
  const userName = _deepFreeze("Alice");
  const userAge = _deepFreeze(30);
  console.log(`Hello, ${userName}!`);
  console.log(`${userName} is ${userAge} years old`);
  const itemsCount = _deepFreeze([1, 2, 3]);
  console.log(`Count: ${itemsCount?.length}`);
  const pipeResult1 = _deepFreeze(square(addOne(doubleNum(5))));
  const pipeResult2 = _deepFreeze(_pipe(5, doubleNum, addOne, square));
  console.log(`Pipe result: ${pipeResult2}`);
  const fib = (() => {
    const _cache = new Map();
    return function(n) {
      const _key = JSON.stringify([...arguments]);
      if (_cache.has(_key)) return _cache.get(_key);
      const _result = (() => {
        if ((n <= 1)) {
          return n;
          return;
        } else if (true) {
          return (fib((n - 1)) + fib((n - 2)));
          return;
        }
      })();
      _cache.set(_key, _result);
      return _result;
    };
  })();
  
  console.log(`fib(10) = ${fib(10)}`);
  const NotFoundError = _deepFreeze(error?.create("NotFoundError"));
  const ValidationError = _deepFreeze(error?.create("ValidationError"));
  function fetchUser(id) {
    if (!((id !== 0))) {
      throw NotFoundError(`User ${id} not found`);
    }
    return { id, name: "Alice" };
  }
  
  function handleRequest(id) {
    try {
      return fetchUser(id);
    } catch (e) {
      if ((e?._id === NotFoundError?._id)) {
        console.log(`Not found: ${e?.message}`);
        return null;
        return;
      } else if ((e?._id === ValidationError?._id)) {
        console.log(`Invalid: ${e?.message}`);
        return null;
        return;
      } else if (true) {
        throw e;
        return;
      }
    }
  }
  
  const user = _deepFreeze(handleRequest(1));
  console.log(`User: ${user?.name}`);
  const timeout = _deepFreeze((config?.api?.timeout ?? 3000));
  console.log(`Timeout: ${timeout}`);
  const label = _deepFreeze((((score >= 80)) ? "premium" : "standard"));
  console.log(`Label: ${label}`);
  function countItems(arr) {
    let total = 0;
    for (const item of arr) {
      total = (total + 1);
    }
    return total;
  }
  
  console.log(`Count: ${countItems(items)}`);
  function divide(a, b) {
    if (!((b !== 0))) {
      throw "Cannot divide by zero";
    }
    return (a / b);
  }
  
  console.log(`10 / 3 = ${divide(10, 3)}`);
  (() => {
    console.log("Hello from raw JavaScript!");
  })();
  
  const jsName = _deepFreeze("Alice");
  const jsCount = _deepFreeze(5);
  ((jsName, jsCount) => {
    const greeting = `Hello, ${jsName}! Count: ${jsCount}`;
    console.log(greeting);
  })(jsName, jsCount);
  
  const jsNumbers = _deepFreeze([1, 2, 3, 4, 5]);
  const jsSum = _deepFreeze(((jsNumbers) => { return jsNumbers.reduce((a, b) => a + b, 0); })(jsNumbers));
  console.log(`JS Sum: ${jsSum}`);
  const timestamp = _deepFreeze((() => { return Date.now(); })());
  console.log(`Timestamp: ${timestamp}`);
  console.log("All README examples validated successfully!");
  
  return { API_VERSION, greetExposed, add };
}
