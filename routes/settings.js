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
      message: req.query.message,
      error: req.query.error,
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

    res.redirect(
      '/settings?message=' + encodeURIComponent('Settings saved successfully')
    );
  } catch (error) {
    req.logger.error('Error saving settings:', error);
    res.redirect(
      '/settings?error=' + encodeURIComponent('Failed to save settings')
    );
  }
});

export default router;
