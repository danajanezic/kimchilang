import { _obj, error } from './kimchi-runtime.js';

export default async function(_opts = {}) {
  function fibonacci(n) {
    if ((n <= 1)) {
      return n;
    }
    return (fibonacci((n - 1)) + fibonacci((n - 2)));
  }
  
  console.log("Fibonacci Sequence:");
  for (const i of Array.from({ length: 10 - 0 }, (_, i) => 0 + i)) {
    console.log(fibonacci(i));
  }
  console.log("Fibonacci of 15:");
  console.log(fibonacci(15));
}
