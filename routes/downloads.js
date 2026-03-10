import { Hono } from 'hono';
import { formatFileSize } from '../lib/utils.js';
import { renderWithContext } from '../lib/ejsHelper.js';
import { createReadStream } from 'fs';

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

router.get('/download/', async (c) => {
  const files = await c.get('services').downloads.getDownloadedFiles();

  const rows = files
    .map((f) => {
      const date = new Date(f.modified)
        .toISOString()
        .slice(0, 16)
        .replace('T', ' ');
      const size = formatFileSize(f.size);
      const name = f.name;
      return `<a href="/download/${encodeURIComponent(name)}">${name}</a>${' '.repeat(Math.max(1, 50 - name.length))}${date}  ${size}`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Index of /download/</title>
</head>
<body>
<h1>Index of /download/</h1>
<hr>
<pre>
<a href="../">../</a>
${rows}
</pre>
<hr>
</body>
</html>`;

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

  const fileStream = createReadStream(fileInfo.filePath);
  return c.body(fileStream);
});

router.post('/file/delete', async (c) => {
  const body = await c.req.parseBody();
  const { filename } = body;
  await c.get('services').downloads.deleteFile(filename);
  return c.redirect('/downloads');
});

export default router;
