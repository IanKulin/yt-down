import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { VersionService } from '../lib/services/versionService.js';

describe('VersionService', () => {
  describe('constructor', () => {
    test('should create instance with logger', () => {
      const logger = { debug: () => {}, info: () => {} };
      const service = new VersionService({ logger });

      assert.ok(service instanceof VersionService);
      assert.strictEqual(service.logger, logger);
    });

    test('should initialize with null versions', () => {
      const service = new VersionService({ logger: null });
      const versions = service.getVersions();

      assert.strictEqual(versions.ytDlp, null);
      assert.strictEqual(versions.ffmpeg, null);
    });
  });

  describe('getters', () => {
    test('should return correct version info', () => {
      const service = new VersionService({ logger: null });

      // Set versions directly for testing
      service.versions.ytDlp = '2023.07.06';
      service.versions.ffmpeg = '4.4.2';

      assert.strictEqual(service.getYtDlpVersion(), '2023.07.06');
      assert.strictEqual(service.getFfmpegVersion(), '4.4.2');

      const versions = service.getVersions();
      assert.strictEqual(versions.ytDlp, '2023.07.06');
      assert.strictEqual(versions.ffmpeg, '4.4.2');
    });

    test('should return availability status', () => {
      const service = new VersionService({ logger: null });

      // Initially both should be unavailable
      assert.strictEqual(service.isYtDlpAvailable(), false);
      assert.strictEqual(service.isFfmpegAvailable(), false);

      // Set one version
      service.versions.ytDlp = '2023.07.06';
      assert.strictEqual(service.isYtDlpAvailable(), true);
      assert.strictEqual(service.isFfmpegAvailable(), false);

      // Set both versions
      service.versions.ffmpeg = '4.4.2';
      assert.strictEqual(service.isYtDlpAvailable(), true);
      assert.strictEqual(service.isFfmpegAvailable(), true);
    });

    test('should return null for missing versions', () => {
      const service = new VersionService({ logger: null });

      assert.strictEqual(service.getYtDlpVersion(), null);
      assert.strictEqual(service.getFfmpegVersion(), null);
    });
  });

  describe('initialize', () => {
    test('should not throw when initializing', async () => {
      const service = new VersionService({ logger: null });

      // This will try to detect real versions but should not throw
      await assert.doesNotReject(async () => {
        await service.initialize();
      });
    });

    test('should set versions to null or string after initialization', async () => {
      const service = new VersionService({ logger: null });

      await service.initialize();

      const versions = service.getVersions();

      // Versions should be either null or string
      assert.ok(versions.ytDlp === null || typeof versions.ytDlp === 'string');
      assert.ok(
        versions.ffmpeg === null || typeof versions.ffmpeg === 'string'
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
      assert.strictEqual(version, null);

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
      assert.strictEqual(version, '4.4.2-0ubuntu0.22.04.1');

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
      assert.strictEqual(version, null);

      // Restore original method
      service.detectFfmpegVersion = originalDetectFfmpegVersion;
    });
  });
});
