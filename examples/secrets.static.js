// Generated from .static file

// Secret wrapper class
class _Secret {
  constructor(value) { this._value = value; }
  toString() { return "********"; }
  valueOf() { return this._value; }
  get value() { return this._value; }
  [Symbol.toPrimitive](hint) { return hint === "string" ? "********" : this._value; }
}
function _secret(value) { return new _Secret(value); }

export const AppName = "MySecureApp";

export const Version = "1.0.0";

export const MaxConnections = 100;

export const Timeout = 5000;

export const DebugMode = false;

export const ApiKey = _secret("sk-1234567890abcdef");

export const InternalPort = _secret(8443);

export const DatabaseConfig = { host: "localhost", port: 5432, database: "myapp", username: _secret("admin"), password: _secret("super-secret-password") };

export const ServiceConfig = { name: "api-service", url: "https://api.example.com", token: _secret("bearer-token-12345"), retries: 3 };

