import { _obj, error } from './kimchi-runtime.js';

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
  const name = "World";
  const PI = 3.14159;
  console.log("Hello, KimchiLang!");
  console.log(name);
  function greet(person) {
    return (("Hello, " + person) + "!");
  }
  
  function add(a, b) {
    return (a + b);
  }
  
  console.log(greet("Alice"));
  console.log(add(5, 3));
  const double = x => (x * 2);
  const multiply = (a, b) => (a * b);
  console.log(double(21));
  console.log(multiply(6, 7));
  const numbers = [1, 2, 3, 4, 5];
  const fruits = ["apple", "banana", "cherry"];
  console.log(numbers);
  console.log(fruits[0]);
  const person = { name: "Bob", age: 30, city: "New York" };
  console.log(person.name);
  console.log(person["age"]);
  const score = 85;
  const grade = (() => {
    const _subject = score;
    if ((_subject >= 90)) {
      const n = _subject;
      return "A";
    } else if ((_subject >= 80)) {
      const n = _subject;
      return "B";
    } else if ((_subject >= 70)) {
      const n = _subject;
      return "C";
    } else {
      return "F";
    }
  })();
  console.log(`Grade: ${grade}`);
  for (const item of fruits) {
    console.log(item);
  }
  for (const i of Array.from({ length: 5 - 0 }, (_, i) => 0 + i)) {
    console.log(i);
  }
  function addOne(x) {
    return (x + 1);
  }
  
  function square(x) {
    return (x * x);
  }
  
  const transform = _flow(addOne, square);
  const result = transform(5);
  console.log(`transform(5) = ${result}`);
  const pipeResult = _pipe(5, addOne, square);
  console.log(`5 ~> addOne ~> square = ${pipeResult}`);
  const config = { timeout: null };
  const timeout = (config.timeout ?? 3000);
  console.log(`Timeout: ${timeout}`);
  const status = (((score >= 80)) ? "premium" : "standard");
  console.log(`Status: ${status}`);
  function sumArray(arr) {
    let total = 0;
    for (const n of arr) {
      total = (total + n);
    }
    return total;
  }
  
  console.log(`Sum: ${sumArray(numbers)}`);
  function safeDivide(a, b) {
    if (!((b !== 0))) {
      return null;
    }
    return (a / b);
  }
  
  console.log(`10 / 3 = ${safeDivide(10, 3)}`);
  console.log(`10 / 0 = ${safeDivide(10, 0)}`);
  const arr1 = [1, 2, 3];
  const arr2 = [...arr1, 4, 5, 6];
  console.log(arr2);
  function riskyOperation() {
    throw "Something went wrong!";
  }
  
  try {
    riskyOperation();
  } catch (e) {
    console.log(("Caught error: " + e));
  }
  console.log("Program completed successfully!");
}
