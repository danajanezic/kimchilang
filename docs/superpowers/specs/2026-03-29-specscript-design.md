# SpecScript Language Design

A spec-first programming language optimized for LLMs to read and write. Humans author specifications; LLMs generate tests and implementation. The compiler enforces that specs, tests, and code stay in sync via content hashing.

## Core Principles

- **Spec-first:** Specifications are the authoritative source artifact. Code is derived and disposable.
- **LLM-native:** Markdown-like syntax that aligns with LLM training data. Pure functional, immutable, null-safe design eliminates common LLM-generated bugs.
- **TDD by design:** Every file follows a mandatory spec → test → impl order. Tests must pass for compilation to succeed.
- **Enforced sync:** The compiler hashes spec content and rejects files where tests or implementation are stale.
- **Humans write intent, LLMs write code:** Specs capture *why* (intent, rationale, requirements). LLMs decide *how*.

## File Structure

Every `.sp` file has three ordered sections delimited by markdown headings. The compiler rejects files that violate this order or omit any section.

```markdown
## spec

# ModuleName

**intent:** What this module does
**reason:** Why it exists — the business justification

### requires

- First requirement in natural language
- Second requirement
- Third requirement

### types

- Order :: { items: [Item], customer: Customer, payment: PaymentMethod }
- OrderResult :: Confirmed { orderId, estimatedDelivery } | Failed { reason: FailureReason }
- FailureReason :: OutOfStock | PaymentDeclined | InvalidAddress

### depends

- inventory.stock :: checkInventory
- payment.gateway :: processPayment, rollbackPayment

### expose processOrder :: (Order) -> OrderResult

**intent:** Validate, charge, and reserve inventory for an order

### expose checkInventory :: ([Item]) -> [ItemAvailability]

**intent:** Check current stock levels for a list of items

### internal reserveInventory :: ([Item]) -> ReservationResult

**intent:** Temporarily hold inventory during payment processing

## test

<!-- spec-hash: sha256:ab12cd... -->

test "valid order is confirmed with delivery date" {
  dec result = processOrder(validOrder)
  expect(result).toBe(Confirmed)
  expect(result.estimatedDelivery).toBeTruthy()
}

test "out of stock items fail gracefully" {
  dec result = processOrder(outOfStockOrder)
  expect(result).toBe(Failed)
  expect(result.reason).toBe(OutOfStock)
}

test "declined payment returns PaymentDeclined" {
  dec result = processOrder(declinedPaymentOrder)
  expect(result).toBe(Failed)
  expect(result.reason).toBe(PaymentDeclined)
}

## impl

<!-- spec-hash: sha256:ab12cd... -->

fn processOrder(order) {
  dec inventory = checkInventory(order.items)
  dec unavailable = inventory ~> filter(i => not i.available)

  if unavailable.length > 0 {
    return Failed { reason: OutOfStock }
  }

  dec payment = processPayment(order.payment, order.total)

  if payment.declined {
    return Failed { reason: PaymentDeclined }
  }

  dec reservation = reserveInventory(order.items)

  if reservation.failed {
    rollbackPayment(payment.id)
    return Failed { reason: reservation.error }
  }

  return Confirmed {
    orderId: reservation.id,
    estimatedDelivery: calculateDelivery(order.customer.address)
  }
}
```

## Spec Language

The `## spec` section is structured natural language, not code. It defines intent and contracts.

### Required Elements

| Element | Scope | Purpose |
|---------|-------|---------|
| `**intent:**` | Module and every function | What it does |
| `**reason:**` | Module | Why it exists (business justification) |
| `### requires` | Module | Natural-language requirements list |
| `### types` | Module | Data shape definitions |
| Function declarations | Module | Signatures with `expose` or `internal` visibility |

### Optional Elements

| Element | Purpose |
|---------|---------|
| `### depends` | Explicit module dependencies and which functions are used |

### What Specs Do Not Contain

- No algorithmic detail ("sort using quicksort")
- No implementation hints ("use a hash map")
- No performance requirements
- Specs describe *intent*, not *mechanism*

## Code Language (impl block)

The implementation language follows KimchiLang's design principles:

- **Purely functional:** No classes, no `this`, no global scope
- **Immutable by default:** `dec x = value` produces a deeply frozen binding
- **Null-safe:** All member access compiles to optional chaining
- **Strict equality:** `==` means `===`
- **Pipe operator:** `~>` for eager chaining, `>>` for lazy composition
- **Arrow functions:** `x => x * 2`, `(a, b) => a + b`
- **Pattern matching, destructuring, enums** as in KimchiLang

Visibility (`expose` / `internal`) is declared in the spec, not in the impl. The impl just defines functions; the spec controls the public API.

## Hash Mechanism

The compiler enforces spec-test-impl sync through content hashing.

### How It Works

1. The compiler normalizes the `## spec` section (collapse whitespace, trim lines) and computes a SHA-256 hash
2. The `## test` section must contain a `<!-- spec-hash: sha256:HASH -->` comment matching the current spec hash
3. The `## impl` section must contain the same matching hash
4. If either hash mismatches, the file will not compile

### Compilation States

| Spec hash | Test hash matches | Impl hash matches | State | Compiler behavior |
|-----------|-------------------|-------------------|-------|-------------------|
| abc123 | abc123 | abc123 | **Fresh** | Compile normally, run tests |
| abc123 | abc123 | abc123 | **Tests fail** | Compile error — impl doesn't satisfy spec |
| def456 | abc123 | abc123 | **Stale** | Compile error — tests and impl need regeneration |
| def456 | def456 | abc123 | **Impl stale** | Compile error — impl needs regeneration |
| def456 | abc123 | def456 | **Invalid** | Compile error — tests must be regenerated before impl |

### Key Rules

1. Missing hash is a compile error — no way to bypass the mechanism
2. Tests must be regenerated before impl — you cannot update impl against a stale test suite
3. Tests must pass for compilation to succeed
4. Whitespace is normalized before hashing to prevent spurious staleness from reformatting

## Cross-Module Staleness

Dependencies are declared in `### depends`. The compiler tracks a dependency graph of spec hashes.

### Cascade Rules

Staleness cascades across module boundaries only on **structural changes**:
- Function signature changes (parameters, return type)
- Type definition changes
- Adding or removing an `expose`d function
- Changes to `### requires`

Intent or reason rewording within a dependency does **not** cascade to consumers. It invalidates only the dependency's own tests and impl.

## Project-Level Spec

Every project has a root file (e.g., `project.md`) that defines global context:

```markdown
# OrderSystem

**intent:** End-to-end order management for an e-commerce platform
**reason:** Replace legacy PHP monolith with maintainable, testable services

## config

- target: javascript
- runtime: node
- strict: true

## requires

- All payment operations must be idempotent
- No direct database access — all persistence through the storage module
- All external HTTP calls must have timeout and retry configuration
- Errors must propagate as typed results, never raw exceptions

## modules

- order.processor :: Core order lifecycle
- order.validator :: Input validation and sanitization
- inventory.stock :: Inventory queries and reservations
- payment.gateway :: Payment processing and rollback
- storage.orders :: Order persistence
```

### Project-Level Elements

- **`## config`** — compiler settings (target language, runtime, strictness)
- **`## requires`** — global constraints that apply to every module. The compiler/linter can verify these across the entire codebase.
- **`## modules`** — the module registry. The compiler uses this to detect orphaned files and missing dependencies.

Project-level `requires` are provided as context to the LLM when generating any module's tests or impl.

## Module System

Module paths map to the filesystem:

```
project/
  project.md              # Project-level spec
  order/
    processor.sp           # order.processor
    validator.sp           # order.validator
  inventory/
    stock.sp               # inventory.stock
  payment/
    gateway.sp             # payment.gateway
  storage/
    orders.sp              # storage.orders
```

`order.processor` refers to `order/processor.sp`.

## File Constraints

- **500-line maximum** per `.sp` file, enforced at compile time. Files that exceed this limit must be decomposed into smaller modules.
- This keeps files focused, forces proper decomposition, and ensures the full spec-test-impl context fits within a single LLM prompt window.

## Compilation Target

SpecScript transpiles to JavaScript. The compiler emits JS with runtime helpers (deep freeze, optional chaining) following KimchiLang's established patterns.

The spec-first design means compilation targets can be added later without affecting the language — specs and tests are target-independent, only the impl generation and compiler backend change.

## CLI Toolchain

```bash
sp init                  # Scaffold a new project with project.md
sp check <file>          # Validate structure and hash freshness
sp compile <file>        # Compile to JS (fails if stale or tests fail)
sp stale <file|dir>      # Report which files need regeneration and why
sp regen <file> --test   # Output structured prompt for LLM test regeneration
sp regen <file> --impl   # Output structured prompt for LLM impl regeneration
sp regen <file> --all    # Output structured prompt for full regeneration
sp build <dir>           # Compile all files in dependency order
sp run <file>            # Compile and execute
```

### The `sp regen` Command

`sp regen` does not generate code itself. It outputs the spec (plus project-level context and dependency specs) in a structured format that an LLM consumes. The LLM returns updated test/impl blocks with fresh hashes. This keeps LLM integration at the tooling boundary, not inside the compiler.

## LLM-Friendly Design Summary

### For LLM authors (generating tests and impl)

- Markdown-like syntax aligns with LLM training data
- Spec is in the same file — full context of *why* when generating *how*
- Pure functional, immutable, null-safe — eliminates mutation bugs, null derefs, `this` confusion
- Flat function structure — no class hierarchies to reason about
- Types declared in the spec — no need to infer data shapes
- `requires` list maps directly to test cases

### For LLM consumers (reasoning about and transforming code)

- Every function has an `intent` — purpose is explicit, not reverse-engineered
- `depends` section is explicit — module relationships without parsing imports
- Project-level `requires` give global constraints
- Impl is disposable — confident regeneration without preserving hand-crafted logic
- Hash mechanism guarantees tests and impl reflect the current spec

### For humans (spec authors)

- No code to write — just intent, rationale, requirements, and types
- Files render as readable documents in GitHub, wikis, anywhere
- Staleness is visible and enforced — no accidentally shipping stale code
- 500-line limit keeps modules focused and reviewable

## Workflow

1. Human writes or edits `## spec`
2. `sp check` detects staleness
3. `sp regen <file> --test` produces prompt for LLM
4. LLM generates `## test` block with fresh spec hash
5. `sp regen <file> --impl` produces prompt for LLM
6. LLM generates `## impl` block with fresh spec hash
7. `sp compile` runs tests and compiles to JS
8. If tests fail, LLM regenerates impl (step 5-7)
9. If tests pass, code ships
