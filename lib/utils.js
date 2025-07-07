import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { JobManager } from './jobs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DOWNLOADS_DIR = path.join(__dirname, '..', 'data', 'downloads');
export const DOWNLOADS_ACTIVE_DIR = path.join(
  __dirname,
  '..',
  'data',
  'downloads',
  'active'
);
export const DOWNLOADS_FINISHED_DIR = path.join(
  __dirname,
  '..',
  'data',
  'downloads',
  'finished'
);

export async function ensureDirectoryExists(dir) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

export async function getDownloadedFiles(logger) {
  try {
    await ensureDirectoryExists(DOWNLOADS_FINISHED_DIR);
    const files = await fs.readdir(DOWNLOADS_FINISHED_DIR);
    const fileData = [];

    for (const file of files) {
      if (file === '.DS_Store') continue; // Skip system files

      const filePath = path.join(DOWNLOADS_FINISHED_DIR, file);
      const stats = await fs.stat(filePath);
      const extension = path.extname(file).toLowerCase();

      fileData.push({
        name: file,
        extension,
        size: stats.size,
        modified: stats.mtime,
        isVideo: /\.(mkv|mp4|webm|avi|mov)$/i.test(file),
        isSubtitle: /\.(srt|vtt|dfxp|ass|ttml|sbv|lrc)$/i.test(file),
      });
    }

    // Return files sorted by filename
    return fileData.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    logger.error('Error reading downloads directory:', error);
    return [];
  }
}

export async function cleanupActiveDownloads(logger) {
  try {
    // Clean up abandoned download files
    await ensureDirectoryExists(DOWNLOADS_ACTIVE_DIR);
    const downloadFiles = await fs.readdir(DOWNLOADS_ACTIVE_DIR);

    for (const file of downloadFiles) {
      if (file === '.DS_Store') continue; // Skip system files

      const filePath = path.join(DOWNLOADS_ACTIVE_DIR, file);
      try {
        await fs.unlink(filePath);
        logger.info(`Cleaned up abandoned download file: ${file}`);
      } catch (error) {
        logger.warn(`Failed to cleanup download file ${file}:`, error);
      }
    }

    // Use JobManager to clean up interrupted jobs
    const jobManager = new JobManager({ logger });
    await jobManager.cleanupInterruptedJobs();
  } catch (error) {
    logger.error('Error cleaning up active downloads:', error);
  }
}

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
