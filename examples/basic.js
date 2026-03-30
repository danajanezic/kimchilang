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
  const name = "World";
  const PI = 3.14159;
  console.log("Hello, KimchiLang!");
  console.log(name);
  function greet(person) {
    return (("Hello, " + person) + "!");
  }
  
  function add(a, b) {
    return (a + b);
  }
  
  console.log(greet("Alice"));
  console.log(add(5, 3));
  const double = x => (x * 2);
  const multiply = (a, b) => (a * b);
  console.log(double(21));
  console.log(multiply(6, 7));
  const numbers = [1, 2, 3, 4, 5];
  const fruits = ["apple", "banana", "cherry"];
  console.log(numbers);
  console.log(fruits[0]);
  const person = { name: "Bob", age: 30, city: "New York" };
  console.log(person.name);
  console.log(person["age"]);
  const score = 85;
  const grade = (() => {
    const _subject = score;
    if ((_subject >= 90)) {
      const n = _subject;
      return "A";
    } else if ((_subject >= 80)) {
      const n = _subject;
      return "B";
    } else if ((_subject >= 70)) {
      const n = _subject;
      return "C";
    } else {
      return "F";
    }
  })();
  console.log(`Grade: ${grade}`);
  for (const item of fruits) {
    console.log(item);
  }
  for (const i of Array.from({ length: 5 - 0 }, (_, i) => 0 + i)) {
    console.log(i);
  }
  function addOne(x) {
    return (x + 1);
  }
  
  function square(x) {
    return (x * x);
  }
  
  const transform = _flow(addOne, square);
  const result = transform(5);
  console.log(`transform(5) = ${result}`);
  const pipeResult = _pipe(5, addOne, square);
  console.log(`5 ~> addOne ~> square = ${pipeResult}`);
  const config = { timeout: null };
  const timeout = (config.timeout ?? 3000);
  console.log(`Timeout: ${timeout}`);
  const status = (((score >= 80)) ? "premium" : "standard");
  console.log(`Status: ${status}`);
  function sumArray(arr) {
    let total = 0;
    for (const n of arr) {
      total = (total + n);
    }
    return total;
  }
  
  console.log(`Sum: ${sumArray(numbers)}`);
  function safeDivide(a, b) {
    if (!((b !== 0))) {
      return null;
    }
    return (a / b);
  }
  
  console.log(`10 / 3 = ${safeDivide(10, 3)}`);
  console.log(`10 / 0 = ${safeDivide(10, 0)}`);
  const arr1 = [1, 2, 3];
  const arr2 = [...arr1, 4, 5, 6];
  console.log(arr2);
  function riskyOperation() {
    throw "Something went wrong!";
  }
  
  try {
    riskyOperation();
  } catch (e) {
    console.log(("Caught error: " + e));
  }
  console.log("Program completed successfully!");
}
