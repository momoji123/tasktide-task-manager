// taskEditorUI.js
// This module manages the main task editing area, including displaying,
// saving, deleting tasks, and handling task-specific categories and attachments.

import { DB } from './storage.js';
import { Editor } from './editor.js';
import { escapeHtml, showModalAlert, showModalAlertConfirm } from './utilUI.js';

// Internal state for the currently edited task and global options
let currentTask = null;
let categories = [];
let statuses = [];
let froms = [];
let renderTaskListCallback = null; // Callback to re-render the task list after save/delete
let openMilestonesViewCallback = null; // Callback to open the milestone view
let openTaskViewerCallback = null; // New: Callback to open the task viewer

const selectors = {
  editorArea: '#editorArea',
  taskEditor: '#editorArea .editor', // Selector for the task editor container
  taskTitleInput: '#taskTitle',
  taskFromSelect: '#taskFrom',
  taskPriorityInput: '#taskPriority',
  taskDeadlineInput: '#taskDeadline',
  taskFinishDateInput: '#taskFinishDate',
  taskStatusSelect: '#statusSelect',
  descEditor: '#descEditor',
  notesEditor: '#notesEditor',
  saveTaskBtn: '#saveBtn',
  deleteTaskBtn: '#deleteBtn',
  openMilestonesBtn: '#openMilestonesBtn',
  categoryList: '#categoryList',
  newCategorySelect: '#newCategorySelect',
  addCategoryBtn: '#addCategoryBtn',
  attachmentsList: '#attachments',
  viewerArea: '#viewerArea', // Add viewerArea selector
};

/**
 * Initializes the Task Editor module.
 * @param {object} initialState - Object containing initial categories, statuses, froms.
 * @param {function} onRenderTaskList - Callback to re-render the task list.
 * @param {function} onOpenMilestonesView - Callback to open the milestone view for a task.
 * @param {function} onOpenTaskViewer - New: Callback to open the task viewer for a task.
 */
export function initTaskEditorUI(initialState, onRenderTaskList, onOpenMilestonesView, onOpenTaskViewer) {
  categories = initialState.categories;
  statuses = initialState.statuses;
  froms = initialState.froms;
  renderTaskListCallback = onRenderTaskList;
  openMilestonesViewCallback = onOpenMilestonesView;
  openTaskViewerCallback = onOpenTaskViewer; // Initialize new callback
}

/**
 * Updates the internal lists (categories, statuses, froms).
 * This function is called from the main UI module when global state changes.
 * @param {object} updatedState - Object with updated lists.
 */
export function updateTaskEditorUIState(updatedState) {
  if (updatedState.categories) categories = updatedState.categories;
  if (updatedState.statuses) statuses = updatedState.statuses;
  if (updatedState.froms) froms = updatedState.froms;
  // If the editor is open, re-render its dropdowns
  if (currentTask && document.querySelector(selectors.taskEditor)?.style.display !== 'none') {
    // Re-render select elements if categories/statuses/froms changed
    const editorArea = document.querySelector(selectors.editorArea);
    if (editorArea && editorArea.contains(document.querySelector(selectors.taskFromSelect))) {
      renderFromOptions(editorArea);
      renderStatusOptions(editorArea);
      renderCategoryTags(); // Re-render categories assigned to the task
      renderNewCategoryDropdown(); // Re-render the "Add category" dropdown
    }
  }
}

/**
 * Opens the task editor for a given task.
 * @param {object} task - The task object to edit.
 */
export function openTaskEditor(task) {
  currentTask = task;
  const editorArea = document.querySelector(selectors.editorArea);
  if (!editorArea) return;

  // Get references to viewer and placeholder
  const viewerElement = document.querySelector(selectors.viewerArea);
  const placeholderElement = document.querySelector(selectors.editorArea + ' .placeholder');

  // Hide viewer and placeholder explicitly
  if (viewerElement) {
    viewerElement.style.display = 'none';
  }
  if (placeholderElement) {
    placeholderElement.style.display = 'none';
  }

  // Create the main editor container if it doesn't exist, or re-use it if it does
  let editorContainer = editorArea.querySelector(selectors.taskEditor);
  if (!editorContainer) {
    editorContainer = document.createElement('div');
    editorContainer.className = 'editor'; // Match the selector '#editorArea .editor'
    editorArea.appendChild(editorContainer);
  }

  // Ensure the editor container is visible and clear its content for new rendering
  editorContainer.style.display = 'grid'; // Use grid for editor layout
  editorContainer.innerHTML = ''; // Clear previous editor content

  // Now, populate editorContainer with the task-specific HTML
  editorContainer.innerHTML = `
    <div class="card">
      <div class="label">Title</div>
      <input id="taskTitle" value="${escapeHtml(task.title)}">
      <div class="label">From</div>
      <select id="taskFrom"></select>
      <div class="label">Priority (1-high,5-low)</div>
      <input id="taskPriority" type="number" min="1" max="5" value="${task.priority}">
      <div class="date-inputs">
        <div>
          <div class="label">Deadline</div>
          <input id="taskDeadline" type="date" value="${task.deadline ? task.deadline.split('T')[0]:''}">
        </div>
        <div>
          <div class="label">Finish Date</div>
          <input id="taskFinishDate" type="date" value="${task.finishDate ? task.finishDate.split('T')[0]:''}">
        </div>
      </div>
      <div class="label">Status</div>
      <select id="statusSelect"></select>
      <div class="label">Description</div>
      <div id="descEditor" class="card"></div>
      <div class="label">Notes</div>
      <div id="notesEditor" class="card"></div>
      <div style="margin-top:8px;display:flex;gap:8px">
        <button id="saveBtn">Save</button>
        <button id="deleteBtn">Delete</button>
        <button id="openMilestonesBtn">Open Milestones</button>
      </div>
    </div>
    <aside class="card">
      <div class="label">Categories</div>
      <div id="categoryList"></div>
      <div style="margin-top:8px">
        <select id="newCategorySelect" class="w-full"></select>
        <button id="addCategoryBtn">Add</button>
      </div>
      <div class="label">Attachments</div>
      <div id="attachments" class="attach-list"></div>
    </aside>
  `;

  // Populate dropdowns using the new editorContainer
  renderFromOptions(editorContainer);
  renderStatusOptions(editorContainer);

  // This callback function will be passed to the editor.
  // When a file is attached in the editor, this function is called.
  const handleAttachment = (attachment) => {
    // Ensure the attachments array exists.
    if (!currentTask.attachments) {
      currentTask.attachments = [];
    }
    // Add the new attachment to the current task's attachments array.
    currentTask.attachments.push(attachment);
    // Re-render the attachments section to show the new file.
    renderAttachments();
    // Automatically save the task with the new attachment.
    saveTask();
  };

  // Initialize rich text editors using the editorContainer
  Editor.init(editorContainer.querySelector(selectors.descEditor), { onAttach: handleAttachment });
  editorContainer.querySelector(selectors.descEditor + ' .text-area').innerHTML = task.description;

  Editor.init(editorContainer.querySelector(selectors.notesEditor), { onAttach: handleAttachment });
  editorContainer.querySelector(selectors.notesEditor + ' .text-area').innerHTML = task.notes;

  // Add event listeners for task actions
  editorContainer.querySelector(selectors.saveTaskBtn)?.addEventListener('click', saveTask);
  editorContainer.querySelector(selectors.deleteTaskBtn)?.addEventListener('click', deleteTask);
  editorContainer.querySelector(selectors.openMilestonesBtn)?.addEventListener('click', () => {
    if (openMilestonesViewCallback) openMilestonesViewCallback(currentTask.id, currentTask.title);
  });

  renderCategoryTags();
  renderAttachments();
  renderNewCategoryDropdown();

  editorContainer.querySelector(selectors.addCategoryBtn)?.addEventListener('click', () => {
    const select = editorContainer.querySelector(selectors.newCategorySelect);
    const cat = select.value;
    if (!cat || cat === '__placeholder') return; // Check for placeholder value
    if (!currentTask.categories.includes(cat)) {
      currentTask.categories.push(cat);
      renderCategoryTags();
      renderNewCategoryDropdown(); // Re-render dropdown to remove added category
      saveTask();
    }
    select.value = '__placeholder'; // Reset dropdown
  });
}

/**
 * Populates the 'From' select dropdown.
 * @param {HTMLElement} container - The container element (e.g., the editor div).
 */
function renderFromOptions(container) {
  const select = container.querySelector(selectors.taskFromSelect);
  if (select) {
    select.innerHTML = froms.map(f => `<option value="${escapeHtml(f)}" ${f === currentTask.from ? 'selected':''}>${escapeHtml(f)}</option>`).join('');
  }
}

/**
 * Populates the Status select dropdown.
 * @param {HTMLElement} container - The container element (e.g., the editor div).
 */
function renderStatusOptions(container) {
  const select = container.querySelector(selectors.taskStatusSelect);
  if (select) {
    select.innerHTML = statuses.map(s => `<option value="${escapeHtml(s)}" ${s === currentTask.status ? 'selected':''}>${escapeHtml(s)}</option>`).join('');
  }
}

/**
 * Saves the current task to IndexedDB.
 */
async function saveTask() {
  if (!currentTask) return;
  const editorContainer = document.querySelector(selectors.taskEditor);
  if (!editorContainer) return;

  currentTask.title = editorContainer.querySelector(selectors.taskTitleInput)?.value || '';
  currentTask.from = editorContainer.querySelector(selectors.taskFromSelect)?.value || '';
  currentTask.priority = parseInt(editorContainer.querySelector(selectors.taskPriorityInput)?.value, 10) || 3;
  currentTask.deadline = editorContainer.querySelector(selectors.taskDeadlineInput)?.value || null;
  currentTask.finishDate = editorContainer.querySelector(selectors.taskFinishDateInput)?.value || null;
  currentTask.status = editorContainer.querySelector(selectors.taskStatusSelect)?.value || '';
  currentTask.description = editorContainer.querySelector(selectors.descEditor + ' .text-area')?.innerHTML || '';
  currentTask.notes = editorContainer.querySelector(selectors.notesEditor + ' .text-area')?.innerHTML || '';
  currentTask.updatedAt = new Date().toISOString();

  await DB.putTask(currentTask);
  if (renderTaskListCallback) await renderTaskListCallback(); // Re-render task list
  // After saving, go back to view mode
  if (openTaskViewerCallback) {
      openTaskViewerCallback(currentTask);
  } else {
      // Fallback if viewer callback isn't set (shouldn't happen with proper init)
      openTaskEditor(currentTask); // Re-open editor to show updated state (e.g. updated date)
  }
  showModalAlert('Task saved!');
}

/**
 * Deletes the current task from IndexedDB.
 */
async function deleteTask() {
  if (!currentTask) return;
  const confirmed = await showModalAlertConfirm(`Are you sure you want to delete task "${escapeHtml(currentTask.title)}"? This will also delete all associated milestones.`);

  if (confirmed) {
    // DB.deleteTask also handles deleting associated milestones
    await DB.deleteTask(currentTask.id);
    // Call clearEditorArea to reset the UI safely
    clearEditorArea();
    currentTask = null; // Clear the current task
    if (renderTaskListCallback) await renderTaskListCallback(); // Re-render task list
    showModalAlert('Task deleted!');
  }
}

/**
 * Renders the category tags for the current task.
 */
function renderCategoryTags() {
  const list = document.querySelector(selectors.categoryList);
  if (!list) return;
  list.innerHTML = '';
  (currentTask.categories || []).forEach((cat, idx) => {
    const tag = document.createElement('div');
    tag.className = 'tag selected';
    tag.innerHTML = `${escapeHtml(cat)}<button>x</button>`;
    tag.querySelector('button')?.addEventListener('click', () => {
      currentTask.categories.splice(idx, 1);
      renderCategoryTags();
      renderNewCategoryDropdown(); // Re-render dropdown when a tag is removed
      saveTask();
    });
    list.appendChild(tag);
  });
}

/**
 * Renders the dropdown for adding new categories to a task.
 */
function renderNewCategoryDropdown() {
  const select = document.querySelector(selectors.newCategorySelect);
  if (!select) return;

  // Filter out categories already assigned to the current task
  const availableCategories = categories.filter(cat => !currentTask.categories.includes(cat));

  select.innerHTML = '<option value="__placeholder" disabled selected>Add category...</option>' + 
                     availableCategories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('\n');
}

/**
 * Renders the attachments list for the current task.
 */
function renderAttachments(){
  const el = document.querySelector(selectors.attachmentsList);
  if (!el) return;
  el.innerHTML = '';
  (currentTask.attachments || []).forEach((att, idx)=>{
    const div = document.createElement('div'); div.className = 'attachment';
    const left = document.createElement('div'); left.textContent = att.name;
    const right = document.createElement('div');
    const dl = document.createElement('a'); dl.href = att.data; dl.download = att.name; dl.textContent = 'download';
    const rm = document.createElement('button'); rm.textContent='remove'; rm.addEventListener('click', async ()=>{ 
      const confirmed = await showModalAlertConfirm(`Are you sure you want to remove "${escapeHtml(att.name)}"?`);
      if (confirmed) {
        currentTask.attachments.splice(idx,1); 
        renderAttachments(); 
        saveTask();
      }
    });
    right.appendChild(dl); right.appendChild(document.createTextNode(' ')); right.appendChild(rm);
    div.appendChild(left); div.appendChild(right); el.appendChild(div);
  });
}

/**
 * Clears the editor area and shows the placeholder.
 * This is useful when no task is selected or a task is deleted.
 */
export function clearEditorArea() {
  // Get references to viewer, editor, and placeholder
  const viewerElement = document.querySelector(selectors.viewerArea);
  const editorElement = document.querySelector(selectors.taskEditor);
  const placeholderElement = document.querySelector(selectors.editorArea + ' .placeholder');

  // Hide viewer and editor explicitly if they exist
  if (viewerElement) {
      viewerElement.style.display = 'none';
  }
  if (editorElement) {
      editorElement.style.display = 'none';
  }

  // Show the placeholder, or create it if it doesn't exist (e.g., if editorArea was empty)
  if (placeholderElement) {
      placeholderElement.style.display = 'block';
  } else {
      document.querySelector(selectors.editorArea).innerHTML = '<div class="placeholder">Select or create a task to view/edit details</div>';
  }
  currentTask = null;
}
