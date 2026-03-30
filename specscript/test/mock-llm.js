#!/usr/bin/env node

// Mock LLM for testing — reads prompt from stdin, returns canned response

import { readFileSync } from 'node:fs';

const input = readFileSync('/dev/stdin', 'utf-8');

// If the prompt contains "Review whether", respond with APPROVED
if (input.includes('Review whether')) {
  process.stdout.write('APPROVED\n');
  process.exit(0);
}

// If the prompt contains "Fix the following", respond with APPROVED
if (input.includes('Fix the following')) {
  process.stdout.write('APPROVED\n');
  process.exit(0);
}

// Otherwise it's a generate request — extract the hash from the prompt
const hashMatch = input.match(/spec-hash: (sha256:[a-f0-9]+)/);
const hash = hashMatch ? hashMatch[1] : 'sha256:unknown';

// Check what target is requested
if (input.includes('ONLY the ## test section')) {
  process.stdout.write(`## test

<!-- spec-hash: ${hash} -->

test "basic functionality" {
  expect(1).toBe(1)
}
`);
} else if (input.includes('ONLY the ## impl section')) {
  process.stdout.write(`## impl

<!-- spec-hash: ${hash} -->

fn placeholder() {
  return 1
}
`);
} else {
  // --all: generate both
  process.stdout.write(`## test

<!-- spec-hash: ${hash} -->

test "basic functionality" {
  expect(1).toBe(1)
}

## impl

<!-- spec-hash: ${hash} -->

fn placeholder() {
  return 1
}
`);
}
