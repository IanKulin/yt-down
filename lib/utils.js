import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const QUEUE_DIR = path.join(__dirname, '..', 'data', 'urls', 'queued');
export const ACTIVE_DIR = path.join(__dirname, '..', 'data', 'urls', 'active');
export const FINISHED_DIR = path.join(
  __dirname,
  '..',
  'data',
  'urls',
  'finished'
);
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

export async function readUrlsFromDirectory(dir, dirType, logger) {
  try {
    await ensureDirectoryExists(dir);
    const files = await fs.readdir(dir);
    const urls = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(dir, file);
        try {
          const data = await fs.readFile(filePath, 'utf-8');
          const queueItem = JSON.parse(data);
          urls.push({
            hash: file.replace('.json', ''),
            url: queueItem.url,
            title: queueItem.title || null,
            retryCount: queueItem.retryCount || 0,
            timestamp: queueItem.timestamp || null,
            sortOrder: queueItem.sortOrder || 0,
          });
        } catch (parseError) {
          logger.error(`Error parsing JSON file ${file}:`, parseError);
          // Skip malformed files
        }
      }
    }

    // Sort by sortOrder, then by timestamp
    return urls.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      if (a.timestamp && b.timestamp) {
        return new Date(a.timestamp) - new Date(b.timestamp);
      }
      return 0;
    });
  } catch (error) {
    logger.error(`Error reading ${dirType} URLs:`, error);
    return [];
  }
}

export async function getQueuedUrls(logger) {
  return await readUrlsFromDirectory(QUEUE_DIR, 'queued', logger);
}

export async function getActiveUrls(logger) {
  return await readUrlsFromDirectory(ACTIVE_DIR, 'active', logger);
}

export async function getFinishedUrls(logger) {
  return await readUrlsFromDirectory(FINISHED_DIR, 'finished', logger);
}

export function createUrlHash(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
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

    // Move active URL files back to queued for retry
    await ensureDirectoryExists(ACTIVE_DIR);
    await ensureDirectoryExists(QUEUE_DIR);
    const urlFiles = await fs.readdir(ACTIVE_DIR);

    for (const file of urlFiles) {
      if (file === '.DS_Store' || !file.endsWith('.json')) continue;

      const activeFilePath = path.join(ACTIVE_DIR, file);
      const queuedFilePath = path.join(QUEUE_DIR, file);

      try {
        // Read the JSON file to increment retry count
        const data = await fs.readFile(activeFilePath, 'utf-8');
        const queueItem = JSON.parse(data);
        queueItem.retryCount = (queueItem.retryCount || 0) + 1;
        
        // Write back to queued directory with incremented retry count
        await fs.writeFile(queuedFilePath, JSON.stringify(queueItem, null, 2));
        await fs.unlink(activeFilePath);
        logger.info(`Moved interrupted download back to queue: ${file} (retry count: ${queueItem.retryCount})`);
      } catch (error) {
        logger.warn(`Failed to move URL file ${file} back to queue:`, error);
      }
    }
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

export async function createQueueItem(url, options = {}) {
  const queueItem = {
    url: url.trim(),
    title: options.title || null,
    retryCount: options.retryCount || 0,
    timestamp: options.timestamp || new Date().toISOString(),
    sortOrder: options.sortOrder || Date.now(),
  };
  return queueItem;
}

export async function writeQueueFile(filePath, queueItem) {
  // Use atomic write: write to temp file then rename
  const tempFilePath = `${filePath}.tmp`;
  await fs.writeFile(tempFilePath, JSON.stringify(queueItem, null, 2));
  await fs.rename(tempFilePath, filePath);
}
