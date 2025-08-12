import {DB} from './storage.js';
import {Editor} from './editor.js';

export const UI = (function() {
  const selectors = {
    newTaskBtn: '#newTaskBtn', searchInput: '#searchInput', taskList: '#taskList', editorArea: '#editorArea',
    // Updated selectors for multi-select category filter
    filterCategoryMultiSelect: '#filterCategoryMultiSelect',
    filterCategoryHeader: '#filterCategoryMultiSelect .multi-select-header',
    selectedFilterCategoriesDisplay: '#selectedFilterCategoriesDisplay',
    filterCategoryDropdownContent: '#filterCategoryDropdownContent',

    filterStatus: '#filterStatus', sortBy: '#sortBy', groupBy: '#groupBy', // Add groupBy selector
    // Updated date range selectors
    createdRangeFrom: '#createdRangeFrom', createdRangeTo: '#createdRangeTo',
    updatedRangeFrom: '#updatedRangeTo', updatedRangeTo: '#updatedRangeTo',
    deadlineRangeFrom: '#deadlineRangeFrom', deadlineRangeTo: '#deadlineRangeTo',
    finishedRangeFrom: '#finishedRangeFrom', finishedRangeTo: '#finishedRangeTo',

    exportBtn: '#exportBtn', importBtn: '#importBtn', importFile: '#importFile',
    settingsBtn: '#settingsBtn', settingsDropdown: '#settingsDropdown',
    manageCategoriesBtn: '#manageCategoriesBtn', manageStatusesBtn: '#manageStatusesBtn', manageFromsBtn: '#manageFromsBtn',
    toggleFilterBtn: '#toggleFilterBtn', filterSection: '#filterSection', clearAllBtn: '#clearAllBtn',
    filterColumn: '#filterColumn', // New selector for the filter column
  };

  let currentTask = null;
  let categories = [];
  let statuses = [];
  let froms = [];
  let filterSectionVisible = true; // Default state for filter section visibility
  let selectedFilterCategories = []; // New state for multi-select categories filter

  // Helper function for creating a modal
  function createModal(title, contentHtml, showSaveButton = true) {
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
    } else {
      saveBtn.textContent = 'Save'; // Ensure it says save for regular modals
      saveBtn.classList.remove('danger'); // Remove danger class for generic save
    }

    return new Promise((resolve) => {
      saveBtn.addEventListener('click', () => {
        // For general modals, we assume the content itself manages the value or it's a confirmation
        // For this new list manager modal, the showListManagerModal will handle resolution.
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


  async function init() {
    // Load custom options from DB
    categories = (await DB.getMeta('categories')) || ['General'];
    statuses = (await DB.getMeta('statuses')) || ['todo', 'in-progress', 'done'];
    froms = (await DB.getMeta('froms')) || ['Work', 'Personal', 'Shopping'];
    // Load filter section visibility state
    filterSectionVisible = (await DB.getMeta('filterSectionVisible')) ?? true;
    // Load selected filter categories
    selectedFilterCategories = (await DB.getMeta('selectedFilterCategories')) || [];


    renderFilterCategoriesMultiSelect(); // Render the new multi-select category filter
    renderStatusOptions();

    document.querySelector(selectors.newTaskBtn).addEventListener('click', () => openTaskEditor(createEmptyTask()));
    
    // Event listener for the new settings button to toggle the dropdown
    const settingsBtn = document.querySelector(selectors.settingsBtn);
    const settingsDropdown = document.querySelector(selectors.settingsDropdown);

    settingsBtn.addEventListener('click', (event) => {
        settingsDropdown.classList.toggle('show');
        event.stopPropagation(); // Prevent the document click listener from immediately closing it
    });

    // Close the dropdown if the user clicks outside of it
    window.addEventListener('click', (event) => {
        if (!event.target.matches(selectors.settingsBtn) && !event.target.closest(selectors.filterCategoryMultiSelect) && settingsDropdown.classList.contains('show')) {
            settingsDropdown.classList.remove('show');
        }
    });

    // Attach event listeners to the manage buttons now located inside the dropdown
    document.querySelector(selectors.manageCategoriesBtn).addEventListener('click', () => manageList('categories', 'Manage Categories'));
    document.querySelector(selectors.manageStatusesBtn).addEventListener('click', () => manageList('statuses', 'Manage Statuses'));
    document.querySelector(selectors.manageFromsBtn).addEventListener('click', () => manageList('froms', 'Manage "From" Sources'));
    document.querySelector(selectors.clearAllBtn).addEventListener('click', clearAllData); // Event listener for clear all

    // Filter section toggle
    const toggleFilterBtn = document.querySelector(selectors.toggleFilterBtn);
    // Target the new filterColumn for toggling
    const filterColumn = document.querySelector(selectors.filterColumn);
    const appContainer = document.querySelector('.app'); // Get the main app container

    toggleFilterBtn.addEventListener('click', async () => {
      filterSectionVisible = !filterSectionVisible;
      // Toggle a class on the main app container to change grid columns
      appContainer.classList.toggle('filter-active', filterSectionVisible);
      await DB.putMeta('filterSectionVisible', filterSectionVisible); // Save state
    });

    // Apply initial visibility state
    appContainer.classList.toggle('filter-active', filterSectionVisible);


    document.querySelector(selectors.exportBtn).addEventListener('click', exportJSON);
    document.querySelector(selectors.importBtn).addEventListener('click', () => document.querySelector(selectors.importFile).click());
    document.querySelector(selectors.importFile).addEventListener('change', importJSON);

    // Add event listeners for new date filter inputs
    document.querySelector(selectors.createdRangeFrom).addEventListener('change', renderTaskList);
    document.querySelector(selectors.createdRangeTo).addEventListener('change', renderTaskList);
    document.querySelector(selectors.updatedRangeFrom).addEventListener('change', renderTaskList);
    document.querySelector(selectors.updatedRangeTo).addEventListener('change', renderTaskList);
    document.querySelector(selectors.deadlineRangeFrom).addEventListener('change', renderTaskList);
    document.querySelector(selectors.deadlineRangeTo).addEventListener('change', renderTaskList);
    document.querySelector(selectors.finishedRangeFrom).addEventListener('change', renderTaskList);
    document.querySelector(selectors.finishedRangeTo).addEventListener('change', renderTaskList);


    document.querySelector(selectors.searchInput).addEventListener('input', renderTaskList);
    document.querySelector(selectors.sortBy).addEventListener('change', renderTaskList);
    document.querySelector(selectors.groupBy).addEventListener('change', renderTaskList); // Add listener for groupBy
    // document.querySelector(selectors.filterCategory).addEventListener('change', renderTaskList); // Removed for multi-select
    document.querySelector(selectors.filterStatus).addEventListener('change', renderTaskList);
    
    // Multi-select Category Filter Event Listeners
    const filterCategoryHeader = document.querySelector(selectors.filterCategoryHeader);
    const filterCategoryDropdownContent = document.querySelector(selectors.filterCategoryDropdownContent);

    filterCategoryHeader.addEventListener('click', (event) => {
      filterCategoryDropdownContent.classList.toggle('show');
      event.stopPropagation(); // Prevent closing immediately
    });

    // Close multi-select dropdown if clicked outside
    window.addEventListener('click', (event) => {
      if (!event.target.closest(selectors.filterCategoryMultiSelect) && filterCategoryDropdownContent.classList.contains('show')) {
        filterCategoryDropdownContent.classList.remove('show');
      }
    });

    await renderTaskList();
  }

  function createEmptyTask() {
    const id = 't_' + Date.now();
    return {
      id,
      title: 'Untitled',
      description: '',
      notes: '',
      attachments: [],
      priority: 3,
      deadline: null,
      finishDate: null, // Initialize finishDate
      from: froms[0] || '', // Use the first custom from as default
      categories: [categories[0] || 'General'], // Use the first custom category as default
      status: statuses[0] || 'todo', // Use the first custom status as default
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async function renderTaskList() {
    const container = document.querySelector(selectors.taskList);
    container.innerHTML = '';
    const tasks = await DB.getAllTasks();
    const q = document.querySelector(selectors.searchInput).value.toLowerCase();
    const filterStat = document.querySelector(selectors.filterStatus).value;
    const sortVal = document.querySelector(selectors.sortBy).value;
    const groupVal = document.querySelector(selectors.groupBy).value; // Get groupBy value

    // Get values for all new date range filters
    const createdRF = document.querySelector(selectors.createdRangeFrom).value;
    const createdRT = document.querySelector(selectors.createdRangeTo).value;
    const updatedRF = document.querySelector(selectors.updatedRangeFrom).value;
    const updatedRT = document.querySelector(selectors.updatedRangeTo).value;
    const deadlineRF = document.querySelector(selectors.deadlineRangeFrom).value;
    const deadlineRT = document.querySelector(selectors.deadlineRangeTo).value;
    const finishedRF = document.querySelector(selectors.finishedRangeFrom).value;
    const finishedRT = document.querySelector(selectors.finishedRangeTo).value;


    let filtered = tasks.filter(t => {
      // Search filter
      if (q && !(t.title?.toLowerCase().includes(q) || t.from?.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))) return false;
      
      // Category filter (multi-select)
      // If selectedFilterCategories is empty, it means "select all" (no filter applied)
      if (selectedFilterCategories.length > 0) {
          const taskHasSelectedCategory = t.categories.some(cat => selectedFilterCategories.includes(cat));
          if (!taskHasSelectedCategory) return false;
      }

      // Status filter
      if (filterStat !== '__all' && t.status !== filterStat) return false;
      
      // Created Date filter
      if ((createdRF || createdRT) && t.createdAt) {
        const c = new Date(t.createdAt);
        if (createdRF && c < new Date(createdRF)) return false;
        if (createdRT && c > new Date(createdRT + 'T23:59:59')) return false;
      }
      // Updated Date filter
      if ((updatedRF || updatedRT) && t.updatedAt) {
        const u = new Date(t.updatedAt);
        if (updatedRF && u < new Date(updatedRF)) return false;
        if (updatedRT && u > new Date(updatedRT + 'T23:59:59')) return false;
      }
      // Deadline Date filter
      if ((deadlineRF || deadlineRT) && t.deadline) {
        const d = new Date(t.deadline);
        if (deadlineRF && d < new Date(deadlineRF)) return false;
        if (deadlineRT && d > new Date(deadlineRT + 'T23:59:59')) return false;
      }
      // Finished Date filter
      if ((finishedRF || finishedRT)) {
        if(!t.finishDate){
          return false;
        }
        const f = new Date(t.finishDate);
        if (finishedRF && f < new Date(finishedRF)) return false;
        if (f > new Date(finishedRT + 'T23:59:59')) return false;
      }

      return true;
    });

    // Grouping logic
    if (groupVal === '__none') {
        // No grouping, just sort and render
        filtered.sort((a, b) => {
            if (sortVal === 'deadline') return (a.deadline || '').localeCompare(b.deadline || '');
            if (sortVal === 'priority') return a.priority - b.priority;
            if (sortVal === 'from') return (a.from || '').localeCompare(b.from || '');
            return (b.updatedAt || '').localeCompare(a.updatedAt || '');
        });
        renderTaskItems(container, filtered);
    } else {
        const groupedTasks = {};
        
        filtered.forEach(task => {
            if (groupVal === 'category' && task.categories && task.categories.length > 0) {
                // If grouping by category and task has multiple categories, add to each group
                task.categories.forEach(category => {
                    const groupKey = category || 'No Category';
                    if (!groupedTasks[groupKey]) {
                        groupedTasks[groupKey] = [];
                    }
                    // Avoid duplicate tasks if they appear multiple times due to other filters
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
                        groupKey = task.priority ? task.priority : "No Priority";
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

        // Sort group keys
        const sortedGroupKeys = Object.keys(groupedTasks).sort((a, b) => {
            // Special handling for date groups to sort numerically
            if (groupVal.includes('MonthYear')) {
                // For month-year, parse to date objects for proper sorting
                const dateA = new Date(a);
                const dateB = new Date(b);
                if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) return dateA.getTime() - dateB.getTime();
            } else if (groupVal.includes('Year')) {
                const yearA = parseInt(a.replace(/\D/g, ''), 10);
                const yearB = parseInt(b.replace(/\D/g, ''), 10);
                if (!isNaN(yearA) && !isNaN(yearB)) return yearA - yearB;
            } else if (groupVal === 'priority') {
                // Extract priority number for sorting
                const pA = parseInt(a.replace('Priority ', ''), 10);
                const pB = parseInt(b.replace('Priority ', ''), 10);
                if (!isNaN(pA) && !isNaN(pB)) return pA - pB;
            }
            console.log("default")
            // Default alphabetical sort for other keys, with 'No X' last
            if (a.startsWith('No ')) return 1;
            if (b.startsWith('No ')) return -1;
            return a.localeCompare(b);
        });

        // Render grouped tasks with collapsible sections
        sortedGroupKeys.forEach(groupKey => {
            const groupHeaderDiv = document.createElement('div');
            groupHeaderDiv.className = 'group-header';
            groupHeaderDiv.innerHTML = `
                <h4>${groupKey}</h4>
                <button class="toggle-group-btn" data-group-key="${escapeHtml(groupKey)}">&#9660;</button>
            `; // Down arrow initially

            const groupContentDiv = document.createElement('div');
            groupContentDiv.className = 'group-content show'; // Initially show content

            container.appendChild(groupHeaderDiv);
            container.appendChild(groupContentDiv);

            // Add event listener to toggle content visibility
            groupHeaderDiv.querySelector('.toggle-group-btn').addEventListener('click', (e) => {
                const btn = e.target;
                const content = btn.parentElement.nextElementSibling; // The div immediately after the header
                content.classList.toggle('show');
                btn.innerHTML = content.classList.contains('show') ? '&#9660;' : '&#9658;'; // Toggle arrow direction
            });

            // Sort tasks within each group
            groupedTasks[groupKey].sort((a, b) => {
                if (sortVal === 'deadline') return (a.deadline || '').localeCompare(b.deadline || '');
                if (sortVal === 'priority') return a.priority - b.priority;
                if (sortVal === 'from') return (a.from || '').localeCompare(b.from || '');
                return (b.updatedAt || '').localeCompare(a.updatedAt || '');
            });

            renderTaskItems(groupContentDiv, groupedTasks[groupKey]);
        });
    }
  }

  function renderTaskItems(container, tasksToRender) {
    const tmpl = document.getElementById('task-item-template').content;
    tasksToRender.forEach(t => {
      const node = tmpl.cloneNode(true);
      const el = node.querySelector('.task-item');
      el.querySelector('.title').textContent = t.title || '(no title)';
      el.querySelector('.meta').textContent = `${t.from || '—'} • ${t.categories.join(', ')} • ${t.status}`;
      
      const deadlineText = t.deadline ? `Due: ${new Date(t.deadline).toLocaleDateString()}` : '';
      const finishDateText = t.finishDate ? `Finished: ${new Date(t.finishDate).toLocaleDateString()}` : '';

      el.querySelector('.priority').textContent = ['!', '!!', '!!!'][Math.max(0, 3 - t.priority)] || t.priority;
      
      // Target the new display elements
      const deadlineDisplay = el.querySelector('.deadline-display');
      const finishDateDisplay = el.querySelector('.finish-date-display');

      if (deadlineDisplay) {
        deadlineDisplay.textContent = deadlineText;
      }
      if (finishDateDisplay) {
        finishDateDisplay.textContent = finishDateText;
      }

      el.addEventListener('click', () => openTaskEditor(t));
      container.appendChild(node);
    });
  }


  // New function to render the multi-select category filter UI
  async function renderFilterCategoriesMultiSelect() {
    const selectedDisplay = document.querySelector(selectors.selectedFilterCategoriesDisplay);
    const dropdownContent = document.querySelector(selectors.filterCategoryDropdownContent);

    selectedDisplay.innerHTML = ''; // Clear current selected tags
    dropdownContent.innerHTML = ''; // Clear current dropdown items

    // Render selected categories as tags in the header
    if (selectedFilterCategories.length === 0) {
      selectedDisplay.innerHTML = '<span class="placeholder-text">All Categories</span>';
    } else {
      selectedFilterCategories.forEach((cat, idx) => {
        const tag = document.createElement('div');
        tag.className = 'selected-tag';
        tag.innerHTML = `${escapeHtml(cat)}<button data-cat="${escapeHtml(cat)}">x</button>`;
        tag.querySelector('button').addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent dropdown from closing
          const categoryToRemove = e.target.dataset.cat;
          selectedFilterCategories = selectedFilterCategories.filter(c => c !== categoryToRemove);
          DB.putMeta('selectedFilterCategories', selectedFilterCategories); // Persist
          renderFilterCategoriesMultiSelect();
          renderTaskList();
        });
        selectedDisplay.appendChild(tag);
      });
    }

    // Render all categories in the dropdown content
    categories.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      item.textContent = escapeHtml(cat);
      if (selectedFilterCategories.includes(cat)) {
        item.classList.add('selected');
      }

      item.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent dropdown from closing immediately on item click

        if (selectedFilterCategories.includes(cat)) {
          // Remove if already selected
          selectedFilterCategories = selectedFilterCategories.filter(c => c !== cat);
        } else {
          // Add if not selected
          selectedFilterCategories.push(cat);
        }
        DB.putMeta('selectedFilterCategories', selectedFilterCategories); // Persist
        renderFilterCategoriesMultiSelect(); // Re-render this filter UI
        renderTaskList(); // Re-render task list based on new filter
      });
      dropdownContent.appendChild(item);
    });
  }


  function renderStatusOptions() {
    const sel = document.querySelector(selectors.filterStatus);
    sel.innerHTML = '<option value="__all">All</option>' + statuses.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('\n');
  }

  // Generic function to manage lists (categories, statuses, froms) using a tag-like modal
  async function manageList(type, title) {
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

    // Modal HTML structure for list management
    const contentHtml = `
      <div class="list-manager-container">
        <div class="tag-list-modal" id="listManagerTags"></div>
        <div style="display:flex; gap:8px; margin-top: 12px;">
          <input type="text" id="listManagerInput" placeholder="Add new ${type.slice(0, -1) || 'item'}..." class="flex-grow">
          <button id="listManagerAddBtn">Add</button>
        </div>
      </div>
    `;

    // Create the modal and get a reference to its backdrop for dynamic content
    const modalPromise = new Promise(async (resolve) => {
      const tmpl = document.getElementById('modal-template').content;
      const modalFragment = tmpl.cloneNode(true);
      const modalBackdrop = modalFragment.querySelector('.modal-backdrop');

      modalFragment.querySelector('h3').textContent = title;
      modalFragment.querySelector('.modal-body').innerHTML = contentHtml;

      const saveBtn = modalFragment.querySelector('.modal-save');
      const cancelBtn = modalFragment.querySelector('.modal-cancel');
      const closeBtn = modalFragment.querySelector('.modal-close');

      let tempList = [...currentList]; // Temporary list for edits

      const listManagerTags = modalBackdrop.querySelector('#listManagerTags');
      const listManagerInput = modalBackdrop.querySelector('#listManagerInput');
      const listManagerAddBtn = modalBackdrop.querySelector('#listManagerAddBtn');

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
              isInUse = allTasks.some(task => task.status === itemToRemove);
              if (isInUse) {
                showModalAlert(`Cannot delete status "${itemToRemove}" because it is currently in use by one or more tasks.`);
              }
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

      // Allow adding by pressing Enter in the input field
      listManagerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          listManagerAddBtn.click();
        }
      });

      saveBtn.addEventListener('click', () => {
        document.body.removeChild(modalBackdrop);
        resolve(tempList); // Resolve with the modified list
      });
      cancelBtn.addEventListener('click', () => {
        document.body.removeChild(modalBackdrop);
        resolve(null); // Resolve with null on cancel
      });
      closeBtn.addEventListener('click', () => {
        document.body.removeChild(modalBackdrop);
        resolve(null); // Resolve with null on close
      });
      document.body.appendChild(modalFragment);
    });

    const resultList = await modalPromise; // Wait for the modal to resolve

    if (resultList !== null) { // If not cancelled
      let finalUpdateList = resultList;
      // Prevent saving an empty list; revert to default if empty
      if (resultList.length === 0) {
        showModalAlert(`List for ${type} cannot be empty. Reverting to default values.`);
        finalUpdateList = defaultList;
      }

      // Update the main categories/statuses/froms array
      if (type === 'categories') {
        categories = finalUpdateList;
        // Also update selectedFilterCategories if a category was removed
        selectedFilterCategories = selectedFilterCategories.filter(cat => categories.includes(cat));
        await DB.putMeta('selectedFilterCategories', selectedFilterCategories);
        renderFilterCategoriesMultiSelect(); // Re-render the multi-select filter
      } else if (type === 'statuses') {
        statuses = finalUpdateList;
      } else if (type === 'froms') {
        froms = finalUpdateList;
      }
      await DB.putMeta(putMetaKey, finalUpdateList);
      renderStatusOptions(); // Re-render filter options if categories or statuses changed (only statuses are select)
      await renderTaskList(); // Re-render task list to reflect changes
    }
  }
  
  // Custom alert modal (now uses createModal internally)
  function showModalAlert(message) {
      createModal('Warning', `<p>${escapeHtml(message)}</p>`, false); // Pass false for showSaveButton
  }

  // Custom confirmation modal (now uses createModal internally with specific button texts)
  function showModalAlertConfirm(message, resolve) {
      const tmpl = document.getElementById('modal-template').content;
      const modalFragment = tmpl.cloneNode(true);
      const modalBackdrop = modalFragment.querySelector('.modal-backdrop');

      modalFragment.querySelector('h3').textContent = 'Confirm';
      modalFragment.querySelector('.modal-body').innerHTML = `<p>${escapeHtml(message)}</p>`;
      modalFragment.querySelector('.modal-footer').innerHTML = `
          <button class="modal-cancel">Cancel</button>
          <button class="modal-save danger">Confirm</button>
      `;
      
      const saveBtn = modalFragment.querySelector('.modal-save');
      const cancelBtn = modalFragment.querySelector('.modal-cancel');

      saveBtn.addEventListener('click', () => {
          document.body.removeChild(modalBackdrop);
          resolve(true);
      });
      cancelBtn.addEventListener('click', () => {
          document.body.removeChild(modalBackdrop);
          resolve(false);
      });
      document.body.appendChild(modalFragment);
  }

  // New function to clear all persisted data
  async function clearAllData() {
    const confirmed = await new Promise(resolve => {
        showModalAlertConfirm('Are you sure you want to clear ALL persisted data (tasks, categories, statuses, settings)? This action cannot be undone.', resolve);
    });

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


  async function openTaskEditor(task) {
    currentTask = task;
    const area = document.querySelector(selectors.editorArea);
    area.innerHTML = `
      <div class="editor">
        <div class="card">
          <div class="label">Title</div>
          <input id="taskTitle" value="${escapeHtml(task.title)}">
          <div class="label">From</div>
          <select id="taskFrom">${froms.map(f=>`<option value="${escapeHtml(f)}" ${f === task.from ? 'selected':''}>${escapeHtml(f)}</option>`).join('')}</select>
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
          <select id="statusSelect">${statuses.map(s=>`<option value="${escapeHtml(s)}" ${s === task.status ? 'selected':''}>${escapeHtml(s)}</option>`).join('')}</select>
          <div class="label">Description</div>
          <div id="descEditor" class="card"></div>
          <div class="label">Notes</div>
          <div id="notesEditor" class="card"></div>
          <div style="margin-top:8px;display:flex;gap:8px">
            <button id="saveBtn">Save</button>
            <button id="deleteBtn">Delete</button>
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
      renderAttachments(currentTask);
      // Automatically save the task with the new attachment.
      saveTask();
    };

    Editor.init(area.querySelector('#descEditor'), { onAttach: handleAttachment });
    area.querySelector('#descEditor .text-area').innerHTML = task.description;

    Editor.init(area.querySelector('#notesEditor'), { onAttach: handleAttachment });
    area.querySelector('#notesEditor .text-area').innerHTML = task.notes;

    area.querySelector('#saveBtn').addEventListener('click', saveTask);
    area.querySelector('#deleteBtn').addEventListener('click', deleteTask);

    renderCategoryTags();
    renderAttachments(task);
    renderNewCategoryDropdown(); // Call to render the new dropdown

    area.querySelector('#addCategoryBtn').addEventListener('click', () => {
      const select = area.querySelector('#newCategorySelect');
      const cat = select.value;
      if (!cat || cat === '__placeholder') return; // Check for placeholder value
      if (!task.categories.includes(cat)) {
        task.categories.push(cat);
        renderCategoryTags();
        renderNewCategoryDropdown(); // Re-render dropdown to remove added category
        saveTask();
      }
      select.value = '__placeholder'; // Reset dropdown
    });
  }

  function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  async function saveTask() {
    if (!currentTask) return;
    const editorArea = document.querySelector(selectors.editorArea);
    const titleInput = editorArea.querySelector('#taskTitle');
    const fromSelect = editorArea.querySelector('#taskFrom');
    const priorityInput = editorArea.querySelector('#taskPriority');
    const deadlineInput = editorArea.querySelector('#taskDeadline');
    const finishDateInput = editorArea.querySelector('#taskFinishDate'); // Get finish date input
    const statusSelect = editorArea.querySelector('#statusSelect');
    
    currentTask.title = titleInput.value;
    currentTask.from = fromSelect.value;
    currentTask.priority = parseInt(priorityInput.value, 10);
    currentTask.deadline = deadlineInput.value || null;
    currentTask.finishDate = finishDateInput.value || null; // Save finishDate
    currentTask.status = statusSelect.value;
    currentTask.description = editorArea.querySelector('#descEditor .text-area').innerHTML;
    currentTask.notes = editorArea.querySelector('#notesEditor .text-area').innerHTML;
    currentTask.updatedAt = new Date().toISOString();

    await DB.putTask(currentTask);
    await renderTaskList();
    openTaskEditor(currentTask);
  }

  async function deleteTask() {
    if (!currentTask) return;
    const confirmed = await new Promise(resolve => {
        const tmpl = document.getElementById('modal-template').content;
        const modalFragment = tmpl.cloneNode(true);
        const modalBackdrop = modalFragment.querySelector('.modal-backdrop');

        modalFragment.querySelector('h3').textContent = 'Delete Task';
        modalFragment.querySelector('.modal-body').innerHTML = '<p>Are you sure you want to delete this task?</p>';
        modalFragment.querySelector('.modal-footer').innerHTML = `
            <button class="modal-cancel">Cancel</button>
            <button class="modal-save danger">Delete</button>
        `;
        const saveBtn = modalFragment.querySelector('.modal-save');
        const cancelBtn = modalFragment.querySelector('.modal-cancel');
        
        saveBtn.addEventListener('click', () => {
            document.body.removeChild(modalBackdrop);
            resolve(true);
        });
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modalBackdrop);
            resolve(false);
        });
        document.body.appendChild(modalFragment);
    });

    if (confirmed) {
        await DB.deleteTask(currentTask.id);
        document.querySelector(selectors.editorArea).innerHTML = '<div class="placeholder">Select or create a task to view/edit details</div>';
        currentTask = null;
        await renderTaskList();
    }
  }


  function renderCategoryTags() {
    const list = document.querySelector('#categoryList');
    list.innerHTML = '';
    (currentTask.categories || []).forEach((cat, idx) => {
      const tag = document.createElement('div');
      tag.className = 'tag selected';
      tag.innerHTML = `${escapeHtml(cat)}<button>x</button>`;
      tag.querySelector('button').addEventListener('click', () => {
        currentTask.categories.splice(idx, 1);
        renderCategoryTags();
        renderNewCategoryDropdown(); // Re-render dropdown when a tag is removed
        saveTask();
      });
      list.appendChild(tag);
    });
  }

  // New function to render the category dropdown
  function renderNewCategoryDropdown() {
    const select = document.querySelector('#newCategorySelect');
    if (!select) return;

    // Filter out categories already assigned to the current task
    const availableCategories = categories.filter(cat => !currentTask.categories.includes(cat));

    select.innerHTML = '<option value="__placeholder" disabled selected>Add category...</option>' + 
                       availableCategories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('\n');
  }


  function renderAttachments(task){
    const el = document.querySelector('#attachments');
    el.innerHTML = '';
    (task.attachments || []).forEach((att, idx)=>{
      const div = document.createElement('div'); div.className = 'attachment';
      const left = document.createElement('div'); left.textContent = att.name;
      const right = document.createElement('div');
      const dl = document.createElement('a'); dl.href = att.data; dl.download = att.name; dl.textContent = 'download';
      const rm = document.createElement('button'); rm.textContent='remove'; rm.addEventListener('click', async ()=>{ 
        const confirmed = await new Promise(resolve => {
          showModalAlertConfirm(`Are you sure you want to remove "${att.name}"?`, resolve);
        });
        if (confirmed) {
          task.attachments.splice(idx,1); 
          renderAttachments(task); 
          saveTask();
        }
      });
      right.appendChild(dl); right.appendChild(document.createTextNode(' ')); right.appendChild(rm);
      div.appendChild(left); div.appendChild(right); el.appendChild(div);
    });
  }

  async function exportJSON() {
    const all = await DB.getAllTasks();
    const data = {
        tasks: all,
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
  }

  async function importJSON(e) {
    const f = e.target.files[0];
    if (!f) return;
    const txt = await f.text();
    try {
      const j = JSON.parse(txt);
      if (j.categories) categories = j.categories;
      if (j.statuses) statuses = j.statuses;
      if (j.froms) froms = j.froms;
      
      if (j.tasks) {
        for (const t of j.tasks) {
          await DB.putTask(t);
        }
      }
      await DB.putMeta('categories', categories);
      await DB.putMeta('statuses', statuses);
      await DB.putMeta('froms', froms);
      
      renderFilterCategoriesMultiSelect(); // Re-render the multi-select filter
      renderStatusOptions();
      await renderTaskList();
    } catch (e) {
      console.error(e);
      showModalAlert('Error importing file.');
    }
  }

  return {init};
})();
