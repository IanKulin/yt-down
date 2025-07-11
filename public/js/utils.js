/**
 * Utility functions
 * Centralized utility functions for all pages
 */
/* global URL, URLSearchParams, navigator, document */
class Utils {
  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Format file size in human readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Debounce function calls
   * @param {Function} func - Function to debounce
   * @param {number} delay - Delay in milliseconds
   * @returns {Function} Debounced function
   */
  static debounce(func, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  /**
   * Throttle function calls
   * @param {Function} func - Function to throttle
   * @param {number} limit - Limit in milliseconds
   * @returns {Function} Throttled function
   */
  static throttle(func, limit) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  /**
   * Deep clone an object
   * @param {Object} obj - Object to clone
   * @returns {Object} Cloned object
   */
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj);
    if (obj instanceof Array) return obj.map((item) => Utils.deepClone(item));
    if (typeof obj === 'object') {
      const cloned = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = Utils.deepClone(obj[key]);
        }
      }
      return cloned;
    }
  }

  /**
   * Check if element is in viewport
   * @param {Element} element - Element to check
   * @returns {boolean} Whether element is in viewport
   */
  static isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <=
        (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  /**
   * Smooth scroll to element
   * @param {Element|string} target - Element or selector to scroll to
   * @param {Object} options - Scroll options
   */
  static scrollToElement(target, options = {}) {
    const element =
      typeof target === 'string' ? document.querySelector(target) : target;
    if (!element) return;

    const defaultOptions = {
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
    };

    element.scrollIntoView({ ...defaultOptions, ...options });
  }

  /**
   * Get query parameter value
   * @param {string} param - Parameter name
   * @returns {string|null} Parameter value or null if not found
   */
  static getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  }

  /**
   * Set query parameter
   * @param {string} param - Parameter name
   * @param {string} value - Parameter value
   * @param {boolean} replaceHistory - Whether to replace history state
   */
  static setQueryParam(param, value, replaceHistory = true) {
    const url = new URL(window.location);
    url.searchParams.set(param, value);

    if (replaceHistory) {
      window.history.replaceState({}, '', url);
    } else {
      window.history.pushState({}, '', url);
    }
  }

  /**
   * Remove query parameter
   * @param {string} param - Parameter name
   * @param {boolean} replaceHistory - Whether to replace history state
   */
  static removeQueryParam(param, replaceHistory = true) {
    const url = new URL(window.location);
    url.searchParams.delete(param);

    if (replaceHistory) {
      window.history.replaceState({}, '', url);
    } else {
      window.history.pushState({}, '', url);
    }
  }

  /**
   * Format date to locale string
   * @param {Date|string} date - Date to format
   * @param {Object} options - Formatting options
   * @returns {string} Formatted date string
   */
  static formatDate(date, options = {}) {
    const dateObj = date instanceof Date ? date : new Date(date);
    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    };

    return dateObj.toLocaleDateString(undefined, {
      ...defaultOptions,
      ...options,
    });
  }

  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy
   * @returns {Promise<boolean>} Whether copy was successful
   */
  static async copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
      }
    } catch (err) {
      console.error('Failed to copy text: ', err);
      return false;
    }
  }

  /**
   * Show API error as toast
   * @param {string} message - Error message
   */
  static showApiError(message) {
    if (window.showToast) {
      window.showToast('error', message, 10000);
    } else {
      console.error('API Error:', message);
    }
  }

  /**
   * Show success message as toast
   * @param {string} message - Success message
   */
  static showSuccess(message) {
    if (window.showToast) {
      window.showToast('success', message, 5000);
    } else {
      console.log('Success:', message);
    }
  }
}

// Make utility functions available globally
window.Utils = Utils;

// Create convenience functions for backward compatibility
window.escapeHtml = Utils.escapeHtml;
window.formatFileSize = Utils.formatFileSize;
window.showApiError = Utils.showApiError;
