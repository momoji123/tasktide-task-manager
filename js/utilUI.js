// utilUI.js
// This module provides utility functions for common UI operations
// like HTML escaping and generic modal creation/management.

/**
 * Escapes HTML special characters in a string to prevent XSS.
 * @param {string} unsafe - The string to escape.
 * @returns {string} The escaped string.
 */
export function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Creates and displays a generic modal dialog.
 * @param {string} title - The title of the modal.
 * @param {string} contentHtml - The HTML content for the modal body.
 * @param {boolean} [showSaveButton=true] - Whether to show the "Save" button. If false, it acts as an alert.
 * @returns {Promise<boolean>} A promise that resolves to true if "Save"/"Confirm" is clicked, false if "Cancel"/"Close" is clicked.
 */
export function createModal(title, contentHtml, showSaveButton = true) {
  const tmpl = document.getElementById('modal-template').content;
  const modalFragment = tmpl.cloneNode(true);
  const modalBackdrop = modalFragment.querySelector('.modal-backdrop');

  modalFragment.querySelector('h3').textContent = title;
  modalFragment.querySelector('.modal-body').innerHTML = contentHtml;
  
  const saveBtn = modalFragment.querySelector('.modal-save');
  const cancelBtn = modalFragment.querySelector('.modal-cancel');
  const closeBtn = modalFragment.querySelector('.modal-close');

  // Hide save button if not needed (e.g., for alerts)
  if (!showSaveButton) {
    saveBtn.style.display = 'none';
    cancelBtn.textContent = 'Close'; // Change cancel to close for alerts
    cancelBtn.classList.remove('danger'); // Ensure no danger styling if it's a simple close
  } else {
    saveBtn.textContent = 'Save'; // Ensure it says save for regular modals
    saveBtn.classList.remove('danger'); // Remove danger class for generic save
  }

  return new Promise((resolve) => {
    saveBtn.addEventListener('click', () => {
      document.body.removeChild(modalBackdrop);
      resolve(true); // Indicate save action was clicked
    });
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(modalBackdrop);
      resolve(false); // Indicate cancel/close action was clicked
    });
    closeBtn.addEventListener('click', () => {
      document.body.removeChild(modalBackdrop);
      resolve(false); // Indicate close action was clicked
    });
    document.body.appendChild(modalFragment);
  });
}

/**
 * Displays a simple alert modal.
 * @param {string} message - The message to display.
 */
export function showModalAlert(message) {
    createModal('Warning', `<p>${escapeHtml(message)}</p>`, false); // Pass false for showSaveButton
}

/**
 * Displays a confirmation modal.
 * @param {string} message - The confirmation message.
 * @returns {Promise<boolean>} A promise that resolves to true if "Confirm" is clicked, false otherwise.
 */
export function showModalAlertConfirm(message) {
    return new Promise(resolve => {
        const tmpl = document.getElementById('modal-template').content;
        const modalFragment = tmpl.cloneNode(true);
        const modalBackdrop = modalFragment.querySelector('.modal-backdrop');

        modalFragment.querySelector('h3').textContent = 'Confirm';
        modalFragment.querySelector('.modal-body').innerHTML = `<p>${escapeHtml(message)}</p>`;
        // Override the footer with specific Confirm/Cancel buttons
        modalFragment.querySelector('.modal-footer').innerHTML = `
            <button class="modal-cancel">Cancel</button>
            <button class="modal-save danger">Confirm</button>
        `;
        
        const saveBtn = modalFragment.querySelector('.modal-save');
        const cancelBtn = modalFragment.querySelector('.modal-cancel');
        const closeBtn = modalFragment.querySelector('.modal-close'); // Also need to handle closing with 'x'

        saveBtn.addEventListener('click', () => {
            document.body.removeChild(modalBackdrop);
            resolve(true);
        });
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modalBackdrop);
            resolve(false);
        });
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modalBackdrop);
            resolve(false);
        });
        document.body.appendChild(modalFragment);
    });
}
