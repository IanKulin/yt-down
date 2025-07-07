import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { JobManager } from '../lib/jobs.js';
import { saveSettings } from '../lib/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Create job manager instance
const jobManager = new JobManager();

router.get('/api/state', async (req, res) => {
  try {
    // Set logger on job manager
    jobManager.logger = req.logger;

    const [queuedJobs, activeJobs, finishedJobs] = await Promise.all([
      jobManager.getQueuedJobs(),
      jobManager.getActiveJobs(),
      jobManager.getFinishedJobs(),
    ]);

    // Convert Job objects to the format expected by the API
    const formattedQueuedJobs = queuedJobs.map((job) => ({
      hash: job.id,
      url: job.url,
      title: job.title,
      retryCount: job.retryCount,
      timestamp: job.timestamp,
      sortOrder: job.sortOrder,
    }));

    const formattedActiveJobs = activeJobs.map((job) => ({
      hash: job.id,
      url: job.url,
      title: job.title,
      retryCount: job.retryCount,
      timestamp: job.timestamp,
      sortOrder: job.sortOrder,
    }));

    const formattedFinishedJobs = finishedJobs.map((job) => ({
      hash: job.id,
      url: job.url,
      title: job.title,
      retryCount: job.retryCount,
      timestamp: job.timestamp,
      sortOrder: job.sortOrder,
    }));

    // Check for pending notifications
    let notifications = [];
    try {
      const notificationsFile = path.join(
        __dirname,
        '..',
        'data',
        'notifications.json'
      );
      const data = await fs.readFile(notificationsFile, 'utf-8');
      notifications = JSON.parse(data);
    } catch {
      // File doesn't exist or is invalid, ignore
    }

    const state = {
      queued: formattedQueuedJobs,
      active: formattedActiveJobs,
      finished: formattedFinishedJobs,
      counts: {
        queued: formattedQueuedJobs.length,
        active: formattedActiveJobs.length,
        finished: formattedFinishedJobs.length,
        total:
          formattedQueuedJobs.length +
          formattedActiveJobs.length +
          formattedFinishedJobs.length,
      },
      processor: req.queueProcessor.getStatus(),
      notifications: notifications,
      timestamp: new Date().toISOString(),
    };

    res.json(state);
  } catch (error) {
    req.logger.error('Error getting state:', error);
    res.status(500).json({
      error: 'Failed to get state',
      timestamp: new Date().toISOString(),
    });
  }
});

router.post('/api/notifications/dismiss', async (req, res) => {
  try {
    const { notificationId } = req.body;
    const notificationsFile = path.join(
      __dirname,
      '..',
      'data',
      'notifications.json'
    );

    let notifications = [];
    try {
      const data = await fs.readFile(notificationsFile, 'utf-8');
      notifications = JSON.parse(data);
    } catch {
      // File doesn't exist or is invalid, start with empty array
    }

    // Remove the notification by timestamp (using timestamp as ID)
    notifications = notifications.filter((n) => n.timestamp !== notificationId);

    await fs.writeFile(
      notificationsFile,
      JSON.stringify(notifications, null, 2)
    );

    res.json({ success: true });
  } catch (error) {
    req.logger.error('Error dismissing notification:', error);
    res.status(500).json({
      error: 'Failed to dismiss notification',
      timestamp: new Date().toISOString(),
    });
  }
});

router.post('/api/settings', async (req, res) => {
  try {
    const { videoQuality, subtitles, autoSubs, subLanguage, rateLimit } =
      req.body;

    const settings = {
      videoQuality: videoQuality || 'no-limit',
      subtitles: subtitles === true || subtitles === 'on',
      autoSubs: autoSubs === true || autoSubs === 'on',
      subLanguage: subLanguage || 'en',
      rateLimit: rateLimit || 'no-limit',
    };

    await saveSettings(settings);
    req.logger.debug('Settings updated via API:', settings);

    res.json({
      success: true,
      settings: settings,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    req.logger.error('Error saving settings via API:', error);
    res.status(500).json({
      error: 'Failed to save settings',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
