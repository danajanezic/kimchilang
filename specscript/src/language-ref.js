// Condensed SpecScript language reference for LLM prompts

export const LANGUAGE_REF = `## SpecScript Language Reference

### File Structure
SpecScript files have three ordered sections delimited by markdown headings:
- \`## spec\` — human-written specification (intent, requirements, types, function signatures)
- \`## test\` — tests that verify the spec requirements
- \`## impl\` — implementation code

Both ## test and ## impl must start with a hash comment:
\`<!-- spec-hash: sha256:HASH_VALUE -->\`

### Test Syntax
\`\`\`
test "description" {
  expect(expression).toBe(expected)
  expect(expression).toEqual(expected)
  expect(expression).toBeTruthy()
  expect(expression).toBeFalsy()
  expect(expression).toContain(item)
  expect(expression).toHaveLength(n)
  expect(expression).toBeGreaterThan(n)
  expect(expression).toBeLessThan(n)
  expect(expression).toBeNull()
  expect(fn).toThrow(message)
}
\`\`\`

### Implementation Syntax
- \`dec x = value\` — immutable declaration (deeply frozen)
- \`fn name(params) { body }\` — function declaration
- \`async fn name(params) { body }\` — async function
- \`if condition { body } else { body }\` — conditional (no parens around condition)
- \`for item in iterable { body }\` — for-in loop
- \`while condition { body }\` — while loop
- \`try { body } catch e { body }\` — error handling
- \`throw expression\` — throw error
- \`return expression\` — return value
- \`enum Name { Variant1, Variant2 }\` — enum declaration
- \`x => expression\` — single-param arrow function
- \`(a, b) => expression\` — multi-param arrow function
- \`items ~> transform(fn)\` — pipe operator (eager)
- \`a >> b\` — flow operator (lazy composition)
- \`a == b\` — strict equality (compiles to ===)
- \`a != b\` — strict inequality (compiles to !==)
- \`a and b\`, \`a or b\`, \`not a\` — logical operators
- \`obj.property\` — null-safe member access (compiles to ?.)
- \`[1, 2, 3]\` — array literal
- \`{ key: value }\` — object literal
- \`Name { field: value }\` — named constructor (enum variant with data)
- \`start..end\` — range expression
- \`...arr\` — spread operator
- \`dec { a, b } = obj\` — object destructuring
- \`dec [a, b] = arr\` — array destructuring
`;
