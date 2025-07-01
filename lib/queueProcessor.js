import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
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
            this.processQueue().catch(error => {
                this.logger?.error('Error in queue processing:', error);
            });
        }, this.pollInterval);

        // Process immediately on start
        this.processQueue().catch(error => {
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
            this.logger?.info(`Waiting for ${activeProcesses.length} active downloads to complete`);
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
                        filePath
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
                });

        } catch (error) {
            this.logger?.error(`Error starting download for ${url}:`, error);
        }
    }

    async downloadVideo(hash, url) {
        return new Promise((resolve, reject) => {
            const args = [
                '--fragment-retries', '20',
                '--retries', 'infinite',
                '--socket-timeout', '30',
                '--limit-rate', '180K',
                '-o', '%(title)s.%(ext)s',
                '--write-subs',
                '--write-auto-subs',
                '--sub-lang', 'en',
                '--convert-subs', 'srt',
                url
            ];

            const ytDlp = spawn('yt-dlp', args, {
                cwd: this.downloadsDir,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            ytDlp.stdout.on('data', (data) => {
                stdout += data.toString();
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
            this.logger?.error(`Error moving failed download back to queue for ${url}:`, moveError);
        }
    }

    getStatus() {
        return {
            isProcessing: this.isProcessing,
            activeDownloads: this.activeDownloads.size,
            maxConcurrent: this.maxConcurrent,
            pollInterval: this.pollInterval
        };
    }
}

export default QueueProcessor;