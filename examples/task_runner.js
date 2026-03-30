import { _obj, error } from './../kimchi-runtime.js';

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
      if ((_subject <= 10)) {
        const n = _subject;
        return "fast";
      } else if ((_subject <= 60)) {
        const n = _subject;
        return "normal";
      } else if ((_subject > 60)) {
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
    return (task?.status) === "pending" ? true : (task?.status) === "failed" ? true : false;
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
