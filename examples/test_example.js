import { _obj, error } from './../kimchi-runtime.js';

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
    toThrow(msg) { try { actual(); throw new Error("Expected to throw"); } catch(e) { const eMsg = e.message || String(e); if (msg && !eMsg.includes(msg)) throw new Error(`Expected error containing "${msg}" but got "${eMsg}"`); } },
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
  function add(a, b) {
    return (a + b);
  }
  
  function multiply(a, b) {
    return (a * b);
  }
  
  function greet(name) {
    return `Hello, ${name}!`;
  }
  
  function safeDivide(a, b) {
    if (!((b !== 0))) {
      throw "Cannot divide by zero";
    }
    return (a / b);
  }
  
  _test("addition works", async () => {
    _expect(add(2, 3)).toBe(5);
    _expect(add(-1, 1)).toBe(0);
  });
  _test("multiplication works", async () => {
    _expect(multiply(3, 4)).toBe(12);
    _expect(multiply(0, 100)).toBe(0);
  });
  _describe("String functions", () => {
    _test("greet returns correct message", async () => {
      _expect(greet("World")).toBe("Hello, World!");
    });
    _test("string contains check", async () => {
      const message = greet("Alice");
      _expect(message).toContain("Alice");
    });
  });
  _describe("Array operations", () => {
    _test("array length", async () => {
      const arr = [1, 2, 3, 4, 5];
      _expect(arr).toHaveLength(5);
    });
    _test("array contains", async () => {
      const fruits = ["apple", "banana", "cherry"];
      _expect(fruits).toContain("banana");
    });
  });
  _test("assert examples", async () => {
    _assert(((1 + 1) === 2), "Basic math should work");
    _assert(true, "True should be truthy");
  });
  _test("comparison matchers", async () => {
    _expect(10).toBeGreaterThan(5);
    _expect(3).toBeLessThan(7);
  });
  _test("truthy and falsy", async () => {
    _expect(true).toBeTruthy();
    _expect(false).toBeFalsy();
    _expect(null).toBeFalsy();
    _expect("hello").toBeTruthy();
  });
  _describe("New matchers", () => {
    _test("toBeDefined and toBeUndefined", async () => {
      _expect(42).toBeDefined();
      const obj = { a: 1 };
      _expect(obj?.b).toBeUndefined();
    });
    _test("toBeCloseTo for floating point", async () => {
      const result = (0.1 + 0.2);
      _expect(result).toBeCloseTo(0.3);
    });
  });
  _describe("Not modifier", () => {
    _test("not.toBe", async () => {
      _expect(1).not.toBe(2);
    });
    _test("not.toContain", async () => {
      const arr = [1, 2, 3];
      _expect(arr).not.toContain(4);
    });
    _test("not.toBeNull", async () => {
      _expect("hello").not.toBeNull();
    });
  });
  _test("future feature", async () => {
    _assert(false, "This should not run");
  }, "skip");
  _describe("Guard validation", () => {
    _test("safeDivide works", async () => {
      _expect(safeDivide(10, 2)).toBe(5);
    });
    _test("safeDivide throws on zero", async () => {
      _expect(() => safeDivide(10, 0)).toThrow("Cannot divide by zero");
    });
  });
  _describe("Match expressions", () => {
    _test("match returns correct value", async () => {
      const result = (200) === 200 ? "OK" : (200) === 404 ? "Not Found" : "Unknown";
      _expect(result).toBe("OK");
    });
    _test("match with wildcard", async () => {
      const result = (999) === 200 ? "OK" : "Unknown";
      _expect(result).toBe("Unknown");
    });
  });
}
