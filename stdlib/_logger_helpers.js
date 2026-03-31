// JS helpers for logger.km — functions that require JS-specific constructs
// These are extern'd from logger.km and will be removed when js {} is dropped

export function getCallerInfo() {
  const err = new Error();
  const stack = err.stack.split('\n');
  for (let i = 3; i < stack.length; i++) {
    const line = stack[i];
    if (!line.includes('logger') && !line.includes('node:internal')) {
      const match = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);
      if (match) {
        return {
          name: match[1] || '<anonymous>',
          module: match[2].replace(/^file:\/\//, '').replace(/.*\//, '').replace(/\.(js|km)$/, ''),
          line: parseInt(match[3], 10),
        };
      }
    }
  }
  return { name: '<unknown>', module: '<unknown>', line: 0 };
}
