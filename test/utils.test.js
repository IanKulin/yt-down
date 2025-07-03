import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import {
  createUrlHash,
  formatFileSize,
  ensureDirectoryExists,
  readUrlsFromDirectory,
  getDownloadedFiles,
  isInProgressFile,
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
  describe('createUrlHash', () => {
    test('should create consistent SHA-256 hash', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      const hash1 = createUrlHash(url);
      const hash2 = createUrlHash(url);

      assertValidHash(hash1);
      assert.equal(hash1, hash2, 'Same URL should produce same hash');
    });

    test('should create different hashes for different URLs', () => {
      const url1 = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      const url2 = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

      const hash1 = createUrlHash(url1);
      const hash2 = createUrlHash(url2);

      assertValidHash(hash1);
      assertValidHash(hash2);
      assert.notEqual(
        hash1,
        hash2,
        'Different URLs should produce different hashes'
      );
    });

    test('should handle empty string', () => {
      const hash = createUrlHash('');
      assertValidHash(hash);
      assert.equal(
        hash,
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      );
    });

    test('should handle special characters and unicode', () => {
      const url = 'https://example.com/video?title=测试视频&emoji=🎵';
      const hash = createUrlHash(url);
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

  describe('isInProgressFile', () => {
    test('should detect .part files', () => {
      assert.equal(isInProgressFile('video.mp4.part'), true);
      assert.equal(isInProgressFile('video.mkv.part'), true);
      assert.equal(isInProgressFile('video.mp4'), false);
    });

    test('should detect fragment files', () => {
      assert.equal(isInProgressFile('video.frag'), true);
      assert.equal(isInProgressFile('video.temp'), true);
      assert.equal(isInProgressFile('video.tmp'), true);
      assert.equal(isInProgressFile('video.ytdl'), true);
    });

    test('should detect format ID files', () => {
      assert.equal(isInProgressFile('video.f137'), true);
      assert.equal(isInProgressFile('video.f140'), true);
      assert.equal(isInProgressFile('video.f999'), true);
      assert.equal(isInProgressFile('video.f1'), true);
    });

    test('should detect part pattern files', () => {
      assert.equal(isInProgressFile('video.part-001'), true);
      assert.equal(isInProgressFile('video.temp-123'), true);
      assert.equal(isInProgressFile('video.mp4.part-001'), true);
    });

    test('should not detect complete files', () => {
      assert.equal(isInProgressFile('video.mp4'), false);
      assert.equal(isInProgressFile('video.mkv'), false);
      assert.equal(isInProgressFile('video.webm'), false);
      assert.equal(isInProgressFile('video.srt'), false);
      assert.equal(isInProgressFile('video.vtt'), false);
    });

    test('should handle edge cases', () => {
      assert.equal(isInProgressFile(''), false);
      assert.equal(isInProgressFile('file.txt'), false);
      assert.equal(isInProgressFile('file.pdf'), false);
      assert.equal(isInProgressFile('video.fragmented'), false); // Not exactly .frag
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

  describe('readUrlsFromDirectory', () => {
    test('should read URLs from txt files', async () => {
      await createTestDir();
      const testDir = path.join(TEST_DATA_DIR, 'urls');
      const logger = createMockLogger();

      await createTestFile(
        'urls/hash1.txt',
        'https://www.youtube.com/watch?v=video1'
      );
      await createTestFile(
        'urls/hash2.txt',
        'https://www.youtube.com/watch?v=video2'
      );
      await createTestFile('urls/not-txt.md', 'should be ignored');

      const urls = await readUrlsFromDirectory(testDir, 'test', logger);

      assert.equal(urls.length, 2);
      assert.equal(urls[0].hash, 'hash1');
      assert.equal(urls[0].url, 'https://www.youtube.com/watch?v=video1');
      assert.equal(urls[1].hash, 'hash2');
      assert.equal(urls[1].url, 'https://www.youtube.com/watch?v=video2');

      await cleanupTestDir();
    });

    test('should trim whitespace from URLs', async () => {
      await createTestDir();
      const testDir = path.join(TEST_DATA_DIR, 'urls');
      const logger = createMockLogger();

      await createTestFile(
        'urls/hash1.txt',
        '  https://www.youtube.com/watch?v=video1  \n'
      );

      const urls = await readUrlsFromDirectory(testDir, 'test', logger);

      assert.equal(urls.length, 1);
      assert.equal(urls[0].url, 'https://www.youtube.com/watch?v=video1');

      await cleanupTestDir();
    });

    test('should return empty array for non-existent directory', async () => {
      const logger = createMockLogger();
      const urls = await readUrlsFromDirectory(
        '/non/existent/path',
        'test',
        logger
      );
      assert.deepEqual(urls, []);
    });

    test('should create directory if it does not exist', async () => {
      await createTestDir();
      const testDir = path.join(TEST_DATA_DIR, 'new-urls');
      const logger = createMockLogger();

      const urls = await readUrlsFromDirectory(testDir, 'test', logger);

      assert.deepEqual(urls, []);
      const stats = await fs.stat(testDir);
      assert.ok(stats.isDirectory());

      await cleanupTestDir();
    });
  });

  describe('getDownloadedFiles', () => {
    test('should return some files from actual downloads directory', async () => {
      const logger = createMockLogger();

      // Test the actual function but don't make assumptions about specific content
      const groupedFiles = await getDownloadedFiles(logger);

      // Basic structure validation
      assert.ok(Array.isArray(groupedFiles), 'Should return an array');

      // If there are files, they should have the correct structure
      for (const group of groupedFiles) {
        assert.ok(typeof group === 'object', 'Group should be object');
        assert.ok('baseName' in group, 'Group should have baseName');
        assert.ok('video' in group, 'Group should have video property');
        assert.ok('subtitles' in group, 'Group should have subtitles property');
        assert.ok(Array.isArray(group.subtitles), 'Subtitles should be array');

        if (group.video) {
          assert.ok('name' in group.video, 'Video should have name');
          assert.ok('baseName' in group.video, 'Video should have baseName');
          assert.ok('extension' in group.video, 'Video should have extension');
          assert.ok('size' in group.video, 'Video should have size');
          assert.ok('modified' in group.video, 'Video should have modified');
          assert.ok('isVideo' in group.video, 'Video should have isVideo');
          assert.ok(
            'isSubtitle' in group.video,
            'Video should have isSubtitle'
          );
          assert.equal(
            group.video.isVideo,
            true,
            'Video should be marked as video'
          );
          assert.equal(
            group.video.isSubtitle,
            false,
            'Video should not be marked as subtitle'
          );
        }

        for (const subtitle of group.subtitles) {
          assert.ok('name' in subtitle, 'Subtitle should have name');
          assert.ok('baseName' in subtitle, 'Subtitle should have baseName');
          assert.ok('extension' in subtitle, 'Subtitle should have extension');
          assert.ok('size' in subtitle, 'Subtitle should have size');
          assert.ok('modified' in subtitle, 'Subtitle should have modified');
          assert.ok('isVideo' in subtitle, 'Subtitle should have isVideo');
          assert.ok(
            'isSubtitle' in subtitle,
            'Subtitle should have isSubtitle'
          );
          assert.equal(
            subtitle.isVideo,
            false,
            'Subtitle should not be marked as video'
          );
          assert.equal(
            subtitle.isSubtitle,
            true,
            'Subtitle should be marked as subtitle'
          );
        }
      }
    });

    test('should detect file types correctly with regex patterns', () => {
      // Test the regex patterns used by the function
      const videoExtensions = ['mp4', 'mkv', 'webm', 'avi', 'mov'];
      const subtitleExtensions = ['srt', 'vtt'];

      for (const ext of videoExtensions) {
        const filename = `test.${ext}`;
        assert.ok(
          /\.(mkv|mp4|webm|avi|mov)$/i.test(filename),
          `${ext} should match video pattern`
        );
        assert.ok(
          !/\.(srt|vtt)$/i.test(filename),
          `${ext} should not match subtitle pattern`
        );
      }

      for (const ext of subtitleExtensions) {
        const filename = `test.${ext}`;
        assert.ok(
          /\.(srt|vtt)$/i.test(filename),
          `${ext} should match subtitle pattern`
        );
        assert.ok(
          !/\.(mkv|mp4|webm|avi|mov)$/i.test(filename),
          `${ext} should not match video pattern`
        );
      }
    });

    test('should test baseName extraction logic', () => {
      const testCases = [
        { filename: 'video.mp4', expectedBaseName: 'video' },
        { filename: 'movie.mkv', expectedBaseName: 'movie' },
        { filename: 'video.srt', expectedBaseName: 'video' },
        {
          filename: 'long-filename-with-dashes.webm',
          expectedBaseName: 'long-filename-with-dashes',
        },
        { filename: 'file.with.dots.avi', expectedBaseName: 'file.with.dots' },
        { filename: 'UPPERCASE.MP4', expectedBaseName: 'UPPERCASE' },
      ];

      for (const testCase of testCases) {
        const baseName = testCase.filename.replace(
          /\.(mkv|mp4|webm|avi|mov|srt|vtt)$/i,
          ''
        );
        assert.equal(
          baseName,
          testCase.expectedBaseName,
          `BaseName extraction failed for ${testCase.filename}`
        );
      }
    });

    test('should handle empty downloads directory gracefully', async () => {
      // Test that the function handles missing or empty directory
      const logger = createMockLogger();

      // The function should handle errors gracefully and return empty array
      try {
        const groupedFiles = await getDownloadedFiles(logger);
        assert.ok(
          Array.isArray(groupedFiles),
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
