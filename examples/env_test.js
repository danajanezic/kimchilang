import { _obj, error } from './kimchi-runtime.js';

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
