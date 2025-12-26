import { describe, it as test } from '@std/testing/bdd';
import { assert, assertEquals, assertRejects } from '@std/assert';
import { join } from '@std/path';
import { Job, JobManager, JobState } from '../lib/jobs.js';
import {
  assertValidHash,
  cleanupTestDir,
  createMockLogger,
  createTestDir,
  TEST_DATA_DIR,
} from './helpers.js';

describe('jobs.js', () => {
  describe('Job class', () => {
    describe('constructor and basic properties', () => {
      test('should create job with required URL', () => {
        const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        const job = new Job({ url });

        assertEquals(job.url, url);
        assert(job.id, 'Should have an ID');
        assertEquals(
          job.state,
          JobState.QUEUED,
          'Should default to QUEUED state',
        );
        assertEquals(job.retryCount, 0, 'Should default to 0 retries');
        assert(job.timestamp, 'Should have a timestamp');
        assert(job.sortOrder, 'Should have a sort order');
        assertEquals(job.metadata, {}, 'Should default to empty metadata');
      });

      test('should create job with custom properties', () => {
        const jobData = {
          url: 'https://example.com/video',
          title: 'Test Video',
          retryCount: 2,
          timestamp: '2023-01-01T00:00:00Z',
          sortOrder: 12345,
          state: JobState.ACTIVE,
          metadata: { duration: 120 },
        };

        const job = new Job(jobData);

        assertEquals(job.url, jobData.url);
        assertEquals(job.title, jobData.title);
        assertEquals(job.retryCount, jobData.retryCount);
        assertEquals(job.timestamp, jobData.timestamp);
        assertEquals(job.sortOrder, jobData.sortOrder);
        assertEquals(job.state, jobData.state);
        assertEquals(job.metadata, jobData.metadata);
      });

      test('should generate consistent ID from URL', () => {
        const url = 'https://www.youtube.com/watch?v=test123';
        const job1 = new Job({ url });
        const job2 = new Job({ url });

        assertEquals(job1.id, job2.id, 'Same URL should produce same ID');
        assertValidHash(job1.id);
      });

      test('should generate different IDs for different URLs', () => {
        const job1 = new Job({ url: 'https://example.com/video1' });
        const job2 = new Job({ url: 'https://example.com/video2' });

        assert(
          job1.id !== job2.id,
          'Different URLs should produce different IDs',
        );
      });

      test('should handle special characters and unicode in URLs', () => {
        const url = 'https://example.com/测试视频?title=测试&emoji=🎵';
        const job = new Job({ url });

        assertValidHash(job.id);
        assertEquals(job.url, url);
      });
    });

    describe('validation', () => {
      test('should validate successfully with valid data', () => {
        const job = new Job({ url: 'https://example.com/video' });
        // In Deno, there's no assert.doesNotThrow, so just call validate
        // and if it doesn't throw, the test passes
        job.validate();
      });

      test('should throw error for missing URL', () => {
        const job = new Job({ url: '' });
        let didThrow = false;
        try {
          job.validate();
        } catch (error) {
          didThrow = true;
          assert(error.message.includes('Job URL is required'));
        }
        assert(didThrow, 'Should have thrown error for missing URL');
      });

      test('should throw error for non-string URL', () => {
        const job = new Job({ url: null });
        let didThrow = false;
        try {
          job.validate();
        } catch (error) {
          didThrow = true;
          assert(error.message.includes('Job URL is required'));
        }
        assert(didThrow, 'Should have thrown error for non-string URL');
      });

      test('should throw error for invalid state', () => {
        const job = new Job({ url: 'https://example.com/video' });
        job.state = 'invalid_state';
        let didThrow = false;
        try {
          job.validate();
        } catch (error) {
          didThrow = true;
          assert(error.message.includes('Invalid job state'));
        }
        assert(didThrow, 'Should have thrown error for invalid state');
      });

      test('should throw error for negative retry count', () => {
        const job = new Job({ url: 'https://example.com/video' });
        job.retryCount = -1;
        let didThrow = false;
        try {
          job.validate();
        } catch (error) {
          didThrow = true;
          assert(error.message.includes('Retry count cannot be negative'));
        }
        assert(didThrow, 'Should have thrown error for negative retry count');
      });
    });

    describe('utility methods', () => {
      test('should generate correct filename', () => {
        const job = new Job({ url: 'https://example.com/video' });
        const filename = job.getFilename();

        assert(filename.endsWith('.json'), 'Filename should end with .json');
        assertEquals(filename, `${job.id}.json`);
      });

      test('should generate correct file path', () => {
        const job = new Job({
          url: 'https://example.com/video',
          state: JobState.QUEUED,
        });
        const baseDir = '/test/base';
        const filePath = job.getFilePath(baseDir);

        assertEquals(
          filePath,
          join(baseDir, 'data', 'jobs', 'queued', `${job.id}.json`),
        );
      });

      test('should convert to JSON correctly', () => {
        const jobData = {
          url: 'https://example.com/video',
          title: 'Test Video',
          retryCount: 1,
          timestamp: '2023-01-01T00:00:00Z',
          sortOrder: 12345,
          metadata: { duration: 120 },
        };

        const job = new Job(jobData);
        const json = job.toJSON();

        assertEquals(json.url, jobData.url);
        assertEquals(json.title, jobData.title);
        assertEquals(json.retryCount, jobData.retryCount);
        assertEquals(json.timestamp, jobData.timestamp);
        assertEquals(json.sortOrder, jobData.sortOrder);
        assertEquals(json.metadata, jobData.metadata);
        assert(!('id' in json), 'JSON should not include ID');
        assert(!('state' in json), 'JSON should not include state');
      });

      test('should create from JSON correctly', () => {
        const jsonData = {
          url: 'https://example.com/video',
          title: 'Test Video',
          retryCount: 1,
          timestamp: '2023-01-01T00:00:00Z',
          sortOrder: 12345,
          metadata: { duration: 120 },
        };

        const job = Job.fromJSON(jsonData, 'test-id', JobState.ACTIVE);

        assertEquals(job.id, 'test-id');
        assertEquals(job.state, JobState.ACTIVE);
        assertEquals(job.url, jsonData.url);
        assertEquals(job.title, jsonData.title);
        assertEquals(job.retryCount, jsonData.retryCount);
        assertEquals(job.timestamp, jsonData.timestamp);
        assertEquals(job.sortOrder, jsonData.sortOrder);
        assertEquals(job.metadata, jsonData.metadata);
      });
    });

    describe('state management', () => {
      test('should set state correctly', () => {
        const job = new Job({ url: 'https://example.com/video' });

        job.setState(JobState.ACTIVE);
        assertEquals(job.state, JobState.ACTIVE);

        job.setState(JobState.ACTIVE);
        assertEquals(job.state, JobState.ACTIVE);
      });

      test('should throw error for invalid state', () => {
        const job = new Job({ url: 'https://example.com/video' });

        let didThrow = false;
        try {
          job.setState('invalid');
        } catch (error) {
          didThrow = true;
          assert(error.message.includes('Invalid job state'));
        }
        assert(didThrow, 'Should have thrown error for invalid state');
      });

      test('should clone job with new state', () => {
        const originalJob = new Job({
          url: 'https://example.com/video',
          title: 'Test Video',
          retryCount: 1,
          metadata: { duration: 120 },
        });

        const clonedJob = originalJob.clone(JobState.ACTIVE);

        assertEquals(clonedJob.state, JobState.ACTIVE);
        assertEquals(clonedJob.id, originalJob.id);
        assertEquals(clonedJob.url, originalJob.url);
        assertEquals(clonedJob.title, originalJob.title);
        assertEquals(clonedJob.retryCount, originalJob.retryCount);
        assertEquals(clonedJob.metadata, originalJob.metadata);
        assert(clonedJob !== originalJob, 'Should be different objects');
      });

      test('should increment retry count', () => {
        const job = new Job({ url: 'https://example.com/video' });

        assertEquals(job.retryCount, 0);
        job.incrementRetryCount();
        assertEquals(job.retryCount, 1);
        job.incrementRetryCount();
        assertEquals(job.retryCount, 2);
      });

      test('should update title', () => {
        const job = new Job({ url: 'https://example.com/video' });

        job.updateTitle('New Title');
        assertEquals(job.title, 'New Title');
      });
    });
  });

  describe('JobManager class', () => {
    describe('constructor and configuration', () => {
      test('should create with default options', () => {
        const jobManager = new JobManager();

        assertEquals(jobManager.maxRetries, 3);
        assert(jobManager.baseDir, 'Should have a base directory');
        assert(jobManager.jobDirectories, 'Should have job directories');
      });

      test('should create with custom options', () => {
        const logger = createMockLogger();
        const baseDir = '/custom/base';
        const maxRetries = 5;

        const jobManager = new JobManager({ logger, baseDir, maxRetries });

        assertEquals(jobManager.logger, logger);
        assertEquals(jobManager.baseDir, baseDir);
        assertEquals(jobManager.maxRetries, maxRetries);
      });

      test('should set up correct job directories', () => {
        const baseDir = '/test/base';
        const jobManager = new JobManager({ baseDir });

        assertEquals(
          jobManager.jobDirectories[JobState.QUEUED],
          join(baseDir, 'data', 'jobs', 'queued'),
        );
        assertEquals(
          jobManager.jobDirectories[JobState.ACTIVE],
          join(baseDir, 'data', 'jobs', 'active'),
        );
      });
    });

    describe('job creation', () => {
      test('should create job successfully', async () => {
        await createTestDir();
        const baseDir = join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const url = 'https://example.com/video';
        const job = await jobManager.createJob(url);

        assertEquals(job.url, url);
        assertEquals(job.state, JobState.QUEUED);
        assertValidHash(job.id);

        // Verify file was created
        const filePath = job.getFilePath(baseDir);
        let fileExists = false;
        try {
          await Deno.stat(filePath);
          fileExists = true;
        } catch {
          fileExists = false;
        }
        assert(fileExists, 'Job file should be created');

        await cleanupTestDir();
      });

      test('should create job with options', async () => {
        await createTestDir();
        const baseDir = join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const url = 'https://example.com/video';
        const options = {
          title: 'Test Video',
          retryCount: 1,
          metadata: { duration: 120 },
        };

        const job = await jobManager.createJob(url, options);

        assertEquals(job.url, url);
        assertEquals(job.title, options.title);
        assertEquals(job.retryCount, options.retryCount);
        assertEquals(job.metadata, options.metadata);

        await cleanupTestDir();
      });

      test('should throw error for duplicate job', async () => {
        await createTestDir();
        const baseDir = join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const url = 'https://example.com/video';
        await jobManager.createJob(url);

        await assertRejects(
          () => jobManager.createJob(url),
          Error,
          'Job already exists',
        );

        await cleanupTestDir();
      });
    });

    describe('job retrieval', () => {
      test('should get job by ID', async () => {
        await createTestDir();
        const baseDir = join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const url = 'https://example.com/video';
        const createdJob = await jobManager.createJob(url);
        const retrievedJob = await jobManager.getJob(createdJob.id);

        assertEquals(retrievedJob.id, createdJob.id);
        assertEquals(retrievedJob.url, createdJob.url);
        assertEquals(retrievedJob.state, createdJob.state);

        await cleanupTestDir();
      });

      test('should return null for non-existent job', async () => {
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger });

        const job = await jobManager.getJob('non-existent-id');
        assertEquals(job, null);
      });

      test('should get jobs by state', async () => {
        await createTestDir();
        const baseDir = join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        // Create jobs in different states
        const job1 = await jobManager.createJob('https://example.com/video1');
        const job2 = await jobManager.createJob('https://example.com/video2');
        await jobManager.moveJob(job2.id, JobState.ACTIVE);

        const queuedJobs = await jobManager.getQueuedJobs();
        const activeJobs = await jobManager.getActiveJobs();

        assertEquals(queuedJobs.length, 1);
        assertEquals(queuedJobs[0].id, job1.id);
        assertEquals(activeJobs.length, 1);
        assertEquals(activeJobs[0].id, job2.id);

        await cleanupTestDir();
      });

      test('should return empty array for invalid state', async () => {
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger });

        await assertRejects(
          () => jobManager.getJobsByState('invalid'),
          Error,
          'Invalid job state',
        );
      });
    });

    describe('job state transitions', () => {
      test('should move job between states', async () => {
        await createTestDir();
        const baseDir = join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const job = await jobManager.createJob('https://example.com/video');
        assertEquals(job.state, JobState.QUEUED);

        // Move to active
        const activeJob = await jobManager.moveJob(job.id, JobState.ACTIVE);
        assertEquals(activeJob.state, JobState.ACTIVE);
        assertEquals(activeJob.id, job.id);

        // Verify old file is gone and new file exists
        const queuedPath = job.getFilePath(baseDir);
        const activePath = activeJob.getFilePath(baseDir);

        let queuedExists = false;
        try {
          await Deno.stat(queuedPath);
          queuedExists = true;
        } catch {
          queuedExists = false;
        }

        let activeExists = false;
        try {
          await Deno.stat(activePath);
          activeExists = true;
        } catch {
          activeExists = false;
        }

        assert(!queuedExists, 'Queued file should be removed');
        assert(activeExists, 'Active file should exist');

        await cleanupTestDir();
      });

      test('should not move job if already in target state', async () => {
        await createTestDir();
        const baseDir = join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const job = await jobManager.createJob('https://example.com/video');
        const sameJob = await jobManager.moveJob(job.id, JobState.QUEUED);

        assertEquals(sameJob.state, JobState.QUEUED);
        assertEquals(sameJob.id, job.id);

        await cleanupTestDir();
      });

      test('should throw error for invalid state transition', async () => {
        await createTestDir();
        const baseDir = join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const job = await jobManager.createJob('https://example.com/video');

        await assertRejects(
          () => jobManager.moveJob(job.id, 'invalid'),
          Error,
          'Invalid job state',
        );

        await cleanupTestDir();
      });

      test('should throw error for non-existent job', async () => {
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger });

        await assertRejects(
          () => jobManager.moveJob('non-existent', JobState.ACTIVE),
          Error,
          'Job not found',
        );
      });
    });

    describe('job updates', () => {
      test('should update job properties', async () => {
        await createTestDir();
        const baseDir = join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const job = await jobManager.createJob('https://example.com/video');
        const updates = {
          title: 'Updated Title',
          retryCount: 2,
          metadata: { duration: 180 },
        };

        const updatedJob = await jobManager.updateJob(job.id, updates);

        assertEquals(updatedJob.title, updates.title);
        assertEquals(updatedJob.retryCount, updates.retryCount);
        assertEquals(updatedJob.metadata, updates.metadata);

        // Verify changes persisted to file
        const retrievedJob = await jobManager.getJob(job.id);
        assertEquals(retrievedJob.title, updates.title);
        assertEquals(retrievedJob.retryCount, updates.retryCount);

        await cleanupTestDir();
      });

      test('should merge metadata correctly', async () => {
        await createTestDir();
        const baseDir = join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const job = await jobManager.createJob('https://example.com/video', {
          metadata: { duration: 120, quality: 'HD' },
        });

        await jobManager.updateJob(job.id, {
          metadata: { duration: 180, format: 'mp4' },
        });

        const updatedJob = await jobManager.getJob(job.id);
        assertEquals(updatedJob.metadata, {
          duration: 180,
          quality: 'HD',
          format: 'mp4',
        });

        await cleanupTestDir();
      });
    });

    describe('job deletion', () => {
      test('should delete job successfully', async () => {
        await createTestDir();
        const baseDir = join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const job = await jobManager.createJob('https://example.com/video');
        const filePath = job.getFilePath(baseDir);

        // Verify file exists
        let fileExists = false;
        try {
          await Deno.stat(filePath);
          fileExists = true;
        } catch {
          fileExists = false;
        }
        assert(fileExists, 'File should exist before deletion');

        // Delete job
        const result = await jobManager.deleteJob(job.id);
        assertEquals(result, true);

        // Verify file is gone
        fileExists = false;
        try {
          await Deno.stat(filePath);
          fileExists = true;
        } catch {
          fileExists = false;
        }
        assert(!fileExists, 'File should be deleted');

        // Verify job is not retrievable
        const retrievedJob = await jobManager.getJob(job.id);
        assertEquals(retrievedJob, null);

        await cleanupTestDir();
      });

      test('should throw error for non-existent job', async () => {
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger });

        await assertRejects(
          () => jobManager.deleteJob('non-existent'),
          Error,
          'Job not found',
        );
      });
    });

    describe('job failure handling', () => {
      test('should retry failed job within limit', async () => {
        await createTestDir();
        const baseDir = join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir, maxRetries: 3 });

        const job = await jobManager.createJob('https://example.com/video');
        await jobManager.moveJob(job.id, JobState.ACTIVE);

        const error = new Error('Download failed');
        const retriedJob = await jobManager.handleJobFailure(job.id, error);

        assert(retriedJob, 'Should return retried job');
        assertEquals(retriedJob.state, JobState.QUEUED);
        assertEquals(retriedJob.retryCount, 1);

        await cleanupTestDir();
      });

      test('should move job to failed directory after max retries', async () => {
        await createTestDir();
        const baseDir = join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir, maxRetries: 2 });

        const job = await jobManager.createJob('https://example.com/video', {
          retryCount: 2,
        });
        await jobManager.moveJob(job.id, JobState.ACTIVE);

        const error = new Error('Download failed');
        const result = await jobManager.handleJobFailure(job.id, error);

        assertEquals(
          result,
          null,
          'Should return null when max retries exceeded',
        );

        // Verify job is moved to failed directory
        const retrievedJob = await jobManager.getJob(job.id);
        assert(retrievedJob, 'Job should exist in failed directory');
        assertEquals(retrievedJob.state, JobState.FAILED);
        assertEquals(retrievedJob.metadata.lastError, 'Download failed');
        assert(
          retrievedJob.metadata.failedAt,
          'Should have failedAt timestamp',
        );

        await cleanupTestDir();
      });
    });

    describe('cleanup operations', () => {
      test('should cleanup interrupted jobs', async () => {
        await createTestDir();
        const baseDir = join(TEST_DATA_DIR, 'cleanup-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir, maxRetries: 3 });

        // Create active jobs (simulating interrupted downloads)
        const job1 = await jobManager.createJob('https://example.com/cleanup1');
        const job2 = await jobManager.createJob('https://example.com/cleanup2');
        await jobManager.moveJob(job1.id, JobState.ACTIVE);
        await jobManager.moveJob(job2.id, JobState.ACTIVE);

        await jobManager.cleanupInterruptedJobs();

        // Verify jobs moved back to queued with incremented retry count
        const jobs = await jobManager.getQueuedJobs();
        assertEquals(jobs.length, 2);

        for (const job of jobs) {
          assertEquals(job.retryCount, 1);
        }

        await cleanupTestDir();
      });
    });

    describe('statistics', () => {
      test('should return correct job statistics', async () => {
        await createTestDir();
        const baseDir = join(TEST_DATA_DIR, 'stats-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        // Create jobs in different states
        await jobManager.createJob('https://example.com/stats1');
        const job2 = await jobManager.createJob('https://example.com/stats2');
        const job3 = await jobManager.createJob('https://example.com/stats3');

        await jobManager.moveJob(job2.id, JobState.ACTIVE);
        await jobManager.moveJob(job3.id, JobState.ACTIVE);

        const stats = await jobManager.getJobStats();

        assertEquals(stats.queued, 1);
        assertEquals(stats.active, 2);
        assertEquals(stats.total, 3);

        await cleanupTestDir();
      });
    });
  });

  describe('Integration tests', () => {
    test('should handle complete job lifecycle', async () => {
      await createTestDir();
      const baseDir = join(TEST_DATA_DIR, 'integration-test');
      const logger = createMockLogger();
      const jobManager = new JobManager({ logger, baseDir });

      const url = 'https://example.com/video';

      // Create job
      const job = await jobManager.createJob(url, { title: 'Test Video' });
      assertEquals(job.state, JobState.QUEUED);

      // Move to active
      await jobManager.moveJob(job.id, JobState.ACTIVE);
      let currentJob = await jobManager.getJob(job.id);
      assertEquals(currentJob.state, JobState.ACTIVE);

      // Update during processing
      await jobManager.updateJob(job.id, {
        title: 'Updated Video Title',
        metadata: { progress: 50 },
      });

      // Complete successfully - in real app, job would be deleted
      // For this test, just verify it's in active state
      currentJob = await jobManager.getJob(job.id);
      assertEquals(currentJob.state, JobState.ACTIVE);
      assertEquals(currentJob.title, 'Updated Video Title');

      // Verify final state
      const stats = await jobManager.getJobStats();
      assertEquals(stats.active, 1);
      assertEquals(stats.total, 1);

      await cleanupTestDir();
    });

    test('should handle job failure and retry workflow', async () => {
      await createTestDir();
      const baseDir = join(TEST_DATA_DIR, 'retry-workflow-test');
      const logger = createMockLogger();
      const jobManager = new JobManager({ logger, baseDir, maxRetries: 2 });

      const url = 'https://example.com/retry-workflow';

      // Create and start job
      const job = await jobManager.createJob(url);
      await jobManager.moveJob(job.id, JobState.ACTIVE);

      // First failure
      const retriedJob = await jobManager.handleJobFailure(
        job.id,
        new Error('Network error'),
      );
      assertEquals(retriedJob.retryCount, 1);
      assertEquals(retriedJob.state, JobState.QUEUED);

      // Move to active again
      await jobManager.moveJob(job.id, JobState.ACTIVE);

      // Second failure (max retries reached)
      const finalResult = await jobManager.handleJobFailure(
        job.id,
        new Error('Persistent error'),
      );
      assertEquals(finalResult, null);

      // Verify job is moved to failed directory
      const failedJob = await jobManager.getJob(job.id);
      assert(failedJob, 'Job should exist in failed directory');
      assertEquals(failedJob.state, JobState.FAILED);
      assertEquals(failedJob.metadata.lastError, 'Persistent error');
      assert(failedJob.metadata.failedAt, 'Should have failedAt timestamp');

      await cleanupTestDir();
    });

    test('should handle concurrent job operations', async () => {
      await createTestDir();
      const baseDir = join(TEST_DATA_DIR, 'concurrent-test');
      const logger = createMockLogger();
      const jobManager = new JobManager({ logger, baseDir });

      // Create multiple jobs concurrently
      const urls = [
        'https://example.com/video1',
        'https://example.com/video2',
        'https://example.com/video3',
      ];

      const jobs = await Promise.all(
        urls.map((url) => jobManager.createJob(url)),
      );

      assertEquals(jobs.length, 3);

      // Move jobs to different states concurrently
      await Promise.all([
        jobManager.moveJob(jobs[0].id, JobState.ACTIVE),
        jobManager.moveJob(jobs[1].id, JobState.ACTIVE),
        jobManager.updateJob(jobs[2].id, { title: 'Updated Title' }),
      ]);

      // Verify final states
      const [activeJobs, queuedJobs] = await Promise.all([
        jobManager.getActiveJobs(),
        jobManager.getQueuedJobs(),
      ]);

      assertEquals(activeJobs.length, 2);
      assertEquals(queuedJobs.length, 1);
      assertEquals(queuedJobs[0].title, 'Updated Title');

      await cleanupTestDir();
    });

    test('should handle async title enhancement workflow', async () => {
      await createTestDir();
      const baseDir = join(TEST_DATA_DIR, 'title-enhancement-test');
      const logger = createMockLogger();
      const jobManager = new JobManager({ logger, baseDir });

      const url = 'https://example.com/video';

      // Create job without title (simulating instant job creation)
      const job = await jobManager.createJob(url);
      assertEquals(job.title, null);
      assertEquals(job.state, JobState.QUEUED);

      // Simulate title enhancement service updating the job
      await jobManager.updateJob(job.id, { title: 'Enhanced Video Title' });

      // Verify title was updated
      const updatedJob = await jobManager.getJob(job.id);
      assertEquals(updatedJob.title, 'Enhanced Video Title');
      assertEquals(updatedJob.state, JobState.QUEUED);

      // Verify job can still be processed normally
      await jobManager.moveJob(job.id, JobState.ACTIVE);
      const activeJob = await jobManager.getJob(job.id);
      assertEquals(activeJob.state, JobState.ACTIVE);
      assertEquals(activeJob.title, 'Enhanced Video Title');

      await cleanupTestDir();
    });

    test('should handle race condition during title enhancement', async () => {
      await createTestDir();
      const baseDir = join(TEST_DATA_DIR, 'race-condition-test');
      const logger = createMockLogger();
      const jobManager = new JobManager({ logger, baseDir });

      const url = 'https://example.com/video';

      // Create job
      const job = await jobManager.createJob(url);
      assertEquals(job.title, null);

      // Simulate race condition: move job to active before title enhancement
      await jobManager.moveJob(job.id, JobState.ACTIVE);

      // Simulate title enhancement service trying to update active job
      // This should not fail but should still update the title
      await jobManager.updateJob(job.id, { title: 'Late Enhanced Title' });

      // Verify title was updated even though job became active
      const updatedJob = await jobManager.getJob(job.id);
      assertEquals(updatedJob.title, 'Late Enhanced Title');
      assertEquals(updatedJob.state, JobState.ACTIVE);

      await cleanupTestDir();
    });

    test('should handle multiple jobs with title enhancement', async () => {
      await createTestDir();
      const baseDir = join(TEST_DATA_DIR, 'multiple-enhancement-test');
      const logger = createMockLogger();
      const jobManager = new JobManager({ logger, baseDir });

      const urls = [
        'https://example.com/video1',
        'https://example.com/video2',
        'https://example.com/video3',
      ];

      // Create jobs without titles
      const jobs = await Promise.all(
        urls.map((url) => jobManager.createJob(url)),
      );

      // Verify all jobs created without titles
      for (const job of jobs) {
        assertEquals(job.title, null);
        assertEquals(job.state, JobState.QUEUED);
      }

      // Simulate title enhancement for some jobs
      await Promise.all([
        jobManager.updateJob(jobs[0].id, { title: 'Enhanced Video 1' }),
        jobManager.updateJob(jobs[1].id, { title: 'Enhanced Video 2' }),
        // Leave jobs[2] without title enhancement
      ]);

      // Verify enhancement results
      const enhancedJobs = await jobManager.getQueuedJobs();
      assertEquals(enhancedJobs.length, 3);

      const job1 = enhancedJobs.find((j) => j.url === urls[0]);
      const job2 = enhancedJobs.find((j) => j.url === urls[1]);
      const job3 = enhancedJobs.find((j) => j.url === urls[2]);

      assertEquals(job1.title, 'Enhanced Video 1');
      assertEquals(job2.title, 'Enhanced Video 2');
      assertEquals(job3.title, null);

      await cleanupTestDir();
    });
  });
});
