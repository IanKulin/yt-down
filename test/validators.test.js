import { describe, it } from '@std/testing/bdd';
import { assertEquals, assertThrows } from '@std/assert';
import {
  validateFilename,
  validateSettings,
  validateUrl,
} from '../lib/validators.js';
import { ValidationError } from '../lib/errors.js';

describe('Validators', () => {
  describe('validateUrl', () => {
    it('should validate correct URLs', () => {
      const validUrls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'http://example.com',
        'https://example.com/path?param=value',
      ];

      validUrls.forEach((url) => {
        const result = validateUrl(url);
        assertEquals(result, url);
      });
    });

    it('should trim whitespace from URLs', () => {
      const url = '  https://example.com  ';
      const result = validateUrl(url);
      assertEquals(result, 'https://example.com');
    });

    it('should throw ValidationError for invalid URLs', () => {
      const invalidUrls = [
        '',
        '   ',
        'not-a-url',
        'htp://invalid-protocol.com',
        'javascript:alert(1)',
        'ftp://files.example.com/file.txt',
        'ftps://secure.example.com/file.txt',
      ];

      invalidUrls.forEach((url) => {
        assertThrows(() => validateUrl(url), ValidationError);
      });
    });

    it('should throw ValidationError for null/undefined URLs', () => {
      [null, undefined].forEach((url) => {
        assertThrows(() => validateUrl(url), ValidationError);
      });
    });

    it('should throw ValidationError for URLs longer than 2048 characters', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2050);
      assertThrows(() => validateUrl(longUrl), ValidationError);
    });

    it('should accept URLs at the 2048 character limit', () => {
      const baseUrl = 'https://example.com/';
      const maxLengthUrl = baseUrl + 'a'.repeat(2048 - baseUrl.length);
      const result = validateUrl(maxLengthUrl);
      assertEquals(result, maxLengthUrl);
    });
  });

  describe('validateFilename', () => {
    it('should validate correct filenames', () => {
      const validFilenames = [
        'video.mp4',
        'audio.mp3',
        'document.pdf',
        'image.jpg',
        'file_with_underscores.txt',
        'file-with-dashes.mkv',
      ];

      validFilenames.forEach((filename) => {
        const result = validateFilename(filename);
        assertEquals(result, filename);
      });
    });

    it('should trim whitespace from filenames', () => {
      const filename = '  video.mp4  ';
      const result = validateFilename(filename);
      assertEquals(result, 'video.mp4');
    });

    it('should throw ValidationError for directory traversal attempts', () => {
      const maliciousFilenames = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32\\config\\sam',
        'file/with/slashes.txt',
        'file\\with\\backslashes.txt',
        '../file.mp4',
        'file/../other.mp4',
        'file\\..\\other.mp4',
        '..',
        '../',
        '..\\',
      ];

      maliciousFilenames.forEach((filename) => {
        assertThrows(() => validateFilename(filename), ValidationError);
      });
    });

    it('should allow filenames with consecutive dots (fixed behavior)', () => {
      // These filenames with consecutive dots should now be valid after the fix
      const validFilenames = [
        'Series 1 L.P.G..mp4',
        'file..mp4',
        'video..avi',
        'document..pdf',
        'file..with..dots.txt',
        'track..mp3',
      ];

      validFilenames.forEach((filename) => {
        const result = validateFilename(filename);
        assertEquals(
          result,
          filename,
          `Expected "${filename}" to be valid`,
        );
      });
    });

    it('should throw ValidationError for empty/null filenames', () => {
      ['', '   ', null, undefined].forEach((filename) => {
        assertThrows(() => validateFilename(filename), ValidationError);
      });
    });
  });

  describe('validateSettings', () => {
    it('should validate correct settings', () => {
      const validSettings = {
        quality: 'high',
        subtitles: true,
        rateLimit: 1000,
      };

      const result = validateSettings(validSettings);
      assertEquals(result, validSettings);
    });

    it('should validate settings with missing optional fields', () => {
      const partialSettings = {
        quality: 'medium',
      };

      const result = validateSettings(partialSettings);
      assertEquals(result, partialSettings);
    });

    it('should throw ValidationError for invalid settings object', () => {
      [null, undefined, 'string', 123, []].forEach((settings) => {
        assertThrows(() => validateSettings(settings), ValidationError);
      });
    });

    it('should throw ValidationError for invalid quality type', () => {
      const invalidSettings = {
        quality: 123,
      };

      assertThrows(() => validateSettings(invalidSettings), ValidationError);
    });

    it('should throw ValidationError for invalid subtitles type', () => {
      const invalidSettings = {
        subtitles: 'yes',
      };

      assertThrows(() => validateSettings(invalidSettings), ValidationError);
    });

    it('should throw ValidationError for invalid rateLimit', () => {
      const invalidSettings = [
        { rateLimit: 'fast' },
        { rateLimit: -1 },
        { rateLimit: -100 },
        { rateLimit: 'invalid-rate' },
        { rateLimit: '999X' },
      ];

      invalidSettings.forEach((settings) => {
        assertThrows(() => validateSettings(settings), ValidationError);
      });
    });

    it('should allow zero rateLimit', () => {
      const settings = {
        rateLimit: 0,
      };

      const result = validateSettings(settings);
      assertEquals(result, settings);
    });

    it('should validate string rateLimit values used by the application', () => {
      const validRateLimits = ['no-limit', '180K', '360K', '720K', '1440K'];

      validRateLimits.forEach((rateLimit) => {
        const settings = { rateLimit };
        const result = validateSettings(settings);
        assertEquals(result, settings);
      });
    });

    it('should throw ValidationError for invalid string rateLimit values', () => {
      const invalidRateLimits = [
        'invalid-rate',
        '999X',
        'fast',
        'slow',
        '100MB',
      ];

      invalidRateLimits.forEach((rateLimit) => {
        const settings = { rateLimit };
        assertThrows(() => validateSettings(settings), ValidationError);
      });
    });
  });
});
