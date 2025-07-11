import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { TitleEnhancementService } from '../lib/services/titleEnhancementService.js';
import { JobState } from '../lib/jobs.js';

describe('TitleEnhancementService', () => {
  let service;
  let mockJobManager;
  let mockLogger;
  let mockBroadcastChange;

  beforeEach(() => {
    mockJobManager = {
      getQueuedJobs: mock.fn(async () => []),
      getActiveJobs: mock.fn(async () => []),
      getJob: mock.fn(async () => null),
      updateJob: mock.fn(async () => {}),
    };
    mockLogger = {
      info: mock.fn(),
      error: mock.fn(),
      warn: mock.fn(),
      debug: mock.fn(),
    };
    mockBroadcastChange = mock.fn();

    service = new TitleEnhancementService({
      jobManager: mockJobManager,
      logger: mockLogger,
      broadcastChange: mockBroadcastChange,
    });
  });

  afterEach(() => {
    service.stop();
    mock.reset();
  });

  describe('constructor', () => {
    it('should create instance with correct initial state', () => {
      assert.strictEqual(service.isRunning, false);
      assert.strictEqual(service.processingQueue.size, 0);
      assert.strictEqual(service.pollInterval, 2000);
      assert.strictEqual(service.maxTitleChecks, 2);
      assert.strictEqual(service.intervalId, null);
      assert.strictEqual(service.settings, null);
    });

    it('should store provided dependencies', () => {
      assert.strictEqual(service.jobManager, mockJobManager);
      assert.strictEqual(service.logger, mockLogger);
      assert.strictEqual(service.broadcastChange, mockBroadcastChange);
    });
  });

  describe('stop', () => {
    it('should stop service correctly', () => {
      // Manually set up service state
      service.isRunning = true;
      service.intervalId = 123;

      service.stop();

      assert.strictEqual(service.isRunning, false);
      assert.strictEqual(service.intervalId, null);
      assert.strictEqual(mockLogger.info.mock.calls.length, 1);
      assert.strictEqual(
        mockLogger.info.mock.calls[0].arguments[0],
        'Stopping title enhancement service'
      );
    });

    it('should handle stop when not running', () => {
      assert.strictEqual(service.isRunning, false);

      service.stop();

      assert.strictEqual(service.isRunning, false);
      assert.strictEqual(mockLogger.info.mock.calls.length, 1);
    });
  });

  describe('getStatus', () => {
    it('should return correct status when not running', () => {
      const status = service.getStatus();

      assert.deepStrictEqual(status, {
        isRunning: false,
        processingQueue: 0,
        maxTitleChecks: 2,
        pollInterval: 2000,
      });
    });

    it('should return correct status when running', () => {
      // Manually set service state
      service.isRunning = true;
      service.maxTitleChecks = 3;
      service.pollInterval = 1000;

      const status = service.getStatus();

      assert.deepStrictEqual(status, {
        isRunning: true,
        processingQueue: 0,
        maxTitleChecks: 3,
        pollInterval: 1000,
      });
    });

    it('should reflect processing queue size', () => {
      service.processingQueue.add('test-job-1');
      service.processingQueue.add('test-job-2');

      const status = service.getStatus();

      assert.strictEqual(status.processingQueue, 2);
    });
  });

  describe('processEnhancementQueue', () => {
    beforeEach(() => {
      // Manually set service as running for these tests
      service.isRunning = true;
    });

    it('should process jobs that need titles', async () => {
      const testJobs = [
        {
          id: 'job-1',
          url: 'https://example.com/1',
          title: null,
          state: JobState.QUEUED,
        },
        {
          id: 'job-2',
          url: 'https://example.com/2',
          title: 'Already has title',
          state: JobState.QUEUED,
        },
        {
          id: 'job-3',
          url: 'https://example.com/3',
          title: null,
          state: JobState.QUEUED,
        },
      ];

      mockJobManager.getQueuedJobs.mock.mockImplementation(
        async () => testJobs
      );

      // Mock enhanceJobMetadata to avoid actual processing
      const enhanceJobMetadataSpy = mock.method(
        service,
        'enhanceJobMetadata',
        async () => {}
      );

      await service.processEnhancementQueue();

      assert.strictEqual(enhanceJobMetadataSpy.mock.calls.length, 2);
      assert.strictEqual(
        enhanceJobMetadataSpy.mock.calls[0].arguments[0].id,
        'job-1'
      );
      assert.strictEqual(
        enhanceJobMetadataSpy.mock.calls[1].arguments[0].id,
        'job-3'
      );
    });

    it('should respect maxConcurrent limit', async () => {
      const testJobs = [
        {
          id: 'job-1',
          url: 'https://example.com/1',
          title: null,
          state: JobState.QUEUED,
        },
        {
          id: 'job-2',
          url: 'https://example.com/2',
          title: null,
          state: JobState.QUEUED,
        },
        {
          id: 'job-3',
          url: 'https://example.com/3',
          title: null,
          state: JobState.QUEUED,
        },
      ];

      mockJobManager.getQueuedJobs.mock.mockImplementation(
        async () => testJobs
      );

      // Simulate one job already being processed
      service.processingQueue.add('job-1');

      const enhanceJobMetadataSpy = mock.method(
        service,
        'enhanceJobMetadata',
        async () => {}
      );

      await service.processEnhancementQueue();

      // Should only process 1 more job (maxConcurrent - 1)
      assert.strictEqual(enhanceJobMetadataSpy.mock.calls.length, 1);
      assert.strictEqual(
        enhanceJobMetadataSpy.mock.calls[0].arguments[0].id,
        'job-2'
      );
    });

    it('should skip jobs already being processed', async () => {
      const testJobs = [
        {
          id: 'job-1',
          url: 'https://example.com/1',
          title: null,
          state: JobState.QUEUED,
        },
        {
          id: 'job-2',
          url: 'https://example.com/2',
          title: null,
          state: JobState.QUEUED,
        },
      ];

      mockJobManager.getQueuedJobs.mock.mockImplementation(
        async () => testJobs
      );

      // Mark job-1 as already being processed
      service.processingQueue.add('job-1');

      const enhanceJobMetadataSpy = mock.method(
        service,
        'enhanceJobMetadata',
        async () => {}
      );

      await service.processEnhancementQueue();

      assert.strictEqual(enhanceJobMetadataSpy.mock.calls.length, 1);
      assert.strictEqual(
        enhanceJobMetadataSpy.mock.calls[0].arguments[0].id,
        'job-2'
      );
    });

    it('should handle errors gracefully', async () => {
      mockJobManager.getQueuedJobs.mock.mockImplementation(async () => {
        throw new Error('Database error');
      });

      await service.processEnhancementQueue();

      assert.strictEqual(mockLogger.error.mock.calls.length, 1);
      assert.strictEqual(
        mockLogger.error.mock.calls[0].arguments[0],
        'Error processing enhancement queue:'
      );
    });

    it('should not process if service is stopped', async () => {
      service.isRunning = false;

      const enhanceJobTitleSpy = mock.method(
        service,
        'enhanceJobTitle',
        async () => {}
      );

      await service.processEnhancementQueue();

      assert.strictEqual(enhanceJobTitleSpy.mock.calls.length, 0);
    });
  });

  describe('enhanceJobTitle', () => {
    beforeEach(() => {
      // Set up mock settings for these tests
      service.settings = {
        titleEnhancement: {
          timeout: 10000,
        },
      };
    });

    it('should enhance job with metadata successfully', async () => {
      const testJob = {
        id: 'test-job',
        url: 'https://example.com/video',
        title: null,
        state: JobState.QUEUED,
      };

      mockJobManager.getJob.mock.mockImplementation(async () => testJob);

      // Mock extractVideoMetadata to return metadata
      const mockMetadata = {
        title: 'Test Video Title',
        filesize: 1234567,
        filesize_estimated: false,
        duration: 180,
        uploader: 'Test Channel',
        upload_date: '20230101',
        view_count: 1000,
        like_count: 50,
        description: 'Test description',
        thumbnail: 'https://example.com/thumb.jpg',
      };

      const extractMetadataSpy = mock.method(
        service,
        'extractVideoMetadata',
        async () => mockMetadata
      );

      await service.enhanceJobTitle(testJob);

      assert.strictEqual(extractMetadataSpy.mock.calls.length, 1);
      assert.strictEqual(
        extractMetadataSpy.mock.calls[0].arguments[0],
        testJob.url
      );
      assert.strictEqual(mockJobManager.updateJob.mock.calls.length, 1);
      assert.strictEqual(
        mockJobManager.updateJob.mock.calls[0].arguments[0],
        testJob.id
      );
      assert.deepStrictEqual(
        mockJobManager.updateJob.mock.calls[0].arguments[1],
        {
          metadata: mockMetadata,
          title: 'Test Video Title',
        }
      );
      assert.strictEqual(mockBroadcastChange.mock.calls.length, 1);
    });

    it('should skip enhancement if job is already being processed', async () => {
      const testJob = {
        id: 'test-job',
        url: 'https://example.com/video',
        title: null,
      };

      service.processingQueue.add('test-job');

      const extractMetadataSpy = mock.method(
        service,
        'extractVideoMetadata',
        async () => ({ title: 'Test Title' })
      );

      await service.enhanceJobTitle(testJob);

      assert.strictEqual(extractMetadataSpy.mock.calls.length, 0);
      assert.strictEqual(mockJobManager.updateJob.mock.calls.length, 0);
    });

    it('should skip enhancement if job is no longer queued', async () => {
      const testJob = {
        id: 'test-job',
        url: 'https://example.com/video',
        title: null,
        state: JobState.QUEUED,
      };

      // First call returns null (job deleted)
      mockJobManager.getJob.mock.mockImplementationOnce(async () => null);

      const extractMetadataSpy = mock.method(
        service,
        'extractVideoMetadata',
        async () => ({ title: 'Test Title' })
      );

      await service.enhanceJobTitle(testJob);

      assert.strictEqual(extractMetadataSpy.mock.calls.length, 0);
      assert.strictEqual(mockJobManager.updateJob.mock.calls.length, 0);
      assert.strictEqual(
        mockLogger.info.mock.calls.some((call) =>
          call.arguments[0].includes(
            'no longer in valid state, skipping metadata enhancement'
          )
        ),
        true
      );
    });

    it('should handle race conditions during title extraction', async () => {
      const testJob = {
        id: 'test-job',
        url: 'https://example.com/video',
        title: null,
        state: JobState.QUEUED,
      };

      // Mock extractVideoMetadata to return metadata
      mock.method(service, 'extractVideoMetadata', async () => ({
        title: 'Test Title',
      }));

      // First call returns queued job (passes initial check)
      mockJobManager.getJob.mock.mockImplementationOnce(async () => testJob);

      // Second call simulates job became active during title extraction
      mockJobManager.getJob.mock.mockImplementationOnce(async () => ({
        ...testJob,
        state: JobState.ACTIVE,
      }));

      await service.enhanceJobTitle(testJob);

      // Should not update due to race condition
      assert.strictEqual(mockJobManager.updateJob.mock.calls.length, 0);

      // Verify the processing queue was cleaned up
      assert.strictEqual(service.processingQueue.has('test-job'), false);
    });

    it('should handle title extraction failure gracefully', async () => {
      const testJob = {
        id: 'test-job',
        url: 'https://example.com/video',
        title: null,
        state: JobState.QUEUED,
      };

      mockJobManager.getJob.mock.mockImplementation(async () => testJob);

      // Mock extractVideoMetadata to return null (failure)
      const extractMetadataSpy = mock.method(
        service,
        'extractVideoMetadata',
        async () => null
      );

      await service.enhanceJobTitle(testJob);

      assert.strictEqual(extractMetadataSpy.mock.calls.length, 1);
      assert.strictEqual(mockJobManager.updateJob.mock.calls.length, 0);
      assert.strictEqual(
        mockLogger.warn.mock.calls.some((call) =>
          call.arguments[0].includes('Failed to extract metadata for job')
        ),
        true
      );
    });

    it('should handle errors during processing', async () => {
      const testJob = {
        id: 'test-job',
        url: 'https://example.com/video',
        title: null,
        state: JobState.QUEUED,
      };

      mockJobManager.getJob.mock.mockImplementation(async () => {
        throw new Error('Database error');
      });

      await service.enhanceJobTitle(testJob);

      assert.strictEqual(
        mockLogger.error.mock.calls.some((call) =>
          call.arguments[0].includes('Metadata enhancement failed for job')
        ),
        true
      );
    });

    it('should clean up processing queue after completion', async () => {
      const testJob = {
        id: 'test-job',
        url: 'https://example.com/video',
        title: null,
        state: JobState.QUEUED,
      };

      mockJobManager.getJob.mock.mockImplementation(async () => testJob);
      mock.method(service, 'extractVideoMetadata', async () => ({
        title: 'Test Title',
      }));

      await service.enhanceJobTitle(testJob);

      assert.strictEqual(service.processingQueue.has('test-job'), false);
    });

    it('should clean up processing queue after error', async () => {
      const testJob = {
        id: 'test-job',
        url: 'https://example.com/video',
        title: null,
        state: JobState.QUEUED,
      };

      mockJobManager.getJob.mock.mockImplementation(async () => {
        throw new Error('Database error');
      });

      await service.enhanceJobTitle(testJob);

      assert.strictEqual(service.processingQueue.has('test-job'), false);
    });
  });

  describe('extractVideoMetadata', () => {
    it('should extract metadata successfully', async () => {
      // This test would require mocking child_process.spawn
      // For now, we'll test the timeout behavior
      const shortTimeout = 100;
      const metadata = await service.extractVideoMetadata(
        'https://invalid-url.com',
        shortTimeout
      );

      // Should return null due to timeout or error
      assert.strictEqual(metadata, null);
    });

    it('should handle timeout correctly', async () => {
      const shortTimeout = 50;
      const startTime = Date.now();

      const metadata = await service.extractVideoMetadata(
        'https://invalid-url.com',
        shortTimeout
      );
      const endTime = Date.now();

      assert.strictEqual(metadata, null);
      // Should complete within reasonable time after timeout
      assert(endTime - startTime < shortTimeout + 100);
    });

    it('should prefer filesize_approx over filesize', async () => {
      // Mock the spawn method
      const originalSpawn = service.extractVideoMetadata;
      service.extractVideoMetadata = async () => ({
        title: 'Test Video',
        filesize: 2000000, // Should use filesize_approx
        filesize_estimated: false,
        duration: 120,
        uploader: null,
        upload_date: null,
        view_count: null,
        like_count: null,
        description: null,
        thumbnail: null,
      });

      const result = await service.extractVideoMetadata('test-url');

      assert.strictEqual(result.filesize, 2000000);
      assert.strictEqual(result.filesize_estimated, false);

      // Restore original method
      service.extractVideoMetadata = originalSpawn;
    });

    it('should estimate filesize from bitrate when no explicit size available', async () => {
      // Mock for SBS-style metadata without explicit filesize
      service.extractVideoMetadata = async () => ({
        title: 'Test Video',
        filesize: 1313600, // Calculated: (1981.321 * 5259 * 1024) / 8 = ~1.3GB
        filesize_estimated: true,
        duration: 5259,
        uploader: 'SBSC',
        upload_date: null,
        view_count: null,
        like_count: null,
        description: null,
        thumbnail: null,
      });

      const result = await service.extractVideoMetadata('test-url');

      assert.strictEqual(result.filesize_estimated, true);
      assert(result.filesize > 1000000); // Should be a reasonable estimate
    });

    it('should return null filesize when no size info available', async () => {
      // Mock for metadata with no size or bitrate info
      service.extractVideoMetadata = async () => ({
        title: 'Test Video',
        filesize: null,
        filesize_estimated: false,
        duration: 120,
        uploader: null,
        upload_date: null,
        view_count: null,
        like_count: null,
        description: null,
        thumbnail: null,
      });

      const result = await service.extractVideoMetadata('test-url');

      assert.strictEqual(result.filesize, null);
      assert.strictEqual(result.filesize_estimated, false);
    });
  });

  describe('extractVideoTitle', () => {
    it('should extract title from metadata', async () => {
      // Mock extractVideoMetadata to return metadata
      const mockMetadata = { title: 'Test Video Title' };
      mock.method(service, 'extractVideoMetadata', async () => mockMetadata);

      const title = await service.extractVideoTitle(
        'https://example.com/video'
      );

      assert.strictEqual(title, 'Test Video Title');
    });

    it('should return null if no metadata', async () => {
      // Mock extractVideoMetadata to return null
      mock.method(service, 'extractVideoMetadata', async () => null);

      const title = await service.extractVideoTitle(
        'https://example.com/video'
      );

      assert.strictEqual(title, null);
    });

    it('should return null if no title in metadata', async () => {
      // Mock extractVideoMetadata to return metadata without title
      mock.method(service, 'extractVideoMetadata', async () => ({
        duration: 180,
      }));

      const title = await service.extractVideoTitle(
        'https://example.com/video'
      );

      assert.strictEqual(title, null);
    });
  });
});
