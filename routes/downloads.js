import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import {
  DOWNLOADS_DIR,
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
      message: req.query.message,
      error: req.query.error,
    });
  } catch (_error) {
    req.logger.error('Error rendering downloads page:', _error);
    res.status(500).send('Server error');
  }
});

router.get('/download/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(DOWNLOADS_DIR, filename);

    // Security check: ensure the file is within the downloads directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDownloadsDir = path.resolve(DOWNLOADS_DIR);

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
      return res.redirect(
        '/downloads?error=' + encodeURIComponent('Invalid filename provided')
      );
    }

    const trimmedFilename = filename.trim();
    const filePath = path.join(DOWNLOADS_DIR, trimmedFilename);

    // Security check: ensure the file is within the downloads directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDownloadsDir = path.resolve(DOWNLOADS_DIR);

    if (!resolvedPath.startsWith(resolvedDownloadsDir)) {
      return res.redirect(
        '/downloads?error=' + encodeURIComponent('Access denied')
      );
    }

    try {
      await fs.unlink(filePath);
      req.logger.info(`Deleted file: ${trimmedFilename}`);

      res.redirect(
        '/downloads?message=' + encodeURIComponent('File deleted successfully')
      );
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.redirect(
          '/downloads?error=' + encodeURIComponent('File not found')
        );
      }
      throw error;
    }
  } catch (error) {
    req.logger.error('Error deleting file:', error);
    res.redirect(
      '/downloads?error=' + encodeURIComponent('Failed to delete file')
    );
  }
});

export default router;
