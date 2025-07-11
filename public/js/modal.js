/**
 * Modal management system
 * Centralized modal handling for all pages
 */
class ModalSystem {
  constructor() {
    this.currentModal = null;
    this.previouslyFocusedElement = null;
    this.setupGlobalEventListeners();
  }

  /**
   * Setup global event listeners for modal interactions
   */
  setupGlobalEventListeners() {
    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.currentModal) {
        this.hideModal(this.currentModal);
      }
    });

    // Close modal when clicking outside
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay') && this.currentModal) {
        this.hideModal(this.currentModal);
      }
    });
  }

  /**
   * Show a modal
   * @param {string} modalId - ID of the modal to show
   * @param {Object} options - Optional configuration
   */
  showModal(modalId, options = {}) {
    const modal = document.getElementById(modalId);
    if (!modal) {
      console.error(`Modal with ID "${modalId}" not found`);
      return;
    }

    // Store currently focused element
    this.previouslyFocusedElement = document.activeElement;

    this.currentModal = modalId;
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling

    // Apply any custom options
    if (options.title) {
      const titleElement = modal.querySelector('h3, .modal-title');
      if (titleElement) titleElement.textContent = options.title;
    }

    if (options.message) {
      const messageElement = modal.querySelector('p, .modal-message');
      if (messageElement) messageElement.textContent = options.message;
    }

    if (options.content) {
      const contentElement = modal.querySelector('.modal-content, .modal-body');
      if (contentElement) contentElement.innerHTML = options.content;
    }

    // Set focus to the first focusable element in the modal
    this.trapFocus(modal);
  }

  /**
   * Hide a modal
   * @param {string} modalId - ID of the modal to hide
   */
  hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = 'auto';
    this.currentModal = null;

    // Remove focus trap event listener
    if (modal.focusTrapHandler) {
      modal.removeEventListener('keydown', modal.focusTrapHandler);
      modal.focusTrapHandler = null;
    }

    // Return focus to previously focused element
    if (this.previouslyFocusedElement) {
      this.previouslyFocusedElement.focus();
      this.previouslyFocusedElement = null;
    }
  }

  /**
   * Trap focus within modal
   * @param {HTMLElement} modal - The modal element
   */
  trapFocus(modal) {
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement =
      focusableElements[focusableElements.length - 1];

    // Focus the first element
    firstFocusableElement.focus();

    // Add event listener for tab key
    const handleTabKey = (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstFocusableElement) {
            lastFocusableElement.focus();
            e.preventDefault();
          }
        } else {
          // Tab
          if (document.activeElement === lastFocusableElement) {
            firstFocusableElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    // Store the handler to remove it later
    modal.focusTrapHandler = handleTabKey;
    modal.addEventListener('keydown', handleTabKey);
  }

  /**
   * Setup delete confirmation modal
   * @param {Object} config - Configuration object
   */
  setupDeleteModal(config) {
    const {
      modalId = 'deleteModal',
      triggerSelector = '.delete-btn',
      formId = 'deleteForm',
      dataAttribute = 'data-filename',
      hiddenInputId = 'deleteFilename',
    } = config;

    let currentDeleteValue = null;

    // Event delegation for delete buttons
    document.addEventListener('click', (e) => {
      if (e.target && e.target.matches(triggerSelector)) {
        const value =
          e.target.getAttribute(dataAttribute) ||
          e.target.dataset.filename ||
          e.target.dataset.hash;
        const url = e.target.dataset.url;
        const status = e.target.dataset.status;

        currentDeleteValue = value;

        // Show modal with appropriate content
        const modal = document.getElementById(modalId);
        if (modal) {
          // Update display text
          const displayElement = modal.querySelector(
            '.modal-filename, .modal-url, #modalFilename, #modalUrl'
          );
          if (displayElement) {
            displayElement.textContent = url || value;
          }

          // Update modal content based on status (for queue items)
          if (status) {
            const titleElement = modal.querySelector(
              '#modalTitle, .modal-title'
            );
            const messageElement = modal.querySelector(
              '#modalMessage, .modal-message'
            );
            const cancelBtn = modal.querySelector(
              '#modalCancelBtn, .btn-cancel'
            );
            const confirmBtn = modal.querySelector(
              '#modalConfirmBtn, .btn-delete, .btn-confirm'
            );

            if (status === 'active') {
              if (titleElement) titleElement.textContent = 'Cancel Download';
              if (messageElement)
                messageElement.textContent =
                  "You're about to cancel this download. It will be stopped and removed from the queue.";
              if (cancelBtn) {
                cancelBtn.textContent = 'Keep Downloading';
                cancelBtn.className = 'modal-btn btn-cancel';
              }
              if (confirmBtn) {
                confirmBtn.textContent = 'Cancel Download';
                confirmBtn.className = 'modal-btn btn-cancel-download';
              }
            } else {
              if (titleElement) titleElement.textContent = 'Confirm Delete';
              if (messageElement)
                messageElement.textContent =
                  'Are you sure you want to delete this download job from the queue?';
              if (cancelBtn) {
                cancelBtn.textContent = 'Cancel';
                cancelBtn.className = 'modal-btn btn-cancel';
              }
              if (confirmBtn) {
                confirmBtn.textContent = 'Delete';
                confirmBtn.className = 'modal-btn btn-delete';
              }
            }
          }
        }

        this.showModal(modalId);

        // Update button aria-expanded state
        e.target.setAttribute('aria-expanded', 'true');
      }
    });

    // Setup modal buttons
    const modal = document.getElementById(modalId);
    if (modal) {
      // Cancel button
      const cancelBtn = modal.querySelector('#modalCancelBtn, .btn-cancel');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          this.hideModal(modalId);
          currentDeleteValue = null;
          // Update aria-expanded state on trigger element
          const triggerElement = document.querySelector(
            `[aria-expanded="true"]`
          );
          if (triggerElement) {
            triggerElement.setAttribute('aria-expanded', 'false');
          }
        });
      }

      // Confirm button
      const confirmBtn = modal.querySelector(
        '#modalConfirmBtn, .btn-delete, .btn-confirm'
      );
      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          if (currentDeleteValue) {
            const hiddenInput = document.getElementById(hiddenInputId);
            const form = document.getElementById(formId);

            if (hiddenInput && form) {
              hiddenInput.value = currentDeleteValue;
              form.submit();
            }
          }
        });
      }
    }

    // Make functions available globally for onclick handlers
    window.hideDeleteModal = () => {
      this.hideModal(modalId);
      currentDeleteValue = null;
      // Update aria-expanded state on trigger element
      const triggerElement = document.querySelector(`[aria-expanded="true"]`);
      if (triggerElement) {
        triggerElement.setAttribute('aria-expanded', 'false');
      }
    };

    window.confirmDelete = () => {
      if (currentDeleteValue) {
        const hiddenInput = document.getElementById(hiddenInputId);
        const form = document.getElementById(formId);

        if (hiddenInput && form) {
          hiddenInput.value = currentDeleteValue;
          form.submit();
        }
      }
    };
  }
}

// Create global modal system instance
window.modalSystem = new ModalSystem();

// Convenience functions for global access
window.showModal = (modalId, options) =>
  window.modalSystem.showModal(modalId, options);
window.hideModal = (modalId) => window.modalSystem.hideModal(modalId);
