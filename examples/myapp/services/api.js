import _dep_http from './myapp/lib/http.km';

export default function(_overrides = {}) {
  const http = _overrides["myapp.lib.http"] || _dep_http();
  
  function fetchUsers() {
    let response = http.get("https://api.example.com/users");
    return response.data;
  }
  
  function createUser(name) {
    let response = http.post("https://api.example.com/users", { name });
    return response.data;
  }
  
  
  return { fetchUsers, createUser };
}
