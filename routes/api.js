import express from 'express';
import { asyncHandler } from '../lib/errorHandler.js';

const router = express.Router();

router.get(
  '/api/state',
  asyncHandler(async (req, res) => {
    const [jobs, statistics, notifications] = await Promise.all([
      req.services.jobs.getJobsForDisplay(),
      req.services.jobs.getJobStatistics(),
      req.services.notifications.getNotifications(),
    ]);

    const state = {
      queued: jobs.queued,
      active: jobs.active,
      failed: jobs.failed,
      counts: statistics.counts,
      processor: statistics.processor,
      titleEnhancement: req.services.titleEnhancement.getStatus(),
      notifications,
      timestamp: new Date().toISOString(),
    };

    res.json(state);
  })
);

router.post(
  '/api/notifications/dismiss',
  asyncHandler(async (req, res) => {
    const { notificationId } = req.body;

    const result =
      await req.services.notifications.dismissNotification(notificationId);

    res.json({ success: result.success });
  })
);

router.post(
  '/api/settings',
  asyncHandler(async (req, res) => {
    const result = await req.services.settings.updateSettings(req.body);

    res.json({
      success: result.success,
      settings: result.settings,
      timestamp: new Date().toISOString(),
    });
  })
);

router.get(
  '/api/failed',
  asyncHandler(async (req, res) => {
    const failedJobs = await req.services.jobs.getFailedJobs();

    res.json({
      failed: failedJobs,
      timestamp: new Date().toISOString(),
    });
  })
);

router.post(
  '/api/failed/:jobId/retry',
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const result = await req.services.jobs.retryFailedJob(jobId);

    res.json({
      success: result.success,
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
