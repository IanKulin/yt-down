import { Hono } from 'hono';
import { renderWithContext } from '../lib/ejsHelper.js';

const router = new Hono();

router.get('/logs', async (c) => {
  const lines = await c.get('services').logs.getTailLines(500);

  const html = await renderWithContext(c, 'logs', { lines });

  return c.html(html);
});

export default router;
