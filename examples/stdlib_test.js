import { _obj, error } from './../kimchi-runtime.js';

export default async function(_opts = {}) {
  function _describe() {
    return "Test that literals have stdlib methods";
  }
  
  const nums = [1, 2, 3, 4, 5];
  console.log("Array tests:");
  console.log(`first: ${nums.first()}`);
  console.log(`last: ${nums.last()}`);
  console.log(`sum: ${nums.sum()}`);
  console.log(`average: ${nums.average()}`);
  console.log(`max: ${nums.max()}`);
  console.log(`min: ${nums.min()}`);
  const text = "hello world";
  console.log("\nString tests:");
  console.log(`capitalize: ${text.capitalize()}`);
  console.log(`isEmpty: ${text.isEmpty()}`);
  console.log(`isBlank: ${"   "?.isBlank()}`);
  
  return { _describe };
}
