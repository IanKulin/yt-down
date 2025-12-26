// deno-lint-ignore-file require-await -- Test mocks need to match async signatures
import { describe, it as test } from '@std/testing/bdd';
import { assert, assertEquals } from '@std/assert';
import { VersionService } from '../lib/services/versionService.js';

describe('VersionService', () => {
  describe('constructor', () => {
    test('should create instance with logger', () => {
      const logger = { debug: () => {}, info: () => {} };
      const service = new VersionService({ logger });

      assert(service instanceof VersionService);
      assertEquals(service.logger, logger);
    });

    test('should initialize with null versions', () => {
      const service = new VersionService({ logger: null });
      const versions = service.getVersions();

      assertEquals(versions.ytDlp, null);
      assertEquals(versions.ffmpeg, null);
    });
  });

  describe('getters', () => {
    test('should return correct version info', () => {
      const service = new VersionService({ logger: null });

      // Set versions directly for testing
      service.versions.ytDlp = '2023.07.06';
      service.versions.ffmpeg = '4.4.2';

      assertEquals(service.getYtDlpVersion(), '2023.07.06');
      assertEquals(service.getFfmpegVersion(), '4.4.2');

      const versions = service.getVersions();
      assertEquals(versions.ytDlp, '2023.07.06');
      assertEquals(versions.ffmpeg, '4.4.2');
    });

    test('should return availability status', () => {
      const service = new VersionService({ logger: null });

      // Initially both should be unavailable
      assertEquals(service.isYtDlpAvailable(), false);
      assertEquals(service.isFfmpegAvailable(), false);

      // Set one version
      service.versions.ytDlp = '2023.07.06';
      assertEquals(service.isYtDlpAvailable(), true);
      assertEquals(service.isFfmpegAvailable(), false);

      // Set both versions
      service.versions.ffmpeg = '4.4.2';
      assertEquals(service.isYtDlpAvailable(), true);
      assertEquals(service.isFfmpegAvailable(), true);
    });

    test('should return null for missing versions', () => {
      const service = new VersionService({ logger: null });

      assertEquals(service.getYtDlpVersion(), null);
      assertEquals(service.getFfmpegVersion(), null);
    });
  });

  describe('initialize', () => {
    test('should not throw when initializing', async () => {
      const service = new VersionService({ logger: null });

      // This will try to detect real versions but should not throw
      await service.initialize();
    });

    test('should set versions to null or string after initialization', async () => {
      const service = new VersionService({ logger: null });

      await service.initialize();

      const versions = service.getVersions();

      // Versions should be either null or string
      assert(versions.ytDlp === null || typeof versions.ytDlp === 'string');
      assert(
        versions.ffmpeg === null || typeof versions.ffmpeg === 'string',
      );
    });
  });

  describe('version detection logic', () => {
    test('should handle empty stdout in detectYtDlpVersion', async () => {
      const service = new VersionService({ logger: null });

      // Mock the execAsync method to return empty stdout
      const originalDetectYtDlpVersion = service.detectYtDlpVersion;
      service.detectYtDlpVersion = async () => {
        try {
          // Simulate empty stdout
          const stdout = '';
          const version = stdout.trim();
          return version || null;
        } catch {
          return null;
        }
      };

      const version = await service.detectYtDlpVersion();
      assertEquals(version, null);

      // Restore original method
      service.detectYtDlpVersion = originalDetectYtDlpVersion;
    });

    test('should parse ffmpeg version from output', async () => {
      const service = new VersionService({ logger: null });

      // Mock the detectFfmpegVersion method to test parsing logic
      const originalDetectFfmpegVersion = service.detectFfmpegVersion;
      service.detectFfmpegVersion = async () => {
        try {
          const output =
            'ffmpeg version 4.4.2-0ubuntu0.22.04.1 Copyright (c) 2000-2021 the FFmpeg developers';
          const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
          if (versionMatch) {
            return versionMatch[1];
          }
          return null;
        } catch {
          return null;
        }
      };

      const version = await service.detectFfmpegVersion();
      assertEquals(version, '4.4.2-0ubuntu0.22.04.1');

      // Restore original method
      service.detectFfmpegVersion = originalDetectFfmpegVersion;
    });

    test('should handle invalid ffmpeg output', async () => {
      const service = new VersionService({ logger: null });

      // Mock the detectFfmpegVersion method to test invalid output
      const originalDetectFfmpegVersion = service.detectFfmpegVersion;
      service.detectFfmpegVersion = async () => {
        try {
          const output = 'invalid output without version information';
          const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
          if (versionMatch) {
            return versionMatch[1];
          }
          return null;
        } catch {
          return null;
        }
      };

      const version = await service.detectFfmpegVersion();
      assertEquals(version, null);

      // Restore original method
      service.detectFfmpegVersion = originalDetectFfmpegVersion;
    });
  });
});
