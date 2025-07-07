import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import path from 'path';
import QueueProcessor from '../lib/queueProcessor.js';
import {
  createTestDir,
  cleanupTestDir,
  createMockLogger,
  TEST_DATA_DIR,
} from './helpers.js';

describe('queueProcessor.js', () => {
  describe('QueueProcessor constructor', () => {
    test('should create instance with default options', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      assert.ok(
        processor instanceof QueueProcessor,
        'Should be instance of QueueProcessor'
      );
      assert.equal(processor.logger, logger, 'Should set logger');
      assert.equal(
        processor.pollInterval,
        5000,
        'Should use default poll interval'
      );
      assert.equal(
        processor.maxConcurrent,
        1,
        'Should use default max concurrent'
      );
      assert.equal(
        processor.isProcessing,
        false,
        'Should not be processing initially'
      );
      assert.ok(
        processor.activeDownloads instanceof Map,
        'Should initialize activeDownloads as Map'
      );
    });

    test('should create instance with custom options', () => {
      const logger = createMockLogger();
      const customBaseDir = '/custom/base/dir';
      const customPollInterval = 10000;
      const customMaxConcurrent = 3;

      const processor = new QueueProcessor({
        logger,
        baseDir: customBaseDir,
        pollInterval: customPollInterval,
        maxConcurrent: customMaxConcurrent,
      });

      assert.equal(
        processor.baseDir,
        customBaseDir,
        'Should use custom base directory'
      );
      assert.equal(
        processor.pollInterval,
        customPollInterval,
        'Should use custom poll interval'
      );
      assert.equal(
        processor.maxConcurrent,
        customMaxConcurrent,
        'Should use custom max concurrent'
      );
    });

    test('should set up correct directory paths', () => {
      const logger = createMockLogger();
      const baseDir = '/test/base';
      const processor = new QueueProcessor({ logger, baseDir });

      // Job directories are now managed by JobManager
      assert.ok(processor.jobManager, 'Should have JobManager instance');
      assert.equal(
        processor.jobManager.baseDir,
        baseDir,
        'JobManager should use same base directory'
      );

      // Downloads directories are still on processor
      assert.equal(
        processor.downloadsActiveDir,
        path.join(baseDir, 'data', 'downloads', 'active')
      );
      assert.equal(
        processor.downloadsFinishedDir,
        path.join(baseDir, 'data', 'downloads', 'finished')
      );
    });

    test('should handle missing logger gracefully', () => {
      const processor = new QueueProcessor();

      assert.equal(
        processor.logger,
        undefined,
        'Should handle undefined logger'
      );
      assert.equal(
        processor.pollInterval,
        5000,
        'Should still use default poll interval'
      );
      assert.equal(
        processor.maxConcurrent,
        1,
        'Should still use default max concurrent'
      );
    });
  });

  describe('getStatus', () => {
    test('should return correct initial status', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      const status = processor.getStatus();

      assert.equal(typeof status, 'object', 'Should return object');
      assert.equal(
        status.isProcessing,
        false,
        'Should not be processing initially'
      );
      assert.equal(
        status.activeDownloads,
        0,
        'Should have 0 active downloads initially'
      );
      assert.equal(
        status.maxConcurrent,
        1,
        'Should return max concurrent limit'
      );
      assert.equal(status.pollInterval, 5000, 'Should return poll interval');
    });

    test('should return updated status after starting', async () => {
      await createTestDir();
      const logger = createMockLogger();
      const processor = new QueueProcessor({
        logger,
        baseDir: TEST_DATA_DIR,
        pollInterval: 1000, // Short interval for testing
      });

      await processor.start();

      const status = processor.getStatus();
      assert.equal(
        status.isProcessing,
        true,
        'Should be processing after start'
      );

      await processor.stop();
      await cleanupTestDir();
    });

    test('should reflect custom configuration', () => {
      const logger = createMockLogger();
      const customPollInterval = 3000;
      const customMaxConcurrent = 5;

      const processor = new QueueProcessor({
        logger,
        pollInterval: customPollInterval,
        maxConcurrent: customMaxConcurrent,
      });

      const status = processor.getStatus();
      assert.equal(
        status.pollInterval,
        customPollInterval,
        'Should return custom poll interval'
      );
      assert.equal(
        status.maxConcurrent,
        customMaxConcurrent,
        'Should return custom max concurrent'
      );
    });

    test('should return status object with all required fields', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      const status = processor.getStatus();

      // Check all required fields exist
      assert.ok('isProcessing' in status, 'Should have isProcessing field');
      assert.ok(
        'activeDownloads' in status,
        'Should have activeDownloads field'
      );
      assert.ok('maxConcurrent' in status, 'Should have maxConcurrent field');
      assert.ok('pollInterval' in status, 'Should have pollInterval field');

      // Check field types
      assert.equal(
        typeof status.isProcessing,
        'boolean',
        'isProcessing should be boolean'
      );
      assert.equal(
        typeof status.activeDownloads,
        'number',
        'activeDownloads should be number'
      );
      assert.equal(
        typeof status.maxConcurrent,
        'number',
        'maxConcurrent should be number'
      );
      assert.equal(
        typeof status.pollInterval,
        'number',
        'pollInterval should be number'
      );
    });
  });

  describe('configuration validation', () => {
    test('should handle zero poll interval', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger, pollInterval: 0 });

      // Note: QueueProcessor uses logical OR for pollInterval, so 0 becomes 5000
      assert.equal(
        processor.pollInterval,
        5000,
        'Should use default when 0 is provided'
      );
      const status = processor.getStatus();
      assert.equal(
        status.pollInterval,
        5000,
        'Status should reflect default poll interval'
      );
    });

    test('should handle zero max concurrent', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger, maxConcurrent: 0 });

      // Note: QueueProcessor uses logical OR for maxConcurrent, so 0 becomes 1
      assert.equal(
        processor.maxConcurrent,
        1,
        'Should use default when 0 is provided'
      );
      const status = processor.getStatus();
      assert.equal(
        status.maxConcurrent,
        1,
        'Status should reflect default max concurrent'
      );
    });

    test('should handle very large poll interval', () => {
      const logger = createMockLogger();
      const largePollInterval = 60000; // 1 minute
      const processor = new QueueProcessor({
        logger,
        pollInterval: largePollInterval,
      });

      assert.equal(
        processor.pollInterval,
        largePollInterval,
        'Should accept large poll interval'
      );
    });

    test('should handle very large max concurrent', () => {
      const logger = createMockLogger();
      const largeMaxConcurrent = 100;
      const processor = new QueueProcessor({
        logger,
        maxConcurrent: largeMaxConcurrent,
      });

      assert.equal(
        processor.maxConcurrent,
        largeMaxConcurrent,
        'Should accept large max concurrent'
      );
    });
  });

  describe('state management', () => {
    test('should maintain activeDownloads map correctly', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      assert.ok(processor.activeDownloads instanceof Map, 'Should be a Map');
      assert.equal(processor.activeDownloads.size, 0, 'Should start empty');

      // Simulate adding an active download
      const mockPromise = Promise.resolve();
      processor.activeDownloads.set('test-hash', mockPromise);

      const status = processor.getStatus();
      assert.equal(
        status.activeDownloads,
        1,
        'Should reflect active download count'
      );

      processor.activeDownloads.delete('test-hash');
      const updatedStatus = processor.getStatus();
      assert.equal(updatedStatus.activeDownloads, 0, 'Should reflect removal');
    });

    test('should not be processing initially', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      assert.equal(
        processor.isProcessing,
        false,
        'Should not be processing initially'
      );
      assert.equal(
        processor.intervalId,
        null,
        'Should not have interval ID initially'
      );
    });

    test('should maintain consistent state between calls', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      const status1 = processor.getStatus();
      const status2 = processor.getStatus();

      assert.deepEqual(status1, status2, 'Should return consistent status');
    });
  });

  describe('start and stop methods', () => {
    test('should handle start/stop lifecycle without errors', async () => {
      await createTestDir();
      const logger = createMockLogger();
      const processor = new QueueProcessor({
        logger,
        baseDir: TEST_DATA_DIR,
        pollInterval: 100, // Very short for testing
      });

      // Should not throw
      await processor.start();
      assert.equal(
        processor.isProcessing,
        true,
        'Should be processing after start'
      );

      await processor.stop();
      assert.equal(
        processor.isProcessing,
        false,
        'Should not be processing after stop'
      );

      await cleanupTestDir();
    });

    test('should handle multiple start calls gracefully', async () => {
      await createTestDir();
      const logger = createMockLogger();
      const processor = new QueueProcessor({
        logger,
        baseDir: TEST_DATA_DIR,
        pollInterval: 100,
      });

      await processor.start();
      await processor.start(); // Second start should not error

      assert.equal(processor.isProcessing, true, 'Should still be processing');

      await processor.stop();
      await cleanupTestDir();
    });

    test('should handle stop before start gracefully', async () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      // Should not throw
      await processor.stop();
      assert.equal(
        processor.isProcessing,
        false,
        'Should remain not processing'
      );
    });
  });

  describe('directory path construction', () => {
    test('should construct paths correctly with different base directories', () => {
      const testCases = [
        '/usr/local/app',
        '/home/user/projects/yt-down',
        'C:\\Users\\User\\yt-down', // Windows path
        '.',
        '..',
      ];

      for (const baseDir of testCases) {
        const logger = createMockLogger();
        const processor = new QueueProcessor({ logger, baseDir });

        // JobManager handles job directories now
        assert.equal(
          processor.jobManager.baseDir,
          baseDir,
          'JobManager should use correct base directory'
        );

        // Downloads directories are still on processor
        assert.equal(
          processor.downloadsActiveDir,
          path.join(baseDir, 'data', 'downloads', 'active')
        );
        assert.equal(
          processor.downloadsFinishedDir,
          path.join(baseDir, 'data', 'downloads', 'finished')
        );
      }
    });

    test('should use absolute paths when base directory is absolute', () => {
      const logger = createMockLogger();
      const absoluteBase = '/absolute/path/to/app';
      const processor = new QueueProcessor({ logger, baseDir: absoluteBase });

      // JobManager should have the same base directory
      assert.equal(
        processor.jobManager.baseDir,
        absoluteBase,
        'JobManager should use absolute base directory'
      );

      // Downloads directories should be absolute
      assert.ok(
        path.isAbsolute(processor.downloadsActiveDir),
        'Downloads active dir should be absolute'
      );
      assert.ok(
        path.isAbsolute(processor.downloadsFinishedDir),
        'Downloads finished dir should be absolute'
      );
    });
  });
});
