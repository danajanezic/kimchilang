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
  const tasks = [{ name: "lint", status: "pending", priority: 3, runner: "eslint", timeout: null }, { name: "typecheck", status: "pending", priority: 2, runner: "tsc", timeout: 30 }, { name: "test", status: "pending", priority: 1, runner: "jest", timeout: 60 }, { name: "build", status: "pending", priority: 1, runner: null, timeout: 120 }, { name: "deploy", status: "skipped", priority: 4, runner: "rsync", timeout: 300 }];
  const TaskError = error?.create("TaskError");
  const ValidationError = error?.create("ValidationError");
  function validateTask(task) {
    if (!((task !== null))) {
      throw ValidationError("Task is null");
    }
    if (!((task?.name !== null))) {
      throw ValidationError("Task missing name");
    }
    if (!((task?.status !== null))) {
      throw ValidationError("Task missing status");
    }
    return task;
  }
  
  function getTimeoutLabel(task) {
    const seconds = (task?.timeout ?? 30);
    return (() => {
      const _subject = seconds;
      if ((() => { const n = _subject; return (n <= 10); })()) {
        const n = _subject;
        return "fast";
      } else if ((() => { const n = _subject; return (n <= 60); })()) {
        const n = _subject;
        return "normal";
      } else if ((() => { const n = _subject; return (n > 60); })()) {
        const n = _subject;
        return "slow";
      } else {
        return "unknown";
      }
    })();
  }
  
  function describeTask(task) {
    const runner = (task?.runner ?? "default");
    const timeout = (task?.timeout ?? 30);
    const speed = getTimeoutLabel(task);
    const urgent = (((task?.priority === 1)) ? "URGENT" : "");
    return { name: task?.name, runner, timeout, speed, urgent, status: task?.status };
  }
  
  function shouldRun(task) {
    return (() => {
      const _subject = task?.status;
      if (_subject === "pending") {
        return true;
      } else if (_subject === "failed") {
        return true;
      } else {
        return false;
      }
    })();
  }
  
  function runTask(task) {
    const described = describeTask(task);
    const prefix = (((described.urgent !== "")) ? `[${described.urgent}]` : "[  ]");
    console.log(`${prefix} Running ${described.name} (${described.runner}, ${described.speed})`);
    return (() => {
      const _subject = task;
      if (_subject?.runner === null && 'name' in (_subject || {})) {
        const name = _subject.name;
        console.log(`  WARNING: no runner for '${name}', using fallback`);
        return { ...described, status: "done", note: "used fallback runner" };
      } else if (_subject?.priority === 1) {
        console.log("  Priority task — running with extra checks");
        return { ...described, status: "done", note: "priority run" };
      } else {
        return { ...described, status: "done", note: null };
      }
    })();
  }
  
  function main() {
    console.log("=== Task Runner ===");
    console.log("");
    const validated = tasks.map(t => validateTask(t));
    const runnable = validated.filter(t => shouldRun(t));
    console.log(`Tasks to run: ${runnable.length} of ${tasks.length}`);
    console.log("");
    let results = [];
    let passed = 0;
    let failed = 0;
    for (const task of runnable) {
      try {
        const result = runTask(task);
        results = [...results, result];
        passed = (passed + 1);
      } catch (e) {
        console.log(`  FAILED: ${e?.message}`);
        failed = (failed + 1);
        results = [...results, { name: task?.name, status: "failed" }];
      }
    }
    console.log("");
    console.log("=== Results ===");
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log("");
    for (const result of results) {
      const note = (result.note ?? "no notes");
      const marker = (((result.status === "done")) ? "*" : "x");
      console.log(`  [${marker}] ${result.name}: ${note}`);
    }
    console.log("");
    const allPassed = (((failed === 0)) ? "ALL TASKS PASSED" : "SOME TASKS FAILED");
    console.log(allPassed);
  }
  
  main();
}
