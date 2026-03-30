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
  function double(x) {
    return (x * 2);
  }
  
  function addOne(x) {
    return (x + 1);
  }
  
  function square(x) {
    return (x * x);
  }
  
  async function fetchUser(id) {
    return { id, name: ("User" + id) };
  }
  
  async function enrichUser(user) {
    return { ...user, email: (user?.name + "@example.com") };
  }
  
  async function formatUser(user) {
    return ((("Name: " + user?.name) + ", Email: ") + user?.email);
  }
  
  async function main() {
    console.log("=== Async Pipe Operator (~>) ===");
    const userInfo = await _pipe(1, fetchUser, enrichUser, formatUser);
    console.log(userInfo);
    const result = await _pipe(5, double, addOne);
    console.log(`5 ~> double ~> addOne = ${result}`);
    console.log("");
    console.log("=== Async Flow Operator (>>) ===");
    const processUser = _flow(fetchUser, enrichUser, formatUser);
    const user1 = await processUser(1);
    const user2 = await processUser(2);
    console.log(`User 1: ${user1}`);
    console.log(`User 2: ${user2}`);
    const transform = _flow(double, addOne, square);
    const transformed = await transform(5);
    console.log(`transform(5) = ${transformed}`);
    console.log("");
    console.log("Done!");
  }
  
  main();
}
