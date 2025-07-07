import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Job States
export const JobState = {
  QUEUED: 'queued',
  ACTIVE: 'active',
  FINISHED: 'finished',
  FAILED: 'failed',
};

// Default base directory
const DEFAULT_BASE_DIR = path.join(__dirname, '..');

/**
 * Represents a download job with state management and validation
 */
export class Job {
  constructor(data) {
    this.id = data.id || this.generateId(data.url);
    this.url = data.url;
    this.title = data.title || null;
    this.retryCount = data.retryCount || 0;
    this.timestamp = data.timestamp || new Date().toISOString();
    this.sortOrder = data.sortOrder || Date.now();
    this.state = data.state || JobState.QUEUED;
    this.metadata = data.metadata || {};
  }

  /**
   * Generate a unique ID for the job based on URL
   */
  generateId(url) {
    if (!url || typeof url !== 'string') {
      return crypto.createHash('sha256').update('').digest('hex');
    }
    return crypto.createHash('sha256').update(url.trim()).digest('hex');
  }

  /**
   * Get the filename for this job
   */
  getFilename() {
    return `${this.id}.json`;
  }

  /**
   * Get the file path for this job based on its state and base directory
   */
  getFilePath(baseDir = DEFAULT_BASE_DIR) {
    const directory = path.join(baseDir, 'data', 'jobs', this.state);
    return path.join(directory, this.getFilename());
  }

  /**
   * Convert job to JSON serializable format
   */
  toJSON() {
    return {
      url: this.url,
      title: this.title,
      retryCount: this.retryCount,
      timestamp: this.timestamp,
      sortOrder: this.sortOrder,
      metadata: this.metadata,
    };
  }

  /**
   * Create a job from JSON data
   */
  static fromJSON(data, id, state = JobState.QUEUED) {
    return new Job({
      id,
      url: data.url,
      title: data.title,
      retryCount: data.retryCount,
      timestamp: data.timestamp,
      sortOrder: data.sortOrder,
      state,
      metadata: data.metadata,
    });
  }

  /**
   * Validate job data
   */
  validate() {
    if (!this.url || typeof this.url !== 'string' || !this.url.trim()) {
      throw new Error('Job URL is required and must be a non-empty string');
    }

    if (!Object.values(JobState).includes(this.state)) {
      throw new Error(`Invalid job state: ${this.state}`);
    }

    if (this.retryCount < 0) {
      throw new Error('Retry count cannot be negative');
    }

    return true;
  }

  /**
   * Increment retry count
   */
  incrementRetryCount() {
    this.retryCount++;
    return this;
  }

  /**
   * Update job title
   */
  updateTitle(title) {
    this.title = title;
    return this;
  }

  /**
   * Set job state
   */
  setState(state) {
    if (!Object.values(JobState).includes(state)) {
      throw new Error(`Invalid job state: ${state}`);
    }
    this.state = state;
    return this;
  }

  /**
   * Clone the job with a new state
   */
  clone(newState) {
    return new Job({
      id: this.id,
      url: this.url,
      title: this.title,
      retryCount: this.retryCount,
      timestamp: this.timestamp,
      sortOrder: this.sortOrder,
      state: newState,
      metadata: { ...this.metadata },
    });
  }
}

/**
 * Manages job operations and state transitions
 */
export class JobManager {
  constructor(options = {}) {
    this.logger = options.logger;
    this.maxRetries = options.maxRetries || 3;
    this.baseDir = options.baseDir || DEFAULT_BASE_DIR;

    // Calculate job directories based on baseDir
    this.jobDirectories = {
      [JobState.QUEUED]: path.join(this.baseDir, 'data', 'jobs', 'queued'),
      [JobState.ACTIVE]: path.join(this.baseDir, 'data', 'jobs', 'active'),
      [JobState.FINISHED]: path.join(this.baseDir, 'data', 'jobs', 'finished'),
    };
  }

  /**
   * Ensure directory exists
   */
  async ensureDirectoryExists(dir) {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Write job file atomically
   */
  async writeJobFile(filePath, job) {
    // Validate job before writing
    job.validate();

    // Use atomic write: write to temp file then rename
    const tempFilePath = `${filePath}.tmp`;
    await fs.writeFile(tempFilePath, JSON.stringify(job.toJSON(), null, 2));
    await fs.rename(tempFilePath, filePath);
  }

  /**
   * Read job file
   */
  async readJobFile(filePath) {
    const data = await fs.readFile(filePath, 'utf-8');
    const jobData = JSON.parse(data);
    const filename = path.basename(filePath, '.json');
    const directory = path.dirname(filePath);

    // Determine state from directory
    let state = JobState.QUEUED;
    for (const [stateKey, dirPath] of Object.entries(this.jobDirectories)) {
      if (directory === dirPath) {
        state = stateKey;
        break;
      }
    }

    return Job.fromJSON(jobData, filename, state);
  }

  /**
   * Create a new job
   */
  async createJob(url, options = {}) {
    const job = new Job({
      url: url.trim(),
      title: options.title || null,
      retryCount: options.retryCount || 0,
      timestamp: options.timestamp || new Date().toISOString(),
      sortOrder: options.sortOrder || Date.now(),
      state: JobState.QUEUED,
      metadata: options.metadata || {},
    });

    // Check if job already exists
    const existingJob = await this.getJob(job.id);
    if (existingJob) {
      throw new Error('Job already exists');
    }

    // Write job file
    const directory = this.jobDirectories[JobState.QUEUED];
    await this.ensureDirectoryExists(directory);
    await this.writeJobFile(job.getFilePath(this.baseDir), job);

    this.logger?.info(`Created job: ${url} (id: ${job.id})`);
    return job;
  }

  /**
   * Get a job by ID
   */
  async getJob(jobId) {
    // Check all directories for the job
    for (const state of Object.values(JobState)) {
      const directory = this.jobDirectories[state];
      if (!directory) continue;

      const filePath = path.join(directory, `${jobId}.json`);
      try {
        await fs.access(filePath);
        return await this.readJobFile(filePath);
      } catch {
        // File doesn't exist in this directory, continue
      }
    }

    return null;
  }

  /**
   * Get all jobs in a specific state
   */
  async getJobsByState(state) {
    if (!Object.values(JobState).includes(state)) {
      throw new Error(`Invalid job state: ${state}`);
    }

    const directory = this.jobDirectories[state];
    const jobs = [];

    try {
      await this.ensureDirectoryExists(directory);
      const files = await fs.readdir(directory);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(directory, file);
          try {
            const job = await this.readJobFile(filePath);
            jobs.push(job);
          } catch (parseError) {
            this.logger?.error(`Error parsing job file ${file}:`, parseError);
            // Skip malformed files
          }
        }
      }

      // Sort by sortOrder, then by timestamp
      return jobs.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        if (a.timestamp && b.timestamp) {
          return new Date(a.timestamp) - new Date(b.timestamp);
        }
        return 0;
      });
    } catch (error) {
      this.logger?.error(`Error reading ${state} jobs:`, error);
      return [];
    }
  }

  /**
   * Get queued jobs
   */
  async getQueuedJobs() {
    return await this.getJobsByState(JobState.QUEUED);
  }

  /**
   * Get active jobs
   */
  async getActiveJobs() {
    return await this.getJobsByState(JobState.ACTIVE);
  }

  /**
   * Get finished jobs
   */
  async getFinishedJobs() {
    return await this.getJobsByState(JobState.FINISHED);
  }

  /**
   * Move job to a different state
   */
  async moveJob(jobId, newState) {
    if (!Object.values(JobState).includes(newState)) {
      throw new Error(`Invalid job state: ${newState}`);
    }

    const currentJob = await this.getJob(jobId);
    if (!currentJob) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // Don't move if already in the target state
    if (currentJob.state === newState) {
      return currentJob;
    }

    // Create new job with updated state
    const newJob = currentJob.clone(newState);

    // Write to new location
    const newDirectory = this.jobDirectories[newState];
    await this.ensureDirectoryExists(newDirectory);
    await this.writeJobFile(newJob.getFilePath(this.baseDir), newJob);

    // Remove from old location
    try {
      await fs.unlink(currentJob.getFilePath(this.baseDir));
    } catch (error) {
      this.logger?.warn(`Failed to remove old job file: ${error.message}`);
    }

    this.logger?.info(
      `Moved job ${jobId} from ${currentJob.state} to ${newState}`
    );
    return newJob;
  }

  /**
   * Update job properties
   */
  async updateJob(jobId, updates) {
    const currentJob = await this.getJob(jobId);
    if (!currentJob) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // Apply updates
    if (updates.title !== undefined) {
      currentJob.updateTitle(updates.title);
    }
    if (updates.retryCount !== undefined) {
      currentJob.retryCount = updates.retryCount;
    }
    if (updates.metadata !== undefined) {
      currentJob.metadata = { ...currentJob.metadata, ...updates.metadata };
    }

    // Write updated job
    await this.writeJobFile(currentJob.getFilePath(this.baseDir), currentJob);

    this.logger?.info(`Updated job ${jobId}`);
    return currentJob;
  }

  /**
   * Delete job
   */
  async deleteJob(jobId) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    await fs.unlink(job.getFilePath(this.baseDir));
    this.logger?.info(`Deleted job ${jobId}: ${job.url}`);
    return true;
  }

  /**
   * Handle job failure with retry logic
   */
  async handleJobFailure(jobId, _error) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    job.incrementRetryCount();

    if (job.retryCount >= this.maxRetries) {
      this.logger?.warning(
        `Max retries (${this.maxRetries}) reached for job ${jobId}, removing from queue`
      );
      await this.deleteJob(jobId);
      return null;
    }

    // Update job with incremented retry count, then move back to queued
    await this.updateJob(jobId, { retryCount: job.retryCount });
    const retriedJob = await this.moveJob(jobId, JobState.QUEUED);

    this.logger?.info(
      `Moved failed job ${jobId} back to queue (retry ${job.retryCount}/${this.maxRetries})`
    );

    return retriedJob;
  }

  /**
   * Clean up interrupted jobs (move active jobs back to queued)
   */
  async cleanupInterruptedJobs() {
    try {
      const activeJobs = await this.getActiveJobs();

      for (const job of activeJobs) {
        await this.handleJobFailure(job.id, new Error('Job interrupted'));
      }

      this.logger?.info(`Cleaned up ${activeJobs.length} interrupted jobs`);
    } catch (error) {
      this.logger?.error('Error cleaning up interrupted jobs:', error);
    }
  }

  /**
   * Get job statistics
   */
  async getJobStats() {
    const [queued, active, finished] = await Promise.all([
      this.getQueuedJobs(),
      this.getActiveJobs(),
      this.getFinishedJobs(),
    ]);

    return {
      queued: queued.length,
      active: active.length,
      finished: finished.length,
      total: queued.length + active.length + finished.length,
    };
  }
}

// Export singleton instance for backward compatibility
export const jobManager = new JobManager();
