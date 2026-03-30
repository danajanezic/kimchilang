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

export default async function(_opts = {}) {
  const name = _opts["name"] !== undefined ? _opts["name"] : "World";
  const password = _secret(_opts["password"] !== undefined ? _opts["password"] : "default-pass");
  
  const HOME = process.env["HOME"];
  const DEBUG = process.env["DEBUG"] !== undefined ? process.env["DEBUG"] : "false";
  const API_TOKEN = _secret(process.env["API_TOKEN"] !== undefined ? process.env["API_TOKEN"] : "default-token-123");
  
  const apiKey = _secret("sk-12345-secret-key");
  const normalValue = "visible-value";
  console.log("=== Arguments ===");
  console.log(`Name: ${name}`);
  console.log(`Password: ${password}`);
  console.log("");
  console.log("=== Environment Variables ===");
  console.log(`HOME: ${HOME}`);
  console.log(`DEBUG: ${DEBUG}`);
  console.log("");
  console.log("=== Secret Values (should be masked) ===");
  console.log(`API Token: ${API_TOKEN}`);
  console.log(`API Key: ${apiKey}`);
  console.log("");
  console.log("=== Normal Values (should be visible) ===");
  console.log(`Normal: ${normalValue}`);
}
