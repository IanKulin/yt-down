import express from 'express';
import { asyncHandler } from '../lib/errorHandler.js';
import { validateUrl } from '../lib/validators.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../lib/errors.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [queuedJobs, activeJobs] = await Promise.all([
      req.jobManager.getQueuedJobs(),
      req.jobManager.getActiveJobs(),
    ]);

    // Convert Job objects to the format expected by the template
    const formattedQueuedJobs = queuedJobs.map((job) => job.toApiFormat());
    const formattedActiveJobs = activeJobs.map((job) => job.toApiFormat());

    res.render('queue', {
      queuedJobs: formattedQueuedJobs,
      activeJobs: formattedActiveJobs,
    });
  })
);

router.post(
  '/job/add',
  asyncHandler(async (req, res) => {
    const { url } = req.body;

    // Validate URL
    const validatedUrl = validateUrl(url);

    try {
      // Create job using JobManager
      await req.jobManager.createJob(validatedUrl);

      req.session.flashMessage = 'Download job added to queue successfully';
      req.session.flashType = 'success';
      res.redirect('/');
    } catch (error) {
      if (error.message === 'Job already exists') {
        throw new ConflictError('Download job already exists in queue');
      }
      throw error;
    }
  })
);

router.post(
  '/job/delete',
  asyncHandler(async (req, res) => {
    const { hash } = req.body;

    if (!hash || !hash.trim()) {
      throw new ValidationError('Invalid hash provided');
    }

    const trimmedHash = hash.trim();

    try {
      // Delete job using JobManager
      await req.jobManager.deleteJob(trimmedHash);

      req.session.flashMessage = 'Download job deleted from queue successfully';
      req.session.flashType = 'success';
      res.redirect('/');
    } catch (error) {
      if (error.message.includes('Job not found')) {
        throw new NotFoundError('Download job not found in queue');
      }
      throw error;
    }
  })
);

export default router;
