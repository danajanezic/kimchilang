// KimchiLang Formatter — applies auto-fixable lint rules
//
// Rules:
//   1. indent            — normalize to 2-space indentation based on brace depth
//   2. no-tabs           — convert tabs to 2 spaces
//   3. no-trailing-spaces — strip trailing whitespace from all lines
//   4. newline-after-function — insert blank line after top-level function declarations
//   5. newline-after-shebang  — if file starts with #!, ensure blank line follows
//   6. no-multiple-empty-lines — collapse consecutive empty lines to single empty line

export function format(source) {
  let lines = source.split('\n');

  // 1. Convert tabs to spaces
  lines = lines.map(line => line.replace(/\t/g, '  '));

  // 2. Strip trailing whitespace
  lines = lines.map(line => line.replace(/\s+$/, ''));

  // 3. Fix indentation based on brace depth
  let depth = 0;
  const indented = [];
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      indented.push('');
      continue;
    }

    // Count leading closing braces to decrement depth before indenting
    const leadingCloses = trimmed.match(/^(\}[\s}]*)/);
    let leadingCloseCount = 0;
    if (leadingCloses) {
      leadingCloseCount = (leadingCloses[1].match(/\}/g) || []).length;
      depth = Math.max(0, depth - leadingCloseCount);
    }

    indented.push('  '.repeat(depth) + trimmed);

    // Count all braces to update depth
    const opens = (trimmed.match(/\{/g) || []).length;
    const closes = (trimmed.match(/\}/g) || []).length;
    // Leading closes were already subtracted; only subtract non-leading closes
    depth += opens - (closes - leadingCloseCount);
    depth = Math.max(0, depth);
  }
  lines = indented;

  // 4. Ensure blank line after shebang
  if (lines.length > 1 && lines[0].startsWith('#!')) {
    if (lines[1].trim() !== '') {
      lines.splice(1, 0, '');
    }
  }

  // 5. Collapse multiple consecutive empty lines to one
  const collapsed = [];
  let prevEmpty = false;
  for (const line of lines) {
    const isEmpty = line.trim() === '';
    if (isEmpty && prevEmpty) continue;
    collapsed.push(line);
    prevEmpty = isEmpty;
  }
  lines = collapsed;

  // 6. Ensure blank line after top-level function/block closing braces
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]);

    // If this line is a closing brace at the top level (no indentation)
    // and next line is non-empty and not another closing brace, add blank line
    const trimmed = lines[i].trim();
    if (trimmed === '}' && lines[i] === '}' && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (nextLine !== '' && nextLine !== '}') {
        result.push('');
      }
    }
  }
  lines = result;

  // Ensure file ends with a single newline
  let output = lines.join('\n');
  output = output.replace(/\n+$/, '\n');

  return output;
}
