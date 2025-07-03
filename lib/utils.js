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
      if (file.endsWith('.txt')) {
        const filePath = path.join(dir, file);
        const url = await fs.readFile(filePath, 'utf-8');
        urls.push({
          hash: file.replace('.txt', ''),
          url: url.trim(),
        });
      }
    }

    return urls;
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
    await ensureDirectoryExists(DOWNLOADS_DIR);
    const files = await fs.readdir(DOWNLOADS_DIR);
    const fileData = [];

    for (const file of files) {
      if (file === '.DS_Store') continue; // Skip system files
      if (isInProgressFile(file)) continue; // Skip in-progress download files

      const filePath = path.join(DOWNLOADS_DIR, file);
      const stats = await fs.stat(filePath);

      // Group files by base name (video + subtitle pairs)
      const baseName = file.replace(/\.(mkv|mp4|webm|avi|mov|srt|vtt)$/i, '');
      const extension = path.extname(file).toLowerCase();

      fileData.push({
        name: file,
        baseName,
        extension,
        size: stats.size,
        modified: stats.mtime,
        isVideo: /\.(mkv|mp4|webm|avi|mov)$/i.test(file),
        isSubtitle: /\.(srt|vtt)$/i.test(file),
      });
    }

    // Group related files together
    const groupedFiles = {};
    fileData.forEach((file) => {
      if (!groupedFiles[file.baseName]) {
        groupedFiles[file.baseName] = {
          baseName: file.baseName,
          video: null,
          subtitles: [],
        };
      }

      if (file.isVideo) {
        groupedFiles[file.baseName].video = file;
      } else if (file.isSubtitle) {
        groupedFiles[file.baseName].subtitles.push(file);
      } else {
        // Other files (thumbnails, etc.)
        if (!groupedFiles[file.baseName].other) {
          groupedFiles[file.baseName].other = [];
        }
        groupedFiles[file.baseName].other.push(file);
      }
    });

    return Object.values(groupedFiles).sort((a, b) => {
      const aTime = a.video
        ? a.video.modified
        : a.subtitles[0]
          ? a.subtitles[0].modified
          : new Date(0);
      const bTime = b.video
        ? b.video.modified
        : b.subtitles[0]
          ? b.subtitles[0].modified
          : new Date(0);
      return bTime - aTime; // Most recent first
    });
  } catch (error) {
    logger.error('Error reading downloads directory:', error);
    return [];
  }
}

export function isInProgressFile(filename) {
  // Skip temporary files created during download
  if (filename.endsWith('.part')) return true;
  if (filename.endsWith('.frag')) return true;
  if (filename.endsWith('.temp')) return true;
  if (filename.endsWith('.tmp')) return true;
  if (filename.endsWith('.ytdl')) return true;

  // Skip format ID files (e.g., .f137, .f140)
  if (/\.f\d+$/.test(filename)) return true;

  // Skip other temporary patterns
  if (filename.includes('.part-')) return true;
  if (filename.includes('.temp-')) return true;

  return false;
}

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
