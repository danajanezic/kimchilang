// Sample JavaScript file to test JS to KimchiLang conversion

const API_URL = "https://api.example.com";

function add(a, b) {
  return a + b;
}

function greet(name) {
  console.log("Hello, " + name);
}

class UserService {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  
  getUser(id) {
    return this.apiKey + "/users/" + id;
  }
  
  createUser(name, email) {
    console.log("Creating user: " + name);
    return { name, email };
  }
}

const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(x => x * 2);

function processStatus(status) {
  if (status === 200) {
    console.log("OK");
  } else if (status === 404) {
    console.log("Not Found");
  } else {
    console.log("Unknown");
  }
}

for (const num of numbers) {
  console.log(num);
}

export { add, greet, UserService };
