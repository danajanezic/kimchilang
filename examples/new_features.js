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
  const name = "Alice";
  const age = 30;
  console.log(`Hello, ${name}!`);
  console.log(`${name} is ${age} years old`);
  const items = [1, 2, 3, 4, 5];
  console.log(`Count: ${items.length}`);
  console.log(`Sum: ${items.sum()}`);
  const user = { name: "Bob", score: 95 };
  console.log(`${user.name} scored ${user.score}%`);
  function double(x) {
    return (x * 2);
  }
  
  function addOne(x) {
    return (x + 1);
  }
  
  function square(x) {
    return (x * x);
  }
  
  const result = _pipe(5, double, addOne, square);
  console.log(`5 ~> double ~> addOne ~> square = ${result}`);
  function sumArray(arr) {
    return arr?.sum();
  }
  
  function doubleAll(arr) {
    return arr?.map(x => (x * 2));
  }
  
  function filterBig(arr) {
    return arr?.filter(x => (x > 5));
  }
  
  const numbers = [1, 2, 3, 4, 5];
  const processed = _pipe(numbers, doubleAll, filterBig, sumArray);
  console.log(`Processed array result: ${processed}`);
  const message = `The answer is ${_pipe(5, double, addOne)}`;
  console.log(message);
  const transform = _flow(double, addOne, square);
  const flowResult = transform(5);
  console.log(`transform(5) = ${flowResult}`);
  const processArray = _flow(doubleAll, filterBig, sumArray);
  const flowArrayResult = processArray(numbers);
  console.log(`processArray([1,2,3,4,5]) = ${flowArrayResult}`);
  const config = { timeout: null, retries: 3 };
  const timeout = (config.timeout ?? 5000);
  const retries = (config.retries ?? 1);
  console.log(`Timeout: ${timeout}, Retries: ${retries}`);
  function divide(a, b) {
    if (!((b !== 0))) {
      return null;
    }
    return (a / b);
  }
  
  console.log(`10 / 3 = ${divide(10, 3)}`);
  console.log(`10 / 0 = ${divide(10, 0)}`);
  const status = 200;
  const statusMessage = (status) === 200 ? "OK" : (status) === 404 ? "Not Found" : (status) === 500 ? "Server Error" : "Unknown";
  console.log(`Status ${status}: ${statusMessage}`);
  const score = 85;
  const tier = (((score >= 90)) ? "Gold" : (((score >= 80)) ? "Silver" : "Bronze"));
  console.log(`Tier: ${tier}`);
  function buildList(n) {
    let squares = [];
    for (const i of Array.from({ length: n - 0 }, (_, i) => 0 + i)) {
      squares = [...squares, (i * i)];
    }
    return squares;
  }
  
  const squares = buildList(5);
  console.log(`Squares: ${squares}`);
}
