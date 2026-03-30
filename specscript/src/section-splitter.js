// Section Splitter — splits .sp files into spec/test/impl sections

const MAX_LINES = 500;
const SECTION_PATTERN = /^## (spec|test|impl)\s*$/;

export function splitSections(source) {
  const lines = source.split('\n');

  if (lines.length > MAX_LINES) {
    throw new Error(
      `File exceeds 500 line limit (${lines.length} lines). Split into smaller modules.`
    );
  }

  const sectionStarts = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SECTION_PATTERN);
    if (match) {
      sectionStarts.push({ name: match[1], line: i });
    }
  }

  const names = sectionStarts.map(s => s.name);

  if (!names.includes('spec')) {
    throw new Error('Missing required ## spec section');
  }
  if (!names.includes('test')) {
    throw new Error('Missing required ## test section');
  }
  if (!names.includes('impl')) {
    throw new Error('Missing required ## impl section');
  }

  const specIdx = names.indexOf('spec');
  const testIdx = names.indexOf('test');
  const implIdx = names.indexOf('impl');

  if (!(specIdx < testIdx && testIdx < implIdx)) {
    throw new Error(
      'Sections must be in order: ## spec, ## test, ## impl'
    );
  }

  const specStart = sectionStarts[specIdx].line + 1;
  const testStart = sectionStarts[testIdx].line + 1;
  const implStart = sectionStarts[implIdx].line + 1;

  const specEnd = sectionStarts[testIdx].line;
  const testEnd = sectionStarts[implIdx].line;
  const implEnd = lines.length;

  return {
    spec: lines.slice(specStart, specEnd).join('\n'),
    test: lines.slice(testStart, testEnd).join('\n'),
    impl: lines.slice(implStart, implEnd).join('\n'),
  };
}
