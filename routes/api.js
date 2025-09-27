import { Hono } from 'hono';
import { asyncHandler } from '../lib/errorHandler.js';

const router = new Hono();

router.get(
  '/api/state',
  asyncHandler(async (c) => {
    const services = c.get('services');
    const [jobs, statistics, notifications] = await Promise.all([
      services.jobs.getJobsForDisplay(),
      services.jobs.getJobStatistics(),
      services.notifications.getNotifications(),
    ]);

    const state = {
      queued: jobs.queued,
      active: jobs.active,
      failed: jobs.failed,
      counts: statistics.counts,
      processor: statistics.processor,
      titleEnhancement: services.titleEnhancement.getStatus(),
      notifications,
      timestamp: new Date().toISOString(),
    };

    return c.json(state);
  })
);

router.post(
  '/api/notifications/dismiss',
  asyncHandler(async (c) => {
    const body = await c.req.parseBody();
    const { notificationId } = body;

    const result = await c
      .get('services')
      .notifications.dismissNotification(notificationId);

    return c.json({ success: result.success });
  })
);

router.post(
  '/api/settings',
  asyncHandler(async (c) => {
    const body = await c.req.parseBody();
    const result = await c.get('services').settings.updateSettings(body);

    return c.json({
      success: result.success,
      settings: result.settings,
      timestamp: new Date().toISOString(),
    });
  })
);

router.get(
  '/api/failed',
  asyncHandler(async (c) => {
    const failedJobs = await c.get('services').jobs.getFailedJobs();

    return c.json({
      failed: failedJobs,
      timestamp: new Date().toISOString(),
    });
  })
);

router.post(
  '/api/failed/:jobId/retry',
  asyncHandler(async (c) => {
    const jobId = c.req.param('jobId');
    const result = await c.get('services').jobs.retryFailedJob(jobId);

    return c.json({
      success: result.success,
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
