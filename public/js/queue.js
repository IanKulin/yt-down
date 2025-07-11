/**
 * Queue page functionality
 * Handles real-time queue updates, download progress, and WebSocket communication
 */
/* global fetch, console, setTimeout, clearInterval, setInterval, document, window */
class QueueManager {
  constructor() {
    this.updateInterval = null;
  }

  /**
   * Fetch current download state and update UI
   */
  updateCurrentDownload() {
    fetch('/api/state')
      .then((response) => response.json())
      .then((data) => {
        // Mark connection as successful
        window.updateConnectionState(true);

        const currentDownloads = data.processor.currentDownloads;

        if (currentDownloads && currentDownloads.length > 0) {
          // Get the first (and usually only) active download
          const download = currentDownloads[0];

          // Update filename
          const filename = download.filename || 'Preparing download...';
          document.getElementById('downloadFilename').textContent = filename;

          // Update progress bar and text
          const percentage = download.percentage || 0;
          document.getElementById('progressFill').style.width =
            percentage + '%';
          document.getElementById('progressText').textContent =
            percentage.toFixed(1) + '%';

          // Update speed and ETA
          const speed = download.speed || 'N/A';
          const eta = download.eta || 'N/A';
          document.getElementById('downloadSpeed').textContent =
            'Speed: ' + speed;
          document.getElementById('downloadEta').textContent = 'ETA: ' + eta;

          // Update file size
          const filesize = download.filesize || download.fileSize;
          if (filesize) {
            document.getElementById('downloadFilesize').textContent =
              'Size: ' +
              (typeof filesize === 'number'
                ? window.formatFileSize(filesize)
                : filesize);
          } else {
            document.getElementById('downloadFilesize').textContent =
              'Size: calculating...';
          }
        } else {
          // Reset to default state
          document.getElementById('downloadFilename').textContent =
            'No active download';
          document.getElementById('progressFill').style.width = '0%';
          document.getElementById('progressText').textContent = '0%';
          document.getElementById('downloadSpeed').textContent = 'Speed: N/A';
          document.getElementById('downloadEta').textContent = 'ETA: N/A';
          document.getElementById('downloadFilesize').textContent = 'Size: N/A';
        }

        // Update queue list in real-time
        this.updateQueueList(data.queued || [], data.active || []);
      })
      .catch((error) => {
        console.error('Error fetching download status:', error);
        window.updateConnectionState(false);
      });
  }

  /**
   * Update the queue list display
   * @param {Array} queuedJobs - Array of queued jobs
   * @param {Array} activeJobs - Array of active jobs
   */
  updateQueueList(queuedJobs, activeJobs) {
    const queueSection = document.querySelector('.queue-section');
    if (!queueSection) return;

    // Update queue count
    const queueCountElement = queueSection.querySelector('h2');
    const totalCount = queuedJobs.length + activeJobs.length;
    if (totalCount > 0) {
      queueCountElement.textContent = `Current Queue (${totalCount === 1 ? '1 job' : totalCount + ' jobs'})`;
    } else {
      queueCountElement.textContent = 'Current Queue';
    }

    // Find or create the queue container
    let queueContainer = queueSection.querySelector('.queue-container');
    if (!queueContainer) {
      // Create container if it doesn't exist
      queueContainer = document.createElement('div');
      queueContainer.className = 'queue-container';
      queueSection.appendChild(queueContainer);
    }

    // Clear existing items
    queueContainer.innerHTML = '';

    // Show empty state if no items
    if (totalCount === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-queue';
      emptyDiv.textContent = 'No download jobs in queue';
      queueContainer.appendChild(emptyDiv);
      return;
    }

    // Add active downloads first
    activeJobs.forEach((item) => {
      const queueItem = this.createQueueItem(item, 'active', 'Downloading...');
      queueContainer.appendChild(queueItem);
    });

    // Add queued downloads
    queuedJobs.forEach((item) => {
      const queueItem = this.createQueueItem(item, 'queued', 'Waiting...');
      queueContainer.appendChild(queueItem);
    });
  }

  /**
   * Create a queue item element
   * @param {Object} item - Job item data
   * @param {string} status - Job status ('active' or 'queued')
   * @param {string} statusText - Status text to display
   * @returns {HTMLElement} Queue item element
   */
  createQueueItem(item, status, statusText) {
    const queueItem = document.createElement('div');
    queueItem.className =
      status === 'active' ? 'queue-item active' : 'queue-item';
    queueItem.dataset.hash = item.hash;

    // Determine what to display - title if available, otherwise URL
    const displayText = item.title
      ? window.escapeHtml(item.title)
      : window.escapeHtml(item.url);
    const displayClass = item.title ? 'title' : 'url';
    const loadingIndicator =
      !item.title && status === 'queued'
        ? '<span class="title-loading">Fetching title...</span>'
        : '';

    queueItem.innerHTML = `
      <div class="queue-item-content">
        <div class="${displayClass}">${displayText}</div>
        ${loadingIndicator}
        <div class="file-size">Size: ${item.filesize ? window.formatFileSize(item.filesize) : 'calculating...'}</div>
        <div class="status ${status}">${statusText}</div>
      </div>
      <button class="delete-btn" data-hash="${window.escapeHtml(item.hash)}" data-url="${window.escapeHtml(item.url)}" data-status="${status}">
        ${status === 'active' ? 'Cancel' : 'Delete'}
      </button>
    `;

    return queueItem;
  }

  /**
   * Setup WebSocket-based updates with polling fallback
   */
  setupWebSocketUpdates() {
    if (window.wsClient) {
      console.log('WebSocket client available, setting up real-time updates');
      window.wsClient.addListener(() => this.updateCurrentDownload());

      // Listen for connection state changes
      window.wsClient.addConnectionListener((isConnected) => {
        window.updateConnectionState(isConnected);
      });
    } else {
      // Retry in a moment if WebSocket client is still loading
      setTimeout(() => {
        if (window.wsClient) {
          console.log('WebSocket client loaded, setting up real-time updates');
          window.wsClient.addListener(() => this.updateCurrentDownload());

          // Listen for connection state changes
          window.wsClient.addConnectionListener((isConnected) => {
            window.updateConnectionState(isConnected);
          });
        } else {
          // Fallback to polling if WebSocket client is not available
          console.warn(
            'WebSocket client not available, falling back to polling'
          );
          this.updateInterval = setInterval(
            () => this.updateCurrentDownload(),
            2000
          );
        }
      }, 100);
    }
  }

  /**
   * Initialize the queue manager
   */
  initialize() {
    // Setup delete modal
    window.modalSystem.setupDeleteModal({
      modalId: 'deleteModal',
      triggerSelector: '.delete-btn',
      formId: 'deleteForm',
      dataAttribute: 'data-hash',
      hiddenInputId: 'deleteHash',
    });

    // Initial update
    this.updateCurrentDownload();

    // Set up WebSocket-triggered updates with retry
    this.setupWebSocketUpdates();

    // Initialize notification system
    window.notificationSystem.initialize();
  }

  /**
   * Clean up resources when page is unloaded
   */
  cleanup() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (window.wsClient) {
      window.wsClient.removeListener(() => this.updateCurrentDownload());
    }
    window.notificationSystem.cleanup();
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
  window.queueManager = new QueueManager();
  window.queueManager.initialize();
});

// Clean up when page is unloaded
window.addEventListener('beforeunload', function () {
  if (window.queueManager) {
    window.queueManager.cleanup();
  }
});
