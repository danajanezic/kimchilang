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

export default async function(_opts = {}) {
  console.log("Hello, KimchiLang!");
  function greet(name) {
    return (("Welcome, " + name) + "!");
  }
  
  console.log(greet("Developer"));
  const name = "Alice";
  const PI = 3.14159;
  const config = { api: { url: "https://api.example.com", timeout: 5000 } };
  const person = { name: "Alice", age: 30, city: "NYC" };
  const { name: personName, age } = person;
  const numbers = [1, 2, 3, 4, 5];
  const [first, second, third] = numbers;
  const internalConfig = { key: "hidden" };
  function helperFn() {
    return "internal";
  }
  
  const API_VERSION = "1.0";
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
  const double = x => (x * 2);
  const addArrow = (a, b) => (a + b);
  const process = x => {
    const result = (x * 2);
    return (result + 1);
  };
  const numbersArr = [1, 2, 3, 4, 5];
  const doubled = numbersArr.map(x => (x * 2));
  const sumArr = numbersArr.reduce((acc, n) => (acc + n), 0);
  const score = 85;
  const grade = (() => {
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
  })();
  console.log(grade);
  const items = ["a", "b", "c"];
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
  const flowResult = transform(5);
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
  const nums = [1, 2, 3, 4, 5];
  const personObj = { name: "Bob", age: 30 };
  const more = [...nums, 6, 7, 8];
  const updated = { ...personObj, age: 31 };
  const obj = { a: { b: { c: 1 } } };
  console.log(obj.a.b.c);
  const userName = "Alice";
  const userAge = 30;
  console.log(`Hello, ${userName}!`);
  console.log(`${userName} is ${userAge} years old`);
  const itemsCount = [1, 2, 3];
  console.log(`Count: ${itemsCount.length}`);
  const pipeResult1 = square(addOne(doubleNum(5)));
  const pipeResult2 = _pipe(5, doubleNum, addOne, square);
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
  const NotFoundError = error?.create("NotFoundError");
  const ValidationError = error?.create("ValidationError");
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
  
  const user = handleRequest(1);
  console.log(`User: ${user.name}`);
  const timeout = (config.api.timeout ?? 3000);
  console.log(`Timeout: ${timeout}`);
  const label = (((score >= 80)) ? "premium" : "standard");
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
  
  const jsName = "Alice";
  const jsCount = 5;
  ((jsName, jsCount) => {
    const greeting = `Hello, ${jsName}! Count: ${jsCount}`;
    console.log(greeting);
  })(Object.freeze(jsName), Object.freeze(jsCount));
  
  const jsNumbers = [1, 2, 3, 4, 5];
  const jsSum = ((jsNumbers) => { return jsNumbers.reduce((a, b) => a + b, 0); })(Object.freeze(jsNumbers));
  console.log(`JS Sum: ${jsSum}`);
  const timestamp = (() => { return Date.now(); })();
  console.log(`Timestamp: ${timestamp}`);
  console.log("All README examples validated successfully!");
  
  return { API_VERSION, greetExposed, add };
}
