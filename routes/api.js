import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveSettings } from '../lib/settings.js';
import { asyncHandler } from '../lib/errorHandler.js';
import { validateSettings } from '../lib/validators.js';
import { ValidationError } from '../lib/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.get(
  '/api/state',
  asyncHandler(async (req, res) => {
    const [queuedJobs, activeJobs, finishedJobs] = await Promise.all([
      req.jobManager.getQueuedJobs(),
      req.jobManager.getActiveJobs(),
      req.jobManager.getFinishedJobs(),
    ]);

    // Convert Job objects to the format expected by the API
    const formattedQueuedJobs = queuedJobs.map((job) => job.toApiFormat());
    const formattedActiveJobs = activeJobs.map((job) => job.toApiFormat());
    const formattedFinishedJobs = finishedJobs.map((job) => job.toApiFormat());

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
  })
);

router.post(
  '/api/notifications/dismiss',
  asyncHandler(async (req, res) => {
    const { notificationId } = req.body;

    if (!notificationId) {
      throw new ValidationError('Notification ID is required');
    }

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
  })
);

router.post(
  '/api/settings',
  asyncHandler(async (req, res) => {
    const { videoQuality, subtitles, autoSubs, subLanguage, rateLimit } =
      req.body;

    const settings = {
      videoQuality: videoQuality || 'no-limit',
      subtitles: subtitles === true || subtitles === 'on',
      autoSubs: autoSubs === true || autoSubs === 'on',
      subLanguage: subLanguage || 'en',
      rateLimit: rateLimit || 'no-limit',
    };

    const validatedSettings = validateSettings(settings);
    await saveSettings(validatedSettings);
    req.logger.debug('Settings updated via API:', validatedSettings);

    res.json({
      success: true,
      settings: validatedSettings,
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
