// KimchiLang stdlib extensions
if (!Array.prototype._kmExtended) {
  Array.prototype._kmExtended = true;
  Array.prototype.first = function() { return this[0]; };
  Array.prototype.last = function() { return this[this.length - 1]; };
  Array.prototype.isEmpty = function() { return this.length === 0; };
  Array.prototype.sum = function() { return this.reduce((a, b) => a + b, 0); };
  Array.prototype.product = function() { return this.reduce((a, b) => a * b, 1); };
  Array.prototype.average = function() { return this.reduce((a, b) => a + b, 0) / this.length; };
  Array.prototype.max = function() { return Math.max(...this); };
  Array.prototype.min = function() { return Math.min(...this); };
  Array.prototype.take = function(n) { return this.slice(0, n); };
  Array.prototype.drop = function(n) { return this.slice(n); };
  Array.prototype.flatten = function() { return this.flat(Infinity); };
  Array.prototype.unique = function() { return [...new Set(this)]; };
}
if (!String.prototype._kmExtended) {
  String.prototype._kmExtended = true;
  String.prototype.isEmpty = function() { return this.length === 0; };
  String.prototype.isBlank = function() { return this.trim().length === 0; };
  String.prototype.toChars = function() { return this.split(""); };
  String.prototype.toLines = function() { return this.split("\n"); };
  String.prototype.capitalize = function() { return this.length === 0 ? this : this[0].toUpperCase() + this.slice(1); };
}
const _obj = {
  keys: (o) => Object.keys(o),
  values: (o) => Object.values(o),
  entries: (o) => Object.entries(o),
  fromEntries: (arr) => Object.fromEntries(arr),
  has: (o, k) => Object.hasOwn(o, k),
  freeze: (o) => Object.freeze(o),
  isEmpty: (o) => Object.keys(o).length === 0,
  size: (o) => Object.keys(o).length,
};

function error(message, _id = "Error") {
  const e = new Error(message);
  e._id = _id;
  return e;
}
error.create = (_id) => {
  const fn = (message) => error(message, _id);
  fn._id = _id;
  return fn;
};

export default async function(_opts = {}) {
  const transactions = [{ type: "credit", amount: 100 }, { type: "debit", amount: 50 }, { type: "credit", amount: 200 }, { type: "debit", amount: 75 }, { type: "refund", amount: 25 }];
  function transactionReducer(acc, tx) {
    if ((tx?.type === "credit")) {
      return (acc + tx?.amount);
      return;
    } else if ((tx?.type === "debit")) {
      return (acc - tx?.amount);
      return;
    } else if ((tx?.type === "refund")) {
      return (acc + tx?.amount);
      return;
    } else if (true) {
      return acc;
      return;
    }
  }
  
  const balance = transactions.reduce(transactionReducer, 0);
  console.log(`Final balance: $${balance}`);
  const items = [{ name: "apple", category: "fruit" }, { name: "carrot", category: "vegetable" }, { name: "banana", category: "fruit" }, { name: "broccoli", category: "vegetable" }, { name: "orange", category: "fruit" }];
  function groupReducer(acc, item) {
    if ((item?.category === "fruit")) {
      return { fruits: [...acc?.fruits, item?.name], vegetables: acc?.vegetables };
      return;
    } else if ((item?.category === "vegetable")) {
      return { fruits: acc?.fruits, vegetables: [...acc?.vegetables, item?.name] };
      return;
    } else if (true) {
      return acc;
      return;
    }
  }
  
  const grouped = items.reduce(groupReducer, { fruits: [], vegetables: [] });
  console.log("\nGrouped items:");
  console.log(`Fruits: ${grouped.fruits?.join(", ")}`);
  console.log(`Vegetables: ${grouped.vegetables?.join(", ")}`);
  const events = ["start", "pause", "resume", "stop", "start"];
  const finalState = events.reduce((state, event) => {
    if ((event === "start")) {
      return "running";
      return;
    } else if (((event === "pause") && (state === "running"))) {
      return "paused";
      return;
    } else if (((event === "resume") && (state === "paused"))) {
      return "running";
      return;
    } else if ((event === "stop")) {
      return "stopped";
      return;
    } else if (true) {
      return state;
      return;
    }
  }, "idle");
  console.log(`
Final state: ${finalState}`);
}
