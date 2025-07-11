import { spawn } from 'child_process';
import { JobState } from '../jobs.js';
import { loadSettings } from '../settings.js';

export class TitleEnhancementService {
  constructor({ jobManager, logger, broadcastChange }) {
    this.jobManager = jobManager;
    this.logger = logger;
    this.broadcastChange = broadcastChange;

    this.isRunning = false;
    this.processingQueue = new Set();
    this.pollInterval = 2000;
    this.maxTitleChecks = 2; // maximum concurrent title checks
    this.intervalId = null;
    this.settings = null;
  }

  async start() {
    if (this.isRunning) {
      this.logger?.warn('Title enhancement service already running');
      return;
    }

    // Load settings to check if service is enabled
    try {
      this.settings = await loadSettings();

      if (!this.settings.titleEnhancement.enabled) {
        this.logger?.info('Title enhancement service is disabled in settings');
        return;
      }

      // Apply settings
      this.maxTitleChecks = this.settings.titleEnhancement.maxTitleChecks;
      this.pollInterval = this.settings.titleEnhancement.pollInterval;
    } catch (error) {
      this.logger?.error(
        'Error loading settings for title enhancement service:',
        error
      );
      return;
    }

    this.logger?.info('Starting title enhancement service');
    this.isRunning = true;

    this.intervalId = setInterval(() => {
      this.processEnhancementQueue().catch((error) => {
        this.logger?.error('Error in title enhancement processing:', error);
      });
    }, this.pollInterval);

    this.processEnhancementQueue().catch((error) => {
      this.logger?.error(
        'Error in initial title enhancement processing:',
        error
      );
    });
  }

  stop() {
    this.logger?.info('Stopping title enhancement service');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async getJobsNeedingEnhancement() {
    const queuedJobs = await this.jobManager.getQueuedJobs();
    const activeJobs = await this.jobManager.getActiveJobs();

    const queuedNeedingTitles = queuedJobs.filter(
      (job) => !job.title && !this.processingQueue.has(job.id)
    );
    const activeNeedingFilesize = activeJobs.filter(
      (job) => !job.metadata?.filesize && !this.processingQueue.has(job.id)
    );

    return [...queuedNeedingTitles, ...activeNeedingFilesize];
  }

  async processEnhancementQueue() {
    if (!this.isRunning) return;

    try {
      const jobsNeedingEnhancement = await this.getJobsNeedingEnhancement();
      const jobsToProcess = jobsNeedingEnhancement.slice(
        0,
        this.maxTitleChecks - this.processingQueue.size
      );

      for (const job of jobsToProcess) {
        this.enhanceJobMetadata(job).catch((error) => {
          this.logger?.error(
            `Error enhancing metadata for job ${job.id}:`,
            error
          );
        });
      }
    } catch (error) {
      this.logger?.error('Error processing enhancement queue:', error);
    }
  }

  async enhanceJobMetadata(job) {
    if (this.processingQueue.has(job.id)) {
      return;
    }

    this.processingQueue.add(job.id);
    this.logger?.info(`Enhancing metadata for job: ${job.url}`);

    try {
      const currentJob = await this.jobManager.getJob(job.id);
      if (
        !currentJob ||
        (currentJob.state !== JobState.QUEUED &&
          currentJob.state !== JobState.ACTIVE)
      ) {
        this.logger?.info(
          `Job ${job.id} no longer in valid state, skipping metadata enhancement`
        );
        return;
      }

      const metadata = await this.extractVideoMetadata(
        job.url,
        this.settings.titleEnhancement.timeout
      );

      if (metadata) {
        const jobBeforeUpdate = await this.jobManager.getJob(job.id);
        if (
          jobBeforeUpdate &&
          (jobBeforeUpdate.state === JobState.QUEUED ||
            jobBeforeUpdate.state === JobState.ACTIVE)
        ) {
          const updateData = { metadata };

          // Only update title for queued jobs
          if (jobBeforeUpdate.state === JobState.QUEUED && metadata.title) {
            updateData.title = metadata.title;
          }

          // For active jobs, only update filesize if not already present
          if (
            jobBeforeUpdate.state === JobState.ACTIVE &&
            !jobBeforeUpdate.metadata?.filesize
          ) {
            updateData.metadata = {
              ...jobBeforeUpdate.metadata,
              filesize: metadata.filesize,
            };
          }

          await this.jobManager.updateJob(job.id, updateData);

          if (this.broadcastChange) {
            this.broadcastChange();
          }

          this.logger?.info(
            `Enhanced job ${job.id} with metadata: ${metadata.title || 'filesize update'}`
          );
        } else {
          this.logger?.info(
            `Job ${job.id} state changed during metadata extraction, skipping update`
          );
        }
      } else {
        this.logger?.warn(`Failed to extract metadata for job: ${job.url}`);
      }
    } catch (error) {
      this.logger?.error(
        `Metadata enhancement failed for job ${job.id}:`,
        error
      );
    } finally {
      this.processingQueue.delete(job.id);
    }
  }

  async extractVideoMetadata(url, timeout = 15000) {
    return new Promise((resolve) => {
      const ytDlp = spawn('yt-dlp', ['--dump-json', '--no-download', url], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let resolved = false;

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          ytDlp.kill('SIGTERM');
          resolve(null);
        }
      }, timeout);

      ytDlp.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ytDlp.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);

          if (code === 0 && stdout.trim()) {
            try {
              const jsonData = JSON.parse(stdout.trim());

              // Priority order for file size following yt-dlp patterns
              let filesize =
                jsonData.filesize_approx ||
                jsonData.filesize ||
                jsonData.requested_formats?.[0]?.filesize ||
                null;

              // If no explicit size, estimate from bitrate + duration
              let filesizeEstimated = false;
              if (!filesize && jsonData.tbr && jsonData.duration) {
                filesize = Math.round(
                  (jsonData.tbr * jsonData.duration * 1024) / 8
                );
                filesizeEstimated = true;
              }

              const metadata = {
                title: jsonData.title,
                filesize: filesize,
                filesize_estimated: filesizeEstimated,
                duration: jsonData.duration,
                uploader: jsonData.uploader,
                upload_date: jsonData.upload_date,
                view_count: jsonData.view_count,
                like_count: jsonData.like_count,
                description: jsonData.description,
                thumbnail: jsonData.thumbnail,
              };
              resolve(metadata);
            } catch {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        }
      });

      ytDlp.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          resolve(null);
        }
      });
    });
  }

  async enhanceJobTitle(job) {
    return this.enhanceJobMetadata(job);
  }

  async extractVideoTitle(url, timeout = 15000) {
    const metadata = await this.extractVideoMetadata(url, timeout);
    return metadata?.title || null;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      processingQueue: this.processingQueue.size,
      maxTitleChecks: this.maxTitleChecks,
      pollInterval: this.pollInterval,
    };
  }
}
