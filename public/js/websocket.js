/**
 * WebSocket client module for real-time updates
 * Handles connection, reconnection, and event listening
 */
class WebSocketClient {
  constructor() {
    this.ws = null;
    this.listeners = new Set();
    this.connectionListeners = new Set();
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
    this.maxReconnectDelay = 30000; // Max 30 seconds
    this.fallbackPollInterval = null;
    this.fallbackEnabled = false;
  }

  /**
   * Initialize WebSocket connection
   */
  connect() {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000; // Reset delay
        this.disableFallbackPolling();
        this.updateConnectionStatus(true);
        this.notifyConnectionListeners(true);
      };

      this.ws.onmessage = (event) => {
        if (event.data === 'changed') {
          console.log('Received change notification');
          this.notifyListeners();
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.isConnected = false;
        this.updateConnectionStatus(false);
        this.notifyConnectionListeners(false);

        // Only attempt reconnection if it wasn't a clean close
        if (event.code !== 1000) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.updateConnectionStatus(false);
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.enableFallbackPolling();
    }
  }

  /**
   * Schedule reconnection attempt with exponential backoff
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(
        'Max reconnection attempts reached, enabling fallback polling'
      );
      this.enableFallbackPolling();
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    console.log(
      `Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      if (!this.isConnected) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Enable fallback polling when WebSocket fails
   */
  enableFallbackPolling() {
    if (this.fallbackEnabled) return;

    console.log('Enabling fallback polling');
    this.fallbackEnabled = true;

    // Poll every 3 seconds as fallback
    this.fallbackPollInterval = setInterval(() => {
      this.notifyListeners();
    }, 3000);
  }

  /**
   * Disable fallback polling when WebSocket reconnects
   */
  disableFallbackPolling() {
    if (!this.fallbackEnabled) return;

    console.log('Disabling fallback polling');
    this.fallbackEnabled = false;

    if (this.fallbackPollInterval) {
      clearInterval(this.fallbackPollInterval);
      this.fallbackPollInterval = null;
    }
  }

  /**
   * Add a listener function to be called when changes are received
   * @param {Function} listener - Function to call when changes occur
   */
  addListener(listener) {
    if (typeof listener === 'function') {
      this.listeners.add(listener);
    }
  }

  /**
   * Remove a listener function
   * @param {Function} listener - Function to remove
   */
  removeListener(listener) {
    this.listeners.delete(listener);
  }

  /**
   * Add a connection listener function to be called when connection state changes
   * @param {Function} listener - Function to call when connection state changes
   */
  addConnectionListener(listener) {
    if (typeof listener === 'function') {
      this.connectionListeners.add(listener);
    }
  }

  /**
   * Remove a connection listener function
   * @param {Function} listener - Function to remove
   */
  removeConnectionListener(listener) {
    this.connectionListeners.delete(listener);
  }

  /**
   * Notify all connection listeners about connection state change
   * @param {boolean} isConnected - Whether WebSocket is connected
   */
  notifyConnectionListeners(isConnected) {
    this.connectionListeners.forEach((listener) => {
      try {
        listener(isConnected);
      } catch (error) {
        console.error('Error in connection listener:', error);
      }
    });
  }

  /**
   * Notify all listeners that a change occurred
   */
  notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error('Error in WebSocket listener:', error);
      }
    });
  }

  /**
   * Update connection status indicator
   * @param {boolean} connected - Whether WebSocket is connected
   */
  updateConnectionStatus(connected) {
    // Find connection status element if it exists
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
      statusElement.textContent = connected ? 'Connected' : 'Disconnected';
      statusElement.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
    }
  }

  /**
   * Close WebSocket connection
   */
  close() {
    this.disableFallbackPolling();

    if (this.ws) {
      this.ws.close(1000, 'Client closing');
      this.ws = null;
    }

    this.isConnected = false;
    this.listeners.clear();
    this.connectionListeners.clear();
  }

  /**
   * Get current connection status
   * @returns {boolean} Whether WebSocket is connected
   */
  isWebSocketConnected() {
    return this.isConnected;
  }

  /**
   * Get current fallback status
   * @returns {boolean} Whether fallback polling is enabled
   */
  isFallbackEnabled() {
    return this.fallbackEnabled;
  }
}

// Create global WebSocket client instance
window.wsClient = new WebSocketClient();

// Auto-connect when page loads
document.addEventListener('DOMContentLoaded', () => {
  window.wsClient.connect();
});

// Clean up when page unloads
window.addEventListener('beforeunload', () => {
  window.wsClient.close();
});

// Handle page visibility changes (pause/resume connection)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Page is hidden, we can keep connection alive
    // but reduce activity if needed in the future
  } else {
    // Page is visible again, ensure connection is active
    if (
      !window.wsClient.isWebSocketConnected() &&
      !window.wsClient.isFallbackEnabled()
    ) {
      window.wsClient.connect();
    }
  }
});
