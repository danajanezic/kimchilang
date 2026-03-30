// Hasher — normalizes spec content and computes SHA-256 hashes

import { createHash } from 'node:crypto';

export function normalizeSpec(source) {
  return source
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}

export function computeSpecHash(source) {
  const normalized = normalizeSpec(source);
  const hash = createHash('sha256').update(normalized).digest('hex');
  return `sha256:${hash}`;
}

export function extractHash(section) {
  const match = section.match(/<!--\s*spec-hash:\s*(sha256:[a-f0-9]+)\s*-->/);
  return match ? match[1] : null;
}
