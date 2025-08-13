export const DB = (function(){
  const DB_NAME = 'taskmgr-v1';
  const STORE_TASKS = 'tasks';
  const STORE_META = 'meta';
  // New store for milestones
  const STORE_MILESTONES = 'milestones'; 
  let db;

  function open(){
    return new Promise((resolve,reject)=>{
      if(db) return resolve(db);
      // Version bump to 4 to trigger onupgradeneeded for milestones
      const r = indexedDB.open(DB_NAME, 4); 
      r.onupgradeneeded = e => {
        const idb = e.target.result;
        
        // Task store
        let tstore;
        if(!idb.objectStoreNames.contains(STORE_TASKS)){
          tstore = idb.createObjectStore(STORE_TASKS,{keyPath:'id'});
        } else {
          tstore = r.transaction.objectStore(STORE_TASKS);
        }
        if(!tstore.indexNames.contains('deadline')) tstore.createIndex('deadline','deadline',{unique:false});
        if(!tstore.indexNames.contains('updatedAt')) tstore.createIndex('updatedAt','updatedAt',{unique:false});
        if(!tstore.indexNames.contains('from')) tstore.createIndex('from','from',{unique:false});
        if(!tstore.indexNames.contains('finishDate')) tstore.createIndex('finishDate','finishDate',{unique:false});

        // Meta store for custom categories, statuses, etc.
        if(!idb.objectStoreNames.contains(STORE_META)){
          idb.createObjectStore(STORE_META,{keyPath:'key'});
        }

        // New Milestone store (for version 4)
        if(!idb.objectStoreNames.contains(STORE_MILESTONES)){
          const mstore = idb.createObjectStore(STORE_MILESTONES,{keyPath:'id'});
          // Index to quickly retrieve milestones by their parent task ID
          mstore.createIndex('taskId','taskId',{unique:false});
          mstore.createIndex('deadline','deadline',{unique:false});
          mstore.createIndex('finishDate','finishDate',{unique:false});
        }
      };
      r.onsuccess = e => { db = e.target.result; resolve(db); };
      r.onerror = e => reject(e.target.error);
    });
  }

  // --- Task Operations (Existing) ---
  async function putTask(task){
    const connection = await open();
    return new Promise((resolve,reject)=>{
      const tx = connection.transaction([STORE_TASKS],'readwrite');
      const store = tx.objectStore(STORE_TASKS);
      store.put(task);
      tx.oncomplete = ()=>resolve(task);
      tx.onerror = e => reject(e.target.error);
    });
  }

  async function getTask(id){
    const conn = await open();
    return new Promise((res,rej)=>{
      const tx = conn.transaction([STORE_TASKS],'readonly');
      tx.objectStore(STORE_TASKS).get(id).onsuccess = e => res(e.target.result);
      tx.onerror = e => rej(e.target.error);
    });
  }

  async function deleteTask(id){
    const conn = await open();
    return new Promise(async (res,rej)=>{
      const tx = conn.transaction([STORE_TASKS, STORE_MILESTONES],'readwrite');
      
      // Delete task itself
      tx.objectStore(STORE_TASKS).delete(id);

      // Delete all associated milestones
      const milestoneStore = tx.objectStore(STORE_MILESTONES);
      const taskIdIndex = milestoneStore.index('taskId');
      const request = taskIdIndex.openCursor(IDBKeyRange.only(id));

      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete(); // Delete the current milestone
          cursor.continue(); // Move to the next
        }
      };
      request.onerror = (e) => {
        console.error("Error deleting associated milestones:", e.target.error);
      };

      tx.oncomplete = ()=>res();
      tx.onerror = e => rej(e.target.error);
    });
  }

  async function getAllTasks(){
    const conn = await open();
    return new Promise((res,rej)=>{
      const tx = conn.transaction([STORE_TASKS],'readonly');
      const out = [];
      const cursor = tx.objectStore(STORE_TASKS).openCursor();
      cursor.onsuccess = e => {
        const cur = e.target.result;
        if(cur){ out.push(cur.value); cur.continue(); } else { res(out); }
      };
      cursor.onerror = e => rej(e.target.error);
    });
  }

  // --- Meta Operations (Existing) ---
  async function putMeta(key,value){
    const conn = await open();
    return new Promise((res,rej)=>{
      const tx = conn.transaction([STORE_META],'readwrite');
      tx.objectStore(STORE_META).put({key,value});
      tx.oncomplete = ()=>res();
      tx.onerror = e => rej(e.target.error);
    });
  }

  async function getMeta(key){
    const conn = await open();
    return new Promise((res,rej)=>{
      const tx = conn.transaction([STORE_META],'readonly');
      tx.objectStore(STORE_META).get(key).onsuccess = e => res(e.target.result?.value);
      tx.onerror = e => rej(e.target.error);
    });
  }

  // --- New Milestone Operations ---
  async function putMilestone(milestone){
    const connection = await open();
    return new Promise((resolve,reject)=>{
      const tx = connection.transaction([STORE_MILESTONES],'readwrite');
      const store = tx.objectStore(STORE_MILESTONES);
      store.put(milestone);
      tx.oncomplete = ()=>resolve(milestone);
      tx.onerror = e => reject(e.target.error);
    });
  }

  async function getMilestone(id){
    const conn = await open();
    return new Promise((res,rej)=>{
      const tx = conn.transaction([STORE_MILESTONES],'readonly');
      tx.objectStore(STORE_MILESTONES).get(id).onsuccess = e => res(e.target.result);
      tx.onerror = e => rej(e.target.error);
    });
  }

  async function getMilestonesForTask(taskId){
    const conn = await open();
    return new Promise((res,rej)=>{
      const tx = conn.transaction([STORE_MILESTONES],'readonly');
      const milestoneStore = tx.objectStore(STORE_MILESTONES);
      const taskIdIndex = milestoneStore.index('taskId');
      const out = [];
      
      taskIdIndex.openCursor(IDBKeyRange.only(taskId)).onsuccess = e => {
        const cursor = e.target.result;
        if(cursor){
          out.push(cursor.value);
          cursor.continue();
        } else {
          res(out);
        }
      };
      tx.onerror = e => rej(e.target.error);
    });
  }

  async function deleteMilestone(id){
    const conn = await open();
    return new Promise((res,rej)=>{
      const tx = conn.transaction([STORE_MILESTONES],'readwrite');
      tx.objectStore(STORE_MILESTONES).delete(id);
      tx.oncomplete = ()=>res();
      tx.onerror = e => rej(e.target.error);
    });
  }

  // New function to close the IndexedDB connection
  function close() {
    if (db) {
      db.close();
      db = null; // Clear the reference
    }
  }

  return {putTask,getTask,deleteTask,getAllTasks,putMeta,getMeta,close,
          putMilestone, getMilestone, getMilestonesForTask, deleteMilestone};
})();
