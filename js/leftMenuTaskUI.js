// leftMenuTaskUI.js
// This module manages the left sidebar, including task list rendering,
// search, filtering (category, status, date ranges), sorting, and grouping.

import { escapeHtml } from './utilUI.js';
import { loadTaskFromServer, loadTasksSummaryFromServer } from './apiService.js';
import { DB } from './storage.js'; // Keep DB for persisting filter metadata

// Internal state, initialized by the main UI module
let categories = [];
let statuses = [];
let filterSectionVisible = true;
let selectedFilterCategories = [];
let selectedFilterStatuses = [];
let openTaskEditorFn = null;
let openTaskViewerFn = null;
let currentSelectedTaskId = null; // New state to hold the ID of the currently selected task
let currentUsername = null; // To get the current user's username for loading tasks

const selectors = {
  newTaskBtn: '#newTaskBtn',
  searchInput: '#searchInput',
  taskList: '#taskList',
  filterCategoryMultiSelect: '#filterCategoryMultiSelect',
  filterCategoryHeader: '#filterCategoryMultiSelect .multi-select-header',
  selectedFilterCategoriesDisplay: '#selectedFilterCategoriesDisplay',
  filterCategoryDropdownContent: '#filterCategoryDropdownContent',
  
  filterStatusMultiSelect: '#filterStatusMultiSelect',
  filterStatusHeader: '#filterStatusMultiSelect .multi-select-header',
  selectedFilterStatusesDisplay: '#selectedFilterStatusesDisplay',
  filterStatusDropdownContent: '#filterStatusDropdownContent',

  sortBy: '#sortBy',
  groupBy: '#groupBy',
  createdRangeFrom: '#createdRangeFrom',
  createdRangeTo: '#createdRangeTo',
  updatedRangeFrom: '#updatedRangeFrom',
  updatedRangeTo: '#updatedRangeTo',
  deadlineRangeFrom: '#deadlineRangeFrom',
  deadlineRangeTo: '#deadlineRangeTo',
  finishedRangeFrom: '#finishedRangeFrom',
  finishedRangeTo: '#finishedRangeTo',
  toggleFilterBtn: '#toggleFilterBtn',
  filterSection: '#filterSection',
  filterColumn: '#filterColumn',
  appContainer: '#app',
  sidebar: '.sidebar',
};

/**
 * Initializes left menu task UI event listeners and state.
 * @param {object} initialState - Object containing initial categories, statuses, filter states, and username.
 * @param {function} onOpenEditor - Callback function to open the task editor.
 * @param {function} onOpenViewer - Callback function to open the task viewer.
 */
export async function initLeftMenuTaskUI(initialState, onOpenEditor, onOpenViewer) {
  categories = initialState.categories;
  statuses = initialState.statuses;
  filterSectionVisible = initialState.filterSectionVisible;
  selectedFilterCategories = initialState.selectedFilterCategories;
  selectedFilterStatuses = initialState.selectedFilterStatuses || []; 
  currentUsername = initialState.username;

  const appContainer = document.querySelector(selectors.appContainer);
  if (appContainer) {
    appContainer.classList.toggle('filter-active', filterSectionVisible);
  }

  // Assign the passed-in functions to the internal module variables
  openTaskEditorFn = onOpenEditor;
  openTaskViewerFn = onOpenViewer;

  document.querySelector(selectors.newTaskBtn)?.addEventListener('click', () => {
    // Clear current selected task when creating a new one
    currentSelectedTaskId = null;
    // Remove selected class from any previously selected task item
    const previouslySelected = document.querySelector('.selected-task-item');
    if (previouslySelected) {
      previouslySelected.classList.remove('selected-task-item');
    }

    const id = 't_' + Date.now();
    const emptyTask = {
      id,
      title: 'Untitled',
      description: '',
      notes: '',
      attachments: [],
      priority: 3,
      deadline: null,
      finishDate: null,
      from: initialState.froms[0] || '',
      categories: [initialState.categories[0] || 'General'],
      status: initialState.statuses[0] || 'todo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      creator: currentUsername
    };
    if (openTaskEditorFn) {
        openTaskEditorFn(emptyTask, true);
    }
  });

  // Event listeners for filters and sorting
  document.querySelector(selectors.createdRangeFrom)?.addEventListener('change', renderTaskList);
  document.querySelector(selectors.createdRangeTo)?.addEventListener('change', renderTaskList);
  document.querySelector(selectors.updatedRangeFrom)?.addEventListener('change', renderTaskList);
  document.querySelector(selectors.updatedRangeTo)?.addEventListener('change', renderTaskList);
  document.querySelector(selectors.deadlineRangeFrom)?.addEventListener('change', renderTaskList);
  document.querySelector(selectors.deadlineRangeTo)?.addEventListener('change', renderTaskList);
  document.querySelector(selectors.finishedRangeFrom)?.addEventListener('change', renderTaskList);
  document.querySelector(selectors.finishedRangeTo)?.addEventListener('change', renderTaskList);
  document.querySelector(selectors.searchInput)?.addEventListener('input', renderTaskList);
  document.querySelector(selectors.sortBy)?.addEventListener('change', renderTaskList);
  document.querySelector(selectors.groupBy)?.addEventListener('change', renderTaskList);

  const filterCategoryHeader = document.querySelector(selectors.filterCategoryHeader);
  const filterCategoryDropdownContent = document.querySelector(selectors.filterCategoryDropdownContent);

  if (filterCategoryHeader) {
    filterCategoryHeader.addEventListener('click', (event) => {
      filterCategoryDropdownContent?.classList.toggle('show');
      event.stopPropagation();
    });
  }

  const filterStatusHeader = document.querySelector(selectors.filterStatusHeader);
  const filterStatusDropdownContent = document.querySelector(selectors.filterStatusDropdownContent);

  if (filterStatusHeader) {
    filterStatusHeader.addEventListener('click', (event) => {
      filterStatusDropdownContent?.classList.toggle('show');
      event.stopPropagation();
    });
  }

  window.addEventListener('click', (event) => {
    if (filterCategoryDropdownContent && !event.target.closest(selectors.filterCategoryMultiSelect) && filterCategoryDropdownContent.classList.contains('show')) {
      filterCategoryDropdownContent.classList.remove('show');
    }
    if (filterStatusDropdownContent && !event.target.closest(selectors.filterStatusMultiSelect) && filterStatusDropdownContent.classList.contains('show')) {
      filterStatusDropdownContent.classList.remove('show');
    }
  });

  const toggleFilterBtn = document.querySelector(selectors.toggleFilterBtn);
  const filterColumn = document.querySelector(selectors.filterColumn);

  if (toggleFilterBtn && appContainer) {
    toggleFilterBtn.addEventListener('click', async () => {
      filterSectionVisible = !filterSectionVisible;
      appContainer.classList.toggle('filter-active', filterSectionVisible);
      await DB.putMeta('filterSectionVisible', filterSectionVisible);
    });
  }

  renderFilterCategoriesMultiSelect();
  renderFilterStatusMultiSelect();
  await renderTaskList();
}

/**
 * Updates the internal lists (categories, statuses) and filter states.
 * This function is called from the main UI module when global state changes.
 * @param {object} updatedState - Object with updated lists/states.
 */
export function updateLeftMenuTaskUIState(updatedState) {
  if (updatedState.categories) categories = updatedState.categories;
  if (updatedState.statuses) statuses = updatedState.statuses;
  if (updatedState.filterSectionVisible !== undefined) filterSectionVisible = updatedState.filterSectionVisible;
  if (updatedState.selectedFilterCategories) selectedFilterCategories = updatedState.selectedFilterCategories;
  if (updatedState.selectedFilterStatuses) selectedFilterStatuses = updatedState.selectedFilterStatuses;
  if (updatedState.username !== undefined) currentUsername = updatedState.username;

  if (updatedState.currentSelectedTaskId !== undefined) currentSelectedTaskId = updatedState.currentSelectedTaskId;
  
  const appContainer = document.querySelector(selectors.appContainer);
  if (appContainer) {
    appContainer.classList.toggle('filter-active', filterSectionVisible);
  }
  renderFilterCategoriesMultiSelect();
  renderFilterStatusMultiSelect();
  renderTaskList();
}

/**
 * Renders the list of tasks based on current filters and sorting/grouping.
 * Fetches data directly from the server API with applied filters.
 */
export async function renderTaskList() {
  const container = document.querySelector(selectors.taskList);
  if (!container) return;
  container.innerHTML = '';

  const filters = {
    q: document.querySelector(selectors.searchInput)?.value || '',
    categories: selectedFilterCategories,
    statuses: selectedFilterStatuses,
    sortBy: document.querySelector(selectors.sortBy)?.value || 'updatedAt',
    createdRF: document.querySelector(selectors.createdRangeFrom)?.value,
    createdRT: document.querySelector(selectors.createdRangeTo)?.value,
    updatedRF: document.querySelector(selectors.updatedRangeFrom)?.value,
    updatedRT: document.querySelector(selectors.updatedRangeTo)?.value,
    deadlineRF: document.querySelector(selectors.deadlineRangeFrom)?.value,
    deadlineRT: document.querySelector(selectors.deadlineRangeTo)?.value,
    finishedRF: document.querySelector(selectors.finishedRangeFrom)?.value,
    finishedRT: document.querySelector(selectors.finishedRangeTo)?.value,
  };

  let tasks = [];
  try {
    tasks = await loadTasksSummaryFromServer(filters);
  } catch (error) {
    console.error("Error fetching tasks from server:", error);
    container.innerHTML = '<div class="error-message">Failed to load tasks. Please try again or log in.</div>';
    return;
  }

  const groupVal = document.querySelector(selectors.groupBy)?.value || '__none';

  if (groupVal === '__none') {
      renderTaskItems(container, tasks);
  } else {
      const groupedTasks = {};
      
      tasks.forEach(task => {
          if (groupVal === 'category' && task.categories && task.categories.length > 0) {
              task.categories.forEach(category => {
                  const groupKey = category || 'No Category';
                  if (!groupedTasks[groupKey]) {
                      groupedTasks[groupKey] = [];
                  }
                  if (!groupedTasks[groupKey].some(t => t.id === task.id)) {
                      groupedTasks[groupKey].push(task);
                  }
              });
          } else {
              let groupKey;
              switch (groupVal) {
                  case 'from':
                      groupKey = task.from || 'No From';
                      break;
                  case 'status':
                      groupKey = task.status || 'No Status';
                      break;
                  case 'priority':
                      groupKey = task.priority ? `Priority ${task.priority}` : "No Priority";
                      break;
                  case 'deadlineYear':
                      groupKey = task.deadline ? new Date(task.deadline).getFullYear().toString() : 'No Deadline';
                      break;
                  case 'deadlineMonthYear':
                      groupKey = task.deadline ? new Date(task.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : 'No Deadline';
                      break;
                  case 'finishDateYear':
                      groupKey = task.finishDate ? new Date(task.finishDate).getFullYear().toString() : 'No Finish Date';
                      break;
                  case 'finishDateMonthYear':
                      groupKey = task.finishDate ? new Date(task.finishDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : 'No Finish Date';
                      break;
                  case 'createdAtYear':
                      groupKey = task.createdAt ? new Date(task.createdAt).getFullYear().toString() : 'No Creation Date';
                      break;
                  case 'createdAtMonthYear':
                      groupKey = task.createdAt ? new Date(task.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : 'No Creation Date';
                      break;
                  default:
                      groupKey = 'No Group';
              }

              if (!groupedTasks[groupKey]) {
                  groupedTasks[groupKey] = [];
              }
              groupedTasks[groupKey].push(task);
          }
      });

      const sortedGroupKeys = Object.keys(groupedTasks).sort((a, b) => {
          if (groupVal.includes('MonthYear')) {
              const dateA = new Date(a);
              const dateB = new Date(b);
              if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) return dateA.getTime() - dateB.getTime();
          } else if (groupVal.includes('Year')) {
              const yearA = parseInt(a.replace(/\D/g, ''), 10);
              const yearB = parseInt(b.replace(/\D/g, ''), 10);
              if (!isNaN(yearA) && !isNaN(yearB)) return yearA - yearB;
          } else if (groupVal === 'priority') {
              const pA = parseInt(a.replace('Priority ', ''), 10);
              const pB = parseInt(b.replace('Priority ', ''), 10);
              if (!isNaN(pA) && !isNaN(pB)) return pA - pB;
          }
          if (a.startsWith('No ')) return 1;
          if (b.startsWith('No ')) return -1;
          return a.localeCompare(b);
      });

      sortedGroupKeys.forEach(groupKey => {
          const groupHeaderDiv = document.createElement('div');
          groupHeaderDiv.className = 'group-header';
          groupHeaderDiv.innerHTML = `
              <h4>${escapeHtml(groupKey)}</h4>
              <button class="toggle-group-btn" data-group-key="${escapeHtml(groupKey)}">&#9660;</button>
          `;
          const groupContentDiv = document.createElement('div');
          groupContentDiv.className = 'group-content show';

          container.appendChild(groupHeaderDiv);
          container.appendChild(groupContentDiv);

          groupHeaderDiv.querySelector('.toggle-group-btn')?.addEventListener('click', (e) => {
              const btn = e.target;
              const content = btn.parentElement.nextElementSibling;
              content?.classList.toggle('show');
              if (content) {
                btn.innerHTML = content.classList.contains('show') ? '&#9660;' : '&#9658;';
              }
          });

          renderTaskItems(groupContentDiv, groupedTasks[groupKey]);
      });
  }
}

/**
 * Renders individual task items into a container.
 * @param {HTMLElement} container - The DOM element to render tasks into.
 * @param {Array<object>} tasksToRender - Array of task objects to render.
 */
function renderTaskItems(container, tasksToRender) {
  const tmpl = document.getElementById('task-item-template')?.content;
  if (!tmpl) return;

  tasksToRender.forEach(t => {
    const node = tmpl.cloneNode(true);
    const el = node.querySelector('.task-item');
    if (!el) return;

    el.querySelector('.title').textContent = t.title || '(no title)';
    el.querySelector('.meta').textContent = `${escapeHtml(t.from || '—')} • ${escapeHtml(t.categories?.join(', ') || 'No Category')} • ${escapeHtml(t.status)}`;
    
    const deadlineText = t.deadline ? `Due: ${new Date(t.deadline).toLocaleDateString()}` : '';
    const finishDateText = t.finishDate ? `Finished: ${new Date(t.finishDate).toLocaleDateString()}` : '';

    el.querySelector('.priority').textContent = ['!', '!!', '!!!'][Math.max(0, 3 - t.priority)] || t.priority;
    
    const deadlineDisplay = el.querySelector('.deadline-display');
    const finishDateDisplay = el.querySelector('.finish-date-display');

    if (deadlineDisplay) {
      deadlineDisplay.textContent = deadlineText;
    }
    if (finishDateDisplay) {
      finishDateDisplay.textContent = finishDateText;
    }

    // Add selected-task-item class if this task is the currently selected one
    if (t.id === currentSelectedTaskId) {
      el.classList.add('selected-task-item');
    } else {
      el.classList.remove('selected-task-item');
    }

    el.addEventListener('click', async () => {
      // Remove 'selected-task-item' from the previously selected task
      const previouslySelected = document.querySelector('.selected-task-item');
      if (previouslySelected && previouslySelected !== el) {
        previouslySelected.classList.remove('selected-task-item');
      }

      // Add 'selected-task-item' to the newly clicked task
      el.classList.add('selected-task-item');

      // Update the currentSelectedTaskId
      currentSelectedTaskId = t.id;
      
      let fullTask = t;
      if (t.creator) {
          fullTask = await loadTaskFromServer(t.id) || t;
      }

      if (openTaskViewerFn) {
          openTaskViewerFn(fullTask, false);
      }

      const appContainer = document.querySelector(selectors.appContainer);
      if (window.innerWidth <= 768) {
        appContainer.classList.remove('sidebar-active');
        appContainer.classList.add('viewer-active');
      }
    });
    container.appendChild(node);
  });
}

/**
 * Renders the multi-select category filter UI.
 */
export async function renderFilterCategoriesMultiSelect() {
  const selectedDisplay = document.querySelector(selectors.selectedFilterCategoriesDisplay);
  const dropdownContent = document.querySelector(selectors.filterCategoryDropdownContent);

  if (!selectedDisplay || !dropdownContent) return;

  selectedDisplay.innerHTML = '';
  dropdownContent.innerHTML = '';

  if (selectedFilterCategories.length === 0) {
    selectedDisplay.innerHTML = '<span class="placeholder-text">All Categories</span>';
  } else {
    selectedFilterCategories.forEach((cat) => {
      const tag = document.createElement('div');
      tag.className = 'selected-tag';
      tag.innerHTML = `${escapeHtml(cat)}<button data-cat="${escapeHtml(cat)}">x</button>`;
      tag.querySelector('button')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const categoryToRemove = e.target.dataset.cat;
        selectedFilterCategories = selectedFilterCategories.filter(c => c !== categoryToRemove);
        await DB.putMeta('selectedFilterCategories', selectedFilterCategories);
        renderFilterCategoriesMultiSelect();
        renderTaskList();
      });
      selectedDisplay.appendChild(tag);
    });
  }

  categories.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.textContent = escapeHtml(cat);
    if (selectedFilterCategories.includes(cat)) {
      item.classList.add('selected');
    }

    item.addEventListener('click', async (e) => {
      e.stopPropagation();

      if (selectedFilterCategories.includes(cat)) {
        selectedFilterCategories = selectedFilterCategories.filter(c => c !== cat);
      } else {
        selectedFilterCategories.push(cat);
      }
      await DB.putMeta('selectedFilterCategories', selectedFilterCategories);
      renderFilterCategoriesMultiSelect();
      renderTaskList();
    });
    dropdownContent.appendChild(item);
  });
}

/**
 * Renders the multi-select status filter UI.
 */
export async function renderFilterStatusMultiSelect() {
  const selectedDisplay = document.querySelector(selectors.selectedFilterStatusesDisplay);
  const dropdownContent = document.querySelector(selectors.filterStatusDropdownContent);

  if (!selectedDisplay || !dropdownContent) return;

  selectedDisplay.innerHTML = '';
  dropdownContent.innerHTML = '';

  if (selectedFilterStatuses.length === 0) {
    selectedDisplay.innerHTML = '<span class="placeholder-text">All Statuses</span>';
  } else {
    selectedFilterStatuses.forEach((status) => {
      const tag = document.createElement('div');
      tag.className = 'selected-tag';
      tag.innerHTML = `${escapeHtml(status)}<button data-status="${escapeHtml(status)}">x</button>`;
      tag.querySelector('button')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const statusToRemove = e.target.dataset.status;
        selectedFilterStatuses = selectedFilterStatuses.filter(s => s !== statusToRemove);
        await DB.putMeta('selectedFilterStatuses', selectedFilterStatuses);
        renderFilterStatusMultiSelect();
        renderTaskList();
      });
      selectedDisplay.appendChild(tag);
    });
  }

  statuses.forEach(status => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.textContent = escapeHtml(status);
    if (selectedFilterStatuses.includes(status)) {
      item.classList.add('selected');
    }

    item.addEventListener('click', async (e) => {
      e.stopPropagation();

      if (selectedFilterStatuses.includes(status)) {
        selectedFilterStatuses = selectedFilterStatuses.filter(s => s !== status);
      } else {
        selectedFilterStatuses.push(status);
      }
      await DB.putMeta('selectedFilterStatuses', selectedFilterStatuses);
      renderFilterStatusMultiSelect();
      renderTaskList();
    });
    dropdownContent.appendChild(item);
  });
}

// Function to handle showing the sidebar (e.g., when a close button is clicked)
export function showLeftMenu() {
  const appContainer = document.querySelector(selectors.appContainer);
  if (window.innerWidth <= 768) {
    appContainer.classList.remove('editor-active', 'viewer-active');
    appContainer.classList.add('sidebar-active');
  }
}
