import { _obj, error } from './../kimchi-runtime.js';

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
  const name = "Alice";
  const age = 30;
  console.log(`Hello, ${name}!`);
  console.log(`${name} is ${age} years old`);
  const items = [1, 2, 3, 4, 5];
  console.log(`Count: ${items.length}`);
  console.log(`Sum: ${items.sum()}`);
  const user = { name: "Bob", score: 95 };
  console.log(`${user.name} scored ${user.score}%`);
  function double(x) {
    return (x * 2);
  }
  
  function addOne(x) {
    return (x + 1);
  }
  
  function square(x) {
    return (x * x);
  }
  
  const result = _pipe(5, double, addOne, square);
  console.log(`5 ~> double ~> addOne ~> square = ${result}`);
  function sumArray(arr) {
    return arr?.sum();
  }
  
  function doubleAll(arr) {
    return arr?.map(x => (x * 2));
  }
  
  function filterBig(arr) {
    return arr?.filter(x => (x > 5));
  }
  
  const numbers = [1, 2, 3, 4, 5];
  const processed = _pipe(numbers, doubleAll, filterBig, sumArray);
  console.log(`Processed array result: ${processed}`);
  const message = `The answer is ${_pipe(5, double, addOne)}`;
  console.log(message);
  const transform = _flow(double, addOne, square);
  const flowResult = transform(5);
  console.log(`transform(5) = ${flowResult}`);
  const processArray = _flow(doubleAll, filterBig, sumArray);
  const flowArrayResult = processArray(numbers);
  console.log(`processArray([1,2,3,4,5]) = ${flowArrayResult}`);
  const config = { timeout: null, retries: 3 };
  const timeout = (config.timeout ?? 5000);
  const retries = (config.retries ?? 1);
  console.log(`Timeout: ${timeout}, Retries: ${retries}`);
  function divide(a, b) {
    if (!((b !== 0))) {
      return null;
    }
    return (a / b);
  }
  
  console.log(`10 / 3 = ${divide(10, 3)}`);
  console.log(`10 / 0 = ${divide(10, 0)}`);
  const status = 200;
  const statusMessage = (status) === 200 ? "OK" : (status) === 404 ? "Not Found" : (status) === 500 ? "Server Error" : "Unknown";
  console.log(`Status ${status}: ${statusMessage}`);
  const score = 85;
  const tier = (((score >= 90)) ? "Gold" : (((score >= 80)) ? "Silver" : "Bronze"));
  console.log(`Tier: ${tier}`);
  function buildList(n) {
    let squares = [];
    for (const i of Array.from({ length: n - 0 }, (_, i) => 0 + i)) {
      squares = [...squares, (i * i)];
    }
    return squares;
  }
  
  const squares = buildList(5);
  console.log(`Squares: ${squares}`);
}
