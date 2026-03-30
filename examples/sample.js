import { _obj, error } from './../kimchi-runtime.js';

export default async function(_opts = {}) {
  const API_URL = "https://api.example.com";
  function add(a, b) {
    return (a + b);
  }
  
  function greet(name) {
    console.log(("Hello, " + name));
  }
  
  function createUserService(apiKey) {
    if (!((apiKey !== null))) {
      throw "apiKey is required";
    }
    return { getUser: id => {
      return `${apiKey}/users/${id}`;
    }, createUser: (name, email) => {
      console.log(`Creating user: ${name}`);
      return { name, email };
    } };
  }
  
  const numbers = [1, 2, 3, 4, 5];
  const doubled = numbers.map(x => (x * 2));
  function processStatus(status) {
    const message = (status) === 200 ? "OK" : (status) === 404 ? "Not Found" : (status) === 500 ? "Server Error" : "Unknown";
    console.log(message);
  }
  
  for (const num of numbers) {
    console.log(num);
  }
}
