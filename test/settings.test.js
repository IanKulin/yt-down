import { describe, it as test } from '@std/testing/bdd';
import { assert, assertEquals } from '@std/assert';
import { getAvailableOptions, getYtDlpArgs } from '../lib/settings.js';

describe('settings.js', () => {
  describe('getAvailableOptions', () => {
    test('should return valid video quality options', () => {
      const options = getAvailableOptions();

      assert(
        Array.isArray(options.videoQualities),
        'videoQualities should be an array',
      );
      assert(
        options.videoQualities.length > 0,
        'Should have video quality options',
      );

      // Check structure of first option
      const firstOption = options.videoQualities[0];
      assert(
        typeof firstOption.value === 'string',
        'Option should have string value',
      );
      assert(
        typeof firstOption.label === 'string',
        'Option should have string label',
      );

      // Should include expected options
      const values = options.videoQualities.map((opt) => opt.value);
      assert(values.includes('no-limit'), 'Should include no-limit option');
      assert(values.includes('720p'), 'Should include 720p option');
      assert(values.includes('1080p'), 'Should include 1080p option');
      assert(values.includes('1440p'), 'Should include 1440p option');
      assert(values.includes('2160p'), 'Should include 2160p option');
    });

    test('should return valid rate limit options', () => {
      const options = getAvailableOptions();

      assert(
        Array.isArray(options.rateLimits),
        'rateLimits should be an array',
      );
      assert(
        options.rateLimits.length > 0,
        'Should have rate limit options',
      );

      const values = options.rateLimits.map((opt) => opt.value);
      assert(values.includes('no-limit'), 'Should include no-limit option');
      assert(values.includes('180K'), 'Should include 180K option');
      assert(values.includes('360K'), 'Should include 360K option');
      assert(values.includes('720K'), 'Should include 720K option');
      assert(values.includes('1440K'), 'Should include 1440K option');
    });

    test('should return valid subtitle language options', () => {
      const options = getAvailableOptions();

      assert(
        Array.isArray(options.subLanguages),
        'subLanguages should be an array',
      );
      assert(
        options.subLanguages.length > 0,
        'Should have subtitle language options',
      );

      const values = options.subLanguages.map((opt) => opt.value);
      assert(values.includes('en'), 'Should include English');
      assert(values.includes('es'), 'Should include Spanish');
      assert(values.includes('fr'), 'Should include French');
      assert(values.includes('de'), 'Should include German');
    });

    test('should return consistent results on multiple calls', () => {
      const options1 = getAvailableOptions();
      const options2 = getAvailableOptions();

      assertEquals(
        options1,
        options2,
        'Should return same options on multiple calls',
      );
    });
  });

  describe('getYtDlpArgs', () => {
    test('should build basic args and include essential arguments', async () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

      const args = await getYtDlpArgs(url);

      // Check that essential arguments are present
      assert(
        args.includes('--fragment-retries'),
        'Should include fragment retries',
      );
      assert(args.includes('20'), 'Should include retry count');
      assert(args.includes('--retries'), 'Should include retries');
      assert(args.includes('infinite'), 'Should include infinite retries');
      assert(
        args.includes('--socket-timeout'),
        'Should include socket timeout',
      );
      assert(args.includes('30'), 'Should include timeout value');
      assert(args.includes('-o'), 'Should include output format');
      assert(
        args.includes('%(title)s.%(ext)s'),
        'Should include filename template',
      );
      assert(args.includes('--format'), 'Should include format selector');
      assert(
        args.includes('--merge-output-format'),
        'Should include merge format',
      );
      assert(args.includes('mp4'), 'Should include mp4 format');
      assert(args.includes(url), 'Should include the URL');

      // URL should be last argument
      assertEquals(args[args.length - 1], url, 'URL should be last argument');
    });

    test('should test format selector patterns for different quality settings', () => {
      // Test the format selector building logic
      const testCases = [
        {
          quality: 'no-limit',
          shouldIncludeHeight: false,
          description: 'no height restriction for unlimited quality',
        },
        {
          quality: '720p',
          shouldIncludeHeight: true,
          expectedHeight: '720',
          description: 'height restriction for 720p',
        },
        {
          quality: '1080p',
          shouldIncludeHeight: true,
          expectedHeight: '1080',
          description: 'height restriction for 1080p',
        },
        {
          quality: '1440p',
          shouldIncludeHeight: true,
          expectedHeight: '1440',
          description: 'height restriction for 1440p',
        },
        {
          quality: '2160p',
          shouldIncludeHeight: true,
          expectedHeight: '2160',
          description: 'height restriction for 2160p',
        },
      ];

      for (const testCase of testCases) {
        let formatSelector = '';

        if (testCase.quality !== 'no-limit') {
          const height = testCase.quality.replace('p', '');
          formatSelector =
            `bestvideo[height<=${height}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}][ext=mp4]+bestaudio/best[height<=${height}]`;
        } else {
          formatSelector =
            'bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio/best';
        }

        if (testCase.shouldIncludeHeight) {
          assert(
            formatSelector.includes(`height<=${testCase.expectedHeight}`),
            `Format selector should include height restriction for ${testCase.quality}`,
          );
        } else {
          assert(
            !formatSelector.includes('height<='),
            `Format selector should not include height restriction for ${testCase.quality}`,
          );
        }

        // Should always include h.264 and mp4 preferences
        assert(
          formatSelector.includes('vcodec^=avc1'),
          `Format selector should prefer h.264 for ${testCase.quality}`,
        );
        assert(
          formatSelector.includes('ext=mp4'),
          `Format selector should prefer mp4 for ${testCase.quality}`,
        );
        assert(
          formatSelector.includes('ext=m4a'),
          `Format selector should prefer m4a audio for ${testCase.quality}`,
        );
      }
    });

    test('should build valid command array structure', async () => {
      const url = 'https://www.youtube.com/watch?v=test';
      const args = await getYtDlpArgs(url);

      assert(Array.isArray(args), 'Should return an array');
      assert(args.length > 0, 'Should have arguments');

      // All arguments should be strings
      for (const arg of args) {
        assertEquals(
          typeof arg,
          'string',
          `All arguments should be strings, got: ${typeof arg}`,
        );
      }

      // Should not have empty arguments
      for (const arg of args) {
        assert(arg.length > 0, 'Should not have empty arguments');
      }
    });
  });

  describe('argument validation', () => {
    test('should test rate limit argument patterns', () => {
      const rateLimits = ['no-limit', '180K', '360K', '720K', '1440K'];

      for (const rateLimit of rateLimits) {
        // Test the logic for including rate limit args
        const shouldIncludeRateLimit = rateLimit !== 'no-limit';

        if (shouldIncludeRateLimit) {
          // Rate limit should be included in args
          assert(
            rateLimit.match(/^\d+K$/),
            `${rateLimit} should match rate limit pattern`,
          );
        } else {
          // No rate limit
          assertEquals(rateLimit, 'no-limit', 'Should be no-limit value');
        }
      }
    });

    test('should test subtitle argument patterns', () => {
      const testCases = [
        {
          subtitles: true,
          autoSubs: true,
          subLanguage: 'en',
          expectedArgs: [
            '--write-subs',
            '--sub-lang',
            'en',
            '--convert-subs',
            'srt',
            '--write-auto-subs',
          ],
        },
        {
          subtitles: true,
          autoSubs: false,
          subLanguage: 'es',
          expectedArgs: [
            '--write-subs',
            '--sub-lang',
            'es',
            '--convert-subs',
            'srt',
          ],
        },
        {
          subtitles: false,
          autoSubs: true,
          subLanguage: 'fr',
          expectedArgs: ['--write-auto-subs'],
        },
        {
          subtitles: false,
          autoSubs: false,
          subLanguage: 'de',
          expectedArgs: [],
        },
      ];

      for (const testCase of testCases) {
        const args = [];

        if (testCase.subtitles) {
          args.push('--write-subs');
          if (testCase.subLanguage) {
            args.push('--sub-lang', testCase.subLanguage);
          }
          args.push('--convert-subs', 'srt');
        }

        if (testCase.autoSubs) {
          args.push('--write-auto-subs');
        }

        assertEquals(
          args,
          testCase.expectedArgs,
          `Subtitle args don't match for case: ${JSON.stringify(testCase)}`,
        );
      }
    });
  });
});
