import express from 'express';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
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
  } catch (error) {
    req.logger.error('Error rendering queue page:', error);
    res.status(500).send('Server error');
  }
});

router.post('/job/add', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || !url.trim()) {
      req.session.flashMessage = 'Please enter a valid URL';
      req.session.flashType = 'error';
      return res.redirect('/');
    }

    const trimmedUrl = url.trim();

    // Create job using JobManager
    await req.jobManager.createJob(trimmedUrl);

    req.session.flashMessage = 'Download job added to queue successfully';
    req.session.flashType = 'success';
    res.redirect('/');
  } catch (error) {
    if (error.message === 'Job already exists') {
      req.session.flashMessage = 'Download job already exists in queue';
      req.session.flashType = 'error';
    } else {
      req.logger.error('Error adding URL to queue:', error);
      req.session.flashMessage = 'Failed to add download job to queue';
      req.session.flashType = 'error';
    }
    res.redirect('/');
  }
});

router.post('/job/delete', async (req, res) => {
  try {
    const { hash } = req.body;

    if (!hash || !hash.trim()) {
      req.session.flashMessage = 'Invalid hash provided';
      req.session.flashType = 'error';
      return res.redirect('/');
    }

    const trimmedHash = hash.trim();

    // Delete job using JobManager
    await req.jobManager.deleteJob(trimmedHash);

    req.session.flashMessage = 'Download job deleted from queue successfully';
    req.session.flashType = 'success';
    res.redirect('/');
  } catch (error) {
    if (error.message.includes('Job not found')) {
      req.session.flashMessage = 'Download job not found in queue';
      req.session.flashType = 'error';
    } else {
      req.logger.error('Error deleting URL from queue:', error);
      req.session.flashMessage = 'Failed to delete download job from queue';
      req.session.flashType = 'error';
    }
    res.redirect('/');
  }
});

export default router;
