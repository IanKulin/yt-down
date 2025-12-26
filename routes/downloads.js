import { Hono } from 'hono';
import { formatFileSize } from '../lib/utils.js';
import { renderWithContext } from '../lib/ejsHelper.js';

const router = new Hono();

router.get('/downloads', async (c) => {
  const downloadedFiles = await c
    .get('services')
    .downloads.getDownloadedFiles();

  const html = await renderWithContext(c, 'downloads', {
    downloadedFiles,
    formatFileSize,
  });

  return c.html(html);
});

router.get('/download/:filename', async (c) => {
  const filename = c.req.param('filename');
  const fileInfo = await c
    .get('services')
    .downloads.prepareFileDownload(filename);

  // Set appropriate headers
  Object.entries(fileInfo.headers).forEach(([key, value]) => {
    c.header(key, value);
  });

  // Open file and stream using Deno
  const file = await Deno.open(fileInfo.filePath, { read: true });
  return c.body(file.readable);
});

router.post('/file/delete', async (c) => {
  const body = await c.req.parseBody();
  const { filename } = body;
  await c.get('services').downloads.deleteFile(filename);
  return c.redirect('/downloads');
});

export default router;
