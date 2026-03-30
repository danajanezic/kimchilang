function _deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.getOwnPropertyNames(obj).forEach(name => {
    const value = obj[name];
    if (typeof value === 'object' && value !== null) {
      _deepFreeze(value);
    }
  });
  return Object.freeze(obj);
}

async function _pipe(value, ...fns) {
  let result = value;
  for (const fn of fns) {
    result = await fn(result);
  }
  return result;
}

function _flow(...fns) {
  return async function(value) {
    let result = value;
    for (const fn of fns) {
      result = await fn(result);
    }
    return result;
  };
}

const _tests = [];

function _test(name, fn) {
  _tests.push({ name, fn });
}

function _expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toContain(item) {
      if (!actual.includes(item)) throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`);
    },
    toBeTruthy() {
      if (!actual) throw new Error(`Expected truthy value, got ${JSON.stringify(actual)}`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`Expected falsy value, got ${JSON.stringify(actual)}`);
    },
    toBeNull() {
      if (actual !== null) throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
    },
    toHaveLength(len) {
      if (actual.length !== len) throw new Error(`Expected length ${len}, got ${actual.length}`);
    },
    toBeGreaterThan(n) {
      if (actual <= n) throw new Error(`Expected ${actual} to be greater than ${n}`);
    },
    toBeLessThan(n) {
      if (actual >= n) throw new Error(`Expected ${actual} to be less than ${n}`);
    },
    toThrow() {
      try {
        actual();
        throw new Error('Expected function to throw');
      } catch (e) {
        if (e.message === 'Expected function to throw') throw e;
      }
    },
  };
}

async function _runTests() {
  if (_tests.length === 0) return;
  let passed = 0;
  let failed = 0;
  for (const { name, fn } of _tests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${name}: ${e.message}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
}

function add(a, b) {
  return a + b;
}
function subtract(a, b) {
  return a - b;
}
function multiply(a, b) {
  return a * b;
}
_test("add returns sum", async () => {
  expect(add(2, 3))?.toBe(5);
});
_test("add handles negatives", async () => {
  expect(add(-1, 1))?.toBe(0);
});
_test("subtract returns difference", async () => {
  expect(subtract(10, 4))?.toBe(6);
});
_test("multiply returns product", async () => {
  expect(multiply(3, 4))?.toBe(12);
});
_test("multiply by zero returns zero", async () => {
  expect(multiply(5, 0))?.toBe(0);
});
_runTests();
