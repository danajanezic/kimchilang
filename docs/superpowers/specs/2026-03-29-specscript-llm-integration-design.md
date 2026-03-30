# SpecScript LLM Integration Design

Adds LLM integration to the `sp regen` command so it automatically generates and reviews test/impl sections from specs, rather than outputting JSON for manual LLM interaction.

## Config File

`specscript.config.json` in the project root:

```json
{
  "llm": {
    "command": "claude --print",
    "maxRetries": 5
  }
}
```

### Fields

- **`llm.command`** (required) — a shell command that reads a prompt from stdin and writes the LLM response to stdout. Examples:
  - `claude --print`
  - `cat | ollama run llama3`
  - `openai chat -m gpt-4o`
- **`llm.maxRetries`** (optional, default 5) — maximum number of review/fix cycles before giving up

The compiler validates that the config file exists and `llm.command` is set before attempting regen. If missing, it prints a helpful error with an example config.

## Regen Flow

When the user runs `sp regen fizzbuzz.sp --all`:

### Pass 1: Generate

1. Load `specscript.config.json` from the project root (walk up from the file's directory)
2. Build a generation prompt containing:
   - The condensed SpecScript language reference (syntax, keywords, operators, test/impl format)
   - The file's `## spec` section content
   - The current spec hash
   - Instructions to output only `## test` and `## impl` sections in the correct format
3. Pipe the prompt to the configured LLM command via stdin
4. Capture stdout as the LLM response
5. Parse the response to extract `## test` and `## impl` blocks

### Pass 2: Review

1. Build a review prompt containing:
   - The original `## spec` section
   - The generated `## test` and `## impl` sections
   - Instructions to verify each spec requirement has at least one corresponding test
   - Instructions to respond with exactly "APPROVED" if everything is correct, or list specific issues
2. Pipe to LLM, capture response
3. If response contains "APPROVED" — proceed to apply step
4. If response lists issues — proceed to fix loop

### Pass 3+: Fix Loop

1. Build a fix prompt containing:
   - The original `## spec` section
   - The current `## test` and `## impl` sections
   - The review feedback listing specific issues
   - Instructions to fix the issues and output corrected `## test` and `## impl` sections
2. Pipe to LLM, get revised test/impl
3. Review again (back to pass 2)
4. Repeat until approved or `maxRetries` exhausted

### On Success (Review Approved)

1. Display a diff showing what will change in the `.sp` file
2. Prompt: `Apply these changes? (y/n)`
3. If yes — write the updated `## test` and `## impl` sections into the `.sp` file, replacing existing content (or appending if the file was spec-only)
4. If no — exit without changes

### On Max Retries Exhausted

1. Display the last review feedback
2. Write the best attempt to `<filename>.sp.draft` alongside the original file
3. Print a message telling the user to review the draft and manually edit

## Prompt Design

### Generation Prompt

```
You are generating code for SpecScript, a spec-first language that transpiles to JavaScript.

## Language Reference

### File Structure
SpecScript files have three sections: ## spec, ## test, ## impl

### Test Syntax
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

### Implementation Syntax
- dec x = value (immutable declaration, deeply frozen)
- fn name(params) { body } (function declaration)
- if condition { body } else { body }
- for item in iterable { body }
- while condition { body }
- try { body } catch e { body }
- throw expression
- return expression
- enum Name { Variant1, Variant2 }
- x => expression (arrow function)
- (a, b) => expression (multi-param arrow)
- items ~> transform(fn) (pipe operator)
- a == b (strict equality)
- a != b (strict inequality)
- a and b, a or b, not a (logical operators)
- obj.property (null-safe member access)
- [1, 2, 3] (array literal)
- { key: value } (object literal)
- Name { field: value } (named constructor)
- start..end (range expression)

## Spec to Implement

{spec_content}

## Instructions

Generate two sections for this spec. Each section must start with a spec-hash comment.

Output ONLY the following two sections, no other text:

## test

<!-- spec-hash: {spec_hash} -->

[test blocks here]

## impl

<!-- spec-hash: {spec_hash} -->

[implementation here]
```

### Review Prompt

```
Review whether the generated tests and implementation match the spec requirements.

## Spec

{spec_content}

## Generated Code

{test_and_impl_content}

## Instructions

For each requirement listed in the spec:
1. Verify there is at least one test that covers it
2. Verify the implementation would satisfy it

Check that:
- Tests verify behavior described in the spec, not implementation details
- All exposed functions declared in the spec are implemented
- All internal functions declared in the spec are implemented
- Types/enums declared in the spec are defined in the implementation

If everything looks correct, respond with exactly: APPROVED

Otherwise, list each issue as:
- ISSUE: [description of what's missing or wrong]
- FIX: [what should be added or changed]
```

### Fix Prompt

```
Fix the following issues in the SpecScript test and implementation sections.

## Spec

{spec_content}

## Current Code

{test_and_impl_content}

## Issues Found

{review_feedback}

## Instructions

Fix all listed issues. Output the corrected sections.

Output ONLY the following two sections, no other text:

## test

<!-- spec-hash: {spec_hash} -->

[corrected test blocks]

## impl

<!-- spec-hash: {spec_hash} -->

[corrected implementation]
```

## Response Parsing

The LLM response is parsed to extract `## test` and `## impl` sections:

1. Find `## test` heading in the response
2. Find `## impl` heading in the response
3. Extract content between them (test section) and after impl heading (impl section)
4. Verify both sections contain the correct `<!-- spec-hash: {hash} -->` comment
5. If the hash comment is missing or wrong, inject/fix it automatically

If the response cannot be parsed (no recognizable sections), treat it as a generation failure and retry.

## Diff Display

Before applying changes, show a unified diff:

```
Changes to examples/fizzbuzz.sp:

+ ## test
+
+ <!-- spec-hash: sha256:f846... -->
+
+ test "returns Fizz for multiples of 3" {
+   expect(fizzbuzz(3)[2]).toBe("Fizz")
+ }
+ ...
+
+ ## impl
+
+ <!-- spec-hash: sha256:f846... -->
+
+ fn fizzbuzz(n) {
+   ...
+ }

Apply these changes? (y/n)
```

For files that already have test/impl sections, show removed lines with `-` and added lines with `+`.

## Error Handling

| Error | Behavior |
|-------|----------|
| No `specscript.config.json` found | Print error with example config, exit 1 |
| `llm.command` missing from config | Print error explaining the field is required, exit 1 |
| LLM command fails (non-zero exit) | Print stderr from the command, retry up to maxRetries |
| LLM response unparseable | Print warning, retry with a "please output only the sections" reminder appended |
| All retries exhausted | Save `.sp.draft`, print review feedback, exit 1 |

## File Structure

```
specscript/
  src/
    llm.js              # LLM invocation, prompt building, response parsing, retry loop
    language-ref.js      # Condensed SpecScript language reference as string constant
    cli.js               # Modified: cmdRegen uses LLM, sp init scaffolds config
  test/
    test.js              # New tests for config loading, prompt building, response parsing
```

## CLI Changes

### `sp regen` (modified)

No longer outputs JSON. Instead:
1. Loads config
2. Invokes LLM for generation
3. Invokes LLM for review
4. Loops if needed
5. Shows diff and confirms before writing

The `--test`, `--impl`, `--all` flags still work — they control which sections to generate. For `--test`, only the test section is generated. For `--impl`, the existing tests are included in the prompt and only impl is generated. For `--all`, both are generated.

### `sp init` (modified)

Also creates `specscript.config.json` with a template:

```json
{
  "llm": {
    "command": "YOUR_LLM_COMMAND_HERE",
    "maxRetries": 5
  }
}
```

## Regen Targets

### `--all` (generate both test and impl)

Single generation prompt asks for both sections. Review checks both.

### `--test` (generate tests only)

Generation prompt asks for only `## test` section. If impl exists, it's included as context but not regenerated. Review only checks test coverage.

### `--impl` (generate implementation only)

Generation prompt includes existing `## test` section and asks for only `## impl` that passes the tests. Review checks that impl satisfies the spec and would pass the tests.
