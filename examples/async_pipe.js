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
  function double(x) {
    return (x * 2);
  }
  
  function addOne(x) {
    return (x + 1);
  }
  
  function square(x) {
    return (x * x);
  }
  
  async function fetchUser(id) {
    return { id, name: ("User" + id) };
  }
  
  async function enrichUser(user) {
    return { ...user, email: (user?.name + "@example.com") };
  }
  
  async function formatUser(user) {
    return ((("Name: " + user?.name) + ", Email: ") + user?.email);
  }
  
  async function main() {
    console.log("=== Async Pipe Operator (~>) ===");
    const userInfo = await _pipe(1, fetchUser, enrichUser, formatUser);
    console.log(userInfo);
    const result = await _pipe(5, double, addOne);
    console.log(`5 ~> double ~> addOne = ${result}`);
    console.log("");
    console.log("=== Async Flow Operator (>>) ===");
    const processUser = _flow(fetchUser, enrichUser, formatUser);
    const user1 = await processUser(1);
    const user2 = await processUser(2);
    console.log(`User 1: ${user1}`);
    console.log(`User 2: ${user2}`);
    const transform = _flow(double, addOne, square);
    const transformed = await transform(5);
    console.log(`transform(5) = ${transformed}`);
    console.log("");
    console.log("Done!");
  }
  
  main();
}
