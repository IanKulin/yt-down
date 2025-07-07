import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import {
  DOWNLOADS_FINISHED_DIR,
  getDownloadedFiles,
  formatFileSize,
} from '../lib/utils.js';
import { asyncHandler } from '../lib/errorHandler.js';
import { validateFilename } from '../lib/validators.js';
import { NotFoundError, ForbiddenError } from '../lib/errors.js';

const router = express.Router();

router.get(
  '/downloads',
  asyncHandler(async (req, res) => {
    const downloadedFiles = await getDownloadedFiles(req.logger);
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
    const validatedFilename = validateFilename(filename);
    const filePath = path.join(DOWNLOADS_FINISHED_DIR, validatedFilename);

    // Security check: ensure the file is within the downloads directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDownloadsDir = path.resolve(DOWNLOADS_FINISHED_DIR);

    if (!resolvedPath.startsWith(resolvedDownloadsDir)) {
      throw new ForbiddenError('Access denied');
    }

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundError('File not found');
    }

    // Set appropriate headers
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${validatedFilename}"`
    );
    res.sendFile(filePath);
  })
);

router.post(
  '/file/delete',
  asyncHandler(async (req, res) => {
    const { filename } = req.body;
    const validatedFilename = validateFilename(filename);
    const filePath = path.join(DOWNLOADS_FINISHED_DIR, validatedFilename);

    // Security check: ensure the file is within the downloads directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDownloadsDir = path.resolve(DOWNLOADS_FINISHED_DIR);

    if (!resolvedPath.startsWith(resolvedDownloadsDir)) {
      throw new ForbiddenError('Access denied');
    }

    try {
      await fs.unlink(filePath);
      req.logger.info(`Deleted file: ${validatedFilename}`);

      req.session.flashMessage = 'File deleted successfully';
      req.session.flashType = 'success';
      res.redirect('/downloads');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new NotFoundError('File not found');
      }
      throw error;
    }
  })
);

export default router;
