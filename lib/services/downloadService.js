import fs from 'fs/promises';
import path from 'path';
import { NotFoundError, ForbiddenError } from '../errors.js';
import { validateFilename } from '../validators.js';
import {
  DOWNLOADS_FINISHED_DIR,
  getDownloadedFiles,
  formatFileSize,
} from '../utils.js';

/**
 * DownloadService handles all file download and management operations
 * Abstracts file system operations and security checks from route handlers
 */
export class DownloadService {
  constructor({ logger }) {
    this.logger = logger;
  }

  /**
   * Get all downloaded files with metadata
   * @returns {Array} Array of downloaded files with metadata
   */
  async getDownloadedFiles() {
    try {
      const files = await getDownloadedFiles(this.logger);
      return files;
    } catch (error) {
      this.logger?.error('Error retrieving downloaded files:', error);
      throw error;
    }
  }

  /**
   * Validate file access and return secure file path
   * @param {string} filename - The filename to validate
   * @returns {string} The validated and secure file path
   */
  async validateFileAccess(filename) {
    const validatedFilename = validateFilename(filename);
    const filePath = path.join(DOWNLOADS_FINISHED_DIR, validatedFilename);

    // Security check: ensure the file is within the downloads directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDownloadsDir = path.resolve(DOWNLOADS_FINISHED_DIR);

    if (!resolvedPath.startsWith(resolvedDownloadsDir)) {
      this.logger?.warn(
        `Access denied for file outside downloads directory: ${filename}`
      );
      throw new ForbiddenError('Access denied');
    }

    // Check if file exists
    try {
      await fs.access(filePath);
      return { filePath, validatedFilename };
    } catch {
      this.logger?.warn(`File not found: ${filename}`);
      throw new NotFoundError('File not found');
    }
  }

  /**
   * Prepare file for download (validate access and return file info)
   * @param {string} filename - The filename to download
   * @returns {Object} File information for download
   */
  async prepareFileDownload(filename) {
    const { filePath, validatedFilename } =
      await this.validateFileAccess(filename);

    this.logger?.info(`File download initiated: ${validatedFilename}`);

    return {
      filePath,
      filename: validatedFilename,
      headers: {
        'Content-Disposition': `attachment; filename="${validatedFilename}"`,
      },
    };
  }

  /**
   * Delete a downloaded file
   * @param {string} filename - The filename to delete
   * @returns {Object} Success result with message
   */
  async deleteFile(filename) {
    const { filePath, validatedFilename } =
      await this.validateFileAccess(filename);

    try {
      await fs.unlink(filePath);

      this.logger?.info(`File deleted: ${validatedFilename}`);

      return {
        success: true,
        message: 'File deleted successfully',
        type: 'success',
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger?.warn(
          `File not found during deletion: ${validatedFilename}`
        );
        throw new NotFoundError('File not found');
      }

      this.logger?.error(`Error deleting file ${validatedFilename}:`, error);
      throw error;
    }
  }

  /**
   * Get file statistics and metadata
   * @param {string} filename - The filename to get stats for
   * @returns {Object} File statistics
   */
  async getFileStats(filename) {
    const { filePath, validatedFilename } =
      await this.validateFileAccess(filename);

    try {
      const stats = await fs.stat(filePath);

      return {
        filename: validatedFilename,
        size: stats.size,
        formattedSize: formatFileSize(stats.size),
        created: stats.birthtime,
        modified: stats.mtime,
        isFile: stats.isFile(),
      };
    } catch (error) {
      this.logger?.error(
        `Error getting file stats for ${validatedFilename}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Check if a file exists in the downloads directory
   * @param {string} filename - The filename to check
   * @returns {boolean} Whether the file exists
   */
  async fileExists(filename) {
    try {
      await this.validateFileAccess(filename);
      return true;
    } catch (error) {
      if (error instanceof NotFoundError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get the downloads directory path
   * @returns {string} The downloads directory path
   */
  getDownloadsDirectory() {
    return DOWNLOADS_FINISHED_DIR;
  }
}
