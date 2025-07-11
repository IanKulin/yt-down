import express from 'express';
import { asyncHandler } from '../lib/errorHandler.js';

const router = express.Router();

router.get(
  '/credits',
  asyncHandler(async (req, res) => {
    res.render('credits', {
      currentPage: 'credits',
      pageTitle: 'Credits',
    });
  })
);

export default router;
