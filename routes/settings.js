import express from 'express';
import { asyncHandler } from '../lib/errorHandler.js';

const router = express.Router();

router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const { settings, options } =
      await req.services.settings.getSettingsForDisplay();

    res.render('settings', {
      settings,
      options,
    });
  })
);

export default router;
