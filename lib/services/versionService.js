import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * VersionService handles version detection for external tools
 * Provides cached version information for yt-dlp and ffmpeg
 */
export class VersionService {
  constructor({ logger }) {
    this.logger = logger;
    this.versions = {
      ytDlp: null,
      ffmpeg: null,
    };
  }

  /**
   * Initialize version detection - call this at startup
   * @returns {Promise<void>}
   */
  async initialize() {
    this.logger?.debug('Initializing version detection...');

    try {
      // Detect versions concurrently
      const [ytDlpVersion, ffmpegVersion] = await Promise.all([
        this.detectYtDlpVersion(),
        this.detectFfmpegVersion(),
      ]);

      this.versions.ytDlp = ytDlpVersion;
      this.versions.ffmpeg = ffmpegVersion;

      this.logger?.info('Version detection completed:', {
        ytDlp: ytDlpVersion || 'Not available',
        ffmpeg: ffmpegVersion || 'Not available',
      });
    } catch (error) {
      this.logger?.error('Error during version detection:', error);
    }
  }

  /**
   * Detect yt-dlp version
   * @returns {Promise<string|null>} Version string or null if not available
   */
  async detectYtDlpVersion() {
    try {
      const { stdout } = await execAsync('yt-dlp --version');
      const version = stdout.trim();
      this.logger?.debug('yt-dlp version detected:', version);
      return version;
    } catch (error) {
      this.logger?.debug(
        'yt-dlp not available or version detection failed:',
        error.message
      );
      return null;
    }
  }

  /**
   * Detect ffmpeg version
   * @returns {Promise<string|null>} Version string or null if not available
   */
  async detectFfmpegVersion() {
    try {
      const { stdout, stderr } = await execAsync('ffmpeg -version');
      // ffmpeg outputs version info to stderr, but we'll check both
      const output = stdout || stderr;

      // Extract version from output like "ffmpeg version 4.4.2"
      const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
      if (versionMatch) {
        const version = versionMatch[1];
        this.logger?.debug('ffmpeg version detected:', version);
        return version;
      }

      this.logger?.debug('Could not parse ffmpeg version from output');
      return null;
    } catch (error) {
      this.logger?.debug(
        'ffmpeg not available or version detection failed:',
        error.message
      );
      return null;
    }
  }

  /**
   * Get all detected versions
   * @returns {Object} Object containing version information
   */
  getVersions() {
    return {
      ytDlp: this.versions.ytDlp,
      ffmpeg: this.versions.ffmpeg,
    };
  }

  /**
   * Get yt-dlp version
   * @returns {string|null} yt-dlp version or null if not available
   */
  getYtDlpVersion() {
    return this.versions.ytDlp;
  }

  /**
   * Get ffmpeg version
   * @returns {string|null} ffmpeg version or null if not available
   */
  getFfmpegVersion() {
    return this.versions.ffmpeg;
  }

  /**
   * Check if yt-dlp is available
   * @returns {boolean} True if yt-dlp is available
   */
  isYtDlpAvailable() {
    return this.versions.ytDlp !== null;
  }

  /**
   * Check if ffmpeg is available
   * @returns {boolean} True if ffmpeg is available
   */
  isFfmpegAvailable() {
    return this.versions.ffmpeg !== null;
  }
}
