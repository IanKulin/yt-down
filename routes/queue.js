import express from 'express';
import { asyncHandler } from '../lib/errorHandler.js';
import { formatFileSize } from '../lib/utils.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const jobs = await req.services.jobs.getJobsForDisplay();

    res.render('queue', {
      queuedJobs: jobs.queued,
      activeJobs: jobs.active,
      formatFileSize,
    });
  })
);

router.post(
  '/job/add',
  asyncHandler(async (req, res) => {
    const { url } = req.body;

    await req.services.jobs.addJob(url);
    res.redirect('/');
  })
);

router.post(
  '/job/delete',
  asyncHandler(async (req, res) => {
    const { hash } = req.body;

    await req.services.jobs.removeJob(hash);
    res.redirect('/');
  })
);

export default router;
