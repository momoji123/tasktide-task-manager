// headerUI.js
// This module handles header functionalities: settings dropdown,
// export/import data, and managing custom lists (categories, statuses, froms).

import { DB } from './storage.js';
import { escapeHtml, showModalAlert, showModalAlertConfirm } from './utilUI.js';
import { setAuthCredentials } from './apiService.js'; // Import the new function

// Internal state, initialized by the main UI module
let categories = [];
let statuses = [];
let froms = [];
let username = null; // Added username state
let renderTaskListCallback = null; // Callback to trigger task list re-render in leftMenuTaskUI
let updateLeftMenuTaskUICallback = null; // New callback
let updateTaskEditorUICallback = null;   // New callback
let updateMilestoneEditorUICallback = null; // New callback
let updateUsernameCallback = null; // New callback to update username in UI module

const selectors = {
  exportBtn: '#exportBtn',
  importBtn: '#importBtn',
  importFile: '#importFile',
  settingsBtn: '#settingsBtn',
  settingsDropdown: '#settingsDropdown',
  manageCategoriesBtn: '#manageCategoriesBtn',
  manageStatusesBtn: '#manageStatusesBtn',
  manageFromsBtn: '#manageFromsBtn',
  manageUsernameBtn: '#manageUsernameBtn', // New selector for username setting
  clearAllBtn: '#clearAllBtn',
  filterCategoryMultiSelect: '#filterCategoryMultiSelect', // Needed for dropdown close logic
};

/**
 * Initializes header-related event listeners and state.
 * @param {object} initialState - Object containing initial categories, statuses, froms, and username.
 * @param {function} onRenderTaskList - Callback function to re-render the task list.
 * @param {function} onRenderFilterCategoriesMultiSelect - Callback to re-render category filter.
 * @param {function} onRenderStatusOptions - Callback to re-render status filter options.
 * @param {function} onUpdateLeftMenuTaskUI - Callback to update LeftMenuTaskUI's state.
 * @param {function} onUpdateTaskEditorUI - Callback to update TaskEditorUI's state.
 * @param {function} onUpdateMilestoneEditorUI - Callback to update MilestoneEditorUI's state.
 * @param {function} onUpdateUsername - Callback to update the username in the main UI module.
 */
export function initHeader(
  initialState,
  onRenderTaskList,
  onRenderFilterCategoriesMultiSelect,
  onRenderStatusOptions,
  onUpdateLeftMenuTaskUI, // New parameter
  onUpdateTaskEditorUI,   // New parameter
  onUpdateMilestoneEditorUI, // New parameter
  onUpdateUsername // New parameter
) {
  categories = initialState.categories;
  statuses = initialState.statuses;
  froms = initialState.froms;
  username = initialState.username; // Initialize username
  renderTaskListCallback = onRenderTaskList; // Store callback for later use
  const renderFilterCategoriesMultiSelectCallback = onRenderFilterCategoriesMultiSelect;
  const renderStatusOptionsCallback = onRenderStatusOptions;
  updateLeftMenuTaskUICallback = onUpdateLeftMenuTaskUI;     // Store new callback
  updateTaskEditorUICallback = onUpdateTaskEditorUI;       // Store new callback
  updateMilestoneEditorUICallback = onUpdateMilestoneEditorUI; // Store new callback
  updateUsernameCallback = onUpdateUsername; // Store new callback

  // Event listener for the new settings button to toggle the dropdown
  const settingsBtn = document.querySelector(selectors.settingsBtn);
  const settingsDropdown = document.querySelector(selectors.settingsDropdown);

  if (settingsBtn) {
    settingsBtn.addEventListener('click', (event) => {
      settingsDropdown.classList.toggle('show');
      event.stopPropagation(); // Prevent the document click listener from immediately closing it
    });
  }

  // Close the dropdown if the user clicks outside of it
  window.addEventListener('click', (event) => {
    if (settingsDropdown && !event.target.matches(selectors.settingsBtn) && !event.target.closest(selectors.filterCategoryMultiSelect) && settingsDropdown.classList.contains('show')) {
      settingsDropdown.classList.remove('show');
    }
  });

  // Attach event listeners to the manage buttons now located inside the dropdown
  document.querySelector(selectors.manageCategoriesBtn)?.addEventListener('click', () => manageList('categories', 'Manage Categories', renderFilterCategoriesMultiSelectCallback, renderStatusOptionsCallback));
  document.querySelector(selectors.manageStatusesBtn)?.addEventListener('click', () => manageList('statuses', 'Manage Statuses', renderFilterCategoriesMultiSelectCallback, renderStatusOptionsCallback));
  document.querySelector(selectors.manageFromsBtn)?.addEventListener('click', () => manageList('froms', 'Manage "From" Sources', renderFilterCategoriesMultiSelectCallback, renderStatusOptionsCallback));
  // Updated: Use manageCredentials for the username/password button
  document.querySelector(selectors.manageUsernameBtn)?.addEventListener('click', () => manageCredentials(updateUsernameCallback));
  document.querySelector(selectors.clearAllBtn)?.addEventListener('click', clearAllData); // Event listener for clear all

  document.querySelector(selectors.exportBtn)?.addEventListener('click', exportJSON);
  document.querySelector(selectors.importBtn)?.addEventListener('click', () => document.querySelector(selectors.importFile)?.click());
  document.querySelector(selectors.importFile)?.addEventListener('change', importJSON);

  // Attempt to set initial authentication username from IndexedDB on load.
  // Password is NOT persisted, so it will need to be re-entered.
  if (username) {
      setAuthCredentials(username, ''); // Set username, but password will be empty/null initially
  }
}

/**
 * Updates the internal lists (categories, statuses, froms) and username.
 * This function is called from the main UI module when global state changes.
 * @param {object} updatedState - Object with updated lists and/or username.
 */
export function updateHeaderState(updatedState) {
  if (updatedState.categories) categories = updatedState.categories;
  if (updatedState.statuses) statuses = updatedState.statuses;
  if (updatedState.froms) froms = updatedState.froms;
  if (updatedState.username !== undefined) username = updatedState.username; // Update username
}


/**
 * Generic function to manage lists (categories, statuses, froms) using a custom modal.
 * This function directly creates and manages the modal, allowing for interactive list editing.
 * @param {string} type - The type of list to manage ('categories', 'statuses', 'froms').
 * @param {string} title - The title for the modal.
 * @param {function} renderFilterCategoriesMultiSelectCallback - Callback to re-render category filter.
 * @param {function} renderStatusOptionsCallback - Callback to re-render status filter options.
 */
async function manageList(type, title, renderFilterCategoriesMultiSelectCallback, renderStatusOptionsCallback) {
  let currentList;
  let defaultList = [];
  let putMetaKey;

  if (type === 'categories') {
    currentList = [...categories];
    defaultList = ['General'];
    putMetaKey = 'categories';
  } else if (type === 'statuses') {
    currentList = [...statuses];
    defaultList = ['todo', 'in-progress', 'done'];
    putMetaKey = 'statuses';
  } else if (type === 'froms') {
    currentList = [...froms];
    defaultList = ['Work', 'Personal', 'Shopping'];
    putMetaKey = 'froms';
  } else {
    console.error('Unknown list type:', type);
    return;
  }

  let tempList = [...currentList]; // Temporary list for edits within the modal

  // Get the modal template and clone it
  const modalTemplate = document.getElementById('modal-template');
  if (!modalTemplate) {
    console.error('Modal template not found.');
    return;
  }
  const modalClone = modalTemplate.content.cloneNode(true);
  const modalBackdrop = modalClone.querySelector('.modal-backdrop');
  const modalHeaderTitle = modalClone.querySelector('.modal-header h3');
  const modalBody = modalClone.querySelector('.modal-body');
  const saveBtn = modalClone.querySelector('.modal-save');
  const cancelBtn = modalClone.querySelector('.modal-cancel');
  const closeBtn = modalClone.querySelector('.modal-close');

  modalHeaderTitle.textContent = title;

  // Set up the content for the modal body
  modalBody.innerHTML = `
    <div class="list-manager-container">
      <div class="tag-list-modal" id="listManagerTags"></div>
      <div style="display:flex; gap:8px; margin-top: 12px;">
        <input type="text" id="listManagerInput" placeholder="Add new ${type.slice(0, -1) || 'item'}..." class="flex-grow">
        <button id="listManagerAddBtn">Add</button>
      </div>
    </div>
  `;

  // Append the modal to the body
  document.body.appendChild(modalBackdrop);

  // Get references to the elements *after* they are in the DOM
  const listManagerTags = modalBody.querySelector('#listManagerTags');
  const listManagerInput = modalBody.querySelector('#listManagerInput');
  const listManagerAddBtn = modalBody.querySelector('#listManagerAddBtn');

  // Function to render tags inside the modal
  const renderModalTags = () => {
    listManagerTags.innerHTML = '';
    tempList.forEach((item, idx) => {
      const tag = document.createElement('div');
      tag.className = 'tag selected';
      tag.innerHTML = `${escapeHtml(item)}<button data-idx="${idx}">x</button>`;
      listManagerTags.appendChild(tag);
    });

    // Add event listeners for remove buttons
    listManagerTags.querySelectorAll('.tag button').forEach(button => {
      button.addEventListener('click', async (e) => {
        const idxToRemove = parseInt(e.target.dataset.idx);
        const itemToRemove = tempList[idxToRemove];
        const allTasks = await DB.getAllTasks(); // Fetch all tasks inside the event listener

        let isInUse = false;
        if (type === 'categories') {
          isInUse = allTasks.some(task => task.categories && task.categories.includes(itemToRemove));
          if (isInUse) {
            showModalAlert(`Cannot delete category "${itemToRemove}" because it is currently assigned to one or more tasks.`);
          }
        } else if (type === 'statuses') {
          // Check if status is used by tasks OR milestones
          const tasksUse = allTasks.some(task => task.status === itemToRemove);
          const allMilestones = await Promise.all(allTasks.map(t => DB.getMilestonesForTask(t.id))).then(arr => arr.flat());
          const milestonesUse = allMilestones.some(m => m.status === itemToRemove);

          if (tasksUse || milestonesUse) {
            showModalAlert(`Cannot delete status "${itemToRemove}" because it is currently in use by one or more tasks or milestones.`);
          }
          isInUse = tasksUse || milestonesUse;
        } else if (type === 'froms') {
          isInUse = allTasks.some(task => task.from === itemToRemove);
          if (isInUse) {
            showModalAlert(`Cannot delete "From" source "${itemToRemove}" because it is currently used by one or more tasks.`);
          }
        }

        if (isInUse) {
          return; // Prevent deletion if in use
        }

        tempList.splice(idxToRemove, 1);
        renderModalTags();
      });
    });
  };

  // Initial render of tags
  renderModalTags();

  // Add item functionality
  if (listManagerAddBtn) {
    listManagerAddBtn.addEventListener('click', () => {
      const newItem = listManagerInput.value.trim();
      if (newItem && !tempList.includes(newItem)) {
        tempList.push(newItem);
        listManagerInput.value = '';
        renderModalTags();
      } else if (newItem && tempList.includes(newItem)) {
        showModalAlert(`"${newItem}" already exists in the list.`);
      }
    });
  }

  // Allow adding by pressing Enter in the input field
  if (listManagerInput) {
    listManagerInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        listManagerAddBtn.click();
      }
    });
  }

  // Handle Save/Cancel/Close button clicks for the modal
  return new Promise(resolve => {
    const cleanupAndResolve = (saved) => {
      modalBackdrop.remove(); // Remove modal from DOM
      resolve(saved);
    };

    saveBtn.onclick = () => cleanupAndResolve(true);
    cancelBtn.onclick = () => cleanupAndResolve(false);
    closeBtn.onclick = () => cleanupAndResolve(false); // Treat closing via 'x' as cancel
  })
  .then(async (saved) => {
    if (saved) {
      let finalUpdateList = tempList;
      // Prevent saving an empty list; revert to default if empty
      if (tempList.length === 0) {
        showModalAlert(`List for ${type} cannot be empty. Reverting to default values.`);
        finalUpdateList = defaultList;
      }

      // Update the main categories/statuses/froms array
      if (type === 'categories') {
        categories = finalUpdateList;
        // Also update selectedFilterCategories if a category was removed
        let selectedFilterCategories = (await DB.getMeta('selectedFilterCategories')) || [];
        selectedFilterCategories = selectedFilterCategories.filter(cat => categories.includes(cat));
        await DB.putMeta('selectedFilterCategories', selectedFilterCategories);
        if (renderFilterCategoriesMultiSelectCallback) renderFilterCategoriesMultiSelectCallback(); // Re-render the multi-select filter
        if (updateLeftMenuTaskUICallback) updateLeftMenuTaskUICallback({ categories: finalUpdateList, selectedFilterCategories: selectedFilterCategories });
        if (updateTaskEditorUICallback) updateTaskEditorUICallback({ categories: finalUpdateList });
      } else if (type === 'statuses') {
        statuses = finalUpdateList;
        if (renderStatusOptionsCallback) renderStatusOptionsCallback(); // Re-render filter options if statuses changed
        if (updateLeftMenuTaskUICallback) updateLeftMenuTaskUICallback({ statuses: finalUpdateList });
        if (updateTaskEditorUICallback) updateTaskEditorUICallback({ statuses: finalUpdateList });
        if (updateMilestoneEditorUICallback) updateMilestoneEditorUICallback({ statuses: finalUpdateList });
      } else if (type === 'froms') {
        froms = finalUpdateList;
        if (updateLeftMenuTaskUICallback) updateLeftMenuTaskUICallback({ froms: finalUpdateList });
        if (updateTaskEditorUICallback) updateTaskEditorUICallback({ froms: finalUpdateList });
      }
      await DB.putMeta(putMetaKey, finalUpdateList);
      // Removed the renderTaskListCallback() call here as it's handled by updateLeftMenuTaskUIState
      // if (renderTaskListCallback) await renderTaskListCallback(); // Re-render task list to reflect changes
    }
  });
}

/**
 * Validates a path segment for security.
 * Prevents directory traversal attempts.
 * @param {string} segment - The path segment to validate (e.g., username, task ID).
 * @returns {boolean} True if the segment is safe, false otherwise.
 */
function isValidPathSegment(segment) {
  // Disallow empty strings
  if (!segment) {
    return false;
  }
  // Check for directory traversal patterns
  if (segment.includes('..') || segment.includes('/') || segment.includes('\\')) {
    return false;
  }
  // Disallow segments starting with a dot (e.g., .hidden_file, .git)
  if (segment.startsWith('.')) {
    return false;
  }
  return true;
}


/**
 * Manages the username and password settings through a modal.
 * The username is persisted locally, while the password is only held in memory for the session.
 * @param {function} onUpdateUsernameCallback - Callback to update the username in the main UI module.
 */
async function manageCredentials(onUpdateUsernameCallback) {
  let currentUsername = (await DB.getMeta('username')) || ''; // Get current username

  // Get the modal template and clone it
  const modalTemplate = document.getElementById('modal-template');
  if (!modalTemplate) {
    console.error('Modal template not found.');
    return;
  }
  const modalClone = modalTemplate.content.cloneNode(true);
  const modalBackdrop = modalClone.querySelector('.modal-backdrop');
  const modalHeaderTitle = modalClone.querySelector('.modal-header h3');
  const modalBody = modalClone.querySelector('.modal-body');
  const saveBtn = modalClone.querySelector('.modal-save');
  const cancelBtn = modalClone.querySelector('.modal-cancel');
  const closeBtn = modalClone.querySelector('.modal-close');

  modalHeaderTitle.textContent = 'Set Username & Password';

  modalBody.innerHTML = `
    <div class="username-manager-container">
      <p>Your username and password are required to save and delete tasks and milestones on the server. The username also helps organize your data.</p>
      <div style="margin-top: 12px;">
          <label for="usernameInput" class="label">Username</label>
          <input type="text" id="usernameInput" placeholder="Enter your username" value="${escapeHtml(currentUsername)}" class="w-full mt-1 p-2 border rounded">
      </div>
      <div style="margin-top: 12px;">
          <label for="passwordInput" class="label">Password</label>
          <input type="password" id="passwordInput" placeholder="Enter your password" class="w-full mt-1 p-2 border rounded">
      </div>
      <div style="margin-top: 12px;">
          <label for="confirmPasswordInput" class="label">Confirm Password</label>
          <input type="password" id="confirmPasswordInput" placeholder="Confirm your password" class="w-full mt-1 p-2 border rounded">
      </div>
    </div>
  `;

  document.body.appendChild(modalBackdrop);

  const usernameInput = modalBody.querySelector('#usernameInput');
  const passwordInput = modalBody.querySelector('#passwordInput');
  const confirmPasswordInput = modalBody.querySelector('#confirmPasswordInput');

  return new Promise(resolve => {
    const cleanupAndResolve = (saved) => {
      modalBackdrop.remove();
      resolve(saved);
    };

    saveBtn.onclick = async () => {
      const newUsername = usernameInput.value.trim();
      const newPassword = passwordInput.value;
      const confirmPassword = confirmPasswordInput.value;

      // Client-side validation for username and password
      if (!newUsername) {
        showModalAlert('Username cannot be empty. Please enter a valid username.');
        return;
      }
      if (!isValidPathSegment(newUsername)) {
        showModalAlert('Invalid username. It cannot contain ".." or path separators like "/" or "\\", and cannot start with a ".".');
        return;
      }
      if (!newPassword) {
          showModalAlert('Password cannot be empty. Please enter a password.');
          return;
      }
      if (newPassword !== confirmPassword) {
        showModalAlert('Passwords do not match. Please re-enter your password.');
        return;
      }

      // Set credentials in apiService for the current session
      setAuthCredentials(newUsername, newPassword);

      await DB.putMeta('username', newUsername); // Save username to IndexedDB
      username = newUsername; // Update local state
      if (onUpdateUsernameCallback) onUpdateUsernameCallback(newUsername); // Update global UI state
      showModalAlert('Username and password saved successfully for this session!');
      cleanupAndResolve(true);
    };
    cancelBtn.onclick = () => cleanupAndResolve(false);
    closeBtn.onclick = () => cleanupAndResolve(false);
  });
}


/**
 * Clears all persisted data from IndexedDB.
 */
async function clearAllData() {
  const confirmed = await showModalAlertConfirm('Are you sure you want to clear ALL persisted data (tasks, categories, statuses, settings)? This action cannot be undone.');

  if (confirmed) {
    // Close the IndexedDB connection before deleting the database
    await DB.close(); // Ensure DB connection is closed

    // Delete the IndexedDB database
    const req = indexedDB.deleteDatabase('taskmgr-v1'); // Assuming DB_NAME from storage.js

    req.onsuccess = () => {
      console.log("Database deleted successfully");
      // Also clear any localStorage if used for other settings (though this app primarily uses IndexedDB)
      localStorage.clear();
      // Reload the page to reflect the cleared state
      window.location.reload();
    };

    req.onerror = (event) => {
      console.error("Error deleting database:", event.target.error);
      showModalAlert(`Error clearing data: ${event.target.error.message}`);
    };
  }
}

/**
 * Opens a modal for the user to select tasks for export, then exports the selected tasks.
 */
async function exportJSON() {
  const allTasks = await DB.getAllTasks();

  // Get the task export modal template and clone it
  const modalTemplate = document.getElementById('task-export-modal-template');
  if (!modalTemplate) {
    console.error('Task export modal template not found.');
    return;
  }
  const modalClone = modalTemplate.content.cloneNode(true);
  const modalBackdrop = modalClone.querySelector('.modal-backdrop');
  const taskSelectionList = modalClone.querySelector('#taskSelectionList');
  const selectAllBtn = modalClone.querySelector('#selectAllTasksBtn');
  const deselectAllBtn = modalClone.querySelector('#deselectAllTasksBtn');
  const exportSelectedBtn = modalClone.querySelector('#exportSelectedTasksBtn');
  const cancelBtn = modalClone.querySelector('.modal-cancel');
  const closeBtn = modalClone.querySelector('.modal-close');

  // Populate the task list with checkboxes
  taskSelectionList.innerHTML = '';
  allTasks.forEach(task => {
    const taskItem = document.createElement('div');
    taskItem.className = 'task-selection-item';
    taskItem.innerHTML = `
      <input type="checkbox" id="task-${task.id}" value="${task.id}" checked>
      <label for="task-${task.id}">${escapeHtml(task.title)}</label>
    `;
    taskSelectionList.appendChild(taskItem);
  });

  document.body.appendChild(modalBackdrop);

  const checkboxes = taskSelectionList.querySelectorAll('input[type="checkbox"]');

  selectAllBtn.addEventListener('click', () => {
    checkboxes.forEach(checkbox => checkbox.checked = true);
  });

  deselectAllBtn.addEventListener('click', () => {
    checkboxes.forEach(checkbox => checkbox.checked = false);
  });

  return new Promise(resolve => {
    const cleanupAndResolve = (result) => {
      modalBackdrop.remove();
      resolve(result);
    };

    exportSelectedBtn.onclick = async () => {
      const selectedTaskIds = Array.from(checkboxes)
                                .filter(cb => cb.checked)
                                .map(cb => cb.value);

      if (selectedTaskIds.length === 0) {
        showModalAlert('Please select at least one task to export.');
        return;
      }

      const selectedTasks = allTasks.filter(task => selectedTaskIds.includes(task.id));

      // Fetch all milestones and attach them to their respective tasks
      const tasksWithMilestones = await Promise.all(selectedTasks.map(async (task) => {
        const milestones = await DB.getMilestonesForTask(task.id);
        return { ...task, milestones: milestones };
      }));

      const data = {
          tasks: tasksWithMilestones,
          categories: categories, // Still export all categories/statuses/froms
          statuses: statuses,
          froms: froms,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'selected-tasks-export.json';
      a.click();
      URL.revokeObjectURL(url);
      showModalAlert('Selected tasks exported successfully!');
      cleanupAndResolve(true); // Resolve with true indicating export was successful
    };

    cancelBtn.onclick = () => cleanupAndResolve(false);
    closeBtn.onclick = () => cleanupAndResolve(false); // Treat closing via 'x' as cancel
  });
}


/**
 * Imports tasks, categories, statuses, and froms from a JSON file.
 * @param {Event} e - The change event from the file input.
 */
async function importJSON(e) {
  const f = e.target.files[0];
  if (!f) return;
  const txt = await f.text();
  try {
    const j = JSON.parse(txt);
    if (j.categories) {
      categories.push(...j.categories);
      // Remove duplicates
      categories = [...new Set(categories)];
      if (updateLeftMenuTaskUICallback) updateLeftMenuTaskUICallback({ categories: categories });
      if (updateTaskEditorUICallback) updateTaskEditorUICallback({ categories: categories });
    }
    if (j.statuses) {
      statuses.push(...j.statuses);
      // Remove duplicate
      statuses = [...new Set(statuses)];
      if (updateLeftMenuTaskUICallback) updateLeftMenuTaskUICallback({ statuses: statuses });
      if (updateTaskEditorUICallback) updateTaskEditorUICallback({ statuses: statuses });
      if (updateMilestoneEditorUICallback) updateMilestoneEditorUICallback({ statuses: statuses });
    }
    if (j.froms) {
      froms.push(...j.froms);
      // Remove duplicate
      froms = [...new Set(froms)];
      if (updateLeftMenuTaskUICallback) updateLeftMenuTaskUICallback({ froms: froms });
      if (updateTaskEditorUICallback) updateTaskEditorUICallback({ froms: froms });
    }

    if (j.tasks) {
      for (const t of j.tasks) {
        // Temporarily extract milestones if they exist
        const milestonesToImport = t.milestones || [];
        // Remove milestones property from task before saving the task itself
        delete t.milestones;
        await DB.putTask(t);

        // Save associated milestones
        for (const m of milestonesToImport) {
          await DB.putMilestone(m);
        }
      }
    }
    await DB.putMeta('categories', categories);
    await DB.putMeta('statuses', statuses);
    await DB.putMeta('froms', froms);

    // Call callbacks provided by the main UI module
    if (renderTaskListCallback) await renderTaskListCallback();
    if (document.querySelector(selectors.settingsDropdown) && document.querySelector(selectors.settingsDropdown).classList.contains('show')) {
      document.querySelector(selectors.settingsDropdown).classList.remove('show');
    }

    showModalAlert('Import successful!');
  } catch (e) {
    console.error(e);
    showModalAlert('Error importing file. Please ensure it is a valid task export JSON.');
  } finally {
    // Clear the file input to allow selecting the same file again
    e.target.value = '';
  }
}
