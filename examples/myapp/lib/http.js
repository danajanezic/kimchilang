export default function(_overrides = {}) {
  function get(url) {
    console.log(("HTTP GET: " + url));
    return { status: 200, data: ("response from " + url) };
  }
  
  function post(url, body) {
    console.log(("HTTP POST: " + url));
    return { status: 201, data: "created" };
  }
  
  
  return { get, post };
}
