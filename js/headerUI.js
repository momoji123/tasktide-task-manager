// headerUI.js
// This module handles header functionalities: settings dropdown,
// export/import data, and managing custom lists (categories, statuses, froms).

import { DB } from './storage.js';
import { escapeHtml, showModalAlert, showModalAlertConfirm } from './utilUI.js';

// Internal state, initialized by the main UI module
let categories = [];
let statuses = [];
let froms = [];
let renderTaskListCallback = null; // Callback to trigger task list re-render in leftMenuTaskUI
let updateLeftMenuTaskUICallback = null; // New callback
let updateTaskEditorUICallback = null;   // New callback
let updateMilestoneEditorUICallback = null; // New callback

const selectors = {
  exportBtn: '#exportBtn',
  importBtn: '#importBtn',
  importFile: '#importFile',
  settingsBtn: '#settingsBtn',
  settingsDropdown: '#settingsDropdown',
  manageCategoriesBtn: '#manageCategoriesBtn',
  manageStatusesBtn: '#manageStatusesBtn',
  manageFromsBtn: '#manageFromsBtn',
  clearAllBtn: '#clearAllBtn',
  filterCategoryMultiSelect: '#filterCategoryMultiSelect', // Needed for dropdown close logic
};

/**
 * Initializes header-related event listeners and state.
 * @param {object} initialState - Object containing initial categories, statuses, froms.
 * @param {function} onRenderTaskList - Callback function to re-render the task list.
 * @param {function} onRenderFilterCategoriesMultiSelect - Callback to re-render category filter.
 * @param {function} onRenderStatusOptions - Callback to re-render status filter options.
 * @param {function} onUpdateLeftMenuTaskUI - Callback to update LeftMenuTaskUI's state.
 * @param {function} onUpdateTaskEditorUI - Callback to update TaskEditorUI's state.
 * @param {function} onUpdateMilestoneEditorUI - Callback to update MilestoneEditorUI's state.
 */
export function initHeader(
  initialState,
  onRenderTaskList,
  onRenderFilterCategoriesMultiSelect,
  onRenderStatusOptions,
  onUpdateLeftMenuTaskUI, // New parameter
  onUpdateTaskEditorUI,   // New parameter
  onUpdateMilestoneEditorUI // New parameter
) {
  categories = initialState.categories;
  statuses = initialState.statuses;
  froms = initialState.froms;
  renderTaskListCallback = onRenderTaskList; // Store callback for later use
  const renderFilterCategoriesMultiSelectCallback = onRenderFilterCategoriesMultiSelect;
  const renderStatusOptionsCallback = onRenderStatusOptions;
  updateLeftMenuTaskUICallback = onUpdateLeftMenuTaskUI;     // Store new callback
  updateTaskEditorUICallback = onUpdateTaskEditorUI;       // Store new callback
  updateMilestoneEditorUICallback = onUpdateMilestoneEditorUI; // Store new callback

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
  document.querySelector(selectors.clearAllBtn)?.addEventListener('click', clearAllData); // Event listener for clear all

  document.querySelector(selectors.exportBtn)?.addEventListener('click', exportJSON);
  document.querySelector(selectors.importBtn)?.addEventListener('click', () => document.querySelector(selectors.importFile)?.click());
  document.querySelector(selectors.importFile)?.addEventListener('change', importJSON);
}

/**
 * Updates the internal lists (categories, statuses, froms).
 * This function is called from the main UI module when global state changes.
 * @param {object} updatedState - Object with updated lists.
 */
export function updateHeaderState(updatedState) {
  if (updatedState.categories) categories = updatedState.categories;
  if (updatedState.statuses) statuses = updatedState.statuses;
  if (updatedState.froms) froms = updatedState.froms;
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
      if (renderTaskListCallback) await renderTaskListCallback(); // Re-render task list to reflect changes
    }
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
 * Exports all tasks, categories, statuses, and froms as a JSON file.
 */
async function exportJSON() {
  const allTasks = await DB.getAllTasks();
  
  // Fetch all milestones and attach them to their respective tasks
  const tasksWithMilestones = await Promise.all(allTasks.map(async (task) => {
    const milestones = await DB.getMilestonesForTask(task.id);
    return { ...task, milestones: milestones };
  }));

  const data = {
      tasks: tasksWithMilestones, // Include tasks with nested milestones
      categories: categories,
      statuses: statuses,
      froms: froms
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'task-export.json';
  a.click();
  URL.revokeObjectURL(url);
  showModalAlert('Data exported successfully!');
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
      categories = j.categories;
      if (updateLeftMenuTaskUICallback) updateLeftMenuTaskUICallback({ categories: categories });
      if (updateTaskEditorUICallback) updateTaskEditorUICallback({ categories: categories });
    }
    if (j.statuses) {
      statuses = j.statuses;
      if (updateLeftMenuTaskUICallback) updateLeftMenuTaskUICallback({ statuses: statuses });
      if (updateTaskEditorUICallback) updateTaskEditorUICallback({ statuses: statuses });
      if (updateMilestoneEditorUICallback) updateMilestoneEditorUICallback({ statuses: statuses });
    }
    if (j.froms) {
      froms = j.froms;
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