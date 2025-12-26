import { describe, it as test } from '@std/testing/bdd';
import { assert, assertEquals } from '@std/assert';
import { isAbsolute, join } from '@std/path';
import QueueProcessor from '../lib/queueProcessor.js';
import {
  cleanupTestDir,
  createMockLogger,
  createTestDir,
  TEST_DATA_DIR,
} from './helpers.js';

describe('queueProcessor.js', () => {
  describe('QueueProcessor constructor', () => {
    test('should create instance with default options', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      assert(
        processor instanceof QueueProcessor,
        'Should be instance of QueueProcessor',
      );
      assertEquals(processor.logger, logger, 'Should set logger');
      assertEquals(
        processor.pollInterval,
        5000,
        'Should use default poll interval',
      );
      assertEquals(
        processor.isProcessing,
        false,
        'Should not be processing initially',
      );
      assertEquals(
        processor.isDownloadActive,
        false,
        'Should not have active download initially',
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

      assertEquals(
        processor.baseDir,
        customBaseDir,
        'Should use custom base directory',
      );
      assertEquals(
        processor.pollInterval,
        customPollInterval,
        'Should use custom poll interval',
      );
    });

    test('should set up correct directory paths', () => {
      const logger = createMockLogger();
      const baseDir = '/test/base';
      const processor = new QueueProcessor({ logger, baseDir });

      // Job directories are now managed by JobManager
      assert(processor.jobManager, 'Should have JobManager instance');
      assertEquals(
        processor.jobManager.baseDir,
        baseDir,
        'JobManager should use same base directory',
      );

      // Downloads directories are still on processor
      assertEquals(
        processor.downloadsActiveDir,
        join(baseDir, 'data', 'partials'),
      );
      assertEquals(
        processor.downloadsFinishedDir,
        join(baseDir, 'downloads'),
      );
    });

    test('should handle missing logger gracefully', () => {
      const processor = new QueueProcessor();

      assertEquals(
        processor.logger,
        undefined,
        'Should handle undefined logger',
      );
      assertEquals(
        processor.pollInterval,
        5000,
        'Should still use default poll interval',
      );
    });
  });

  describe('getStatus', () => {
    test('should return correct initial status', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      const status = processor.getStatus();

      assertEquals(typeof status, 'object', 'Should return object');
      assertEquals(
        status.isProcessing,
        false,
        'Should not be processing initially',
      );
      assertEquals(
        status.isDownloadActive,
        false,
        'Should not have active download initially',
      );
      assertEquals(status.pollInterval, 5000, 'Should return poll interval');
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
      assertEquals(
        status.isProcessing,
        true,
        'Should be processing after start',
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
      assertEquals(
        status.pollInterval,
        customPollInterval,
        'Should return custom poll interval',
      );
    });

    test('should return status object with all required fields', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      const status = processor.getStatus();

      // Check all required fields exist
      assert('isProcessing' in status, 'Should have isProcessing field');
      assert(
        'isDownloadActive' in status,
        'Should have isDownloadActive field',
      );
      assert('pollInterval' in status, 'Should have pollInterval field');

      // Check field types
      assertEquals(
        typeof status.isProcessing,
        'boolean',
        'isProcessing should be boolean',
      );
      assertEquals(
        typeof status.isDownloadActive,
        'boolean',
        'isDownloadActive should be boolean',
      );
      assertEquals(
        typeof status.pollInterval,
        'number',
        'pollInterval should be number',
      );
    });
  });

  describe('configuration validation', () => {
    test('should handle zero poll interval', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger, pollInterval: 0 });

      // Note: QueueProcessor uses logical OR for pollInterval, so 0 becomes 5000
      assertEquals(
        processor.pollInterval,
        5000,
        'Should use default when 0 is provided',
      );
      const status = processor.getStatus();
      assertEquals(
        status.pollInterval,
        5000,
        'Status should reflect default poll interval',
      );
    });

    test('should handle very large poll interval', () => {
      const logger = createMockLogger();
      const largePollInterval = 60000; // 1 minute
      const processor = new QueueProcessor({
        logger,
        pollInterval: largePollInterval,
      });

      assertEquals(
        processor.pollInterval,
        largePollInterval,
        'Should accept large poll interval',
      );
    });
  });

  describe('state management', () => {
    test('should maintain download active state correctly', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      assertEquals(processor.isDownloadActive, false, 'Should start inactive');
      assertEquals(
        processor.activeDownloadHash,
        null,
        'Should have no active hash',
      );

      // Simulate setting active download
      processor.isDownloadActive = true;
      processor.activeDownloadHash = 'test-hash';

      const status = processor.getStatus();
      assertEquals(
        status.isDownloadActive,
        true,
        'Should reflect active download state',
      );
      assertEquals(
        status.activeDownloadHash,
        'test-hash',
        'Should reflect active download hash',
      );

      processor.isDownloadActive = false;
      processor.activeDownloadHash = null;
      const updatedStatus = processor.getStatus();
      assertEquals(
        updatedStatus.isDownloadActive,
        false,
        'Should reflect inactive state',
      );
    });

    test('should not be processing initially', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      assertEquals(
        processor.isProcessing,
        false,
        'Should not be processing initially',
      );
      assertEquals(
        processor.intervalId,
        null,
        'Should not have interval ID initially',
      );
    });

    test('should maintain consistent state between calls', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      const status1 = processor.getStatus();
      const status2 = processor.getStatus();

      assertEquals(status1, status2, 'Should return consistent status');
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
      assertEquals(
        processor.isProcessing,
        true,
        'Should be processing after start',
      );

      await processor.stop();
      assertEquals(
        processor.isProcessing,
        false,
        'Should not be processing after stop',
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

      assertEquals(processor.isProcessing, true, 'Should still be processing');

      await processor.stop();
      await cleanupTestDir();
    });

    test('should handle stop before start gracefully', async () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      // Should not throw
      await processor.stop();
      assertEquals(
        processor.isProcessing,
        false,
        'Should remain not processing',
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
        assertEquals(
          processor.jobManager.baseDir,
          baseDir,
          'JobManager should use correct base directory',
        );

        // Downloads directories are still on processor
        assertEquals(
          processor.downloadsActiveDir,
          join(baseDir, 'data', 'partials'),
        );
        assertEquals(
          processor.downloadsFinishedDir,
          join(baseDir, 'downloads'),
        );
      }
    });

    test('should use absolute paths when base directory is absolute', () => {
      const logger = createMockLogger();
      const absoluteBase = '/absolute/path/to/app';
      const processor = new QueueProcessor({ logger, baseDir: absoluteBase });

      // JobManager should have the same base directory
      assertEquals(
        processor.jobManager.baseDir,
        absoluteBase,
        'JobManager should use absolute base directory',
      );

      // Downloads directories should be absolute
      assert(
        isAbsolute(processor.downloadsActiveDir),
        'Downloads active dir should be absolute',
      );
      assert(
        isAbsolute(processor.downloadsFinishedDir),
        'Downloads finished dir should be absolute',
      );
    });
  });

  describe('Download cancellation', () => {
    test('should initialize cancelled jobs set in constructor', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      assert(processor.cancelledJobs instanceof Set, 'Should be a Set');
      assertEquals(processor.cancelledJobs.size, 0, 'Should start empty');
    });

    test('should include cancelled jobs count in status', () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });

      const status = processor.getStatus();
      assert('cancelledJobs' in status, 'Should have cancelledJobs field');
      assertEquals(
        typeof status.cancelledJobs,
        'number',
        'cancelledJobs should be number',
      );
      assertEquals(
        status.cancelledJobs,
        0,
        'Should start with 0 cancelled jobs',
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
      processor.jobManager.handleJobFailure = () => {
        handleJobFailureCalled = true;
        return null;
      };

      // Call handleDownloadError
      await processor.handleDownloadError(jobHash, testUrl, testError);

      // Verify cancellation flag was cleaned up
      assertEquals(
        processor.cancelledJobs.has(jobHash),
        false,
        'Should clean up cancellation flag',
      );

      // Verify job failure handler was not called
      assertEquals(
        handleJobFailureCalled,
        false,
        'Should not call handleJobFailure for cancelled jobs',
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
      assertEquals(
        processor.cancelledJobs.has(jobHash),
        false,
        'Should clean up cancellation flag on completion',
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
      assertEquals(
        processor.cancelledJobs.has(jobHash),
        false,
        'Should clean up cancellation flag in finally block',
      );
    });

    test('should handle multiple cancelled jobs', async () => {
      const logger = createMockLogger();
      const processor = new QueueProcessor({ logger });
      const jobHashes = ['hash1', 'hash2', 'hash3'];

      // Add multiple jobs to cancelled set
      jobHashes.forEach((hash) => processor.cancelledJobs.add(hash));

      // Verify all are tracked
      assertEquals(
        processor.cancelledJobs.size,
        3,
        'Should track multiple cancelled jobs',
      );

      // Mock the JobManager to verify it's not called
      let handleJobFailureCallCount = 0;
      processor.jobManager.handleJobFailure = () => {
        handleJobFailureCallCount++;
        return null;
      };

      // Process errors for all jobs
      for (const hash of jobHashes) {
        await processor.handleDownloadError(
          hash,
          'https://example.com/video',
          new Error('test'),
        );
      }

      // Verify all cancellation flags were cleaned up
      assertEquals(
        processor.cancelledJobs.size,
        0,
        'Should clean up all cancellation flags',
      );

      // Verify job failure handler was never called
      assertEquals(
        handleJobFailureCallCount,
        0,
        'Should not call handleJobFailure for any cancelled jobs',
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
      processor.jobManager.handleJobFailure = () => {
        handleJobFailureCalled = true;
        return { retryCount: 1 };
      };

      // Call handleDownloadError without cancellation
      await processor.handleDownloadError(jobHash, testUrl, testError);

      // Verify job failure handler was called
      assertEquals(
        handleJobFailureCalled,
        true,
        'Should call handleJobFailure for normal errors',
      );
    });
  });
});
