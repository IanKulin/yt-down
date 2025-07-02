import express from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import Logger from '@iankulin/logger';
import QueueProcessor from './lib/queueProcessor.js';
import {
  loadSettings,
  saveSettings,
  getAvailableOptions,
} from './lib/settings.js';

const execAsync = promisify(exec);

const logger = new Logger({ format: 'simple' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const QUEUE_DIR = path.join(__dirname, 'data', 'urls', 'queued');
const ACTIVE_DIR = path.join(__dirname, 'data', 'urls', 'active');
const FINISHED_DIR = path.join(__dirname, 'data', 'urls', 'finished');
const DOWNLOADS_DIR = path.join(__dirname, 'data', 'downloads');

async function ensureDirectoryExists(dir) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function readUrlsFromDirectory(dir, dirType) {
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

async function getQueuedUrls() {
  return await readUrlsFromDirectory(QUEUE_DIR, 'queued');
}

async function getActiveUrls() {
  return await readUrlsFromDirectory(ACTIVE_DIR, 'active');
}

async function getFinishedUrls() {
  return await readUrlsFromDirectory(FINISHED_DIR, 'finished');
}

function createUrlHash(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

async function getDownloadedFiles() {
  try {
    await ensureDirectoryExists(DOWNLOADS_DIR);
    const files = await fs.readdir(DOWNLOADS_DIR);
    const fileData = [];

    for (const file of files) {
      if (file === '.DS_Store') continue; // Skip system files

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

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function checkYtDlpExists() {
  try {
    await execAsync('yt-dlp --version');
    return true;
  } catch {
    return false;
  }
}

app.get('/', async (req, res) => {
  try {
    const queuedUrls = await getQueuedUrls();
    res.render('queue', {
      queuedUrls,
      message: req.query.message,
      error: req.query.error,
    });
  } catch (error) {
    logger.error('Error rendering queue page:', error);
    res.status(500).send('Server error');
  }
});

app.post('/url/add', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || !url.trim()) {
      return res.redirect(
        '/?error=' + encodeURIComponent('Please enter a valid URL')
      );
    }

    const trimmedUrl = url.trim();
    const urlHash = createUrlHash(trimmedUrl);
    const filename = `${urlHash}.txt`;
    const filePath = path.join(QUEUE_DIR, filename);

    await ensureDirectoryExists(QUEUE_DIR);

    try {
      await fs.access(filePath);
      return res.redirect(
        '/?error=' + encodeURIComponent('URL already exists in queue')
      );
    } catch {
      // File doesn't exist, we can proceed
    }

    await fs.writeFile(filePath, trimmedUrl, 'utf-8');
    logger.info(`Added URL to queue: ${trimmedUrl} (hash: ${urlHash})`);

    res.redirect(
      '/?message=' + encodeURIComponent('URL added to queue successfully')
    );
  } catch (error) {
    logger.error('Error adding URL to queue:', error);
    res.redirect('/?error=' + encodeURIComponent('Failed to add URL to queue'));
  }
});

app.post('/url/delete', async (req, res) => {
  try {
    const { hash } = req.body;

    if (!hash || !hash.trim()) {
      return res.redirect(
        '/?error=' + encodeURIComponent('Invalid hash provided')
      );
    }

    const trimmedHash = hash.trim();
    const filename = `${trimmedHash}.txt`;
    const filePath = path.join(QUEUE_DIR, filename);

    try {
      const url = await fs.readFile(filePath, 'utf-8');
      await fs.unlink(filePath);
      logger.info(
        `Deleted URL from queue: ${url.trim()} (hash: ${trimmedHash})`
      );

      res.redirect(
        '/?message=' + encodeURIComponent('URL deleted from queue successfully')
      );
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.redirect(
          '/?error=' + encodeURIComponent('URL not found in queue')
        );
      }
      throw error;
    }
  } catch (error) {
    logger.error('Error deleting URL from queue:', error);
    res.redirect(
      '/?error=' + encodeURIComponent('Failed to delete URL from queue')
    );
  }
});

app.get('/downloads', async (req, res) => {
  try {
    const downloadedFiles = await getDownloadedFiles();
    res.render('downloads', {
      downloadedFiles,
      formatFileSize,
      message: req.query.message,
      error: req.query.error,
    });
  } catch (_error) {
    logger.error('Error rendering downloads page:', _error);
    res.status(500).send('Server error');
  }
});

app.get('/download/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(DOWNLOADS_DIR, filename);

    // Security check: ensure the file is within the downloads directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDownloadsDir = path.resolve(DOWNLOADS_DIR);

    if (!resolvedPath.startsWith(resolvedDownloadsDir)) {
      return res.status(403).send('Access denied');
    }

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).send('File not found');
    }

    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(filePath);
  } catch (error) {
    logger.error('Error downloading file:', error);
    res.status(500).send('Server error');
  }
});

app.post('/file/delete', async (req, res) => {
  try {
    const { filename } = req.body;

    if (!filename || !filename.trim()) {
      return res.redirect(
        '/downloads?error=' + encodeURIComponent('Invalid filename provided')
      );
    }

    const trimmedFilename = filename.trim();
    const filePath = path.join(DOWNLOADS_DIR, trimmedFilename);

    // Security check: ensure the file is within the downloads directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDownloadsDir = path.resolve(DOWNLOADS_DIR);

    if (!resolvedPath.startsWith(resolvedDownloadsDir)) {
      return res.redirect(
        '/downloads?error=' + encodeURIComponent('Access denied')
      );
    }

    try {
      await fs.unlink(filePath);
      logger.info(`Deleted file: ${trimmedFilename}`);

      res.redirect(
        '/downloads?message=' + encodeURIComponent('File deleted successfully')
      );
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.redirect(
          '/downloads?error=' + encodeURIComponent('File not found')
        );
      }
      throw error;
    }
  } catch (error) {
    logger.error('Error deleting file:', error);
    res.redirect(
      '/downloads?error=' + encodeURIComponent('Failed to delete file')
    );
  }
});

app.get('/settings', async (req, res) => {
  try {
    const settings = await loadSettings();
    const options = getAvailableOptions();
    res.render('settings', {
      settings,
      options,
      message: req.query.message,
      error: req.query.error,
    });
  } catch (error) {
    logger.error('Error rendering settings page:', error);
    res.status(500).send('Server error');
  }
});

app.post('/settings', async (req, res) => {
  try {
    const { videoQuality, subtitles, autoSubs, subLanguage, rateLimit } =
      req.body;

    const settings = {
      videoQuality: videoQuality || 'no-limit',
      subtitles: subtitles === 'on',
      autoSubs: autoSubs === 'on',
      subLanguage: subLanguage || 'en',
      rateLimit: rateLimit || 'no-limit',
    };

    await saveSettings(settings);
    logger.info('Settings updated:', settings);

    res.redirect(
      '/settings?message=' + encodeURIComponent('Settings saved successfully')
    );
  } catch (error) {
    logger.error('Error saving settings:', error);
    res.redirect(
      '/settings?error=' + encodeURIComponent('Failed to save settings')
    );
  }
});

app.get('/api/state', async (req, res) => {
  try {
    const [queuedUrls, activeUrls, finishedUrls] = await Promise.all([
      getQueuedUrls(),
      getActiveUrls(),
      getFinishedUrls(),
    ]);

    const state = {
      queued: queuedUrls,
      active: activeUrls,
      finished: finishedUrls,
      counts: {
        queued: queuedUrls.length,
        active: activeUrls.length,
        finished: finishedUrls.length,
        total: queuedUrls.length + activeUrls.length + finishedUrls.length,
      },
      processor: queueProcessor.getStatus(),
      timestamp: new Date().toISOString(),
    };

    res.json(state);
  } catch (error) {
    logger.error('Error getting state:', error);
    res.status(500).json({
      error: 'Failed to get state',
      timestamp: new Date().toISOString(),
    });
  }
});

// Initialize queue processor
const queueProcessor = new QueueProcessor({
  logger,
  baseDir: __dirname,
});

app.listen(PORT, async () => {
  // Check if yt-dlp is available
  const ytDlpExists = await checkYtDlpExists();
  if (!ytDlpExists) {
    logger.error(
      'yt-dlp not found in PATH. Please install yt-dlp to use this application.'
    );
    process.exit(1);
  }

  logger.info(`yt-dlp queue server running on port ${PORT}`);

  // Start the queue processor
  await queueProcessor.start();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT. Gracefully shutting down...');
  await queueProcessor.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM. Gracefully shutting down...');
  await queueProcessor.stop();
  process.exit(0);
});
