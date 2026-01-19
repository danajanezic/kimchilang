# KimchiLang as a CLI Framework

KimchiLang's built-in module system makes it an excellent choice for building CLI tools. This directory contains examples demonstrating CLI patterns.

## Features for CLI Development

- **`arg` / `!arg`** - Declare optional and required arguments
- **`_describe()`** - Provide module description for help output
- **Module paths** - Run modules with `kimchi module.path`
- **Named args** - Pass `--arg-name value` from command line
- **Dependency injection** - Mock dependencies for testing

## Examples

### 1. Simple Greeter (`greeter.km`)

A basic CLI tool with required and optional arguments:

```bash
kimchi cli-framework.greeter --name Alice
kimchi cli-framework.greeter --name Bob --greeting "Hey there" --times 3
```

### 2. Calculator (`calculator.km`)

A calculator with multiple operations:

```bash
kimchi cli-framework.calculator --op add --a 5 --b 3
kimchi cli-framework.calculator --op multiply --a 7 --b 6
kimchi cli-framework.calculator --op divide --a 100 --b 4
```

### 3. Deploy Tool (`deploy.km`)

A deployment tool showing multi-action patterns with environment configuration:

```bash
kimchi cli-framework.deploy --action build
kimchi cli-framework.deploy --action test
kimchi cli-framework.deploy --action publish --target-env production --verbose true
```

## Running Examples

```bash
kimchi cli-framework.greeter --name World
```

## CLI Patterns

### Required vs Optional Arguments

```kimchi
!arg name        // Required - throws error if missing
arg greeting     // Optional - undefined if not provided
```

### Handling Defaults

Since CLI args come as strings, handle defaults explicitly:

```kimchi
!arg name
arg greeting
arg times

dec actualGreeting = greeting ? greeting : "Hello"
dec actualTimes = times ? Number(times) : 1
```

### Boolean Flags

Boolean args from CLI come as strings:

```kimchi
arg verbose
arg dryRun

dec isVerbose = verbose == "true" || verbose == true
dec isDryRun = dryRun == "true" || dryRun == true
```

### Module Description

Provide a `_describe()` function for help output:

```kimchi
expose fn _describe() {
  return "A brief description of what this CLI does"
}
```
