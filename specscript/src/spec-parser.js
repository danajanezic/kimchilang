// Spec Parser — parses ## spec section into structured data

export function parseSpec(source) {
  const lines = source.split('\n');
  const result = {
    module: null,
    intent: null,
    reason: null,
    requires: [],
    types: [],
    depends: [],
    functions: [],
  };

  let currentSection = null;
  let currentFunction = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const moduleMatch = trimmed.match(/^# (\w+)$/);
    if (moduleMatch) {
      result.module = moduleMatch[1];
      currentSection = null;
      continue;
    }

    const intentMatch = trimmed.match(/^\*\*intent:\*\*\s*(.+)$/);
    if (intentMatch) {
      if (currentFunction) {
        currentFunction.intent = intentMatch[1];
        result.functions.push(currentFunction);
        currentFunction = null;
      } else {
        result.intent = intentMatch[1];
      }
      currentSection = null;
      continue;
    }

    const reasonMatch = trimmed.match(/^\*\*reason:\*\*\s*(.+)$/);
    if (reasonMatch) {
      result.reason = reasonMatch[1];
      currentSection = null;
      continue;
    }

    if (trimmed === '### requires') { flushFunction(); currentSection = 'requires'; continue; }
    if (trimmed === '### types') { flushFunction(); currentSection = 'types'; continue; }
    if (trimmed === '### depends') { flushFunction(); currentSection = 'depends'; continue; }

    const funcMatch = trimmed.match(/^### (expose|internal)\s+(\w+)\s*::\s*(\([^)]*\))\s*->\s*(.+)$/);
    if (funcMatch) {
      flushFunction();
      currentSection = null;
      currentFunction = {
        visibility: funcMatch[1],
        name: funcMatch[2],
        params: funcMatch[3],
        returnType: funcMatch[4].trim(),
        intent: null,
      };
      continue;
    }

    const listMatch = trimmed.match(/^- (.+)$/);
    if (listMatch && currentSection) {
      const content = listMatch[1];
      if (currentSection === 'requires') {
        result.requires.push(content);
      } else if (currentSection === 'types') {
        const typeMatch = content.match(/^(\w+)\s*::\s*(.+)$/);
        if (typeMatch) {
          result.types.push({ name: typeMatch[1], definition: typeMatch[2].trim() });
        }
      } else if (currentSection === 'depends') {
        const depMatch = content.match(/^([\w.]+)\s*::\s*(.+)$/);
        if (depMatch) {
          result.depends.push({
            module: depMatch[1],
            functions: depMatch[2].split(',').map(f => f.trim()),
          });
        }
      }
      continue;
    }
  }

  flushFunction();

  if (!result.module) throw new Error('Spec missing module name (# ModuleName heading)');
  if (!result.intent) throw new Error('Spec missing **intent:** field');
  if (!result.reason) throw new Error('Spec missing **reason:** field');

  return result;

  function flushFunction() {
    if (currentFunction) {
      result.functions.push(currentFunction);
      currentFunction = null;
    }
  }
}
