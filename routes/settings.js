import { Hono } from 'hono';
import { renderWithContext } from '../lib/ejsHelper.js';

const router = new Hono();

router.get('/settings', async (c) => {
  const { settings, options } = await c
    .get('services')
    .settings.getSettingsForDisplay();

  const html = await renderWithContext(c, 'settings', {
    settings,
    options,
  });

  return c.html(html);
});

export default router;
