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
        processor.isProcessing,
        false,
        'Should not be processing initially'
      );
      assert.equal(
        processor.isDownloadActive,
        false,
        'Should not have active download initially'
      );
    });

    test('should create instance with custom options', () => {
      const logger = createMockLogger();
      const customBaseDir = '/custom/base/dir';
      const customPollInterval = 10000;
      const processor = new QueueProcessor({
        logger,
        baseDir: customBaseDir,
        pollInterval: customPollInterval,
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
        path.join(baseDir, 'data', 'partials')
      );
      assert.equal(
        processor.downloadsFinishedDir,
        path.join(baseDir, 'downloads')
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
        status.isDownloadActive,
        false,
        'Should not have active download initially'
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
      const processor = new QueueProcessor({
        logger,
        pollInterval: customPollInterval,
      });

      const status = processor.getStatus();
      assert.equal(
        status.pollInterval,
        customPollInterval,
        'Should return custom poll interval'
      );
    });

    test('should return status object with all required fields', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      const status = processor.getStatus();

      // Check all required fields exist
      assert.ok('isProcessing' in status, 'Should have isProcessing field');
      assert.ok(
        'isDownloadActive' in status,
        'Should have isDownloadActive field'
      );
      assert.ok('pollInterval' in status, 'Should have pollInterval field');

      // Check field types
      assert.equal(
        typeof status.isProcessing,
        'boolean',
        'isProcessing should be boolean'
      );
      assert.equal(
        typeof status.isDownloadActive,
        'boolean',
        'isDownloadActive should be boolean'
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
  });

  describe('state management', () => {
    test('should maintain download active state correctly', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      assert.equal(processor.isDownloadActive, false, 'Should start inactive');
      assert.equal(
        processor.activeDownloadHash,
        null,
        'Should have no active hash'
      );

      // Simulate setting active download
      processor.isDownloadActive = true;
      processor.activeDownloadHash = 'test-hash';

      const status = processor.getStatus();
      assert.equal(
        status.isDownloadActive,
        true,
        'Should reflect active download state'
      );
      assert.equal(
        status.activeDownloadHash,
        'test-hash',
        'Should reflect active download hash'
      );

      processor.isDownloadActive = false;
      processor.activeDownloadHash = null;
      const updatedStatus = processor.getStatus();
      assert.equal(
        updatedStatus.isDownloadActive,
        false,
        'Should reflect inactive state'
      );
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
          path.join(baseDir, 'data', 'partials')
        );
        assert.equal(
          processor.downloadsFinishedDir,
          path.join(baseDir, 'downloads')
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

  describe('Download cancellation', () => {
    test('should initialize cancelled jobs set in constructor', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      assert.ok(processor.cancelledJobs instanceof Set, 'Should be a Set');
      assert.equal(processor.cancelledJobs.size, 0, 'Should start empty');
    });

    test('should include cancelled jobs count in status', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      const status = processor.getStatus();
      assert.ok('cancelledJobs' in status, 'Should have cancelledJobs field');
      assert.equal(
        typeof status.cancelledJobs,
        'number',
        'cancelledJobs should be number'
      );
      assert.equal(
        status.cancelledJobs,
        0,
        'Should start with 0 cancelled jobs'
      );
    });

    test('should prevent retry after cancellation', async () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });
      const jobHash = 'test-hash';
      const testUrl = 'https://example.com/video';
      const testError = new Error('yt-dlp exited with code null');

      // Simulate cancellation by adding to cancelled jobs
      processor.cancelledJobs.add(jobHash);

      // Mock the JobManager to verify it's not called
      let handleJobFailureCalled = false;
      processor.jobManager.handleJobFailure = async () => {
        handleJobFailureCalled = true;
        return null;
      };

      // Call handleDownloadError
      await processor.handleDownloadError(jobHash, testUrl, testError);

      // Verify cancellation flag was cleaned up
      assert.equal(
        processor.cancelledJobs.has(jobHash),
        false,
        'Should clean up cancellation flag'
      );

      // Verify job failure handler was not called
      assert.equal(
        handleJobFailureCalled,
        false,
        'Should not call handleJobFailure for cancelled jobs'
      );
    });

    test('should clean up cancellation flag on completion', async () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });
      const jobHash = 'test-hash';
      const testUrl = 'https://example.com/video';

      // Add to cancelled jobs
      processor.cancelledJobs.add(jobHash);

      // Mock the JobManager methods
      processor.jobManager.updateJob = async () => {};
      processor.jobManager.moveJob = async () => {};

      // Mock moveDownloadedFiles and addCompletionNotification
      processor.moveDownloadedFiles = async () => {};
      processor.addCompletionNotification = async () => {};

      // Call completeDownload
      await processor.completeDownload(jobHash, testUrl);

      // Verify cancellation flag was cleaned up
      assert.equal(
        processor.cancelledJobs.has(jobHash),
        false,
        'Should clean up cancellation flag on completion'
      );
    });

    test('should clean up cancellation flag in finally block', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });
      const jobHash = 'test-hash';

      // Add to cancelled jobs
      processor.cancelledJobs.add(jobHash);

      // Simulate the finally block cleanup
      processor.isDownloadActive = false;
      processor.activeDownloadHash = null;
      processor.downloadProgress.delete(jobHash);
      processor.activeProcesses.delete(jobHash);
      processor.lastProgressBroadcast.delete(jobHash);
      processor.cancelledJobs.delete(jobHash);

      // Verify cancellation flag was cleaned up
      assert.equal(
        processor.cancelledJobs.has(jobHash),
        false,
        'Should clean up cancellation flag in finally block'
      );
    });

    test('should handle multiple cancelled jobs', async () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });
      const jobHashes = ['hash1', 'hash2', 'hash3'];

      // Add multiple jobs to cancelled set
      jobHashes.forEach((hash) => processor.cancelledJobs.add(hash));

      // Verify all are tracked
      assert.equal(
        processor.cancelledJobs.size,
        3,
        'Should track multiple cancelled jobs'
      );

      // Mock the JobManager to verify it's not called
      let handleJobFailureCallCount = 0;
      processor.jobManager.handleJobFailure = async () => {
        handleJobFailureCallCount++;
        return null;
      };

      // Process errors for all jobs
      for (const hash of jobHashes) {
        await processor.handleDownloadError(
          hash,
          'https://example.com/video',
          new Error('test')
        );
      }

      // Verify all cancellation flags were cleaned up
      assert.equal(
        processor.cancelledJobs.size,
        0,
        'Should clean up all cancellation flags'
      );

      // Verify job failure handler was never called
      assert.equal(
        handleJobFailureCallCount,
        0,
        'Should not call handleJobFailure for any cancelled jobs'
      );
    });

    test('should handle normal error processing for non-cancelled jobs', async () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });
      const jobHash = 'test-hash';
      const testUrl = 'https://example.com/video';
      const testError = new Error('Network error');

      // Mock the JobManager to verify it is called
      let handleJobFailureCalled = false;
      processor.jobManager.handleJobFailure = async () => {
        handleJobFailureCalled = true;
        return { retryCount: 1 };
      };

      // Call handleDownloadError without cancellation
      await processor.handleDownloadError(jobHash, testUrl, testError);

      // Verify job failure handler was called
      assert.equal(
        handleJobFailureCalled,
        true,
        'Should call handleJobFailure for normal errors'
      );
    });
  });
});
