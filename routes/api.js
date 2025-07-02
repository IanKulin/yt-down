import express from 'express';
import { getQueuedUrls, getActiveUrls, getFinishedUrls } from '../lib/utils.js';

const router = express.Router();

router.get('/api/state', async (req, res) => {
  try {
    const [queuedUrls, activeUrls, finishedUrls] = await Promise.all([
      getQueuedUrls(req.logger),
      getActiveUrls(req.logger),
      getFinishedUrls(req.logger),
    ]);

    const state = {
      queued: queuedUrls,
      active: activeUrls,
      finished: finishedUrls,
      counts: {
        queued: queuedUrls.length,
        active: activeUrls.length,
        finished: finishedUrls.length,
        total: queuedUrls.length + activeUrls.length + finishedUrls.length,
      },
      processor: req.queueProcessor.getStatus(),
      timestamp: new Date().toISOString(),
    };

    res.json(state);
  } catch (error) {
    req.logger.error('Error getting state:', error);
    res.status(500).json({
      error: 'Failed to get state',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
