/**
 * Notification system
 * Centralized notification checking and management
 */
/* global fetch, console */
class NotificationSystem {
  constructor() {
    this.isConnected = true;
    this.lastConnectionState = true;
    this.connectionErrorToastId = null;
    this.isShowingConnectionError = false;
    this.notificationListeners = new Set();
  }

  /**
   * Check for notifications from the server
   * @returns {Promise<void>}
   */
  async checkForNotifications() {
    try {
      const response = await fetch('/api/state');
      const data = await response.json();

      // Mark connection as successful
      this.updateConnectionState(true);

      // Process notifications
      if (data.notifications && data.notifications.length > 0) {
        const notification = data.notifications[0];
        // Only show if we haven't shown this notification before
        if (
          !globalThis.toastSystem.hasShownNotification(notification.timestamp)
        ) {
          globalThis.toastSystem.markNotificationShown(notification.timestamp);
          this.showCompletionNotification(notification);
        }
      }

      // Notify listeners with the full data
      this.notifyListeners(data);
    } catch (error) {
      console.error('Error checking notifications:', error);
      this.updateConnectionState(false);
    }
  }

  /**
   * Show completion notification
   * @param {Object} notification - Notification object
   */
  showCompletionNotification(notification) {
    if (globalThis.showToast) {
      // Map backend notification types to frontend toast types
      const toastType = this.mapNotificationTypeToToastType(notification.type);

      globalThis.showToast(
        toastType,
        notification.message,
        5000,
        notification.timestamp,
      );
    }
  }

  /**
   * Map backend notification types to CSS-compatible toast types
   * @param {string} notificationType - Backend notification type
   * @returns {string} CSS-compatible toast type
   */
  mapNotificationTypeToToastType(notificationType) {
    // Map success-related types to 'success' for green styling
    const successTypes = [
      'download_complete',
      'job_added',
      'job_cancelled',
      'job_deleted',
      'job_retried',
    ];

    if (successTypes.includes(notificationType)) {
      return 'success';
    }

    // Keep error as error for red styling
    if (notificationType === 'error') {
      return 'error';
    }

    // Default to info for unknown types
    return notificationType || 'info';
  }

  /**
   * Update connection state
   * @param {boolean} isConnected - Whether connection is active
   */
  updateConnectionState(isConnected) {
    const wasConnected = this.lastConnectionState;
    this.lastConnectionState = isConnected;

    if (!isConnected && wasConnected) {
      // Transitioned from connected to disconnected
      this.showConnectionError();
    } else if (isConnected && !wasConnected) {
      // Transitioned from disconnected to connected
      this.clearConnectionError();
    }
  }

  /**
   * Show connection error
   */
  showConnectionError() {
    if (this.isShowingConnectionError) return;

    this.isShowingConnectionError = true;
    if (globalThis.showToast) {
      this.connectionErrorToastId = globalThis.showToast(
        'error',
        'Connection lost. Attempting to reconnect...',
        0, // Persistent until cleared
      );
    }
  }

  /**
   * Clear connection error
   */
  clearConnectionError() {
    if (!this.isShowingConnectionError) return;

    this.isShowingConnectionError = false;
    if (this.connectionErrorToastId && globalThis.dismissToastById) {
      globalThis.dismissToastById(this.connectionErrorToastId);
      this.connectionErrorToastId = null;
    }

    // Show brief success notification
    if (globalThis.showToast) {
      globalThis.showToast('success', 'Connection restored', 3000);
    }
  }

  /**
   * Add a notification listener
   * @param {Function} listener - Function to call when notifications are received
   */
  addNotificationListener(listener) {
    if (typeof listener === 'function') {
      this.notificationListeners.add(listener);
    }
  }

  /**
   * Remove a notification listener
   * @param {Function} listener - Function to remove
   */
  removeNotificationListener(listener) {
    this.notificationListeners.delete(listener);
  }

  /**
   * Notify all listeners
   * @param {Object} data - Data to pass to listeners
   */
  notifyListeners(data) {
    this.notificationListeners.forEach((listener) => {
      try {
        listener(data);
      } catch (error) {
        console.error('Error in notification listener:', error);
      }
    });
  }

  /**
   * Setup WebSocket-based notification checking
   */
  setupWebSocketNotifications() {
    if (globalThis.wsClient) {
      globalThis.wsClient.addListener(() => this.checkForNotifications());
      globalThis.wsClient.addConnectionListener((isConnected) => {
        this.updateConnectionState(isConnected);
      });
    } else {
      // Fallback to polling if WebSocket client is not available
      console.warn('WebSocket client not available, falling back to polling');
      setInterval(() => this.checkForNotifications(), 3000);
    }
  }

  /**
   * Setup notification system with WebSocket fallback
   */
  initialize() {
    // Initial notification check
    this.checkForNotifications();

    // Setup WebSocket notifications with retry
    const setupWebSocket = () => {
      if (globalThis.wsClient) {
        this.setupWebSocketNotifications();
      } else {
        // Retry after a short delay
        setTimeout(() => {
          if (globalThis.wsClient) {
            this.setupWebSocketNotifications();
          } else {
            // Final fallback to polling
            console.warn('WebSocket client not available, using polling');
            setInterval(() => this.checkForNotifications(), 3000);
          }
        }, 100);
      }
    };

    setupWebSocket();
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (globalThis.wsClient) {
      globalThis.wsClient.removeListener(() => this.checkForNotifications());
      globalThis.wsClient.removeConnectionListener((isConnected) => {
        this.updateConnectionState(isConnected);
      });
    }

    this.notificationListeners.clear();
  }
}

// Create global notification system instance
globalThis.notificationSystem = new NotificationSystem();

// Convenience functions for global access
globalThis.checkForNotifications = () =>
  globalThis.notificationSystem.checkForNotifications();
globalThis.showCompletionNotification = (notification) =>
  globalThis.notificationSystem.showCompletionNotification(notification);
globalThis.updateConnectionState = (isConnected) =>
  globalThis.notificationSystem.updateConnectionState(isConnected);
