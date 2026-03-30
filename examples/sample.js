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

export default async function(_opts = {}) {
  const API_URL = "https://api.example.com";
  function add(a, b) {
    return (a + b);
  }
  
  function greet(name) {
    console.log(("Hello, " + name));
  }
  
  function createUserService(apiKey) {
    if (!((apiKey !== null))) {
      throw "apiKey is required";
    }
    return { getUser: id => {
      return `${apiKey}/users/${id}`;
    }, createUser: (name, email) => {
      console.log(`Creating user: ${name}`);
      return { name, email };
    } };
  }
  
  const numbers = [1, 2, 3, 4, 5];
  const doubled = numbers.map(x => (x * 2));
  function processStatus(status) {
    const message = (status) === 200 ? "OK" : (status) === 404 ? "Not Found" : (status) === 500 ? "Server Error" : "Unknown";
    console.log(message);
  }
  
  for (const num of numbers) {
    console.log(num);
  }
}
