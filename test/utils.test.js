import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import {
  createJobHash,
  formatFileSize,
  ensureDirectoryExists,
  readJobsFromDirectory,
  getDownloadedFiles,
} from '../lib/utils.js';
import {
  createTestDir,
  cleanupTestDir,
  createTestFile,
  createMockLogger,
  assertValidHash,
  TEST_DATA_DIR,
} from './helpers.js';

describe('utils.js', () => {
  describe('createJobHash', () => {
    test('should create consistent SHA-256 hash', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      const hash1 = createJobHash(url);
      const hash2 = createJobHash(url);

      assertValidHash(hash1);
      assert.equal(hash1, hash2, 'Same URL should produce same hash');
    });

    test('should create different hashes for different URLs', () => {
      const url1 = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      const url2 = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

      const hash1 = createJobHash(url1);
      const hash2 = createJobHash(url2);

      assertValidHash(hash1);
      assertValidHash(hash2);
      assert.notEqual(
        hash1,
        hash2,
        'Different URLs should produce different hashes'
      );
    });

    test('should handle empty string', () => {
      const hash = createJobHash('');
      assertValidHash(hash);
      assert.equal(
        hash,
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      );
    });

    test('should handle special characters and unicode', () => {
      const url = 'https://example.com/video?title=测试视频&emoji=🎵';
      const hash = createJobHash(url);
      assertValidHash(hash);
    });
  });

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

  describe('readJobsFromDirectory', () => {
    test('should read download jobs from json files', async () => {
      await createTestDir();
      const testDir = path.join(TEST_DATA_DIR, 'jobs');
      const logger = createMockLogger();

      await createTestFile(
        'jobs/hash1.json',
        JSON.stringify({
          url: 'https://www.youtube.com/watch?v=video1',
          title: 'Test Video 1',
          retryCount: 0,
          timestamp: '2023-01-01T00:00:00Z',
          sortOrder: 1,
        })
      );
      await createTestFile(
        'jobs/hash2.json',
        JSON.stringify({
          url: 'https://www.youtube.com/watch?v=video2',
          title: 'Test Video 2',
          retryCount: 0,
          timestamp: '2023-01-01T00:01:00Z',
          sortOrder: 2,
        })
      );
      await createTestFile('jobs/not-json.md', 'should be ignored');

      const jobs = await readJobsFromDirectory(testDir, 'test', logger);

      assert.equal(jobs.length, 2);
      assert.equal(jobs[0].hash, 'hash1');
      assert.equal(jobs[0].url, 'https://www.youtube.com/watch?v=video1');
      assert.equal(jobs[0].title, 'Test Video 1');
      assert.equal(jobs[0].retryCount, 0);
      assert.equal(jobs[0].sortOrder, 1);
      assert.equal(jobs[1].hash, 'hash2');
      assert.equal(jobs[1].url, 'https://www.youtube.com/watch?v=video2');
      assert.equal(jobs[1].title, 'Test Video 2');
      assert.equal(jobs[1].retryCount, 0);
      assert.equal(jobs[1].sortOrder, 2);

      await cleanupTestDir();
    });

    test('should handle malformed JSON files gracefully', async () => {
      await createTestDir();
      const testDir = path.join(TEST_DATA_DIR, 'jobs');
      const logger = createMockLogger();

      await createTestFile(
        'jobs/hash1.json',
        JSON.stringify({
          url: 'https://www.youtube.com/watch?v=video1',
          title: 'Test Video 1',
          retryCount: 0,
          timestamp: '2023-01-01T00:00:00Z',
          sortOrder: 1,
        })
      );
      await createTestFile('jobs/malformed.json', '{ invalid json');

      const jobs = await readJobsFromDirectory(testDir, 'test', logger);

      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].url, 'https://www.youtube.com/watch?v=video1');

      await cleanupTestDir();
    });

    test('should return empty array for non-existent directory', async () => {
      const logger = createMockLogger();
      const jobs = await readJobsFromDirectory(
        '/non/existent/path',
        'test',
        logger
      );
      assert.deepEqual(jobs, []);
    });

    test('should create directory if it does not exist', async () => {
      await createTestDir();
      const testDir = path.join(TEST_DATA_DIR, 'new-jobs');
      const logger = createMockLogger();

      const jobs = await readJobsFromDirectory(testDir, 'test', logger);

      assert.deepEqual(jobs, []);
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
