import { Hono } from 'hono';
import { formatFileSize } from '../lib/utils.js';
import { renderWithContext } from '../lib/ejsHelper.js';

const router = new Hono();

router.get('/', async (c) => {
  const jobs = await c.get('services').jobs.getJobsForDisplay();

  const html = await renderWithContext(c, 'queue', {
    queuedJobs: jobs.queued,
    activeJobs: jobs.active,
    formatFileSize,
  });

  return c.html(html);
});

router.post('/job/add', async (c) => {
  const body = await c.req.parseBody();
  const { url } = body;

  await c.get('services').jobs.addJob(url);
  return c.redirect('/');
});

router.post('/job/delete', async (c) => {
  const body = await c.req.parseBody();
  const { hash } = body;

  await c.get('services').jobs.removeJob(hash);
  return c.redirect('/');
});

export default router;
