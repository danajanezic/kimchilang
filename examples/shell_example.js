import { _obj, error } from './../kimchi-runtime.js';

async function _shell(command, inputs = {}) {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  // Interpolate inputs into command
  let cmd = command;
  for (const [key, value] of Object.entries(inputs)) {
    cmd = cmd.replace(new RegExp("\\$" + key + "\\b", "g"), String(value));
  }
  try {
    const { stdout, stderr } = await execAsync(cmd);
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (error) {
    return { stdout: error.stdout?.trim() || "", stderr: error.stderr?.trim() || error.message, exitCode: error.code || 1 };
  }
}

export default async function(_opts = {}) {
  async function listFiles() {
    const result = await _shell("ls -la");
    console.log(result.stdout);
  }
  
  async function getDate() {
    const result = await _shell("date");
    return result.stdout;
  }
  
  async function findFiles(pattern) {
    const result = await _shell("find . -name \"$pattern\"", { pattern });
    return result.stdout;
  }
  
  listFiles();
}
