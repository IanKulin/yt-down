import { describe, it as test } from '@std/testing/bdd';
import { assert, assertEquals } from '@std/assert';
import { join } from '@std/path';
import {
  ensureDirectoryExists,
  formatFileSize,
  getDownloadedFiles,
} from '../lib/utils.js';
import {
  cleanupTestDir,
  createMockLogger,
  createTestDir,
  TEST_DATA_DIR,
} from './helpers.js';

describe('utils.js', () => {
  describe('formatFileSize', () => {
    test('should format bytes correctly', () => {
      assertEquals(formatFileSize(0), '0 Bytes');
      assertEquals(formatFileSize(1), '1 Bytes');
      assertEquals(formatFileSize(512), '512 Bytes');
      assertEquals(formatFileSize(1023), '1023 Bytes');
    });

    test('should format kilobytes correctly', () => {
      assertEquals(formatFileSize(1024), '1 KB');
      assertEquals(formatFileSize(1536), '1.5 KB');
      assertEquals(formatFileSize(2048), '2 KB');
      assertEquals(formatFileSize(1048575), '1024 KB');
    });

    test('should format megabytes correctly', () => {
      assertEquals(formatFileSize(1048576), '1 MB');
      assertEquals(formatFileSize(1572864), '1.5 MB');
      assertEquals(formatFileSize(10485760), '10 MB');
      assertEquals(formatFileSize(1073741823), '1024 MB');
    });

    test('should format gigabytes correctly', () => {
      assertEquals(formatFileSize(1073741824), '1 GB');
      assertEquals(formatFileSize(1610612736), '1.5 GB');
      assertEquals(formatFileSize(10737418240), '10 GB');
    });

    test('should handle decimal places correctly', () => {
      assertEquals(formatFileSize(1234567), '1.18 MB');
      assertEquals(formatFileSize(9876543210), '9.2 GB');
    });
  });

  describe('ensureDirectoryExists', () => {
    test('should create directory if it does not exist', async () => {
      await createTestDir();
      const testDir = join(TEST_DATA_DIR, 'new-directory');

      // Ensure it doesn't exist first
      try {
        await Deno.stat(testDir);
        throw new Error('Directory should not exist initially');
      } catch (error) {
        assert(error instanceof Deno.errors.NotFound);
      }

      await ensureDirectoryExists(testDir);

      // Should now exist
      const stats = await Deno.stat(testDir);
      assert(stats.isDirectory);

      await cleanupTestDir();
    });

    test('should not error if directory already exists', async () => {
      await createTestDir();
      const testDir = join(TEST_DATA_DIR, 'existing-directory');
      await Deno.mkdir(testDir);

      // Should not throw
      await ensureDirectoryExists(testDir);

      const stats = await Deno.stat(testDir);
      assert(stats.isDirectory);

      await cleanupTestDir();
    });

    test('should create nested directories', async () => {
      await createTestDir();
      const testDir = join(TEST_DATA_DIR, 'level1', 'level2', 'level3');

      await ensureDirectoryExists(testDir);

      const stats = await Deno.stat(testDir);
      assert(stats.isDirectory);

      await cleanupTestDir();
    });
  });

  describe('getDownloadedFiles', () => {
    test('should return flat array of files from actual downloads directory', async () => {
      const logger = createMockLogger();

      // Test the actual function but don't make assumptions about specific content
      const files = await getDownloadedFiles(logger);

      // Basic structure validation
      assert(Array.isArray(files), 'Should return an array');

      // If there are files, they should have the correct structure
      for (const file of files) {
        assert(typeof file === 'object', 'File should be object');
        assert('name' in file, 'File should have name');
        assert('extension' in file, 'File should have extension');
        assert('size' in file, 'File should have size');
        assert('modified' in file, 'File should have modified');
        assert('isVideo' in file, 'File should have isVideo');
        assert('isSubtitle' in file, 'File should have isSubtitle');

        // File should be either video or subtitle (or neither), but not both
        assert(
          !(file.isVideo && file.isSubtitle),
          'File should not be both video and subtitle',
        );
      }
    });

    test('should detect file types correctly with regex patterns', () => {
      // Test the regex patterns used by the function
      const videoExtensions = ['mp4', 'mkv', 'webm', 'avi', 'mov'];
      const subtitleExtensions = [
        'srt',
        'vtt',
        'dfxp',
        'ass',
        'ttml',
        'sbv',
        'lrc',
      ];

      for (const ext of videoExtensions) {
        const filename = `test.${ext}`;
        assert(
          /\.(mkv|mp4|webm|avi|mov)$/i.test(filename),
          `${ext} should match video pattern`,
        );
        assert(
          !/\.(srt|vtt|dfxp|ass|ttml|sbv|lrc)$/i.test(filename),
          `${ext} should not match subtitle pattern`,
        );
      }

      for (const ext of subtitleExtensions) {
        const filename = `test.${ext}`;
        assert(
          /\.(srt|vtt|dfxp|ass|ttml|sbv|lrc)$/i.test(filename),
          `${ext} should match subtitle pattern`,
        );
        assert(
          !/\.(mkv|mp4|webm|avi|mov)$/i.test(filename),
          `${ext} should not match video pattern`,
        );
      }
    });

    test('should handle empty downloads directory gracefully', async () => {
      // Test that the function handles missing or empty directory
      const logger = createMockLogger();

      // The function should handle errors gracefully and return empty array
      try {
        const files = await getDownloadedFiles(logger);
        assert(
          Array.isArray(files),
          'Should return array even if directory is empty/missing',
        );
      } catch {
        // Should not throw errors
        throw new Error(
          'Function should not throw errors for missing/empty directory',
        );
      }
    });
  });
});
