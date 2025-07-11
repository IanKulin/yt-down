/**
 * Toast notification system
 * Centralized toast management for all pages
 */
/* global fetch, document */
class ToastSystem {
  constructor() {
    this.toastQueue = [];
    this.toastIdCounter = 0;
    this.shownNotifications = new Set();
  }

  /**
   * Show a toast notification
   * @param {string} type - Type of toast (success, error, info, warning)
   * @param {string} message - Message to display
   * @param {number} duration - Duration in milliseconds (0 for persistent)
   * @param {string} notificationId - Optional notification ID for server dismissal
   * @returns {number} Toast ID
   */
  showToast(type, message, duration = 5000, notificationId = null) {
    const toast = {
      id: ++this.toastIdCounter,
      type: type,
      message: message,
      duration: duration,
      notificationId: notificationId,
      element: null,
      timeout: null,
      progressInterval: null,
      isHovered: false,
    };

    this.toastQueue.push(toast);
    this.displayToast(toast);
    return toast.id;
  }

  /**
   * Display a toast element
   * @param {Object} toast - Toast object
   */
  displayToast(toast) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // Create toast element
    const toastElement = document.createElement('div');
    toastElement.className = `toast-notification ${toast.type}`;
    toastElement.dataset.toastId = toast.id;
    toastElement.innerHTML = `
      <span class="toast-content">${this.escapeHtml(toast.message)}</span>
      <button class="toast-dismiss" aria-label="Dismiss notification">&times;</button>
      <div class="toast-progress"></div>
    `;

    toast.element = toastElement;
    container.appendChild(toastElement);

    // Set up dismiss functionality
    const dismissBtn = toastElement.querySelector('.toast-dismiss');
    dismissBtn.addEventListener('click', () => this.dismissToast(toast));

    // Set up hover pause functionality
    toastElement.addEventListener('mouseenter', () => {
      toast.isHovered = true;
      toastElement.classList.add('paused');
      if (toast.timeout) clearTimeout(toast.timeout);
      if (toast.progressInterval) clearInterval(toast.progressInterval);
    });

    toastElement.addEventListener('mouseleave', () => {
      toast.isHovered = false;
      toastElement.classList.remove('paused');
      this.startToastTimer(toast);
    });

    // Start auto-dismiss timer
    this.startToastTimer(toast);
  }

  /**
   * Start the auto-dismiss timer for a toast
   * @param {Object} toast - Toast object
   */
  startToastTimer(toast) {
    if (toast.isHovered || toast.duration === 0) return;

    const progressBar = toast.element.querySelector('.toast-progress');
    let progress = 0;
    const interval = 50;
    const increment = (interval / toast.duration) * 100;

    toast.progressInterval = setInterval(() => {
      progress += increment;
      progressBar.style.width = progress + '%';

      if (progress >= 100) {
        clearInterval(toast.progressInterval);
        this.dismissToast(toast);
      }
    }, interval);
  }

  /**
   * Dismiss a toast
   * @param {Object} toast - Toast object
   */
  dismissToast(toast) {
    if (!toast.element || toast.element.classList.contains('dismissing'))
      return;

    // Clear timers
    if (toast.timeout) clearTimeout(toast.timeout);
    if (toast.progressInterval) clearInterval(toast.progressInterval);

    // Animate out
    toast.element.classList.add('dismissing');
    setTimeout(() => {
      if (toast.element.parentElement) {
        toast.element.parentElement.removeChild(toast.element);
      }
    }, 300);

    // Remove from queue
    const index = this.toastQueue.indexOf(toast);
    if (index > -1) {
      this.toastQueue.splice(index, 1);
    }

    // Tell server to remove the notification if it has a notification ID
    if (toast.notificationId) {
      // Remove from shown notifications set
      this.shownNotifications.delete(toast.notificationId);

      fetch('/api/notifications/dismiss', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notificationId: toast.notificationId }),
      }).catch((error) => {
        console.error('Error dismissing notification:', error);
      });
    }
  }

  /**
   * Dismiss a toast by ID
   * @param {number} toastId - Toast ID
   */
  dismissToastById(toastId) {
    const toast = this.toastQueue.find((t) => t.id === toastId);
    if (toast) {
      this.dismissToast(toast);
    }
  }

  /**
   * Check if a notification has been shown
   * @param {string} notificationId - Notification ID
   * @returns {boolean}
   */
  hasShownNotification(notificationId) {
    return this.shownNotifications.has(notificationId);
  }

  /**
   * Mark a notification as shown
   * @param {string} notificationId - Notification ID
   */
  markNotificationShown(notificationId) {
    this.shownNotifications.add(notificationId);
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Create global toast system instance
window.toastSystem = new ToastSystem();

// Convenience functions for global access
window.showToast = (type, message, duration, notificationId) =>
  window.toastSystem.showToast(type, message, duration, notificationId);
window.dismissToastById = (toastId) =>
  window.toastSystem.dismissToastById(toastId);
