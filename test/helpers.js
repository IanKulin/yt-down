import { strict as assert } from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TEST_DATA_DIR = path.join(__dirname, 'test-data');

export async function createTestDir() {
  await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  return TEST_DATA_DIR;
}

export async function cleanupTestDir() {
  try {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

export async function createTestFile(relativePath, content) {
  const fullPath = path.join(TEST_DATA_DIR, relativePath);
  const dir = path.dirname(fullPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
  return fullPath;
}

export function createMockLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

// Custom assertion helpers
export function assertEqualArrays(actual, expected, message) {
  assert.equal(actual.length, expected.length, message + ' - length mismatch');
  for (let i = 0; i < actual.length; i++) {
    assert.deepEqual(actual[i], expected[i], message + ` - item ${i} mismatch`);
  }
}

export function assertValidHash(hash, message = 'Invalid hash') {
  assert.equal(typeof hash, 'string', message + ' - should be string');
  assert.equal(hash.length, 64, message + ' - should be 64 characters');
  assert.match(hash, /^[a-f0-9]+$/, message + ' - should be lowercase hex');
}