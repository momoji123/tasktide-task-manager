import {DB} from './storage.js';
import {Editor} from './editor.js';

export const UI = (function() {
  const selectors = {
    newTaskBtn: '#newTaskBtn', searchInput: '#searchInput', taskList: '#taskList', editorArea: '#editorArea',
    filterCategory: '#filterCategory', filterStatus: '#filterStatus', sortBy: '#sortBy', rangeFrom: '#rangeFrom', rangeTo: '#rangeTo',
    // Updated selectors for the new settings menu structure
    exportBtn: '#exportBtn', importBtn: '#importBtn', importFile: '#importFile',
    settingsBtn: '#settingsBtn', settingsDropdown: '#settingsDropdown',
    manageCategoriesBtn: '#manageCategoriesBtn', manageStatusesBtn: '#manageStatusesBtn', manageFromsBtn: '#manageFromsBtn',
    // New selectors for filter toggle and clear all
    toggleFilterBtn: '#toggleFilterBtn', filterSection: '#filterSection', clearAllBtn: '#clearAllBtn',
  };

  let currentTask = null;
  let categories = [];
  let statuses = [];
  let froms = [];
  let filterSectionVisible = true; // Default state for filter section visibility

  // Helper function for creating a modal
  function createModal(title, contentHtml) {
    const tmpl = document.getElementById('modal-template').content;
    const modalFragment = tmpl.cloneNode(true);
    // Get a reference to the actual modal backdrop element BEFORE appending the fragment.
    // Once appended, the fragment's children become direct children of the body,
    // and the original 'modalFragment' itself is no longer in the DOM.
    const modalBackdrop = modalFragment.querySelector('.modal-backdrop');

    modalFragment.querySelector('h3').textContent = title;
    modalFragment.querySelector('.modal-body').innerHTML = contentHtml;
    
    // Add logic to save and close the modal
    const saveBtn = modalFragment.querySelector('.modal-save');
    const cancelBtn = modalFragment.querySelector('.modal-cancel');
    const closeBtn = modalFragment.querySelector('.modal-close');

    return new Promise((resolve) => {
      saveBtn.addEventListener('click', () => {
        const textarea = modalBackdrop.querySelector('textarea'); // Use modalBackdrop to query content
        document.body.removeChild(modalBackdrop); // Remove the direct child
        resolve(textarea ? textarea.value : null); // Handle cases where textarea might not exist
      });
      cancelBtn.addEventListener('click', () => {
        document.body.removeChild(modalBackdrop); // Remove the direct child
        resolve(null);
      });
      closeBtn.addEventListener('click', () => {
        document.body.removeChild(modalBackdrop); // Remove the direct child
        resolve(null);
      });
      document.body.appendChild(modalFragment); // Append the fragment, its children become direct body children
    });
  }


  async function init() {
    // Load custom options from DB
    categories = (await DB.getMeta('categories')) || ['General'];
    statuses = (await DB.getMeta('statuses')) || ['todo', 'in-progress', 'done'];
    froms = (await DB.getMeta('froms')) || ['Work', 'Personal', 'Shopping'];
    // Load filter section visibility state
    filterSectionVisible = (await DB.getMeta('filterSectionVisible')) ?? true;


    renderCategoryOptions();
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
        if (!event.target.matches(selectors.settingsBtn) && settingsDropdown.classList.contains('show')) {
            settingsDropdown.classList.remove('show');
        }
    });

    // Attach event listeners to the manage buttons now located inside the dropdown
    document.querySelector(selectors.manageCategoriesBtn).addEventListener('click', manageCategories);
    document.querySelector(selectors.manageStatusesBtn).addEventListener('click', manageStatuses);
    document.querySelector(selectors.manageFromsBtn).addEventListener('click', manageFroms);
    document.querySelector(selectors.clearAllBtn).addEventListener('click', clearAllData); // Event listener for clear all

    // Filter section toggle
    const toggleFilterBtn = document.querySelector(selectors.toggleFilterBtn);
    const filterSection = document.querySelector(selectors.filterSection);

    toggleFilterBtn.addEventListener('click', async () => {
      filterSectionVisible = !filterSectionVisible;
      filterSection.classList.toggle('show', filterSectionVisible);
      await DB.putMeta('filterSectionVisible', filterSectionVisible); // Save state
    });

    // Apply initial visibility state
    filterSection.classList.toggle('show', filterSectionVisible);


    document.querySelector(selectors.exportBtn).addEventListener('click', exportJSON);
    document.querySelector(selectors.importBtn).addEventListener('click', () => document.querySelector(selectors.importFile).click());
    document.querySelector(selectors.importFile).addEventListener('change', importJSON);

    document.querySelector(selectors.searchInput).addEventListener('input', renderTaskList);
    document.querySelector(selectors.sortBy).addEventListener('change', renderTaskList);
    document.querySelector(selectors.filterCategory).addEventListener('change', renderTaskList);
    document.querySelector(selectors.filterStatus).addEventListener('change', renderTaskList);
    document.querySelector(selectors.rangeFrom).addEventListener('change', renderTaskList);
    document.querySelector(selectors.rangeTo).addEventListener('change', renderTaskList);

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
    const filterCat = document.querySelector(selectors.filterCategory).value;
    const filterStat = document.querySelector(selectors.filterStatus).value;
    const sortVal = document.querySelector(selectors.sortBy).value;

    const rf = document.querySelector(selectors.rangeFrom).value;
    const rt = document.querySelector(selectors.rangeTo).value;

    let filtered = tasks.filter(t => {
      // Search filter
      if (q && !(t.title?.toLowerCase().includes(q) || t.from?.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))) return false;
      // Category filter
      if (filterCat !== '__all' && !t.categories.includes(filterCat)) return false;
      // Status filter
      if (filterStat !== '__all' && t.status !== filterStat) return false;
      // Date range filter (using updatedAt for now, could be expanded to include finishDate or deadline)
      if ((rf || rt) && t.updatedAt) {
        const u = new Date(t.updatedAt);
        if (rf && u < new Date(rf)) return false;
        if (rt && u > new Date(rt + 'T23:59:59')) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (sortVal === 'deadline') return (a.deadline || '').localeCompare(b.deadline || '');
      if (sortVal === 'priority') return a.priority - b.priority;
      if (sortVal === 'from') return (a.from || '').localeCompare(b.from || '');
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });

    const tmpl = document.getElementById('task-item-template').content;
    filtered.forEach(t => {
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

  function renderCategoryOptions() {
    const sel = document.querySelector(selectors.filterCategory);
    sel.innerHTML = '<option value="__all">All</option>' + categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('\n');
  }

  function renderStatusOptions() {
    const sel = document.querySelector(selectors.filterStatus);
    sel.innerHTML = '<option value="__all">All</option>' + statuses.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('\n');
  }

  async function manageCategories() {
    const text = await createModal('Edit categories (comma separated)', `<textarea>${categories.join(', ')}</textarea>`);
    if (text === null) return;
    categories = text.split(',').map(s => s.trim()).filter(Boolean);
    if (categories.length === 0) categories = ['General'];
    await DB.putMeta('categories', categories);
    renderCategoryOptions();
    renderTaskList();
  }

  async function manageStatuses() {
    const allTasks = await DB.getAllTasks();
    const text = await createModal('Edit statuses (comma separated)', `<textarea>${statuses.join(', ')}</textarea>`);
    if (text === null) return;
    
    let newStatuses = text.split(',').map(s => s.trim()).filter(Boolean);

    // Get a list of statuses that are currently in use by tasks
    const usedStatuses = new Set(allTasks.map(t => t.status));

    // Check if the user is trying to delete an in-use status
    for (const status of statuses) {
      if (!newStatuses.includes(status) && usedStatuses.has(status)) {
        // Use a custom alert since window.alert is not available
        showModalAlert(`Cannot delete status "${status}" because it is currently in use.`);
        return; // Exit without saving changes
      }
    }
    
    if (newStatuses.length === 0) newStatuses = ['todo', 'in-progress', 'done'];
    statuses = newStatuses;
    await DB.putMeta('statuses', statuses);
    renderStatusOptions();
    renderTaskList();
  }

  async function manageFroms() {
    const text = await createModal('Edit "From" sources (comma separated)', `<textarea>${froms.join(', ')}</textarea>`);
    if (text === null) return;
    froms = text.split(',').map(s => s.trim()).filter(Boolean);
    if (froms.length === 0) froms = ['Work', 'Personal', 'Shopping'];
    await DB.putMeta('froms', froms);
    renderTaskList();
  }
  
  // Custom alert modal
  function showModalAlert(message) {
      const tmpl = document.getElementById('modal-template').content;
      const modalFragment = tmpl.cloneNode(true);
      const modalBackdrop = modalFragment.querySelector('.modal-backdrop');

      modalFragment.querySelector('h3').textContent = 'Warning';
      modalFragment.querySelector('.modal-body').innerHTML = `<p>${escapeHtml(message)}</p>`;
      modalFragment.querySelector('.modal-footer').innerHTML = `<button class="modal-save">OK</button>`;
      
      const saveBtn = modalFragment.querySelector('.modal-save');
      saveBtn.addEventListener('click', () => {
          document.body.removeChild(modalBackdrop);
      });
      document.body.appendChild(modalFragment);
  }

  // New function to clear all persisted data
  async function clearAllData() {
    const confirmed = await new Promise(resolve => {
        const tmpl = document.getElementById('modal-template').content;
        const modalFragment = tmpl.cloneNode(true);
        const modalBackdrop = modalFragment.querySelector('.modal-backdrop');

        modalFragment.querySelector('h3').textContent = 'Clear All Data';
        modalFragment.querySelector('.modal-body').innerHTML = '<p>Are you sure you want to clear ALL persisted data (tasks, categories, statuses, settings)? This action cannot be undone.</p>';
        modalFragment.querySelector('.modal-footer').innerHTML = `
            <button class="modal-cancel">Cancel</button>
            <button class="modal-save danger">Clear All</button>
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
      
      renderCategoryOptions();
      renderStatusOptions();
      await renderTaskList();
    } catch (e) {
      console.error(e);
      showModalAlert('Error importing file.');
    }
  }

  // Custom confirmation modal
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


  return {init};
})();
