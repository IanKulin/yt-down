import express from 'express';
import { asyncHandler } from '../lib/errorHandler.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const jobs = await req.services.jobs.getJobsForDisplay();

    res.render('queue', {
      queuedJobs: jobs.queued,
      activeJobs: jobs.active,
    });
  })
);

router.post(
  '/job/add',
  asyncHandler(async (req, res) => {
    const { url } = req.body;

    const result = await req.services.jobs.addJob(url);

    req.session.flashMessage = result.message;
    req.session.flashType = result.type;
    res.redirect('/');
  })
);

router.post(
  '/job/delete',
  asyncHandler(async (req, res) => {
    const { hash } = req.body;

    const result = await req.services.jobs.removeJob(hash);

    req.session.flashMessage = result.message;
    req.session.flashType = result.type;
    res.redirect('/');
  })
);

export default router;
