// Condensed KimchiLang reference for LLM prompts
// This is the actual language used in ## test and ## impl sections

export const LANGUAGE_REF = `## KimchiLang Reference

KimchiLang is a purely functional language that transpiles to JavaScript.
No classes, no \`this\`, no global scope. All values are deeply immutable by default.

### Declarations
- \`dec x = value\` — immutable binding (deeply frozen via Object.freeze)
- \`mut x = value\` — mutable binding (block-scoped, cannot be captured by closures or returned)
- \`fn name(params) { body }\` — function declaration
- \`async fn name(params) { body }\` — async function
- \`expose fn name(params) { body }\` — public function (visible to other modules)
- \`expose name\` — expose an already-declared binding

### Control Flow
- \`if condition { body }\` — no parens around condition
- \`if condition { body } else { body }\`
- \`if condition { body } elif condition { body } else { body }\`
- \`for item in iterable { body }\` — for-in loop
- \`for i in 0..10 { body }\` — range loop
- \`while condition { body }\`
- \`break\` / \`continue\`
- \`return expression\`

### Error Handling
- \`try { body } catch (e) { body }\` — parens around catch parameter required
- \`try { body } catch (e) { body } finally { body }\`
- \`throw expression\`

### Enums
\`\`\`
enum Status { Open, InProgress, Done }
enum TaskError {
  InvalidTitle { reason: String },
  InvalidTransition { from: Status, to: Status }
}
\`\`\`
Access variants as \`Status.Open\`, \`TaskError.InvalidTitle { reason: "too long" }\`.
Enum values are frozen objects with a string value matching the variant name.

### Functions and Arrows
- \`fn add(a, b) { return a + b }\`
- \`x => x * 2\` — single-param arrow
- \`(a, b) => a + b\` — multi-param arrow
- \`fn greet(name = "World") { ... }\` — default parameters
- \`fn sum(...nums) { ... }\` — rest parameters

### Operators
- \`==\` / \`!=\` — strict equality (compiles to === / !==)
- \`and\` / \`or\` / \`not\` — logical operators
- \`~>\` — pipe operator (eager): \`items ~> filter(fn) ~> map(fn)\`
- \`>>\` — flow operator (lazy composition)
- \`..\` — range: \`0..5\` produces [0, 1, 2, 3, 4]
- \`...\` — spread: \`[...arr1, ...arr2]\`

### Data
- \`[1, 2, 3]\` — array literal
- \`{ key: value }\` — object literal (keys unquoted)
- \`{ name }\` — shorthand for \`{ name: name }\`
- \`obj.property\` — null-safe member access (compiles to \`obj?.property\`)
- \`dec { a, b } = obj\` — object destructuring
- \`dec [a, b] = arr\` — array destructuring

### Testing
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
  expect(expression).toMatch(regex)
  expect(fn).toThrow(message)
}
\`\`\`

### JS Interop
- \`js { /* raw JavaScript */ }\` — inline JavaScript block
- Standard JS built-ins are available: \`Math\`, \`Date\`, \`JSON\`, \`Object\`, \`Array\`, \`String\`, \`parseInt\`, \`typeof\`, etc.
- String methods: \`.trim()\`, \`.toLowerCase()\`, \`.includes()\`, \`.split()\`, \`.replace()\`, etc.
- Array methods: \`.filter()\`, \`.map()\`, \`.reduce()\`, \`.sort()\`, \`.find()\`, \`.length\`, etc.

### SpecScript File Structure
SpecScript files (.sp) have three sections delimited by markdown headings:
1. \`## spec\` — human-written specification
2. \`## test\` — tests (KimchiLang code)
3. \`## impl\` — implementation (KimchiLang code)

Both ## test and ## impl must start with a hash comment:
\`<!-- spec-hash: sha256:HASH_VALUE -->\`

### Important Notes
- All \`dec\` bindings are deeply frozen — you cannot mutate objects or arrays
- Use \`mut\` when you need a mutable loop counter or accumulator
- \`expose\` marks functions/values as public API
- Member access is always null-safe (\`obj.a.b.c\` compiles to \`obj?.a?.b?.c\`)
- Parentheses are required around catch parameters: \`catch (e)\` not \`catch e\`
`;
