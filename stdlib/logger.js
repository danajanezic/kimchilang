// KimchiLang Logger Module
// Provides structured JSON logging with log levels

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getLogLevel() {
  const level = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LOG_LEVELS[level] ?? LOG_LEVELS.info;
}

function getCallerInfo() {
  const err = new Error();
  const stack = err.stack.split('\n');
  
  // Find the first stack frame outside of logger.js
  for (let i = 2; i < stack.length; i++) {
    const line = stack[i];
    if (!line.includes('logger.js') && !line.includes('node:internal')) {
      // Parse stack frame: "    at functionName (file:line:col)" or "    at file:line:col"
      const match = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);
      if (match) {
        const functionName = match[1] || '<anonymous>';
        const filePath = match[2];
        const lineNumber = parseInt(match[3], 10);
        
        // Extract module path from file path
        const modulePath = filePath
          .replace(/^file:\/\//, '')
          .replace(/.*\//, '')
          .replace(/\.(js|km)$/, '');
        
        return {
          function: functionName,
          module: modulePath,
          line: lineNumber,
          file: filePath,
        };
      }
    }
  }
  
  return {
    function: '<unknown>',
    module: '<unknown>',
    line: 0,
    file: '<unknown>',
  };
}

function formatLog(level, message, data = {}) {
  const caller = getCallerInfo();
  const timestamp = new Date().toISOString();
  
  const logEntry = {
    timestamp,
    level,
    module: caller.module,
    function: caller.function,
    line: caller.line,
    message,
    ...data,
  };
  
  return JSON.stringify(logEntry);
}

function shouldLog(level) {
  const currentLevel = getLogLevel();
  return LOG_LEVELS[level] >= currentLevel;
}

export const logger = {
  debug(message, data) {
    if (shouldLog('debug')) {
      console.log(formatLog('debug', message, data));
    }
  },
  
  info(message, data) {
    if (shouldLog('info')) {
      console.log(formatLog('info', message, data));
    }
  },
  
  warn(message, data) {
    if (shouldLog('warn')) {
      console.warn(formatLog('warn', message, data));
    }
  },
  
  error(message, data) {
    if (shouldLog('error')) {
      console.error(formatLog('error', message, data));
    }
  },
  
  // Create a child logger with additional context
  child(context) {
    return {
      debug: (message, data) => logger.debug(message, { ...context, ...data }),
      info: (message, data) => logger.info(message, { ...context, ...data }),
      warn: (message, data) => logger.warn(message, { ...context, ...data }),
      error: (message, data) => logger.error(message, { ...context, ...data }),
      child: (moreContext) => logger.child({ ...context, ...moreContext }),
    };
  },
};

export default logger;
