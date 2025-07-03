import express from 'express';
import {
  loadSettings,
  saveSettings,
  getAvailableOptions,
} from '../lib/settings.js';

const router = express.Router();

router.get('/settings', async (req, res) => {
  try {
    const settings = await loadSettings();
    const options = getAvailableOptions();
    res.render('settings', {
      settings,
      options,
    });
  } catch (error) {
    req.logger.error('Error rendering settings page:', error);
    res.status(500).send('Server error');
  }
});

router.post('/settings', async (req, res) => {
  try {
    const { videoQuality, subtitles, autoSubs, subLanguage, rateLimit } =
      req.body;

    const settings = {
      videoQuality: videoQuality || 'no-limit',
      subtitles: subtitles === 'on',
      autoSubs: autoSubs === 'on',
      subLanguage: subLanguage || 'en',
      rateLimit: rateLimit || 'no-limit',
    };

    await saveSettings(settings);
    req.logger.info('Settings updated:', settings);

    req.session.flashMessage = 'Settings saved successfully';
    req.session.flashType = 'success';
    res.redirect('/settings');
  } catch (error) {
    req.logger.error('Error saving settings:', error);
    req.session.flashMessage = 'Failed to save settings';
    req.session.flashType = 'error';
    res.redirect('/settings');
  }
});

export default router;
