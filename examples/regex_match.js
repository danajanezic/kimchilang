import { _obj, error } from './../kimchi-runtime.js';

export default async function(_opts = {}) {
  const input = "hello world 123";
  const matched = (/hello/.exec(input) || [])[0];
  console.log(`Simple match result: ${matched}`);
  const transformed = (($match) => { return $match?.[2]; })(/(\w+) (\w+)/.exec(input));
  console.log(`Transformed (second word): ${transformed}`);
  const numbers = (/\d+\.\d+/.exec("Price: $42.99") || [])[0];
  console.log(`Extracted number: ${numbers}`);
  const greeting = (($match) => { return `Welcome, ${$match?.[1]}!`; })(/Hello, (\w+)!/.exec("Hello, John!"));
  console.log(greeting);
  const emailPattern = /^[\w.-]+@[\w.-]+\.\w+$/;
  const phonePattern = /^\d{3}-\d{3}-\d{4}$/;
  function validateEmail(email) {
    if (!((email !== null))) {
      return false;
    }
    return emailPattern.test(email);
  }
  
  function validatePhone(phone) {
    if (!((phone !== null))) {
      return false;
    }
    return phonePattern.test(phone);
  }
  
  console.log("");
  console.log("=== Validation Examples ===");
  console.log(`Is 'test@example.com' a valid email? ${validateEmail("test@example.com")}`);
  console.log(`Is '555-123-4567' a valid phone? ${validatePhone("555-123-4567")}`);
  const logLine = "ERROR: Connection failed";
  const level = (/^(ERROR|WARN|INFO|DEBUG)/.exec(logLine) || [])[0];
  const severity = (level) === "ERROR" ? "CRITICAL" : (level) === "WARN" ? "WARNING" : "OK";
  console.log("");
  console.log(`Log level: ${level} (${severity})`);
}
