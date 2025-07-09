import { ValidationError } from './errors.js';

/* global URL */

const validateUrl = (url) => {
  if (!url || typeof url !== 'string') {
    throw new ValidationError('URL is required');
  }

  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    throw new ValidationError('URL cannot be empty');
  }

  try {
    const parsedUrl = new URL(trimmedUrl);
    // Only allow common safe protocols
    const allowedProtocols = ['http:', 'https:', 'ftp:', 'ftps:'];
    if (!allowedProtocols.includes(parsedUrl.protocol)) {
      throw new ValidationError('Please enter a valid URL');
    }
  } catch {
    throw new ValidationError('Please enter a valid URL');
  }

  return trimmedUrl;
};

const validateFilename = (filename) => {
  if (!filename || typeof filename !== 'string') {
    throw new ValidationError('Filename is required');
  }

  const trimmedFilename = filename.trim();
  if (!trimmedFilename) {
    throw new ValidationError('Filename cannot be empty');
  }

  // Check for directory traversal attempts
  if (
    trimmedFilename.includes('..') ||
    trimmedFilename.includes('/') ||
    trimmedFilename.includes('\\')
  ) {
    throw new ValidationError('Invalid filename provided');
  }

  return trimmedFilename;
};

const validateSettings = (settings) => {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new ValidationError('Settings must be an object');
  }

  // Validate quality if provided
  if (settings.quality && typeof settings.quality !== 'string') {
    throw new ValidationError('Quality must be a string');
  }

  // Validate subtitles if provided
  if (
    settings.subtitles !== undefined &&
    typeof settings.subtitles !== 'boolean'
  ) {
    throw new ValidationError('Subtitles must be a boolean');
  }

  // Validate rateLimit if provided
  if (settings.rateLimit !== undefined) {
    const validRateLimits = ['no-limit', '180K', '360K', '720K', '1440K'];
    const isValidNumber =
      typeof settings.rateLimit === 'number' && settings.rateLimit >= 0;
    const isValidString =
      typeof settings.rateLimit === 'string' &&
      validRateLimits.includes(settings.rateLimit);

    if (!isValidNumber && !isValidString) {
      throw new ValidationError(
        'Rate limit must be a non-negative number or one of: ' +
          validRateLimits.join(', ')
      );
    }
  }

  return settings;
};

export { validateUrl, validateFilename, validateSettings };
