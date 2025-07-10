import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { setImmediate } from 'timers';
import { getYtDlpArgs } from './settings.js';
import { fileURLToPath } from 'url';
import { JobManager, JobState } from './jobs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class QueueProcessor {
  constructor(options = {}) {
    this.logger = options.logger;
    this.baseDir = options.baseDir || path.join(__dirname, '..');

    // Create JobManager instance
    this.jobManager = new JobManager({
      logger: this.logger,
      baseDir: this.baseDir,
      maxRetries: options.maxRetries || 3,
    });

    this.downloadsActiveDir = path.join(this.baseDir, 'data', 'partials');
    this.downloadsFinishedDir = path.join(this.baseDir, 'downloads');

    this.pollInterval = options.pollInterval || 5000; // 5 seconds
    this.maxConcurrent = options.maxConcurrent || 1;
    this.activeDownloads = new Map();
    this.downloadProgress = new Map(); // Track progress for each download
    this.activeProcesses = new Map(); // Track child processes for cancellation
    this.isProcessing = false;
    this.intervalId = null;
    this.broadcastChange = null; // WebSocket broadcast function
    this.lastProgressBroadcast = new Map(); // Track last broadcast time per job
    this.cancelledJobs = new Set(); // Track cancelled job IDs

    // Constants
    this.CLEANUP_CUTOFF_MINUTES = 5;
    this.PROGRESS_BROADCAST_THROTTLE = 1000; // Throttle progress broadcasts to once per second
  }

  setBroadcastChange(broadcastChange) {
    this.broadcastChange = broadcastChange;
  }

  async start() {
    if (this.isProcessing) {
      this.logger?.warn('Queue processor already running');
      return;
    }

    this.logger?.info('Starting queue processor');
    this.isProcessing = true;

    await this.ensureDirectoryExists(this.downloadsActiveDir);
    await this.ensureDirectoryExists(this.downloadsFinishedDir);

    // Start the polling loop
    this.intervalId = setInterval(() => {
      this.processQueue().catch((error) => {
        this.logger?.error('Error in queue processing:', error);
      });
    }, this.pollInterval);

    // Process immediately on start
    this.processQueue().catch((error) => {
      this.logger?.error('Error in initial queue processing:', error);
    });
  }

  async stop() {
    this.logger?.info('Stopping queue processor');
    this.isProcessing = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Wait for active downloads to complete
    const activeProcesses = Array.from(this.activeDownloads.values());
    if (activeProcesses.length > 0) {
      this.logger?.info(
        `Waiting for ${activeProcesses.length} active downloads to complete`
      );
      await Promise.allSettled(activeProcesses);
    }
  }

  async ensureDirectoryExists(dir) {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Parse yt-dlp progress output and update download progress
   * @param {string} line - Output line from yt-dlp
   * @param {string} hash - Job hash for tracking
   */
  parseProgressLine(line, hash) {
    // Parse yt-dlp progress output
    // Examples:
    // [download]   0.0% of 123.45MB at 456.78KiB/s ETA 12:34
    // [download]  12.3% of 123.45MB at 456.78KiB/s ETA 10:21
    // [download] 100.0% of 123.45MB at 456.78KiB/s ETA 00:00
    // [download]  10.5% of ~   4.77MiB at  148.53KiB/s ETA 00:15 (frag 2/38)
    // [download] Destination: video_title.mp4
    // [info] video_title: Downloading 1 format(s): 22

    // Handle fragment-based progress (with ~)
    const fragmentProgressMatch = line.match(
      /\[download\]\s+(\d+\.\d+)%\s+of\s+~\s+(\S+)\s+at\s+(\S+)\s+ETA\s+(\S+)\s+\(frag\s+\d+\/\d+\)/
    );
    if (fragmentProgressMatch) {
      const [, percentage, fileSize, speed, eta] = fragmentProgressMatch;

      const progress = this.downloadProgress.get(hash) || {};
      progress.percentage = parseFloat(percentage);
      progress.fileSize = fileSize;
      progress.speed = speed;
      progress.eta = eta;

      this.downloadProgress.set(hash, progress);

      // Throttle progress broadcasts to avoid spamming
      const now = Date.now();
      const lastBroadcast = this.lastProgressBroadcast.get(hash) || 0;
      if (
        this.broadcastChange &&
        now - lastBroadcast > this.PROGRESS_BROADCAST_THROTTLE
      ) {
        this.logger?.debug(
          `Broadcasting progress update for ${hash}: ${progress.percentage || 'unknown'}%`
        );
        this.broadcastChange();
        this.lastProgressBroadcast.set(hash, now);
      }
      return;
    }

    // Handle regular progress (without fragments)
    const progressMatch = line.match(
      /\[download\]\s+(\d+\.\d+)%\s+of\s+(\S+)\s+at\s+(\S+)\s+ETA\s+(\S+)/
    );
    if (progressMatch) {
      const [, percentage, fileSize, speed, eta] = progressMatch;

      const progress = this.downloadProgress.get(hash) || {};
      progress.percentage = parseFloat(percentage);
      progress.fileSize = fileSize;
      progress.speed = speed;
      progress.eta = eta;

      this.downloadProgress.set(hash, progress);

      // Throttle progress broadcasts to avoid spamming
      const now = Date.now();
      const lastBroadcast = this.lastProgressBroadcast.get(hash) || 0;
      if (
        this.broadcastChange &&
        now - lastBroadcast > this.PROGRESS_BROADCAST_THROTTLE
      ) {
        this.logger?.debug(
          `Broadcasting progress update for ${hash}: ${progress.percentage || 'unknown'}%`
        );
        this.broadcastChange();
        this.lastProgressBroadcast.set(hash, now);
      }
      return;
    }

    // Extract filename from destination line
    const destinationMatch = line.match(/\[download\]\s+Destination:\s+(.+)/);
    if (destinationMatch) {
      const filename = destinationMatch[1];
      const progress = this.downloadProgress.get(hash) || {};
      const hadFilename = !!progress.filename;
      progress.filename = filename;
      this.downloadProgress.set(hash, progress);

      // Broadcast immediately when filename is first detected (important for UI)
      // or throttle subsequent updates
      const now = Date.now();
      const lastBroadcast = this.lastProgressBroadcast.get(hash) || 0;
      if (
        this.broadcastChange &&
        (!hadFilename || now - lastBroadcast > this.PROGRESS_BROADCAST_THROTTLE)
      ) {
        this.logger?.debug(
          `Broadcasting filename update for ${hash}: ${filename}`
        );
        this.broadcastChange();
        this.lastProgressBroadcast.set(hash, now);
      }
      return;
    }

    // Extract filename from info line
    const infoMatch = line.match(/\[info\]\s+(.+?):\s+Downloading/);
    if (infoMatch) {
      const title = infoMatch[1];
      const progress = this.downloadProgress.get(hash) || {};
      const hadFilename = !!progress.filename;
      if (!progress.filename) {
        progress.filename = title;
      }
      this.downloadProgress.set(hash, progress);

      // Broadcast immediately when filename is first detected (important for UI)
      // or throttle subsequent updates
      const now = Date.now();
      const lastBroadcast = this.lastProgressBroadcast.get(hash) || 0;
      if (
        this.broadcastChange &&
        (!hadFilename || now - lastBroadcast > this.PROGRESS_BROADCAST_THROTTLE)
      ) {
        this.logger?.debug(`Broadcasting title update for ${hash}: ${title}`);
        this.broadcastChange();
        this.lastProgressBroadcast.set(hash, now);
      }
      return;
    }
  }

  async processQueue() {
    if (!this.isProcessing) return;

    try {
      // Check if we can start new downloads
      if (this.activeDownloads.size >= this.maxConcurrent) {
        return;
      }

      // Read queued jobs
      const queuedJobs = await this.getQueuedJobs();

      for (const job of queuedJobs) {
        if (this.activeDownloads.size >= this.maxConcurrent) {
          break;
        }

        await this.startDownload(job);
      }
    } catch (error) {
      this.logger?.error('Error processing queue:', error);
    }
  }

  async getQueuedJobs() {
    try {
      const jobs = await this.jobManager.getQueuedJobs();
      // Convert Job objects to the format expected by the processor
      return jobs.map((job) => job.toApiFormat({ includeFilePath: true }));
    } catch (error) {
      this.logger?.error('Error reading queued jobs:', error);
      return [];
    }
  }

  async startDownload(job) {
    const { hash, url, title, retryCount, timestamp, sortOrder } = job;

    try {
      // Move job to active state using JobManager
      await this.jobManager.moveJob(hash, JobState.ACTIVE);

      // Broadcast state change
      if (this.broadcastChange) {
        this.broadcastChange();
      }

      this.logger?.info(
        `Started download: ${url} (hash: ${hash}, retry: ${retryCount})`
      );

      // Start the download process
      const downloadPromise = this.downloadVideo(hash, url, {
        title,
        retryCount,
        timestamp,
        sortOrder,
      });
      this.activeDownloads.set(hash, downloadPromise);

      // Handle completion
      downloadPromise
        .then(async () => {
          await this.completeDownload(hash, url, {
            title,
            retryCount,
            timestamp,
            sortOrder,
          });
        })
        .catch(async (error) => {
          await this.handleDownloadError(hash, url, error, {
            title,
            retryCount,
            timestamp,
            sortOrder,
          });
        })
        .finally(() => {
          this.activeDownloads.delete(hash);
          this.downloadProgress.delete(hash); // Clean up progress data
          this.activeProcesses.delete(hash); // Clean up process reference
          this.lastProgressBroadcast.delete(hash); // Clean up broadcast tracking
          this.cancelledJobs.delete(hash); // Clean up cancellation flag
        });
    } catch (error) {
      this.logger?.error(`Error starting download for ${url}:`, error);
    }
  }

  /**
   * Process yt-dlp stdout data and extract progress information
   * @param {string} chunk - Raw data chunk from stdout
   * @param {string} hash - Job hash for tracking
   * @param {object} bufferState - Object containing stdoutBuffer state
   */
  processYtDlpOutput(chunk, hash, bufferState) {
    bufferState.stdoutBuffer += chunk;

    // Process complete lines for progress parsing
    const lines = bufferState.stdoutBuffer.split('\n');
    bufferState.stdoutBuffer = lines.pop() || ''; // Keep incomplete line in buffer

    lines.forEach((line) => {
      if (line.trim()) {
        // Use setImmediate to ensure progress updates are processed immediately
        setImmediate(() => {
          this.parseProgressLine(line.trim(), hash);
        });
      }
    });
  }

  async downloadVideo(hash, url, _metadata = {}) {
    return new Promise(async (resolve, reject) => {
      let args;
      try {
        args = await getYtDlpArgs(url);
      } catch (error) {
        this.logger?.error(`Error getting yt-dlp args for ${url}:`, error);
        return reject(error);
      }

      const ytDlp = spawn('yt-dlp', args, {
        cwd: this.downloadsActiveDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Store process reference for cancellation
      this.activeProcesses.set(hash, ytDlp);

      let stdout = '';
      let stderr = '';
      const bufferState = { stdoutBuffer: '' };

      ytDlp.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        this.processYtDlpOutput(chunk, hash, bufferState);
      });

      ytDlp.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ytDlp.on('close', (code) => {
        if (code === 0) {
          this.logger?.info(`Download completed successfully: ${url}`);
          resolve({ stdout, stderr });
        } else {
          const error = new Error(`yt-dlp exited with code ${code}`);
          error.stdout = stdout;
          error.stderr = stderr;
          error.exitCode = code;
          reject(error);
        }
      });

      ytDlp.on('error', (error) => {
        this.logger?.error(`Failed to spawn yt-dlp for ${url}:`, error);
        reject(error);
      });
    });
  }

  async completeDownload(hash, url, _metadata = {}) {
    try {
      // Clean up cancellation flag on successful completion
      this.cancelledJobs.delete(hash);

      // Update job title if extracted during download
      const progress = this.downloadProgress.get(hash);
      if (progress?.filename) {
        await this.jobManager.updateJob(hash, { title: progress.filename });
      }

      // Delete job using JobManager (no longer keep finished jobs)
      await this.jobManager.deleteJob(hash);

      // Move downloaded files from active to finished directory
      await this.moveDownloadedFiles(hash);

      // Broadcast state change
      if (this.broadcastChange) {
        this.broadcastChange();
      }

      this.logger?.info(`Download completed: ${url} (hash: ${hash})`);

      // Add completion notification
      await this.addCompletionNotification(url, hash);
    } catch (error) {
      this.logger?.error(`Error completing download for ${url}:`, error);
    }
  }

  async moveDownloadedFiles(_hash) {
    try {
      const activeFiles = await fs.readdir(this.downloadsActiveDir);

      for (const file of activeFiles) {
        // Skip system files
        if (file === '.DS_Store') continue;

        // For now, move all files. In the future, we could be more selective
        // by matching against the expected filename from progress data
        const sourceFile = path.join(this.downloadsActiveDir, file);
        const targetFile = path.join(this.downloadsFinishedDir, file);

        try {
          await fs.rename(sourceFile, targetFile);
        } catch (error) {
          this.logger?.warn(`Failed to move file ${file}:`, error);
        }
      }
    } catch (error) {
      this.logger?.error('Error moving downloaded files:', error);
    }
  }

  async addCompletionNotification(url, hash) {
    try {
      const notificationsFile = path.join(
        this.baseDir,
        'data',
        'notifications.json'
      );
      await this.ensureDirectoryExists(path.dirname(notificationsFile));

      let notifications = [];
      try {
        const data = await fs.readFile(notificationsFile, 'utf-8');
        notifications = JSON.parse(data);
      } catch {
        // File doesn't exist or is invalid, start with empty array
      }

      // Get the filename from progress data if available
      const progress = this.downloadProgress.get(hash);
      const filename = progress?.filename || 'Download';

      notifications.push({
        type: 'download_complete',
        message: `Download completed: ${filename}`,
        url,
        hash,
        timestamp: new Date().toISOString(),
      });

      await fs.writeFile(
        notificationsFile,
        JSON.stringify(notifications, null, 2)
      );
    } catch (error) {
      this.logger?.error('Error saving completion notification:', error);
    }
  }

  async handleDownloadError(hash, url, error, _metadata = {}) {
    this.logger?.error(`Download failed for ${url} (hash: ${hash}):`, error);

    // Check if job was cancelled - if so, don't retry
    if (this.cancelledJobs.has(hash)) {
      this.logger?.info(`Ignoring error for cancelled job: ${hash}`);
      this.cancelledJobs.delete(hash); // Clean up cancellation flag
      return;
    }

    try {
      // Use JobManager to handle job failure with retry logic
      const retriedJob = await this.jobManager.handleJobFailure(hash, error);

      // Broadcast state change
      if (this.broadcastChange) {
        this.broadcastChange();
      }

      if (retriedJob) {
        this.logger?.info(
          `Moved failed download back to queue: ${url} (retry ${retriedJob.retryCount}/${this.jobManager.maxRetries})`
        );
      } else {
        this.logger?.info(
          `Max retries (${this.jobManager.maxRetries}) reached for ${url}, removed from queue`
        );
      }
    } catch (moveError) {
      this.logger?.error(
        `Error handling download failure for ${url}:`,
        moveError
      );
    }
  }

  /**
   * Cancel an active download and clean up associated resources
   * @param {string} jobHash - Hash of the job to cancel
   * @returns {boolean} True if cancellation was successful
   */
  async cancelDownload(jobHash) {
    try {
      // Check if the job is currently active
      const activeDownload = this.activeDownloads.get(jobHash);
      const activeProcess = this.activeProcesses.get(jobHash);

      if (!activeDownload || !activeProcess) {
        throw new Error(`No active download found for job: ${jobHash}`);
      }

      this.logger?.info(`Cancelling download for job: ${jobHash}`);

      // Mark job as cancelled BEFORE killing process
      this.cancelledJobs.add(jobHash);

      // Kill the yt-dlp process
      activeProcess.kill('SIGTERM');

      // Give the process a moment to terminate gracefully
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Force kill if still running
      if (!activeProcess.killed) {
        this.logger?.warn(`Force killing process for job: ${jobHash}`);
        activeProcess.kill('SIGKILL');
      }

      // Clean up active download files
      await this.cleanupActiveDownloadFiles(jobHash);

      // Delete the job file itself so it doesn't get picked up again
      await this.jobManager.deleteJob(jobHash);

      // Clean up tracking data
      this.activeDownloads.delete(jobHash);
      this.downloadProgress.delete(jobHash);
      this.activeProcesses.delete(jobHash);
      this.lastProgressBroadcast.delete(jobHash);

      // Broadcast state change
      if (this.broadcastChange) {
        this.broadcastChange();
      }

      this.logger?.info(`Successfully cancelled download for job: ${jobHash}`);
      return true;
    } catch (error) {
      // Clean up cancellation flag on error
      this.cancelledJobs.delete(jobHash);

      this.logger?.error(
        `Error cancelling download for job ${jobHash}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Clean up active download files created recently
   * @param {string} _jobHash - Job hash (currently unused, kept for future enhancement)
   */
  async cleanupActiveDownloadFiles(_jobHash) {
    try {
      const activeFiles = await fs.readdir(this.downloadsActiveDir);

      // Find files that might belong to this download
      // Since we can't easily match files to specific downloads in multi-concurrent scenarios,
      // we'll remove all files that were created recently (within the last few minutes)
      // This is a simple heuristic - a more sophisticated approach would track exact filenames
      const cutoffTime = Date.now() - this.CLEANUP_CUTOFF_MINUTES * 60 * 1000;

      for (const file of activeFiles) {
        if (file === '.DS_Store') continue;

        const filePath = path.join(this.downloadsActiveDir, file);
        try {
          const stats = await fs.stat(filePath);
          if (stats.mtime.getTime() > cutoffTime) {
            await fs.unlink(filePath);
          }
        } catch (error) {
          this.logger?.warn(`Failed to clean up file ${file}:`, error);
        }
      }
    } catch (error) {
      this.logger?.error('Error cleaning up active download files:', error);
    }
  }

  getStatus() {
    // Convert progress Map to array with hash included
    const progressArray = Array.from(this.downloadProgress.entries()).map(
      ([hash, progress]) => ({
        hash,
        ...progress,
      })
    );

    return {
      isProcessing: this.isProcessing,
      activeDownloads: this.activeDownloads.size,
      maxConcurrent: this.maxConcurrent,
      pollInterval: this.pollInterval,
      currentDownloads: progressArray, // Include progress information
      cancelledJobs: this.cancelledJobs.size, // Include cancellation tracking
    };
  }
}

export default QueueProcessor;
