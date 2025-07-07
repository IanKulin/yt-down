import { ValidationError, NotFoundError, ConflictError } from '../errors.js';
import { validateUrl } from '../validators.js';

/**
 * JobService handles all job-related business logic operations
 * Abstracts JobManager and QueueProcessor interactions from route handlers
 */
export class JobService {
  constructor({ jobManager, queueProcessor, logger }) {
    this.jobManager = jobManager;
    this.queueProcessor = queueProcessor;
    this.logger = logger;
  }

  /**
   * Get all jobs formatted for display in templates or API responses
   * @returns {Object} Object containing formatted job arrays
   */
  async getJobsForDisplay() {
    const [queuedJobs, activeJobs, finishedJobs] = await Promise.all([
      this.jobManager.getQueuedJobs(),
      this.jobManager.getActiveJobs(),
      this.jobManager.getFinishedJobs(),
    ]);

    return {
      queued: queuedJobs.map((job) => job.toApiFormat()),
      active: activeJobs.map((job) => job.toApiFormat()),
      finished: finishedJobs.map((job) => job.toApiFormat()),
    };
  }

  /**
   * Get job statistics and counts
   * @returns {Object} Job counts and processor status
   */
  async getJobStatistics() {
    const jobs = await this.getJobsForDisplay();

    return {
      counts: {
        queued: jobs.queued.length,
        active: jobs.active.length,
        finished: jobs.finished.length,
        total: jobs.queued.length + jobs.active.length + jobs.finished.length,
      },
      processor: this.queueProcessor.getStatus(),
    };
  }

  /**
   * Add a new job to the queue
   * @param {string} url - The URL to download
   * @returns {Object} Success result with message
   */
  async addJob(url) {
    // Validate URL
    const validatedUrl = validateUrl(url);

    try {
      // Create job using JobManager
      await this.jobManager.createJob(validatedUrl);

      this.logger?.info(`Job added to queue: ${validatedUrl}`);

      return {
        success: true,
        message: 'Download job added to queue successfully',
        type: 'success',
      };
    } catch (error) {
      if (error.message === 'Job already exists') {
        throw new ConflictError('Download job already exists in queue');
      }
      throw error;
    }
  }

  /**
   * Remove a job from the queue (with smart cancellation for active jobs)
   * @param {string} jobHash - The job hash to remove
   * @returns {Object} Success result with appropriate message
   */
  async removeJob(jobHash) {
    if (!jobHash || !jobHash.trim()) {
      throw new ValidationError('Invalid hash provided');
    }

    const trimmedHash = jobHash.trim();

    try {
      // First, check if the job exists and get its current state
      const job = await this.jobManager.getJob(trimmedHash);
      if (!job) {
        throw new NotFoundError('Download job not found in queue');
      }

      // If the job is active, cancel the download process (which also deletes the job)
      if (job.state === 'active') {
        try {
          await this.queueProcessor.cancelDownload(trimmedHash);

          this.logger?.info(`Active download cancelled: ${trimmedHash}`);

          return {
            success: true,
            message: 'Download cancelled successfully',
            type: 'success',
          };
        } catch (cancelError) {
          this.logger?.error(
            `Failed to cancel download for ${trimmedHash}:`,
            cancelError
          );

          // If cancellation fails, still try to delete the job
          await this.jobManager.deleteJob(trimmedHash);

          return {
            success: true,
            message:
              'Download job deleted (cancellation failed, but job removed)',
            type: 'warning',
          };
        }
      } else {
        // Job is not active, just delete it normally
        await this.jobManager.deleteJob(trimmedHash);

        this.logger?.info(`Job deleted from queue: ${trimmedHash}`);

        return {
          success: true,
          message: 'Download job deleted from queue successfully',
          type: 'success',
        };
      }
    } catch (error) {
      if (error.message.includes('Job not found')) {
        throw new NotFoundError('Download job not found in queue');
      }
      throw error;
    }
  }

  /**
   * Get a specific job by its hash
   * @param {string} jobHash - The job hash to retrieve
   * @returns {Object|null} The job object or null if not found
   */
  async getJob(jobHash) {
    return await this.jobManager.getJob(jobHash);
  }

  /**
   * Get jobs by state
   * @param {string} state - The job state to filter by
   * @returns {Array} Array of jobs in the specified state
   */
  async getJobsByState(state) {
    const jobs = await this.jobManager.getJobsByState(state);
    return jobs.map((job) => job.toApiFormat());
  }

  /**
   * Get the current queue processor status
   * @returns {Object} Processor status information
   */
  getProcessorStatus() {
    return this.queueProcessor.getStatus();
  }
}
