// milestoneEditorUI.js
// This module handles the detailed editing form for individual milestones,
// including populating the form, saving changes, and deleting milestones.

import { DB } from './storage.js';
import { Editor } from './editor.js'; // Assuming Editor is a separate module
import { escapeHtml, showModalAlert, showModalAlertConfirm } from './utilUI.js';

// Internal state for global options and callbacks
let statuses = [];
let currentMilestone = null; // Stores the milestone currently being edited
let currentTaskId = null; // Stores the ID of the task this milestone belongs to
let renderMilestoneBubblesCallback = null; // Callback to re-render the milestone graph
let updateCurrentMilestoneCallback = null; // Callback to update selected state in graph UI

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
};

/**
 * Initializes the Milestone Editor UI module.
 * @param {object} initialState - Object containing initial statuses.
 * @param {function} onRenderMilestoneBubbles - Callback to re-render the milestone graph.
 * @param {function} onUpdateCurrentMilestone - Callback to update the selected milestone in graph UI.
 */
export function initMilestoneEditorUI(initialState, onRenderMilestoneBubbles, onUpdateCurrentMilestone) {
  statuses = initialState.statuses;
  renderMilestoneBubblesCallback = onRenderMilestoneBubbles;
  updateCurrentMilestoneCallback = onUpdateCurrentMilestone;
}

/**
 * Updates the internal statuses list.
 * This function is called from the main UI module when global state changes.
 * @param {object} updatedState - Object with updated lists.
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
}

/**
 * Opens the milestone editor for a given milestone.
 * @param {object} milestone - The milestone object to edit.
 * @param {string} taskId - The ID of the parent task.
 */
export async function openMilestoneEditor(milestone, taskId) {
  currentMilestone = milestone; // Set the currently selected milestone
  currentTaskId = taskId; // Store the task ID
  if (updateCurrentMilestoneCallback) updateCurrentMilestoneCallback(milestone); // Inform graph UI

  const milestoneEditorArea = document.querySelector(selectors.milestoneEditorArea);
  if (!milestoneEditorArea) return;

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
  const parentSelect = milestoneEditorArea.querySelector(selectors.milestoneParentSelect);
  const allMilestones = await DB.getMilestonesForTask(taskId);
  parentSelect.innerHTML = '<option value="">-- No Parent Milestone --</option>' + 
                           allMilestones
                             .filter(m => m.id !== milestone.id) // Cannot be its own parent
                             .map(m => `<option value="${escapeHtml(m.id)}" ${m.id === milestone.parentId ? 'selected' : ''}>${escapeHtml(m.title)}</option>`)
                             .join('');


  // Initialize Editor for notes
  Editor.init(milestoneEditorArea.querySelector(selectors.milestoneNotesEditor));
  milestoneEditorArea.querySelector(selectors.milestoneNotesEditor + ' .text-area').innerHTML = milestone.notes;

  // Add event listeners
  milestoneEditorArea.querySelector(selectors.saveMilestoneBtn)?.addEventListener('click', saveMilestone);
  milestoneEditorArea.querySelector(selectors.deleteMilestoneBtn)?.addEventListener('click', deleteMilestone);

  // Deselect all bubbles then select the current one in the graph
  document.querySelectorAll('.milestone-bubble').forEach(b => b.classList.remove('selected'));
  const selectedBubble = document.querySelector(`.milestone-bubble[data-milestone-id="${milestone.id}"]`);
  if (selectedBubble) {
    selectedBubble.classList.add('selected');
    // Scroll to the selected bubble if it's not fully in view
    selectedBubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
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
 * Saves the current milestone to IndexedDB.
 */
async function saveMilestone() {
  if (!currentMilestone || !currentTaskId) return;

  const milestoneEditorArea = document.querySelector(selectors.milestoneEditorArea);
  if (!milestoneEditorArea) return;

  currentMilestone.title = milestoneEditorArea.querySelector(selectors.milestoneTitleInput)?.value || '';
  currentMilestone.deadline = milestoneEditorArea.querySelector(selectors.milestoneDeadlineInput)?.value || null;
  currentMilestone.finishDate = milestoneEditorArea.querySelector(selectors.milestoneFinishDateInput)?.value || null;
  currentMilestone.status = milestoneEditorArea.querySelector(selectors.milestoneStatusSelect)?.value || '';
  currentMilestone.parentId = milestoneEditorArea.querySelector(selectors.milestoneParentSelect)?.value || null; // Capture parentId
  currentMilestone.notes = milestoneEditorArea.querySelector(selectors.milestoneNotesEditor + ' .text-area')?.innerHTML || '';
  currentMilestone.updatedAt = new Date().toISOString();

  await DB.putMilestone(currentMilestone);
  
  // Re-render bubbles in the current modal using the callback
  if (renderMilestoneBubblesCallback) {
    const milestonesGraphContainer = document.querySelector(selectors.milestonesGraphContainer); // This selector needs to be accessible in this scope if the graph is open
    if (milestonesGraphContainer) {
        renderMilestoneBubblesCallback(currentTaskId, milestonesGraphContainer);
    }
  }
  showModalAlert('Milestone saved!');
  // Re-open editor to ensure dropdowns are re-rendered if global lists change
  openMilestoneEditor(currentMilestone, currentTaskId);
}

/**
 * Deletes the current milestone from IndexedDB.
 */
async function deleteMilestone() {
  if (!currentMilestone || !currentTaskId) return;

  // Before deleting, check if this milestone is a parent to any other milestones
  const allMilestones = await DB.getMilestonesForTask(currentTaskId);
  const childrenMilestones = allMilestones.filter(m => m.parentId === currentMilestone.id);

  if (childrenMilestones.length > 0) {
      showModalAlert(`Cannot delete milestone "${escapeHtml(currentMilestone.title)}" because it is a parent to other milestones. Please remove its children's parent link first.`);
      return;
  }

  const confirmed = await showModalAlertConfirm(`Are you sure you want to delete milestone "${escapeHtml(currentMilestone.title)}"?`);

  if (confirmed) {
    await DB.deleteMilestone(currentMilestone.id);
    currentMilestone = null; // Clear selected milestone
    if (updateCurrentMilestoneCallback) updateCurrentMilestoneCallback(null); // Inform graph UI no milestone is selected
    
    // Clear milestone editor area
    const milestoneEditorArea = document.querySelector(selectors.milestoneEditorArea);
    if (milestoneEditorArea) {
      milestoneEditorArea.innerHTML = '<div class="placeholder">Select a milestone to edit or add a new one.</div>';
    }

    // Re-render bubbles in the current modal
    if (renderMilestoneBubblesCallback) {
      const milestonesGraphContainer = document.querySelector(selectors.milestonesGraphContainer);
      if (milestonesGraphContainer) {
        renderMilestoneBubblesCallback(currentTaskId, milestonesGraphContainer);
      }
    }
    showModalAlert('Milestone deleted!');
  }
}