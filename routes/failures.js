import { Hono } from 'hono';
import { renderWithContext } from '../lib/ejsHelper.js';

const router = new Hono();

router.get('/failures', async (c) => {
  const failedJobs = await c.get('services').jobs.getFailedJobs();

  const html = await renderWithContext(c, 'failures', {
    failedJobs,
    failedCount: failedJobs.length,
  });

  return c.html(html);
});

router.post('/failures/:jobId/retry', async (c) => {
  const jobId = c.req.param('jobId');
  await c.get('services').jobs.retryFailedJob(jobId);
  return c.redirect('/');
});

router.post('/failures/:jobId/delete', async (c) => {
  const jobId = c.req.param('jobId');
  await c.get('services').jobs.deleteFailedJob(jobId);
  return c.redirect('/failures');
});

export default router;
