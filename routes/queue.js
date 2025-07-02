import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import {
  QUEUE_DIR,
  ensureDirectoryExists,
  getQueuedUrls,
  createUrlHash,
} from '../lib/utils.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const queuedUrls = await getQueuedUrls(req.logger);
    res.render('queue', {
      queuedUrls,
      message: req.query.message,
      error: req.query.error,
    });
  } catch (error) {
    req.logger.error('Error rendering queue page:', error);
    res.status(500).send('Server error');
  }
});

router.post('/url/add', async (req, res) => {
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
    req.logger.info(`Added URL to queue: ${trimmedUrl} (hash: ${urlHash})`);

    res.redirect(
      '/?message=' + encodeURIComponent('URL added to queue successfully')
    );
  } catch (error) {
    req.logger.error('Error adding URL to queue:', error);
    res.redirect('/?error=' + encodeURIComponent('Failed to add URL to queue'));
  }
});

router.post('/url/delete', async (req, res) => {
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
      req.logger.info(
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
    req.logger.error('Error deleting URL from queue:', error);
    res.redirect(
      '/?error=' + encodeURIComponent('Failed to delete URL from queue')
    );
  }
});

export default router;
