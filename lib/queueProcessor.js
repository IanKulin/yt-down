import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { getYtDlpArgs } from './settings.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class QueueProcessor {
  constructor(options = {}) {
    this.logger = options.logger;
    this.baseDir = options.baseDir || path.join(__dirname, '..');

    this.queuedDir = path.join(this.baseDir, 'data', 'urls', 'queued');
    this.activeDir = path.join(this.baseDir, 'data', 'urls', 'active');
    this.finishedDir = path.join(this.baseDir, 'data', 'urls', 'finished');
    this.downloadsDir = path.join(this.baseDir, 'data', 'downloads');

    this.pollInterval = options.pollInterval || 5000; // 5 seconds
    this.maxConcurrent = options.maxConcurrent || 1;
    this.activeDownloads = new Map();
    this.downloadProgress = new Map(); // Track progress for each download
    this.isProcessing = false;
    this.intervalId = null;
  }

  async start() {
    if (this.isProcessing) {
      this.logger?.warn('Queue processor already running');
      return;
    }

    this.logger?.info('Starting queue processor');
    this.isProcessing = true;

    await this.ensureDirectoryExists(this.downloadsDir);

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
      return;
    }

    // Extract filename from destination line
    const destinationMatch = line.match(/\[download\]\s+Destination:\s+(.+)/);
    if (destinationMatch) {
      const filename = destinationMatch[1];
      const progress = this.downloadProgress.get(hash) || {};
      progress.filename = filename;
      this.downloadProgress.set(hash, progress);
      return;
    }

    // Extract filename from info line
    const infoMatch = line.match(/\[info\]\s+(.+?):\s+Downloading/);
    if (infoMatch) {
      const title = infoMatch[1];
      const progress = this.downloadProgress.get(hash) || {};
      if (!progress.filename) {
        progress.filename = title;
      }
      this.downloadProgress.set(hash, progress);
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

      // Read queued items
      const queuedItems = await this.getQueuedItems();

      for (const item of queuedItems) {
        if (this.activeDownloads.size >= this.maxConcurrent) {
          break;
        }

        await this.startDownload(item);
      }
    } catch (error) {
      this.logger?.error('Error processing queue:', error);
    }
  }

  async getQueuedItems() {
    try {
      await this.ensureDirectoryExists(this.queuedDir);
      const files = await fs.readdir(this.queuedDir);
      const items = [];

      for (const file of files) {
        if (file.endsWith('.txt')) {
          const filePath = path.join(this.queuedDir, file);
          const url = (await fs.readFile(filePath, 'utf-8')).trim();
          items.push({
            hash: file.replace('.txt', ''),
            url,
            filePath,
          });
        }
      }

      return items;
    } catch (error) {
      this.logger?.error('Error reading queued items:', error);
      return [];
    }
  }

  async startDownload(item) {
    const { hash, url, filePath } = item;

    try {
      // Move file to active directory
      const activeFilePath = path.join(this.activeDir, `${hash}.txt`);
      await this.ensureDirectoryExists(this.activeDir);
      await fs.rename(filePath, activeFilePath);

      this.logger?.info(`Started download: ${url} (hash: ${hash})`);

      // Start the download process
      const downloadPromise = this.downloadVideo(hash, url);
      this.activeDownloads.set(hash, downloadPromise);

      // Handle completion
      downloadPromise
        .then(async () => {
          await this.completeDownload(hash, url, activeFilePath);
        })
        .catch(async (error) => {
          await this.handleDownloadError(hash, url, activeFilePath, error);
        })
        .finally(() => {
          this.activeDownloads.delete(hash);
          this.downloadProgress.delete(hash); // Clean up progress data
        });
    } catch (error) {
      this.logger?.error(`Error starting download for ${url}:`, error);
    }
  }

  async downloadVideo(hash, url) {
    return new Promise(async (resolve, reject) => {
      let args;
      try {
        args = await getYtDlpArgs(url);
      } catch (error) {
        this.logger?.error(`Error getting yt-dlp args for ${url}:`, error);
        return reject(error);
      }

      // Debug: Log the complete yt-dlp command
      this.logger?.debug(`Executing yt-dlp command: yt-dlp ${args.join(' ')}`);

      const ytDlp = spawn('yt-dlp', args, {
        cwd: this.downloadsDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let stdoutBuffer = '';

      ytDlp.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        stdoutBuffer += chunk;

        // Process complete lines for progress parsing
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || ''; // Keep incomplete line in buffer

        lines.forEach((line) => {
          if (line.trim()) {
            this.parseProgressLine(line.trim(), hash);
          }
        });
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

  async completeDownload(hash, url, activeFilePath) {
    try {
      // Move file to finished directory
      const finishedFilePath = path.join(this.finishedDir, `${hash}.txt`);
      await this.ensureDirectoryExists(this.finishedDir);
      await fs.rename(activeFilePath, finishedFilePath);

      this.logger?.info(`Download completed: ${url} (hash: ${hash})`);
    } catch (error) {
      this.logger?.error(`Error completing download for ${url}:`, error);
    }
  }

  async handleDownloadError(hash, url, activeFilePath, error) {
    this.logger?.error(`Download failed for ${url} (hash: ${hash}):`, error);

    // For now, just move back to queued for retry
    // In the future, could implement retry limits and failed directory
    try {
      const queuedFilePath = path.join(this.queuedDir, `${hash}.txt`);
      await fs.rename(activeFilePath, queuedFilePath);
      this.logger?.info(`Moved failed download back to queue: ${url}`);
    } catch (moveError) {
      this.logger?.error(
        `Error moving failed download back to queue for ${url}:`,
        moveError
      );
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
    };
  }
}

export default QueueProcessor;
