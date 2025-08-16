// milestoneEditorUI.js
// This module handles the detailed editing form for individual milestones,
// including populating the form, saving changes, and deleting milestones.

import { DB } from './storage.js';
import { Editor } from './editor.js'; // Assuming Editor is a separate module
import { escapeHtml, showModalAlert, showModalAlertConfirm } from './utilUI.js';
import { saveMilestoneToServer, deleteMilestoneFromServer } from './apiService.js'; // Import from centralized API service

// Internal state for global options and callbacks
let statuses = [];
let currentMilestone = null; // Stores the milestone currently being edited
let currentTaskId = null; // Stores the ID of the task this milestone belongs to
let currentUsername = null; // Added current username
let taskCreator = null; // Stores the creator of the parent task
let renderMilestoneBubblesCallback = null; // Callback to re-render the milestone graph
let updateCurrentMilestoneCallback = null; // Callback to update selected state in graph UI

// Editor instance for notes
let notesEditorInstance = null;

const selectors = {
  milestoneEditorArea: '#milestoneEditorArea',
  milestoneTitleInput: '#milestoneTitle',
  milestoneDeadlineInput: '#milestoneDeadline',
  milestoneFinishDateInput: '#milestoneFinishDate',
  milestoneStatusSelect: '#milestoneStatusSelect',
  milestoneParentSelect: '#milestoneParentSelect',
  milestoneNotesEditor: '#milestoneNotesEditor',
  saveMilestoneBtn: '#saveMilestoneBtn',
  deleteMilestoneBtn: '#deleteMilestoneBtn',
  closeMilestoneEditorBtn: '#closeMilestoneEditorBtn', // New selector for the close button
  milestonesGraphContainer: '#milestonesGraphContainer', // Added for direct access
  milestonesPage: '#milestonesPage', // Added to get reference to the main milestones view
};

/**
 * Initializes the Milestone Editor UI module.
 * @param {object} initialState - Object containing initial statuses and username.
 * @param {function} onRenderMilestoneBubbles - Callback to re-render the milestone graph.
 * @param {function} onUpdateCurrentMilestone - Callback to update the selected milestone in graph UI.
 */
export function initMilestoneEditorUI(initialState, onRenderMilestoneBubbles, onUpdateCurrentMilestone) {
  statuses = initialState.statuses;
  currentUsername = initialState.username; // Initialize username
  renderMilestoneBubblesCallback = onRenderMilestoneBubbles;
  updateCurrentMilestoneCallback = onUpdateCurrentMilestone;
}

/**
 * Updates the internal statuses list and username.
 * This function is called from the main UI module when global state changes.
 * @param {object} updatedState - Object with updated lists and/or username.
 */
export function updateMilestoneEditorUIState(updatedState) {
  if (updatedState.statuses) {
    statuses = updatedState.statuses;
    // If an editor is open, re-render its status dropdown
    if (currentMilestone) {
      const editorArea = document.querySelector(selectors.milestoneEditorArea);
      if (editorArea && editorArea.contains(document.querySelector(selectors.milestoneStatusSelect))) {
        renderStatusSelectOptions(editorArea, statuses, currentMilestone.status);
      }
    }
  }
  if (updatedState.username !== undefined) {
      currentUsername = updatedState.username;
      // Re-evaluate button states if editor is open
      const editorArea = document.querySelector(selectors.milestoneEditorArea);
      if (editorArea && currentMilestone) {
          updateButtonStates(editorArea);
      }
  }
}

/**
 * Updates the enabled/disabled state of action buttons based on the current username and task creator.
 * @param {HTMLElement} editorArea - The container for the milestone editor.
 */
function updateButtonStates(editorArea) {
  const saveBtn = editorArea.querySelector(selectors.saveMilestoneBtn);
  const deleteBtn = editorArea.querySelector(selectors.deleteMilestoneBtn);

  // Buttons are enabled only if a username is set AND the task's creator matches
  const canEditOrDelete = !!(currentUsername); // Added !! to ensure boolean

  if (saveBtn) {
    saveBtn.disabled = !canEditOrDelete;
  }
  if (deleteBtn) {
    deleteBtn.disabled = !canEditOrDelete;
  }

  // Set editability for rich text notes area
  if (notesEditorInstance) {
    notesEditorInstance.setEditable(canEditOrDelete);
  }

  // For other inputs (not text-area)
  editorArea.querySelectorAll('input, select').forEach(input => {
    input.disabled = !canEditOrDelete;
  });
}

/**
 * Opens the milestone editor for a given milestone.
 * @param {object} milestone - The milestone object to edit.
 * @param {string} taskId - The ID of the parent task.
 */
export async function openMilestoneEditor(milestone, taskId) {
  currentMilestone = milestone; // Set the currently selected milestone
  currentTaskId = taskId; // Store the task ID

  // Fetch the parent task to get its creator
  const parentTask = await DB.getTask(taskId);
  if (!parentTask || !parentTask.creator) {
      showModalAlert('Cannot open milestone editor: Parent task not found or has no creator. Please save the task first.');
      closeMilestoneEditor(); // Close editor if we can't get task creator
      return;
  }
  taskCreator = parentTask.creator; // Store the creator of the parent task

  if (updateCurrentMilestoneCallback) updateCurrentMilestoneCallback(milestone); // Inform graph UI

  const milestoneEditorArea = document.querySelector(selectors.milestoneEditorArea);
  if (!milestoneEditorArea) return;

  // Show the editor area by removing the 'editor-hidden' class
  const milestonesPage = document.querySelector(selectors.milestonesPage);
  if (milestonesPage) {
    milestonesPage.querySelector('.milestones-view-body-grid').classList.remove('editor-hidden');
  }

  milestoneEditorArea.innerHTML = ''; // Clear previous editor content

  const tmpl = document.getElementById('milestone-editor-template')?.content;
  if (!tmpl) {
    console.error('Milestone editor template not found!');
    return;
  }
  const node = tmpl.cloneNode(true);
  milestoneEditorArea.appendChild(node);

  // Populate inputs
  milestoneEditorArea.querySelector(selectors.milestoneTitleInput).value = escapeHtml(milestone.title);
  milestoneEditorArea.querySelector(selectors.milestoneDeadlineInput).value = milestone.deadline ? milestone.deadline.split('T')[0] : '';
  milestoneEditorArea.querySelector(selectors.milestoneFinishDateInput).value = milestone.finishDate ? milestone.finishDate.split('T')[0] : '';

  // Populate status dropdown
  const statusSelect = milestoneEditorArea.querySelector(selectors.milestoneStatusSelect);
  renderStatusSelectOptions(milestoneEditorArea, statuses, milestone.status);

  // Populate parent milestone dropdown
  // Fetch milestones directly from the server for this task
  const allMilestones = await DB.getMilestonesForTask(taskId); 
  const parentSelect = milestoneEditorArea.querySelector(selectors.milestoneParentSelect);
  parentSelect.innerHTML = '<option value="">-- No Parent Milestone --</option>' + 
                           allMilestones
                             .filter(m => m.id !== milestone.id) // Cannot be its own parent
                             .map(m => `<option value="${escapeHtml(m.id)}" ${m.id === milestone.parentId ? 'selected' : ''}>${escapeHtml(m.title)}</option>`)
                             .join('');


  // Initialize Editor for notes and store its instance
  notesEditorInstance = Editor.init(milestoneEditorArea.querySelector(selectors.milestoneNotesEditor));
  milestoneEditorArea.querySelector(selectors.milestoneNotesEditor + ' .text-area').innerHTML = milestone.notes;

  // Add event listeners
  milestoneEditorArea.querySelector(selectors.saveMilestoneBtn)?.addEventListener('click', saveMilestone);
  milestoneEditorArea.querySelector(selectors.deleteMilestoneBtn)?.addEventListener('click', deleteMilestone);
  milestoneEditorArea.querySelector(selectors.closeMilestoneEditorBtn)?.addEventListener('click', closeMilestoneEditor); // Attach listener for the new close button

  // Deselect all bubbles then select the current one in the graph
  document.querySelectorAll('.milestone-bubble').forEach(b => b.classList.remove('selected'));
  const selectedBubble = document.querySelector(`.milestone-bubble[data-milestone-id="${milestone.id}"]`);
  if (selectedBubble) {
    selectedBubble.classList.add('selected');
    // Scroll to the selected bubble if it's not fully in view
    selectedBubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  updateButtonStates(milestoneEditorArea); // Call to set initial button states
}

/**
 * Helper to render options for a select element.
 * @param {HTMLElement} container - The container where the select element is.
 * @param {Array<string>} optionsArray - Array of strings for options.
 * @param {string} selectedValue - The value that should be pre-selected.
 */
function renderStatusSelectOptions(container, optionsArray, selectedValue) {
  const select = container.querySelector(selectors.milestoneStatusSelect);
  if (select) {
    select.innerHTML = optionsArray.map(s => 
      `<option value="${escapeHtml(s)}" ${s === selectedValue ? 'selected':''}>${escapeHtml(s)}</option>`
    ).join('');
  }
}


/**
 * Saves the current milestone to IndexedDB and to the server.
 */
async function saveMilestone() {
  if (!currentMilestone || !currentTaskId) return;

  // Enforce username requirement and creator match
  if (!currentUsername) {
      showModalAlert('Please set your username in Settings');
      return;
  }

  const milestoneEditorArea = document.querySelector(selectors.milestoneEditorArea);
  if (!milestoneEditorArea) return;

  currentMilestone.title = milestoneEditorArea.querySelector(selectors.milestoneTitleInput)?.value || '';
  currentMilestone.deadline = milestoneEditorArea.querySelector(selectors.milestoneDeadlineInput)?.value || null;
  currentMilestone.finishDate = milestoneEditorArea.querySelector(selectors.milestoneFinishDateInput)?.value || null;
  currentMilestone.status = milestoneEditorArea.querySelector(selectors.milestoneStatusSelect)?.value || '';
  currentMilestone.parentId = milestoneEditorArea.querySelector(selectors.milestoneParentSelect)?.value || null; // Capture parentId
  currentMilestone.notes = (notesEditorInstance) ? notesEditorInstance.getHTML() : '';
  currentMilestone.updatedAt = new Date().toISOString();

  await DB.putMilestone(currentMilestone); // Save to IndexedDB
  try {
    await saveMilestoneToServer(currentMilestone, currentTaskId, taskCreator); // Use centralized API service
    showModalAlert('Milestone saved!');
  } catch (error) {
    showModalAlert(`Error saving milestone: ${error.message}`);
  }
  
  // Re-render bubbles in the current modal using the callback
  if (renderMilestoneBubblesCallback) {
    // Find the actual milestonesGraphContainer which should be a parent of the editor area
    const milestonesGraphContainer = document.querySelector(selectors.milestonesGraphContainer);
    if (milestonesGraphContainer) {
        renderMilestoneBubblesCallback(currentTaskId, milestonesGraphContainer);
    }
  }
  // Re-open editor to ensure dropdowns are re-rendered if global lists change
  openMilestoneEditor(currentMilestone, currentTaskId);
}

/**
 * Deletes the current milestone from IndexedDB and from the server.
 */
async function deleteMilestone() {
  if (!currentMilestone || !currentTaskId) {
    return;
  }

  // Enforce username requirement and creator match
  if (!currentUsername || taskCreator !== currentUsername) {
      showModalAlert('You can only delete milestones for tasks you created. Please set your username in Settings or select a task you created.');
      return;
  }

  // Before deleting, check if this milestone is a parent to any other milestones
  const allMilestones = await DB.getMilestonesForTask(currentTaskId);
  const childrenMilestones = allMilestones.filter(m => m.parentId === currentMilestone.id);

  if (childrenMilestones.length > 0) {
      showModalAlert(`Cannot delete milestone "${escapeHtml(currentMilestone.title)}" because it is a parent to other milestones. Please remove its children's parent link first.`);
      return;
  }

  const confirmed = await showModalAlertConfirm(`Are you sure you want to delete milestone "${escapeHtml(currentMilestone.title)}"?`);

  if (confirmed) {
    try {
      await DB.deleteMilestone(currentMilestone.id); // Delete from IndexedDB
      await deleteMilestoneFromServer(currentMilestone.id, currentTaskId, taskCreator); // Use centralized API service

      currentMilestone = null; // Clear selected milestone
      if (updateCurrentMilestoneCallback) updateCurrentMilestoneCallback(null); // Inform graph UI no milestone is selected
      
      // Clear milestone editor area
      const milestoneEditorArea = document.querySelector(selectors.milestoneEditorArea);
      if (milestoneEditorArea) {
        milestoneEditorArea.innerHTML = '<div class="placeholder">Select a milestone to edit or add a new one.</div>';
      }

      // Re-render bubbles in the current modal
      if (renderMilestoneBubblesCallback) {
        // Find the actual milestonesGraphContainer which should be a parent of the editor area
        const milestonesGraphContainer = document.querySelector(selectors.milestonesGraphContainer);
        if (milestonesGraphContainer) {
          renderMilestoneBubblesCallback(currentTaskId, milestonesGraphContainer);
        }
      }
      showModalAlert('Milestone deleted!');
      const milestonesPage = document.querySelector(selectors.milestonesPage);
      if (milestonesPage) {
          milestonesPage.querySelector('.milestones-view-body-grid').classList.add('editor-hidden');
      }
    } catch (error) {
      showModalAlert(`Error deleting milestone: ${error.message}`);
    }
  }
}

/**
 * Clears the milestone editor area and deselects any milestone in the graph.
 */
function closeMilestoneEditor() {
  currentMilestone = null; // Clear selected milestone
  currentTaskId = null; // Clear task ID
  taskCreator = null; // Clear task creator
  if (updateCurrentMilestoneCallback) updateCurrentMilestoneCallback(null); // Inform graph UI no milestone is selected

  // Hide the editor area by adding the 'editor-hidden' class
  const milestonesPage = document.querySelector(selectors.milestonesPage);
  if (milestonesPage) {
    milestonesPage.querySelector('.milestones-view-body-grid').classList.add('editor-hidden');
  }

  // Clear milestone editor area content
  const milestoneEditorArea = document.querySelector(selectors.milestoneEditorArea);
  if (milestoneEditorArea) {
    milestoneEditorArea.innerHTML = '<div class="placeholder">Select a milestone to edit or add a new one.</div>';
  }

  // Deselect all bubbles in the graph
  // This needs to specifically target bubbles within the visible graph container,
  // in case there are other '.milestone-bubble' elements elsewhere.
  const graphContainer = document.querySelector(selectors.milestonesGraphContainer);
  if (graphContainer) {
      graphContainer.querySelectorAll('.milestone-bubble').forEach(b => b.classList.remove('selected'));
  }
  // Clear editor instance
  notesEditorInstance = null;
}
