import {DB} from './storage.js';
import {Editor} from './editor.js';

export const UI = (function(){
  const selectors = {
    newTaskBtn: '#newTaskBtn', searchInput:'#searchInput', taskList:'#taskList', editorArea:'#editorArea',
    filterCategory:'#filterCategory', filterStatus:'#filterStatus', sortBy:'#sortBy', rangeFrom:'#rangeFrom', rangeTo:'#rangeTo', manageCategoriesBtn:'#manageCategoriesBtn', exportBtn:'#exportBtn', importBtn:'#importBtn', importFile:'#importFile'
  };

  let currentTask = null;
  let categories = [];

  async function init(){
    // load categories
    categories = (await DB.getMeta('categories')) || ['General'];
    renderCategoryOptions();

    document.querySelector(selectors.newTaskBtn).addEventListener('click', ()=>openTaskEditor(createEmptyTask()));
    document.querySelector(selectors.manageCategoriesBtn).addEventListener('click', manageCategories);
    document.querySelector(selectors.exportBtn).addEventListener('click', exportJSON);
    document.querySelector(selectors.importBtn).addEventListener('click', ()=>document.querySelector(selectors.importFile).click());
    document.querySelector(selectors.importFile).addEventListener('change', importJSON);

    document.querySelector(selectors.searchInput).addEventListener('input', renderTaskList);
    document.querySelector(selectors.sortBy).addEventListener('change', renderTaskList);
    document.querySelector(selectors.filterCategory).addEventListener('change', renderTaskList);
    document.querySelector(selectors.filterStatus).addEventListener('change', renderTaskList);
    document.querySelector(selectors.rangeFrom).addEventListener('change', renderTaskList);
    document.querySelector(selectors.rangeTo).addEventListener('change', renderTaskList);

    await renderTaskList();
  }

  function createEmptyTask(){
    const id = 't_' + Date.now();
    return {
      id, title:'Untitled', description:'', notes:'', attachments:[], priority:3, deadline:null, from:'', categories:['General'], status:'todo', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
    };
  }

  async function renderTaskList(){
    const container = document.querySelector(selectors.taskList);
    container.innerHTML = '';
    const tasks = await DB.getAllTasks();
    const q = document.querySelector(selectors.searchInput).value.toLowerCase();
    let filtered = tasks.filter(t=>{
      if(q){ if(!(t.title?.toLowerCase().includes(q) || t.from?.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))) return false }
      const cat = document.querySelector(selectors.filterCategory).value; if(cat!='__all' && !t.categories.includes(cat)) return false;
      const st = document.querySelector(selectors.filterStatus).value; if(st!='__all' && t.status!==st) return false;
      const rf = document.querySelector(selectors.rangeFrom).value; const rt = document.querySelector(selectors.rangeTo).value;
      if((rf || rt) && t.updatedAt){
        const u = new Date(t.updatedAt);
        if(rf && u < new Date(rf)) return false;
        if(rt && u > new Date(rt + 'T23:59:59')) return false;
      }
      return true;
    });

    const sort = document.querySelector(selectors.sortBy).value;
    filtered.sort((a,b)=>{
      if(sort==='deadline') return (a.deadline||'').localeCompare(b.deadline||'');
      if(sort==='priority') return a.priority - b.priority;
      if(sort==='from') return (a.from||'').localeCompare(b.from||'');
      return (b.updatedAt||'').localeCompare(a.updatedAt||'');
    });

    const tmpl = document.getElementById('task-item-template').content;
    filtered.forEach(t=>{
      const node = tmpl.cloneNode(true);
      const el = node.querySelector('.task-item');
      el.querySelector('.title').textContent = t.title || '(no title)';
      el.querySelector('.meta').textContent = `${t.from||'—'} • ${t.categories.join(', ')} • ${t.status}`;
      el.querySelector('.priority').textContent = ['!','!!','!!!'][Math.max(0,3 - t.priority)] || t.priority;
      el.querySelector('.deadline').textContent = t.deadline ? new Date(t.deadline).toLocaleDateString() : '';
      el.addEventListener('click', ()=>openTaskEditor(t));
      container.appendChild(node);
    });
  }

  function renderCategoryOptions(){
    const sel = document.querySelector(selectors.filterCategory);
    sel.innerHTML = '<option value="__all">All</option>' + categories.map(c=>`<option value="${c}">${c}</option>`).join('\n');
  }

  async function manageCategories(){
    const text = prompt('Edit categories (comma separated)', categories.join(','));
    if(text==null) return;
    categories = text.split(',').map(s=>s.trim()).filter(Boolean);
    if(categories.length===0) categories = ['General'];
    await DB.putMeta('categories', categories);
    renderCategoryOptions();
    renderTaskList();
  }

  async function openTaskEditor(task){
    currentTask = task;
    const area = document.querySelector(selectors.editorArea);
    area.innerHTML = `
      <div class="editor">
        <div class="card">
          <div class="label">Title</div>
          <input id="taskTitle" value="${escapeHtml(task.title)}">
          <div class="label">From</div>
          <input id="taskFrom" value="${escapeHtml(task.from)}">
          <div class="label">Priority (1-high,5-low)</div>
          <input id="taskPriority" type="number" min="1" max="5" value="${task.priority}">
          <div class="label">Deadline</div>
          <input id="taskDeadline" type="date" value="${task.deadline ? task.deadline.split('T')[0]:''}">

          <div class="label">Description</div>
          <div id="descEditor" class="card"></div>

          <div class="label">Notes</div>
          <div id="notesEditor" class="card"></div>

          <div style="margin-top:8px;display:flex;gap:8px">
            <button id="saveBtn">Save</button>
            <button id="deleteBtn">Delete</button>
            <select id="statusSelect"><option value="todo">todo</option><option value="in-progress">in-progress</option><option value="done">done</option></select>
          </div>
        </div>

        <aside class="card">
          <div class="label">Categories</div>
          <div id="categoryList"></div>
          <div style="margin-top:8px"><input id="newCategoryInput" placeholder="New category"><button id="addCategoryBtn">Add</button></div>
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
      // Add the new attachment to the current task's data.
      currentTask.attachments.push(attachment);
      // Re-render the attachments list to show the newly added file.
      renderAttachments(currentTask);
    };

    // Initialize the rich text editors, passing the attachment handler.
    const desc = Editor.init(document.getElementById('descEditor'), { onAttach: handleAttachment });
    const notes = Editor.init(document.getElementById('notesEditor'), { onAttach: handleAttachment });
    desc.setHTML(task.description || '');
    notes.setHTML(task.notes || '');

    document.getElementById('statusSelect').value = task.status || 'todo';

    renderCategoryEditor(task);
    renderAttachments(task);

    document.getElementById('addCategoryBtn').addEventListener('click', async ()=>{
      const v = document.getElementById('newCategoryInput').value.trim(); if(!v) return;
      if(!categories.includes(v)) categories.push(v);
      await DB.putMeta('categories', categories); renderCategoryOptions(); renderCategoryEditor(currentTask);
      document.getElementById('newCategoryInput').value = '';
    });

    document.getElementById('saveBtn').addEventListener('click', async ()=>{
      currentTask.title = document.getElementById('taskTitle').value;
      currentTask.from = document.getElementById('taskFrom').value;
      currentTask.priority = Number(document.getElementById('taskPriority').value) || 3;
      const dl = document.getElementById('taskDeadline').value; currentTask.deadline = dl ? dl + 'T00:00:00' : null;
      currentTask.description = desc.getHTML(); currentTask.notes = notes.getHTML();
      currentTask.status = document.getElementById('statusSelect').value;
      currentTask.updatedAt = new Date().toISOString();
      // The currentTask object, which now includes the attachments array, is saved.
      await DB.putTask(currentTask);
      await renderTaskList();
      alert('Saved');
    });

    document.getElementById('deleteBtn').addEventListener('click', async ()=>{
      if(!confirm('Delete this task?')) return;
      await DB.deleteTask(currentTask.id);
      currentTask = null; 
      document.querySelector(selectors.editorArea).innerHTML = '<div class="placeholder">Select or create a task to view/edit details</div>';
      await renderTaskList();
    });
  }

  function escapeHtml(s){ return (s||'').replace(/[&<>\"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;' }[c]||c)); }

  function renderCategoryEditor(task){
    const container = document.getElementById('categoryList');
    container.innerHTML = categories.map(c=>`<div><label><input type="checkbox" value="${c}" ${task.categories.includes(c)?'checked':''}> ${c}</label></div>`).join('');
    container.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.addEventListener('change', ()=>{
      const val = cb.value; if(cb.checked){ if(!task.categories.includes(val)) task.categories.push(val);} else { task.categories = task.categories.filter(x=>x!==val);} 
    }));
  }

  function renderAttachments(task){
    const el = document.getElementById('attachments'); el.innerHTML = '';
    (task.attachments||[]).forEach((att,idx)=>{
      const div = document.createElement('div'); div.className='attachment';
      const left = document.createElement('div'); left.textContent = att.name;
      const right = document.createElement('div');
      const dl = document.createElement('a'); dl.href = att.data; dl.download = att.name; dl.textContent = 'download';
      const rm = document.createElement('button'); rm.textContent='remove'; rm.addEventListener('click', ()=>{ 
        if (confirm(`Are you sure you want to remove "${att.name}"?`)) {
          task.attachments.splice(idx,1); 
          renderAttachments(task); 
        }
      });
      right.appendChild(dl); right.appendChild(document.createTextNode(' ')); right.appendChild(rm);
      div.appendChild(left); div.appendChild(right); el.appendChild(div);
    });
  }

  async function exportJSON(){
    const all = await DB.getAllTasks();
    const blob = new Blob([JSON.stringify({tasks:all, categories},null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='task-export.json'; a.click();
    URL.revokeObjectURL(url);
  }

  async function importJSON(e){
    const f = e.target.files[0]; if(!f) return; const txt = await f.text();
    try{ const j = JSON.parse(txt); if(j.categories) categories = j.categories; if(j.tasks){ for(const t of j.tasks){ await DB.putTask(t); } }
      await DB.putMeta('categories',categories); renderCategoryOptions(); await renderTaskList(); alert('Imported');
    }catch(err){ alert('Invalid JSON'); }
    e.target.value='';
  }

  return { init };
})();
