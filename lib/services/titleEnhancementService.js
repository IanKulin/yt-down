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
    this.maxConcurrent = 2;
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
      this.maxConcurrent = this.settings.titleEnhancement.maxConcurrent;
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

  async processEnhancementQueue() {
    if (!this.isRunning) return;

    try {
      const queuedJobs = await this.jobManager.getQueuedJobs();
      const jobsNeedingTitles = queuedJobs.filter(
        (job) => !job.title && !this.processingQueue.has(job.id)
      );

      const jobsToProcess = jobsNeedingTitles.slice(
        0,
        this.maxConcurrent - this.processingQueue.size
      );

      for (const job of jobsToProcess) {
        this.enhanceJobTitle(job).catch((error) => {
          this.logger?.error(`Error enhancing title for job ${job.id}:`, error);
        });
      }
    } catch (error) {
      this.logger?.error('Error processing enhancement queue:', error);
    }
  }

  async enhanceJobTitle(job) {
    if (this.processingQueue.has(job.id)) {
      return;
    }

    this.processingQueue.add(job.id);
    this.logger?.info(`Enhancing title for job: ${job.url}`);

    try {
      const currentJob = await this.jobManager.getJob(job.id);
      if (!currentJob || currentJob.state !== JobState.QUEUED) {
        this.logger?.info(
          `Job ${job.id} no longer queued, skipping title enhancement`
        );
        return;
      }

      const title = await this.extractVideoTitle(
        job.url,
        this.settings.titleEnhancement.timeout
      );

      if (title) {
        const jobBeforeUpdate = await this.jobManager.getJob(job.id);
        if (jobBeforeUpdate && jobBeforeUpdate.state === JobState.QUEUED) {
          await this.jobManager.updateJob(job.id, { title });

          if (this.broadcastChange) {
            this.broadcastChange();
          }

          this.logger?.info(`Enhanced job ${job.id} with title: ${title}`);
        } else {
          this.logger?.info(
            `Job ${job.id} state changed during title extraction, skipping update`
          );
        }
      } else {
        this.logger?.warn(`Failed to extract title for job: ${job.url}`);
      }
    } catch (error) {
      this.logger?.error(`Title enhancement failed for job ${job.id}:`, error);
    } finally {
      this.processingQueue.delete(job.id);
    }
  }

  async extractVideoTitle(url, timeout = 15000) {
    return new Promise((resolve) => {
      const ytDlp = spawn('yt-dlp', ['--print', '%(title)s', url], {
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
            resolve(stdout.trim());
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

  getStatus() {
    return {
      isRunning: this.isRunning,
      processingQueue: this.processingQueue.size,
      maxConcurrent: this.maxConcurrent,
      pollInterval: this.pollInterval,
    };
  }
}
