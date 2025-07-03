import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getQueuedUrls, getActiveUrls, getFinishedUrls } from '../lib/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.get('/api/state', async (req, res) => {
  try {
    const [queuedUrls, activeUrls, finishedUrls] = await Promise.all([
      getQueuedUrls(req.logger),
      getActiveUrls(req.logger),
      getFinishedUrls(req.logger),
    ]);

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
      queued: queuedUrls,
      active: activeUrls,
      finished: finishedUrls,
      counts: {
        queued: queuedUrls.length,
        active: activeUrls.length,
        finished: finishedUrls.length,
        total: queuedUrls.length + activeUrls.length + finishedUrls.length,
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

export default router;
