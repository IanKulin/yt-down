import express from 'express';
import { asyncHandler } from '../lib/errorHandler.js';
import { formatFileSize } from '../lib/utils.js';

const router = express.Router();

router.get(
  '/downloads',
  asyncHandler(async (req, res) => {
    const downloadedFiles = await req.services.downloads.getDownloadedFiles();

    res.render('downloads', {
      downloadedFiles,
      formatFileSize,
    });
  })
);

router.get(
  '/download/:filename',
  asyncHandler(async (req, res) => {
    const filename = req.params.filename;
    const fileInfo = await req.services.downloads.prepareFileDownload(filename);

    // Set appropriate headers
    Object.entries(fileInfo.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    res.sendFile(fileInfo.filePath);
  })
);

router.post(
  '/file/delete',
  asyncHandler(async (req, res) => {
    const { filename } = req.body;
    await req.services.downloads.deleteFile(filename);
    res.redirect('/downloads');
  })
);

export default router;
