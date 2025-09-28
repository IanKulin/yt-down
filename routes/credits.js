import { Hono } from 'hono';
import { renderWithContext } from '../lib/ejsHelper.js';

const router = new Hono();

router.get('/credits', async (c) => {
  const html = await renderWithContext(c, 'credits', {
    currentPage: 'credits',
    pageTitle: 'Credits',
  });

  return c.html(html);
});

export default router;
