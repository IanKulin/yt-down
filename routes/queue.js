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
      // First, check if the job exists and get its current state
      const job = await req.jobManager.getJob(trimmedHash);
      if (!job) {
        throw new NotFoundError('Download job not found in queue');
      }

      // If the job is active, cancel the download process (which also deletes the job)
      if (job.state === 'active') {
        try {
          await req.queueProcessor.cancelDownload(trimmedHash);
          req.session.flashMessage = 'Download cancelled successfully';
          req.session.flashType = 'success';
        } catch (cancelError) {
          req.logger?.error(`Failed to cancel download for ${trimmedHash}:`, cancelError);
          // If cancellation fails, still try to delete the job
          await req.jobManager.deleteJob(trimmedHash);
          req.session.flashMessage = 'Download job deleted (cancellation failed, but job removed)';
          req.session.flashType = 'warning';
        }
      } else {
        // Job is not active, just delete it normally
        await req.jobManager.deleteJob(trimmedHash);
        req.session.flashMessage = 'Download job deleted from queue successfully';
        req.session.flashType = 'success';
      }

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
