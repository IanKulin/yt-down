import express from 'express';
import { asyncHandler } from '../lib/errorHandler.js';

const router = express.Router();

router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const { settings, options } = await req.services.settings.getSettingsForDisplay();
    
    res.render('settings', {
      settings,
      options,
    });
  })
);

router.post(
  '/settings',
  asyncHandler(async (req, res) => {
    const result = await req.services.settings.updateSettings(req.body);

    req.session.flashMessage = result.message;
    req.session.flashType = result.type;
    res.redirect('/settings');
  })
);

export default router;
