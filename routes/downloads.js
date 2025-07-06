import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import {
  DOWNLOADS_FINISHED_DIR,
  getDownloadedFiles,
  formatFileSize,
} from '../lib/utils.js';

const router = express.Router();

router.get('/downloads', async (req, res) => {
  try {
    const downloadedFiles = await getDownloadedFiles(req.logger);
    res.render('downloads', {
      downloadedFiles,
      formatFileSize,
    });
  } catch (_error) {
    req.logger.error('Error rendering downloads page:', _error);
    res.status(500).send('Server error');
  }
});

router.get('/download/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(DOWNLOADS_FINISHED_DIR, filename);

    // Security check: ensure the file is within the downloads directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDownloadsDir = path.resolve(DOWNLOADS_FINISHED_DIR);

    if (!resolvedPath.startsWith(resolvedDownloadsDir)) {
      return res.status(403).send('Access denied');
    }

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).send('File not found');
    }

    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(filePath);
  } catch (error) {
    req.logger.error('Error downloading file:', error);
    res.status(500).send('Server error');
  }
});

router.post('/file/delete', async (req, res) => {
  try {
    const { filename } = req.body;

    if (!filename || !filename.trim()) {
      req.session.flashMessage = 'Invalid filename provided';
      req.session.flashType = 'error';
      return res.redirect('/downloads');
    }

    const trimmedFilename = filename.trim();
    const filePath = path.join(DOWNLOADS_FINISHED_DIR, trimmedFilename);

    // Security check: ensure the file is within the downloads directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDownloadsDir = path.resolve(DOWNLOADS_FINISHED_DIR);

    if (!resolvedPath.startsWith(resolvedDownloadsDir)) {
      req.session.flashMessage = 'Access denied';
      req.session.flashType = 'error';
      return res.redirect('/downloads');
    }

    try {
      await fs.unlink(filePath);
      req.logger.info(`Deleted file: ${trimmedFilename}`);

      req.session.flashMessage = 'File deleted successfully';
      req.session.flashType = 'success';
      res.redirect('/downloads');
    } catch (error) {
      if (error.code === 'ENOENT') {
        req.session.flashMessage = 'File not found';
        req.session.flashType = 'error';
        return res.redirect('/downloads');
      }
      throw error;
    }
  } catch (error) {
    req.logger.error('Error deleting file:', error);
    req.session.flashMessage = 'Failed to delete file';
    req.session.flashType = 'error';
    res.redirect('/downloads');
  }
});

export default router;
