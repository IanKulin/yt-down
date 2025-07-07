import {
  loadSettings,
  saveSettings,
  getAvailableOptions,
} from '../settings.js';
import { validateSettings } from '../validators.js';

/**
 * SettingsService handles all settings-related business logic
 * Centralizes settings operations and validation
 */
export class SettingsService {
  constructor({ logger }) {
    this.logger = logger;
  }

  /**
   * Get current settings
   * @returns {Object} Current settings object
   */
  async getSettings() {
    try {
      const settings = await loadSettings();
      this.logger?.debug('Settings loaded successfully');
      return settings;
    } catch (error) {
      this.logger?.error('Error loading settings:', error);
      throw error;
    }
  }

  /**
   * Get available options for settings
   * @returns {Object} Available options for each setting
   */
  getAvailableOptions() {
    try {
      const options = getAvailableOptions();
      this.logger?.debug('Available options retrieved');
      return options;
    } catch (error) {
      this.logger?.error('Error getting available options:', error);
      throw error;
    }
  }

  /**
   * Update settings with validation
   * @param {Object} settingsData - Raw settings data from request
   * @returns {Object} Success result with updated settings
   */
  async updateSettings(settingsData) {
    try {
      // Normalize and structure the settings data
      const settings = this.normalizeSettingsData(settingsData);

      // Validate the settings
      const validatedSettings = validateSettings(settings);

      // Save the validated settings
      await saveSettings(validatedSettings);

      this.logger?.info('Settings updated successfully:', validatedSettings);

      return {
        success: true,
        message: 'Settings saved successfully',
        type: 'success',
        settings: validatedSettings,
      };
    } catch (error) {
      this.logger?.error('Error updating settings:', error);
      throw error;
    }
  }

  /**
   * Normalize settings data from different input formats (web form vs API)
   * @param {Object} rawData - Raw settings data
   * @returns {Object} Normalized settings object
   */
  normalizeSettingsData(rawData) {
    const { videoQuality, subtitles, autoSubs, subLanguage, rateLimit } =
      rawData;

    return {
      videoQuality: videoQuality || 'no-limit',
      subtitles: this.normalizeBoolean(subtitles),
      autoSubs: this.normalizeBoolean(autoSubs),
      subLanguage: subLanguage || 'en',
      rateLimit: rateLimit || 'no-limit',
    };
  }

  /**
   * Normalize boolean values from different input sources
   * Handles form checkboxes ('on'), API booleans (true/false), and string representations
   * @param {*} value - The value to normalize
   * @returns {boolean} Normalized boolean value
   */
  normalizeBoolean(value) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      return value === 'on' || value === 'true';
    }

    return Boolean(value);
  }

  /**
   * Get settings formatted for template rendering
   * @returns {Object} Settings and options for template
   */
  async getSettingsForDisplay() {
    try {
      const [settings, options] = await Promise.all([
        this.getSettings(),
        Promise.resolve(this.getAvailableOptions()),
      ]);

      return {
        settings,
        options,
      };
    } catch (error) {
      this.logger?.error('Error getting settings for display:', error);
      throw error;
    }
  }

  /**
   * Reset settings to default values
   * @returns {Object} Success result with default settings
   */
  async resetToDefaults() {
    const defaultSettings = {
      videoQuality: 'no-limit',
      subtitles: false,
      autoSubs: false,
      subLanguage: 'en',
      rateLimit: 'no-limit',
    };

    try {
      const validatedSettings = validateSettings(defaultSettings);
      await saveSettings(validatedSettings);

      this.logger?.info('Settings reset to defaults:', validatedSettings);

      return {
        success: true,
        message: 'Settings reset to defaults successfully',
        type: 'success',
        settings: validatedSettings,
      };
    } catch (error) {
      this.logger?.error('Error resetting settings to defaults:', error);
      throw error;
    }
  }

  /**
   * Validate settings without saving
   * @param {Object} settingsData - Settings data to validate
   * @returns {Object} Validation result
   */
  validateSettingsData(settingsData) {
    try {
      const normalizedSettings = this.normalizeSettingsData(settingsData);
      const validatedSettings = validateSettings(normalizedSettings);

      return {
        valid: true,
        settings: validatedSettings,
        errors: [],
      };
    } catch (error) {
      this.logger?.warn('Settings validation failed:', error);

      return {
        valid: false,
        settings: null,
        errors: [error.message],
      };
    }
  }

  /**
   * Get a specific setting value
   * @param {string} key - The setting key to retrieve
   * @returns {*} The setting value
   */
  async getSetting(key) {
    const settings = await this.getSettings();
    return settings[key];
  }

  /**
   * Update a single setting
   * @param {string} key - The setting key to update
   * @param {*} value - The new value
   * @returns {Object} Success result with updated settings
   */
  async updateSetting(key, value) {
    const currentSettings = await this.getSettings();
    const updatedSettings = {
      ...currentSettings,
      [key]: value,
    };

    return await this.updateSettings(updatedSettings);
  }
}
