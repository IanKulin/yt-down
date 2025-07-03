import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import {
  QUEUE_DIR,
  ensureDirectoryExists,
  getQueuedUrls,
  getActiveUrls,
  createUrlHash,
} from '../lib/utils.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [queuedUrls, activeUrls] = await Promise.all([
      getQueuedUrls(req.logger),
      getActiveUrls(req.logger),
    ]);
    res.render('queue', {
      queuedUrls,
      activeUrls,
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
      req.session.flashMessage = 'Please enter a valid URL';
      req.session.flashType = 'error';
      return res.redirect('/');
    }

    const trimmedUrl = url.trim();
    const urlHash = createUrlHash(trimmedUrl);
    const filename = `${urlHash}.txt`;
    const filePath = path.join(QUEUE_DIR, filename);

    await ensureDirectoryExists(QUEUE_DIR);

    try {
      await fs.access(filePath);
      req.session.flashMessage = 'URL already exists in queue';
      req.session.flashType = 'error';
      return res.redirect('/');
    } catch {
      // File doesn't exist, we can proceed
    }

    await fs.writeFile(filePath, trimmedUrl, 'utf-8');
    req.logger.info(`Added URL to queue: ${trimmedUrl} (hash: ${urlHash})`);

    req.session.flashMessage = 'URL added to queue successfully';
    req.session.flashType = 'success';
    res.redirect('/');
  } catch (error) {
    req.logger.error('Error adding URL to queue:', error);
    req.session.flashMessage = 'Failed to add URL to queue';
    req.session.flashType = 'error';
    res.redirect('/');
  }
});

router.post('/url/delete', async (req, res) => {
  try {
    const { hash } = req.body;

    if (!hash || !hash.trim()) {
      req.session.flashMessage = 'Invalid hash provided';
      req.session.flashType = 'error';
      return res.redirect('/');
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

      req.session.flashMessage = 'URL deleted from queue successfully';
      req.session.flashType = 'success';
      res.redirect('/');
    } catch (error) {
      if (error.code === 'ENOENT') {
        req.session.flashMessage = 'URL not found in queue';
        req.session.flashType = 'error';
        return res.redirect('/');
      }
      throw error;
    }
  } catch (error) {
    req.logger.error('Error deleting URL from queue:', error);
    req.session.flashMessage = 'Failed to delete URL from queue';
    req.session.flashType = 'error';
    res.redirect('/');
  }
});

export default router;
