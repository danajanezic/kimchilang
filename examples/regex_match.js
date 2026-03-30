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
  const input = "hello world 123";
  const matched = (/hello/.exec(input) || [])[0];
  console.log(`Simple match result: ${matched}`);
  const transformed = (($match) => { return $match?.[2]; })(/(\w+) (\w+)/.exec(input));
  console.log(`Transformed (second word): ${transformed}`);
  const numbers = (/\d+\.\d+/.exec("Price: $42.99") || [])[0];
  console.log(`Extracted number: ${numbers}`);
  const greeting = (($match) => { return `Welcome, ${$match?.[1]}!`; })(/Hello, (\w+)!/.exec("Hello, John!"));
  console.log(greeting);
  const emailPattern = /^[\w.-]+@[\w.-]+\.\w+$/;
  const phonePattern = /^\d{3}-\d{3}-\d{4}$/;
  function validateEmail(email) {
    if (!((email !== null))) {
      return false;
    }
    return emailPattern.test(email);
  }
  
  function validatePhone(phone) {
    if (!((phone !== null))) {
      return false;
    }
    return phonePattern.test(phone);
  }
  
  console.log("");
  console.log("=== Validation Examples ===");
  console.log(`Is 'test@example.com' a valid email? ${validateEmail("test@example.com")}`);
  console.log(`Is '555-123-4567' a valid phone? ${validatePhone("555-123-4567")}`);
  const logLine = "ERROR: Connection failed";
  const level = (/^(ERROR|WARN|INFO|DEBUG)/.exec(logLine) || [])[0];
  const severity = (level) === "ERROR" ? "CRITICAL" : (level) === "WARN" ? "WARNING" : "OK";
  console.log("");
  console.log(`Log level: ${level} (${severity})`);
}
