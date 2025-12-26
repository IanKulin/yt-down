import { dirname, join } from '@std/path';
import { ensureDir } from '@std/fs';
import { assertEquals, assertMatch } from '@std/assert';

const __dirname = dirname(new URL(import.meta.url).pathname);

export const TEST_DATA_DIR = join(__dirname, 'test-data');

export async function createTestDir() {
  await ensureDir(TEST_DATA_DIR);
  return TEST_DATA_DIR;
}

export async function cleanupTestDir() {
  try {
    await Deno.remove(TEST_DATA_DIR, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

export async function createTestFile(relativePath, content) {
  const fullPath = join(TEST_DATA_DIR, relativePath);
  const dir = dirname(fullPath);
  await ensureDir(dir);
  await Deno.writeTextFile(fullPath, content);
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
  assertEquals(actual.length, expected.length, message + ' - length mismatch');
  for (let i = 0; i < actual.length; i++) {
    assertEquals(actual[i], expected[i], message + ` - item ${i} mismatch`);
  }
}

export function assertValidHash(hash, message = 'Invalid hash') {
  assertEquals(typeof hash, 'string', message + ' - should be string');
  assertEquals(hash.length, 64, message + ' - should be 64 characters');
  assertMatch(hash, /^[a-f0-9]+$/, message + ' - should be lowercase hex');
}
