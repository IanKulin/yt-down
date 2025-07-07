import express from 'express';
import {
  loadSettings,
  saveSettings,
  getAvailableOptions,
} from '../lib/settings.js';
import { asyncHandler } from '../lib/errorHandler.js';
import { validateSettings } from '../lib/validators.js';

const router = express.Router();

router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const settings = await loadSettings();
    const options = getAvailableOptions();
    res.render('settings', {
      settings,
      options,
    });
  })
);

router.post(
  '/settings',
  asyncHandler(async (req, res) => {
    const { videoQuality, subtitles, autoSubs, subLanguage, rateLimit } =
      req.body;

    const settings = {
      videoQuality: videoQuality || 'no-limit',
      subtitles: subtitles === 'on',
      autoSubs: autoSubs === 'on',
      subLanguage: subLanguage || 'en',
      rateLimit: rateLimit || 'no-limit',
    };

    const validatedSettings = validateSettings(settings);
    await saveSettings(validatedSettings);
    req.logger.info('Settings updated:', validatedSettings);

    req.session.flashMessage = 'Settings saved successfully';
    req.session.flashType = 'success';
    res.redirect('/settings');
  })
);

export default router;
