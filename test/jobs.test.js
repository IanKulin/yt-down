import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import { Job, JobManager, JobState } from '../lib/jobs.js';
import {
  createTestDir,
  cleanupTestDir,
  createMockLogger,
  assertValidHash,
  TEST_DATA_DIR,
} from './helpers.js';

describe('jobs.js', () => {
  describe('Job class', () => {
    describe('constructor and basic properties', () => {
      test('should create job with required URL', () => {
        const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        const job = new Job({ url });

        assert.equal(job.url, url);
        assert.ok(job.id, 'Should have an ID');
        assert.equal(
          job.state,
          JobState.QUEUED,
          'Should default to QUEUED state'
        );
        assert.equal(job.retryCount, 0, 'Should default to 0 retries');
        assert.ok(job.timestamp, 'Should have a timestamp');
        assert.ok(job.sortOrder, 'Should have a sort order');
        assert.deepEqual(job.metadata, {}, 'Should default to empty metadata');
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

        assert.equal(job.url, jobData.url);
        assert.equal(job.title, jobData.title);
        assert.equal(job.retryCount, jobData.retryCount);
        assert.equal(job.timestamp, jobData.timestamp);
        assert.equal(job.sortOrder, jobData.sortOrder);
        assert.equal(job.state, jobData.state);
        assert.deepEqual(job.metadata, jobData.metadata);
      });

      test('should generate consistent ID from URL', () => {
        const url = 'https://www.youtube.com/watch?v=test123';
        const job1 = new Job({ url });
        const job2 = new Job({ url });

        assert.equal(job1.id, job2.id, 'Same URL should produce same ID');
        assertValidHash(job1.id);
      });

      test('should generate different IDs for different URLs', () => {
        const job1 = new Job({ url: 'https://example.com/video1' });
        const job2 = new Job({ url: 'https://example.com/video2' });

        assert.notEqual(
          job1.id,
          job2.id,
          'Different URLs should produce different IDs'
        );
      });

      test('should handle special characters and unicode in URLs', () => {
        const url = 'https://example.com/测试视频?title=测试&emoji=🎵';
        const job = new Job({ url });

        assertValidHash(job.id);
        assert.equal(job.url, url);
      });
    });

    describe('validation', () => {
      test('should validate successfully with valid data', () => {
        const job = new Job({ url: 'https://example.com/video' });
        assert.doesNotThrow(() => job.validate());
      });

      test('should throw error for missing URL', () => {
        const job = new Job({ url: '' });
        assert.throws(() => job.validate(), /Job URL is required/);
      });

      test('should throw error for non-string URL', () => {
        const job = new Job({ url: null });
        assert.throws(() => job.validate(), /Job URL is required/);
      });

      test('should throw error for invalid state', () => {
        const job = new Job({ url: 'https://example.com/video' });
        job.state = 'invalid_state';
        assert.throws(() => job.validate(), /Invalid job state/);
      });

      test('should throw error for negative retry count', () => {
        const job = new Job({ url: 'https://example.com/video' });
        job.retryCount = -1;
        assert.throws(() => job.validate(), /Retry count cannot be negative/);
      });
    });

    describe('utility methods', () => {
      test('should generate correct filename', () => {
        const job = new Job({ url: 'https://example.com/video' });
        const filename = job.getFilename();

        assert.ok(filename.endsWith('.json'), 'Filename should end with .json');
        assert.equal(filename, `${job.id}.json`);
      });

      test('should generate correct file path', () => {
        const job = new Job({
          url: 'https://example.com/video',
          state: JobState.QUEUED,
        });
        const baseDir = '/test/base';
        const filePath = job.getFilePath(baseDir);

        assert.equal(
          filePath,
          path.join(baseDir, 'data', 'jobs', 'queued', `${job.id}.json`)
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

        assert.equal(json.url, jobData.url);
        assert.equal(json.title, jobData.title);
        assert.equal(json.retryCount, jobData.retryCount);
        assert.equal(json.timestamp, jobData.timestamp);
        assert.equal(json.sortOrder, jobData.sortOrder);
        assert.deepEqual(json.metadata, jobData.metadata);
        assert.ok(!('id' in json), 'JSON should not include ID');
        assert.ok(!('state' in json), 'JSON should not include state');
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

        assert.equal(job.id, 'test-id');
        assert.equal(job.state, JobState.ACTIVE);
        assert.equal(job.url, jsonData.url);
        assert.equal(job.title, jsonData.title);
        assert.equal(job.retryCount, jsonData.retryCount);
        assert.equal(job.timestamp, jsonData.timestamp);
        assert.equal(job.sortOrder, jsonData.sortOrder);
        assert.deepEqual(job.metadata, jsonData.metadata);
      });
    });

    describe('state management', () => {
      test('should set state correctly', () => {
        const job = new Job({ url: 'https://example.com/video' });

        job.setState(JobState.ACTIVE);
        assert.equal(job.state, JobState.ACTIVE);

        job.setState(JobState.ACTIVE);
        assert.equal(job.state, JobState.ACTIVE);
      });

      test('should throw error for invalid state', () => {
        const job = new Job({ url: 'https://example.com/video' });

        assert.throws(() => job.setState('invalid'), /Invalid job state/);
      });

      test('should clone job with new state', () => {
        const originalJob = new Job({
          url: 'https://example.com/video',
          title: 'Test Video',
          retryCount: 1,
          metadata: { duration: 120 },
        });

        const clonedJob = originalJob.clone(JobState.ACTIVE);

        assert.equal(clonedJob.state, JobState.ACTIVE);
        assert.equal(clonedJob.id, originalJob.id);
        assert.equal(clonedJob.url, originalJob.url);
        assert.equal(clonedJob.title, originalJob.title);
        assert.equal(clonedJob.retryCount, originalJob.retryCount);
        assert.deepEqual(clonedJob.metadata, originalJob.metadata);
        assert.notEqual(clonedJob, originalJob, 'Should be different objects');
      });

      test('should increment retry count', () => {
        const job = new Job({ url: 'https://example.com/video' });

        assert.equal(job.retryCount, 0);
        job.incrementRetryCount();
        assert.equal(job.retryCount, 1);
        job.incrementRetryCount();
        assert.equal(job.retryCount, 2);
      });

      test('should update title', () => {
        const job = new Job({ url: 'https://example.com/video' });

        job.updateTitle('New Title');
        assert.equal(job.title, 'New Title');
      });
    });
  });

  describe('JobManager class', () => {
    describe('constructor and configuration', () => {
      test('should create with default options', () => {
        const jobManager = new JobManager();

        assert.equal(jobManager.maxRetries, 3);
        assert.ok(jobManager.baseDir, 'Should have a base directory');
        assert.ok(jobManager.jobDirectories, 'Should have job directories');
      });

      test('should create with custom options', () => {
        const logger = createMockLogger();
        const baseDir = '/custom/base';
        const maxRetries = 5;

        const jobManager = new JobManager({ logger, baseDir, maxRetries });

        assert.equal(jobManager.logger, logger);
        assert.equal(jobManager.baseDir, baseDir);
        assert.equal(jobManager.maxRetries, maxRetries);
      });

      test('should set up correct job directories', () => {
        const baseDir = '/test/base';
        const jobManager = new JobManager({ baseDir });

        assert.equal(
          jobManager.jobDirectories[JobState.QUEUED],
          path.join(baseDir, 'data', 'jobs', 'queued')
        );
        assert.equal(
          jobManager.jobDirectories[JobState.ACTIVE],
          path.join(baseDir, 'data', 'jobs', 'active')
        );
      });
    });

    describe('job creation', () => {
      test('should create job successfully', async () => {
        await createTestDir();
        const baseDir = path.join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const url = 'https://example.com/video';
        const job = await jobManager.createJob(url);

        assert.equal(job.url, url);
        assert.equal(job.state, JobState.QUEUED);
        assertValidHash(job.id);

        // Verify file was created
        const filePath = job.getFilePath(baseDir);
        const fileExists = await fs
          .access(filePath)
          .then(() => true)
          .catch(() => false);
        assert.ok(fileExists, 'Job file should be created');

        await cleanupTestDir();
      });

      test('should create job with options', async () => {
        await createTestDir();
        const baseDir = path.join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const url = 'https://example.com/video';
        const options = {
          title: 'Test Video',
          retryCount: 1,
          metadata: { duration: 120 },
        };

        const job = await jobManager.createJob(url, options);

        assert.equal(job.url, url);
        assert.equal(job.title, options.title);
        assert.equal(job.retryCount, options.retryCount);
        assert.deepEqual(job.metadata, options.metadata);

        await cleanupTestDir();
      });

      test('should throw error for duplicate job', async () => {
        await createTestDir();
        const baseDir = path.join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const url = 'https://example.com/video';
        await jobManager.createJob(url);

        await assert.rejects(
          () => jobManager.createJob(url),
          /Job already exists/
        );

        await cleanupTestDir();
      });
    });

    describe('job retrieval', () => {
      test('should get job by ID', async () => {
        await createTestDir();
        const baseDir = path.join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const url = 'https://example.com/video';
        const createdJob = await jobManager.createJob(url);
        const retrievedJob = await jobManager.getJob(createdJob.id);

        assert.equal(retrievedJob.id, createdJob.id);
        assert.equal(retrievedJob.url, createdJob.url);
        assert.equal(retrievedJob.state, createdJob.state);

        await cleanupTestDir();
      });

      test('should return null for non-existent job', async () => {
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger });

        const job = await jobManager.getJob('non-existent-id');
        assert.equal(job, null);
      });

      test('should get jobs by state', async () => {
        await createTestDir();
        const baseDir = path.join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        // Create jobs in different states
        const job1 = await jobManager.createJob('https://example.com/video1');
        const job2 = await jobManager.createJob('https://example.com/video2');
        await jobManager.moveJob(job2.id, JobState.ACTIVE);

        const queuedJobs = await jobManager.getQueuedJobs();
        const activeJobs = await jobManager.getActiveJobs();

        assert.equal(queuedJobs.length, 1);
        assert.equal(queuedJobs[0].id, job1.id);
        assert.equal(activeJobs.length, 1);
        assert.equal(activeJobs[0].id, job2.id);

        await cleanupTestDir();
      });

      test('should return empty array for invalid state', async () => {
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger });

        await assert.rejects(
          () => jobManager.getJobsByState('invalid'),
          /Invalid job state/
        );
      });
    });

    describe('job state transitions', () => {
      test('should move job between states', async () => {
        await createTestDir();
        const baseDir = path.join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const job = await jobManager.createJob('https://example.com/video');
        assert.equal(job.state, JobState.QUEUED);

        // Move to active
        const activeJob = await jobManager.moveJob(job.id, JobState.ACTIVE);
        assert.equal(activeJob.state, JobState.ACTIVE);
        assert.equal(activeJob.id, job.id);

        // Verify old file is gone and new file exists
        const queuedPath = job.getFilePath(baseDir);
        const activePath = activeJob.getFilePath(baseDir);

        const queuedExists = await fs
          .access(queuedPath)
          .then(() => true)
          .catch(() => false);
        const activeExists = await fs
          .access(activePath)
          .then(() => true)
          .catch(() => false);

        assert.ok(!queuedExists, 'Queued file should be removed');
        assert.ok(activeExists, 'Active file should exist');

        // Test completed - job moved to active successfully

        await cleanupTestDir();
      });

      test('should not move job if already in target state', async () => {
        await createTestDir();
        const baseDir = path.join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const job = await jobManager.createJob('https://example.com/video');
        const sameJob = await jobManager.moveJob(job.id, JobState.QUEUED);

        assert.equal(sameJob.state, JobState.QUEUED);
        assert.equal(sameJob.id, job.id);

        await cleanupTestDir();
      });

      test('should throw error for invalid state transition', async () => {
        await createTestDir();
        const baseDir = path.join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const job = await jobManager.createJob('https://example.com/video');

        await assert.rejects(
          () => jobManager.moveJob(job.id, 'invalid'),
          /Invalid job state/
        );

        await cleanupTestDir();
      });

      test('should throw error for non-existent job', async () => {
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger });

        await assert.rejects(
          () => jobManager.moveJob('non-existent', JobState.ACTIVE),
          /Job not found/
        );
      });
    });

    describe('job updates', () => {
      test('should update job properties', async () => {
        await createTestDir();
        const baseDir = path.join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const job = await jobManager.createJob('https://example.com/video');
        const updates = {
          title: 'Updated Title',
          retryCount: 2,
          metadata: { duration: 180 },
        };

        const updatedJob = await jobManager.updateJob(job.id, updates);

        assert.equal(updatedJob.title, updates.title);
        assert.equal(updatedJob.retryCount, updates.retryCount);
        assert.deepEqual(updatedJob.metadata, updates.metadata);

        // Verify changes persisted to file
        const retrievedJob = await jobManager.getJob(job.id);
        assert.equal(retrievedJob.title, updates.title);
        assert.equal(retrievedJob.retryCount, updates.retryCount);

        await cleanupTestDir();
      });

      test('should merge metadata correctly', async () => {
        await createTestDir();
        const baseDir = path.join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const job = await jobManager.createJob('https://example.com/video', {
          metadata: { duration: 120, quality: 'HD' },
        });

        await jobManager.updateJob(job.id, {
          metadata: { duration: 180, format: 'mp4' },
        });

        const updatedJob = await jobManager.getJob(job.id);
        assert.deepEqual(updatedJob.metadata, {
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
        const baseDir = path.join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        const job = await jobManager.createJob('https://example.com/video');
        const filePath = job.getFilePath(baseDir);

        // Verify file exists
        let fileExists = await fs
          .access(filePath)
          .then(() => true)
          .catch(() => false);
        assert.ok(fileExists, 'File should exist before deletion');

        // Delete job
        const result = await jobManager.deleteJob(job.id);
        assert.equal(result, true);

        // Verify file is gone
        fileExists = await fs
          .access(filePath)
          .then(() => true)
          .catch(() => false);
        assert.ok(!fileExists, 'File should be deleted');

        // Verify job is not retrievable
        const retrievedJob = await jobManager.getJob(job.id);
        assert.equal(retrievedJob, null);

        await cleanupTestDir();
      });

      test('should throw error for non-existent job', async () => {
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger });

        await assert.rejects(
          () => jobManager.deleteJob('non-existent'),
          /Job not found/
        );
      });
    });

    describe('job failure handling', () => {
      test('should retry failed job within limit', async () => {
        await createTestDir();
        const baseDir = path.join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir, maxRetries: 3 });

        const job = await jobManager.createJob('https://example.com/video');
        await jobManager.moveJob(job.id, JobState.ACTIVE);

        const error = new Error('Download failed');
        const retriedJob = await jobManager.handleJobFailure(job.id, error);

        assert.ok(retriedJob, 'Should return retried job');
        assert.equal(retriedJob.state, JobState.QUEUED);
        assert.equal(retriedJob.retryCount, 1);

        await cleanupTestDir();
      });

      test('should move job to failed directory after max retries', async () => {
        await createTestDir();
        const baseDir = path.join(TEST_DATA_DIR, 'job-manager-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir, maxRetries: 2 });

        const job = await jobManager.createJob('https://example.com/video', {
          retryCount: 2,
        });
        await jobManager.moveJob(job.id, JobState.ACTIVE);

        const error = new Error('Download failed');
        const result = await jobManager.handleJobFailure(job.id, error);

        assert.equal(
          result,
          null,
          'Should return null when max retries exceeded'
        );

        // Verify job is moved to failed directory
        const retrievedJob = await jobManager.getJob(job.id);
        assert.ok(retrievedJob, 'Job should exist in failed directory');
        assert.equal(retrievedJob.state, JobState.FAILED);
        assert.equal(retrievedJob.metadata.lastError, 'Download failed');
        assert.ok(
          retrievedJob.metadata.failedAt,
          'Should have failedAt timestamp'
        );

        await cleanupTestDir();
      });
    });

    describe('cleanup operations', () => {
      test('should cleanup interrupted jobs', async () => {
        await createTestDir();
        const baseDir = path.join(TEST_DATA_DIR, 'cleanup-test');
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
        assert.equal(jobs.length, 2);

        for (const job of jobs) {
          assert.equal(job.retryCount, 1);
        }

        await cleanupTestDir();
      });
    });

    describe('statistics', () => {
      test('should return correct job statistics', async () => {
        await createTestDir();
        const baseDir = path.join(TEST_DATA_DIR, 'stats-test');
        const logger = createMockLogger();
        const jobManager = new JobManager({ logger, baseDir });

        // Create jobs in different states
        await jobManager.createJob('https://example.com/stats1');
        const job2 = await jobManager.createJob('https://example.com/stats2');
        const job3 = await jobManager.createJob('https://example.com/stats3');

        await jobManager.moveJob(job2.id, JobState.ACTIVE);
        await jobManager.moveJob(job3.id, JobState.ACTIVE);

        const stats = await jobManager.getJobStats();

        assert.equal(stats.queued, 1);
        assert.equal(stats.active, 2);
        assert.equal(stats.total, 3);

        await cleanupTestDir();
      });
    });
  });

  describe('Integration tests', () => {
    test('should handle complete job lifecycle', async () => {
      await createTestDir();
      const baseDir = path.join(TEST_DATA_DIR, 'integration-test');
      const logger = createMockLogger();
      const jobManager = new JobManager({ logger, baseDir });

      const url = 'https://example.com/video';

      // Create job
      const job = await jobManager.createJob(url, { title: 'Test Video' });
      assert.equal(job.state, JobState.QUEUED);

      // Move to active
      await jobManager.moveJob(job.id, JobState.ACTIVE);
      let currentJob = await jobManager.getJob(job.id);
      assert.equal(currentJob.state, JobState.ACTIVE);

      // Update during processing
      await jobManager.updateJob(job.id, {
        title: 'Updated Video Title',
        metadata: { progress: 50 },
      });

      // Complete successfully - in real app, job would be deleted
      // For this test, just verify it's in active state
      currentJob = await jobManager.getJob(job.id);
      assert.equal(currentJob.state, JobState.ACTIVE);
      assert.equal(currentJob.title, 'Updated Video Title');

      // Verify final state
      const stats = await jobManager.getJobStats();
      assert.equal(stats.active, 1);
      assert.equal(stats.total, 1);

      await cleanupTestDir();
    });

    test('should handle job failure and retry workflow', async () => {
      await createTestDir();
      const baseDir = path.join(TEST_DATA_DIR, 'retry-workflow-test');
      const logger = createMockLogger();
      const jobManager = new JobManager({ logger, baseDir, maxRetries: 2 });

      const url = 'https://example.com/retry-workflow';

      // Create and start job
      const job = await jobManager.createJob(url);
      await jobManager.moveJob(job.id, JobState.ACTIVE);

      // First failure
      const retriedJob = await jobManager.handleJobFailure(
        job.id,
        new Error('Network error')
      );
      assert.equal(retriedJob.retryCount, 1);
      assert.equal(retriedJob.state, JobState.QUEUED);

      // Move to active again
      await jobManager.moveJob(job.id, JobState.ACTIVE);

      // Second failure (max retries reached)
      const finalResult = await jobManager.handleJobFailure(
        job.id,
        new Error('Persistent error')
      );
      assert.equal(finalResult, null);

      // Verify job is moved to failed directory
      const failedJob = await jobManager.getJob(job.id);
      assert.ok(failedJob, 'Job should exist in failed directory');
      assert.equal(failedJob.state, JobState.FAILED);
      assert.equal(failedJob.metadata.lastError, 'Persistent error');
      assert.ok(failedJob.metadata.failedAt, 'Should have failedAt timestamp');

      await cleanupTestDir();
    });

    test('should handle concurrent job operations', async () => {
      await createTestDir();
      const baseDir = path.join(TEST_DATA_DIR, 'concurrent-test');
      const logger = createMockLogger();
      const jobManager = new JobManager({ logger, baseDir });

      // Create multiple jobs concurrently
      const urls = [
        'https://example.com/video1',
        'https://example.com/video2',
        'https://example.com/video3',
      ];

      const jobs = await Promise.all(
        urls.map((url) => jobManager.createJob(url))
      );

      assert.equal(jobs.length, 3);

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

      assert.equal(activeJobs.length, 2);
      assert.equal(queuedJobs.length, 1);
      assert.equal(queuedJobs[0].title, 'Updated Title');

      await cleanupTestDir();
    });

    test('should handle async title enhancement workflow', async () => {
      await createTestDir();
      const baseDir = path.join(TEST_DATA_DIR, 'title-enhancement-test');
      const logger = createMockLogger();
      const jobManager = new JobManager({ logger, baseDir });

      const url = 'https://example.com/video';

      // Create job without title (simulating instant job creation)
      const job = await jobManager.createJob(url);
      assert.equal(job.title, null);
      assert.equal(job.state, JobState.QUEUED);

      // Simulate title enhancement service updating the job
      await jobManager.updateJob(job.id, { title: 'Enhanced Video Title' });

      // Verify title was updated
      const updatedJob = await jobManager.getJob(job.id);
      assert.equal(updatedJob.title, 'Enhanced Video Title');
      assert.equal(updatedJob.state, JobState.QUEUED);

      // Verify job can still be processed normally
      await jobManager.moveJob(job.id, JobState.ACTIVE);
      const activeJob = await jobManager.getJob(job.id);
      assert.equal(activeJob.state, JobState.ACTIVE);
      assert.equal(activeJob.title, 'Enhanced Video Title');

      await cleanupTestDir();
    });

    test('should handle race condition during title enhancement', async () => {
      await createTestDir();
      const baseDir = path.join(TEST_DATA_DIR, 'race-condition-test');
      const logger = createMockLogger();
      const jobManager = new JobManager({ logger, baseDir });

      const url = 'https://example.com/video';

      // Create job
      const job = await jobManager.createJob(url);
      assert.equal(job.title, null);

      // Simulate race condition: move job to active before title enhancement
      await jobManager.moveJob(job.id, JobState.ACTIVE);

      // Simulate title enhancement service trying to update active job
      // This should not fail but should still update the title
      await jobManager.updateJob(job.id, { title: 'Late Enhanced Title' });

      // Verify title was updated even though job became active
      const updatedJob = await jobManager.getJob(job.id);
      assert.equal(updatedJob.title, 'Late Enhanced Title');
      assert.equal(updatedJob.state, JobState.ACTIVE);

      await cleanupTestDir();
    });

    test('should handle multiple jobs with title enhancement', async () => {
      await createTestDir();
      const baseDir = path.join(TEST_DATA_DIR, 'multiple-enhancement-test');
      const logger = createMockLogger();
      const jobManager = new JobManager({ logger, baseDir });

      const urls = [
        'https://example.com/video1',
        'https://example.com/video2',
        'https://example.com/video3',
      ];

      // Create jobs without titles
      const jobs = await Promise.all(
        urls.map((url) => jobManager.createJob(url))
      );

      // Verify all jobs created without titles
      for (const job of jobs) {
        assert.equal(job.title, null);
        assert.equal(job.state, JobState.QUEUED);
      }

      // Simulate title enhancement for some jobs
      await Promise.all([
        jobManager.updateJob(jobs[0].id, { title: 'Enhanced Video 1' }),
        jobManager.updateJob(jobs[1].id, { title: 'Enhanced Video 2' }),
        // Leave jobs[2] without title enhancement
      ]);

      // Verify enhancement results
      const enhancedJobs = await jobManager.getQueuedJobs();
      assert.equal(enhancedJobs.length, 3);

      const job1 = enhancedJobs.find((j) => j.url === urls[0]);
      const job2 = enhancedJobs.find((j) => j.url === urls[1]);
      const job3 = enhancedJobs.find((j) => j.url === urls[2]);

      assert.equal(job1.title, 'Enhanced Video 1');
      assert.equal(job2.title, 'Enhanced Video 2');
      assert.equal(job3.title, null);

      await cleanupTestDir();
    });
  });
});
