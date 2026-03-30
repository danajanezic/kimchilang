import { _obj, error } from './../kimchi-runtime.js';

export default async function(_opts = {}) {
  if (_opts["name"] === undefined) throw new Error("Required argument 'name' not provided");
  
  const name = _opts["name"];
  const greeting = _opts["greeting"] !== undefined ? _opts["greeting"] : "Hello";
  
  function _describe() {
    return "A simple greeting module";
  }
  
  function greet() {
    console.log(`${greeting}, ${name}!`);
  }
  
  greet();
  
  return { _describe, greet };
}
