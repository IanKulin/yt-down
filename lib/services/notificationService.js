import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ValidationError } from '../errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * NotificationService handles all notification-related operations
 * Centralizes notification file management and operations
 */
export class NotificationService {
  constructor({ logger, baseDir }) {
    this.logger = logger;
    this.baseDir = baseDir || path.join(__dirname, '..', '..');
    this.notificationsFile = path.join(
      this.baseDir,
      'data',
      'notifications.json'
    );
  }

  /**
   * Ensure the notifications directory exists
   */
  async ensureNotificationsDirectory() {
    const dir = path.dirname(this.notificationsFile);
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Get all pending notifications
   * @returns {Array} Array of notification objects
   */
  async getNotifications() {
    try {
      const data = await fs.readFile(this.notificationsFile, 'utf-8');
      const notifications = JSON.parse(data);

      this.logger?.debug(`Retrieved ${notifications.length} notifications`);
      return notifications;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty array
        this.logger?.debug(
          'No notifications file found, returning empty array'
        );
        return [];
      }

      this.logger?.warn(
        'Error reading notifications file, returning empty array:',
        error
      );
      return [];
    }
  }

  /**
   * Add a new notification
   * @param {string} type - The notification type
   * @param {string} message - The notification message
   * @param {Object} metadata - Additional metadata for the notification
   * @returns {Object} The created notification
   */
  async addNotification(type, message, metadata = {}) {
    await this.ensureNotificationsDirectory();

    const notification = {
      type,
      message,
      timestamp: new Date().toISOString(),
      ...metadata,
    };

    try {
      const notifications = await this.getNotifications();
      notifications.push(notification);

      await fs.writeFile(
        this.notificationsFile,
        JSON.stringify(notifications, null, 2)
      );

      this.logger?.debug(`Added notification: ${type} - ${message}`);
      return notification;
    } catch (error) {
      this.logger?.error('Error adding notification:', error);
      throw error;
    }
  }

  /**
   * Dismiss a notification by its ID (timestamp)
   * @param {string} notificationId - The notification ID to dismiss
   * @returns {Object} Success result
   */
  async dismissNotification(notificationId) {
    if (!notificationId) {
      throw new ValidationError('Notification ID is required');
    }

    try {
      const notifications = await this.getNotifications();
      const originalLength = notifications.length;

      // Remove the notification by timestamp (using timestamp as ID)
      const filteredNotifications = notifications.filter(
        (n) => n.timestamp !== notificationId
      );

      await fs.writeFile(
        this.notificationsFile,
        JSON.stringify(filteredNotifications, null, 2)
      );

      const removed = originalLength - filteredNotifications.length;

      if (removed > 0) {
        this.logger?.debug(`Dismissed notification: ${notificationId}`);
        return {
          success: true,
          message: 'Notification dismissed successfully',
          removed,
        };
      } else {
        this.logger?.warn(
          `Notification not found for dismissal: ${notificationId}`
        );
        return {
          success: true,
          message: 'Notification not found (may have already been dismissed)',
          removed: 0,
        };
      }
    } catch (error) {
      this.logger?.error('Error dismissing notification:', error);
      throw error;
    }
  }

  /**
   * Clear all notifications
   * @returns {Object} Success result with count of cleared notifications
   */
  async clearAllNotifications() {
    try {
      const notifications = await this.getNotifications();
      const count = notifications.length;

      await fs.writeFile(this.notificationsFile, JSON.stringify([], null, 2));

      this.logger?.info(`Cleared ${count} notifications`);

      return {
        success: true,
        message: `Cleared ${count} notifications`,
        count,
      };
    } catch (error) {
      this.logger?.error('Error clearing notifications:', error);
      throw error;
    }
  }

  /**
   * Get notification count
   * @returns {number} Number of pending notifications
   */
  async getNotificationCount() {
    const notifications = await this.getNotifications();
    return notifications.length;
  }

  /**
   * Get notifications of a specific type
   * @param {string} type - The notification type to filter by
   * @returns {Array} Array of notifications of the specified type
   */
  async getNotificationsByType(type) {
    const notifications = await this.getNotifications();
    return notifications.filter((n) => n.type === type);
  }

  /**
   * Add a download completion notification
   * @param {string} url - The download URL
   * @param {string} hash - The job hash
   * @param {string} filename - The downloaded filename
   * @returns {Object} The created notification
   */
  async addDownloadCompletionNotification(url, hash, filename) {
    const message = filename
      ? `Download completed: ${filename}`
      : 'Download completed';

    return await this.addNotification('download_complete', message, {
      url,
      hash,
      filename,
    });
  }
}
