import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import {
  QUEUE_DIR,
  ensureDirectoryExists,
  getQueuedJobs,
  getActiveJobs,
  createJobHash,
  createJobItem,
  writeJobFile,
} from '../lib/utils.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [queuedJobs, activeJobs] = await Promise.all([
      getQueuedJobs(req.logger),
      getActiveJobs(req.logger),
    ]);
    res.render('queue', {
      queuedJobs,
      activeJobs,
    });
  } catch (error) {
    req.logger.error('Error rendering queue page:', error);
    res.status(500).send('Server error');
  }
});

router.post('/job/add', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || !url.trim()) {
      req.session.flashMessage = 'Please enter a valid URL';
      req.session.flashType = 'error';
      return res.redirect('/');
    }

    const trimmedUrl = url.trim();
    const jobHash = createJobHash(trimmedUrl);
    const filename = `${jobHash}.json`;
    const filePath = path.join(QUEUE_DIR, filename);

    await ensureDirectoryExists(QUEUE_DIR);

    try {
      await fs.access(filePath);
      req.session.flashMessage = 'Download job already exists in queue';
      req.session.flashType = 'error';
      return res.redirect('/');
    } catch {
      // File doesn't exist, we can proceed
    }

    // Create job item with metadata
    const jobItem = await createJobItem(trimmedUrl);
    await writeJobFile(filePath, jobItem);
    req.logger.info(
      `Added download job to queue: ${trimmedUrl} (hash: ${jobHash})`
    );

    req.session.flashMessage = 'Download job added to queue successfully';
    req.session.flashType = 'success';
    res.redirect('/');
  } catch (error) {
    req.logger.error('Error adding URL to queue:', error);
    req.session.flashMessage = 'Failed to add download job to queue';
    req.session.flashType = 'error';
    res.redirect('/');
  }
});

router.post('/job/delete', async (req, res) => {
  try {
    const { hash } = req.body;

    if (!hash || !hash.trim()) {
      req.session.flashMessage = 'Invalid hash provided';
      req.session.flashType = 'error';
      return res.redirect('/');
    }

    const trimmedHash = hash.trim();
    const filename = `${trimmedHash}.json`;
    const filePath = path.join(QUEUE_DIR, filename);

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const jobItem = JSON.parse(data);
      await fs.unlink(filePath);
      req.logger.info(
        `Deleted download job from queue: ${jobItem.url} (hash: ${trimmedHash})`
      );

      req.session.flashMessage = 'Download job deleted from queue successfully';
      req.session.flashType = 'success';
      res.redirect('/');
    } catch (error) {
      if (error.code === 'ENOENT') {
        req.session.flashMessage = 'Download job not found in queue';
        req.session.flashType = 'error';
        return res.redirect('/');
      }
      throw error;
    }
  } catch (error) {
    req.logger.error('Error deleting URL from queue:', error);
    req.session.flashMessage = 'Failed to delete download job from queue';
    req.session.flashType = 'error';
    res.redirect('/');
  }
});

export default router;
