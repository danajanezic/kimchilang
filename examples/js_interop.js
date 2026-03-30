import { _obj, error } from './kimchi-runtime.js';

export default async function(_opts = {}) {
  (() => {
    console.log("Hello from raw JavaScript!");
  })();
  
  const name = "Alice";
  const count = 5;
  ((name, count) => {
    const greeting = `Hello, ${name}! Count: ${count}`;
    console.log(greeting);
  })(Object.freeze(name), Object.freeze(count));
  
  const doubled = ((count) => { return count * 2; })(Object.freeze(count));
  console.log(`Doubled: ${doubled}`);
  const numbers = [1, 2, 3, 4, 5];
  const sum = ((numbers) => { return numbers.reduce((a, b) => a + b, 0); })(Object.freeze(numbers));
  console.log(`Sum: ${sum}`);
  const timestamp = (() => { return Date.now(); })();
  console.log(`Timestamp: ${timestamp}`);
  const result = ((name) => { const upper = name.toUpperCase(); const reversed = upper.split('').reverse().join(''); return reversed; })(Object.freeze(name));
  console.log(`Reversed uppercase: ${result}`);
}
