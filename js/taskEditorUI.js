// taskEditorUI.js
// This module manages the main task editing area, including displaying,
// saving, deleting tasks, and handling task-specific categories and attachments.

import { DB } from './storage.js';
import { Editor } from './editor.js'; // Assuming Editor is a separate module
import { escapeHtml, showModalAlert, showModalAlertConfirm } from './utilUI.js';

// Internal state for the currently edited task and global options
let currentTask = null;
let categories = [];
let statuses = [];
let froms = [];
let renderTaskListCallback = null; // Callback to re-render the task list after save/delete
let openMilestonesViewCallback = null; // Callback to open the milestone view

const selectors = {
  editorArea: '#editorArea',
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
};

/**
 * Initializes the Task Editor module.
 * @param {object} initialState - Object containing initial categories, statuses, froms.
 * @param {function} onRenderTaskList - Callback to re-render the task list.
 * @param {function} onOpenMilestonesView - Callback to open the milestone view for a task.
 */
export function initTaskEditorUI(initialState, onRenderTaskList, onOpenMilestonesView) {
  categories = initialState.categories;
  statuses = initialState.statuses;
  froms = initialState.froms;
  renderTaskListCallback = onRenderTaskList;
  openMilestonesViewCallback = onOpenMilestonesView;
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
  if (currentTask) {
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
  const area = document.querySelector(selectors.editorArea);
  if (!area) return;

  area.innerHTML = `
    <div class="editor">
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
    </div>
  `;

  // Populate dropdowns
  renderFromOptions(area);
  renderStatusOptions(area);

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

  // Initialize rich text editors
  Editor.init(area.querySelector(selectors.descEditor), { onAttach: handleAttachment });
  area.querySelector(selectors.descEditor + ' .text-area').innerHTML = task.description;

  Editor.init(area.querySelector(selectors.notesEditor), { onAttach: handleAttachment });
  area.querySelector(selectors.notesEditor + ' .text-area').innerHTML = task.notes;

  // Add event listeners for task actions
  area.querySelector(selectors.saveTaskBtn)?.addEventListener('click', saveTask);
  area.querySelector(selectors.deleteTaskBtn)?.addEventListener('click', deleteTask);
  area.querySelector(selectors.openMilestonesBtn)?.addEventListener('click', () => {
    if (openMilestonesViewCallback) openMilestonesViewCallback(currentTask.id, currentTask.title);
  });

  renderCategoryTags();
  renderAttachments();
  renderNewCategoryDropdown();

  area.querySelector(selectors.addCategoryBtn)?.addEventListener('click', () => {
    const select = area.querySelector(selectors.newCategorySelect);
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
 * @param {HTMLElement} editorContainer - The container element for the editor (e.g., #editorArea).
 */
function renderFromOptions(editorContainer) {
  const select = editorContainer.querySelector(selectors.taskFromSelect);
  if (select) {
    select.innerHTML = froms.map(f => `<option value="${escapeHtml(f)}" ${f === currentTask.from ? 'selected':''}>${escapeHtml(f)}</option>`).join('');
  }
}

/**
 * Populates the Status select dropdown.
 * @param {HTMLElement} editorContainer - The container element for the editor (e.g., #editorArea).
 */
function renderStatusOptions(editorContainer) {
  const select = editorContainer.querySelector(selectors.taskStatusSelect);
  if (select) {
    select.innerHTML = statuses.map(s => `<option value="${escapeHtml(s)}" ${s === currentTask.status ? 'selected':''}>${escapeHtml(s)}</option>`).join('');
  }
}

/**
 * Saves the current task to IndexedDB.
 */
async function saveTask() {
  if (!currentTask) return;
  const editorArea = document.querySelector(selectors.editorArea);
  if (!editorArea) return;

  currentTask.title = editorArea.querySelector(selectors.taskTitleInput)?.value || '';
  currentTask.from = editorArea.querySelector(selectors.taskFromSelect)?.value || '';
  currentTask.priority = parseInt(editorArea.querySelector(selectors.taskPriorityInput)?.value, 10) || 3;
  currentTask.deadline = editorArea.querySelector(selectors.taskDeadlineInput)?.value || null;
  currentTask.finishDate = editorArea.querySelector(selectors.taskFinishDateInput)?.value || null;
  currentTask.status = editorArea.querySelector(selectors.taskStatusSelect)?.value || '';
  currentTask.description = editorArea.querySelector(selectors.descEditor + ' .text-area')?.innerHTML || '';
  currentTask.notes = editorArea.querySelector(selectors.notesEditor + ' .text-area')?.innerHTML || '';
  currentTask.updatedAt = new Date().toISOString();

  await DB.putTask(currentTask);
  if (renderTaskListCallback) await renderTaskListCallback(); // Re-render task list
  openTaskEditor(currentTask); // Re-open editor to show updated state (e.g. updated date)
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
    document.querySelector(selectors.editorArea).innerHTML = '<div class="placeholder">Select or create a task to view/edit details</div>';
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