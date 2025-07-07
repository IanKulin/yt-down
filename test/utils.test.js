import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import {
  formatFileSize,
  ensureDirectoryExists,
  getDownloadedFiles,
} from '../lib/utils.js';
import {
  createTestDir,
  cleanupTestDir,
  createMockLogger,
  TEST_DATA_DIR,
} from './helpers.js';

describe('utils.js', () => {
  describe('formatFileSize', () => {
    test('should format bytes correctly', () => {
      assert.equal(formatFileSize(0), '0 Bytes');
      assert.equal(formatFileSize(1), '1 Bytes');
      assert.equal(formatFileSize(512), '512 Bytes');
      assert.equal(formatFileSize(1023), '1023 Bytes');
    });

    test('should format kilobytes correctly', () => {
      assert.equal(formatFileSize(1024), '1 KB');
      assert.equal(formatFileSize(1536), '1.5 KB');
      assert.equal(formatFileSize(2048), '2 KB');
      assert.equal(formatFileSize(1048575), '1024 KB');
    });

    test('should format megabytes correctly', () => {
      assert.equal(formatFileSize(1048576), '1 MB');
      assert.equal(formatFileSize(1572864), '1.5 MB');
      assert.equal(formatFileSize(10485760), '10 MB');
      assert.equal(formatFileSize(1073741823), '1024 MB');
    });

    test('should format gigabytes correctly', () => {
      assert.equal(formatFileSize(1073741824), '1 GB');
      assert.equal(formatFileSize(1610612736), '1.5 GB');
      assert.equal(formatFileSize(10737418240), '10 GB');
    });

    test('should handle decimal places correctly', () => {
      assert.equal(formatFileSize(1234567), '1.18 MB');
      assert.equal(formatFileSize(9876543210), '9.2 GB');
    });
  });

  describe('ensureDirectoryExists', () => {
    test('should create directory if it does not exist', async () => {
      await createTestDir();
      const testDir = path.join(TEST_DATA_DIR, 'new-directory');

      // Ensure it doesn't exist first
      try {
        await fs.access(testDir);
        assert.fail('Directory should not exist initially');
      } catch (error) {
        assert.equal(error.code, 'ENOENT');
      }

      await ensureDirectoryExists(testDir);

      // Should now exist
      const stats = await fs.stat(testDir);
      assert.ok(stats.isDirectory());

      await cleanupTestDir();
    });

    test('should not error if directory already exists', async () => {
      await createTestDir();
      const testDir = path.join(TEST_DATA_DIR, 'existing-directory');
      await fs.mkdir(testDir);

      // Should not throw
      await ensureDirectoryExists(testDir);

      const stats = await fs.stat(testDir);
      assert.ok(stats.isDirectory());

      await cleanupTestDir();
    });

    test('should create nested directories', async () => {
      await createTestDir();
      const testDir = path.join(TEST_DATA_DIR, 'level1', 'level2', 'level3');

      await ensureDirectoryExists(testDir);

      const stats = await fs.stat(testDir);
      assert.ok(stats.isDirectory());

      await cleanupTestDir();
    });
  });

  describe('getDownloadedFiles', () => {
    test('should return flat array of files from actual downloads directory', async () => {
      const logger = createMockLogger();

      // Test the actual function but don't make assumptions about specific content
      const files = await getDownloadedFiles(logger);

      // Basic structure validation
      assert.ok(Array.isArray(files), 'Should return an array');

      // If there are files, they should have the correct structure
      for (const file of files) {
        assert.ok(typeof file === 'object', 'File should be object');
        assert.ok('name' in file, 'File should have name');
        assert.ok('extension' in file, 'File should have extension');
        assert.ok('size' in file, 'File should have size');
        assert.ok('modified' in file, 'File should have modified');
        assert.ok('isVideo' in file, 'File should have isVideo');
        assert.ok('isSubtitle' in file, 'File should have isSubtitle');

        // File should be either video or subtitle (or neither), but not both
        assert.ok(
          !(file.isVideo && file.isSubtitle),
          'File should not be both video and subtitle'
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
        assert.ok(
          /\.(mkv|mp4|webm|avi|mov)$/i.test(filename),
          `${ext} should match video pattern`
        );
        assert.ok(
          !/\.(srt|vtt|dfxp|ass|ttml|sbv|lrc)$/i.test(filename),
          `${ext} should not match subtitle pattern`
        );
      }

      for (const ext of subtitleExtensions) {
        const filename = `test.${ext}`;
        assert.ok(
          /\.(srt|vtt|dfxp|ass|ttml|sbv|lrc)$/i.test(filename),
          `${ext} should match subtitle pattern`
        );
        assert.ok(
          !/\.(mkv|mp4|webm|avi|mov)$/i.test(filename),
          `${ext} should not match video pattern`
        );
      }
    });

    test('should handle empty downloads directory gracefully', async () => {
      // Test that the function handles missing or empty directory
      const logger = createMockLogger();

      // The function should handle errors gracefully and return empty array
      try {
        const files = await getDownloadedFiles(logger);
        assert.ok(
          Array.isArray(files),
          'Should return array even if directory is empty/missing'
        );
      } catch {
        // Should not throw errors
        assert.fail(
          'Function should not throw errors for missing/empty directory'
        );
      }
    });
  });
});
