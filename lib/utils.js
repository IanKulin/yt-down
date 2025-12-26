import { dirname, extname, join } from '@std/path';
import { ensureDir } from '@std/fs';

const __dirname = dirname(new URL(import.meta.url).pathname);

export const DOWNLOADS_DIR = join(__dirname, '..', 'downloads');
export const DOWNLOADS_ACTIVE_DIR = join(__dirname, '..', 'data', 'partials');
export const DOWNLOADS_FINISHED_DIR = join(__dirname, '..', 'downloads');

export async function ensureDirectoryExists(dir) {
  await ensureDir(dir);
}

export async function getDownloadedFiles(logger) {
  try {
    await ensureDirectoryExists(DOWNLOADS_FINISHED_DIR);
    const dirEntries = await Array.fromAsync(
      Deno.readDir(DOWNLOADS_FINISHED_DIR),
    );
    const fileData = [];

    for (const entry of dirEntries) {
      if (entry.name === '.DS_Store') continue; // Skip system files

      const filePath = join(DOWNLOADS_FINISHED_DIR, entry.name);
      const stats = await Deno.stat(filePath);
      const extension = extname(entry.name).toLowerCase();

      fileData.push({
        name: entry.name,
        extension,
        size: stats.size,
        modified: stats.mtime,
        isVideo: /\.(mkv|mp4|webm|avi|mov)$/i.test(entry.name),
        isSubtitle: /\.(srt|vtt|dfxp|ass|ttml|sbv|lrc)$/i.test(entry.name),
      });
    }

    // Return files sorted by filename
    return fileData.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    logger.error('Error reading downloads directory:', error);
    return [];
  }
}

export async function cleanupActiveDownloads(logger, jobManager) {
  try {
    // Clean up abandoned download files
    await ensureDirectoryExists(DOWNLOADS_ACTIVE_DIR);
    const downloadEntries = await Array.fromAsync(
      Deno.readDir(DOWNLOADS_ACTIVE_DIR),
    );

    for (const entry of downloadEntries) {
      if (entry.name === '.DS_Store') continue; // Skip system files

      const filePath = join(DOWNLOADS_ACTIVE_DIR, entry.name);
      try {
        await Deno.remove(filePath);
        logger.info(`Cleaned up abandoned download file: ${entry.name}`);
      } catch (error) {
        logger.warn(`Failed to cleanup download file ${entry.name}:`, error);
      }
    }

    // Ensure failed jobs directory exists
    const failedJobsDir = join(dirname(DOWNLOADS_ACTIVE_DIR), 'jobs', 'failed');
    await ensureDirectoryExists(failedJobsDir);

    // Use provided JobManager to clean up interrupted jobs
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
