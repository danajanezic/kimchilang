import { _obj, error } from './kimchi-runtime.js';

export default async function(_opts = {}) {
  const fibonacci = (() => {
    const _cache = new Map();
    return function(n) {
      const _key = JSON.stringify([...arguments]);
      if (_cache.has(_key)) return _cache.get(_key);
      const _result = (() => {
        if ((n <= 1)) {
          return n;
        }
        return (fibonacci((n - 1)) + fibonacci((n - 2)));
      })();
      _cache.set(_key, _result);
      return _result;
    };
  })();
  
  console.log("Memoized Fibonacci Sequence:");
  for (const i of Array.from({ length: 20 - 0 }, (_, i) => 0 + i)) {
    console.log(`fib(${i}) = ${fibonacci(i)}`);
  }
  console.log("\nFibonacci of 35 (would be slow without memo):");
  console.log(`fib(35) = ${fibonacci(35)}`);
}
