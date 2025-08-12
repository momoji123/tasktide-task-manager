export const DB = (function(){
  const DB_NAME = 'taskmgr-v1';
  const STORE_TASKS = 'tasks';
  const STORE_META = 'meta';
  let db;

  function open(){
    return new Promise((resolve,reject)=>{
      if(db) return resolve(db);
      const r = indexedDB.open(DB_NAME, 2); // Version bump to 2 to trigger onupgradeneeded
      r.onupgradeneeded = e => {
        const idb = e.target.result;
        // Task store
        if(!idb.objectStoreNames.contains(STORE_TASKS)){
          const tstore = idb.createObjectStore(STORE_TASKS,{keyPath:'id'});
          tstore.createIndex('deadline','deadline',{unique:false});
          tstore.createIndex('updatedAt','updatedAt',{unique:false});
        }
        // Meta store for custom categories, statuses, etc.
        if(!idb.objectStoreNames.contains(STORE_META)){
          idb.createObjectStore(STORE_META,{keyPath:'key'});
        }

        // Add 'from' index if it doesn't exist (new in version 2)
        const tstore = r.transaction.objectStore(STORE_TASKS);
        if (!tstore.indexNames.contains('from')) {
          tstore.createIndex('from', 'from', {unique: false});
        }
      };
      r.onsuccess = e => { db = e.target.result; resolve(db); };
      r.onerror = e => reject(e.target.error);
    });
  }

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
    });
  }

  async function deleteTask(id){
    const conn = await open();
    return new Promise((res,rej)=>{
      const tx = conn.transaction([STORE_TASKS],'readwrite');
      tx.objectStore(STORE_TASKS).delete(id);
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

  // New function to close the IndexedDB connection
  function close() {
    if (db) {
      db.close();
      db = null; // Clear the reference
    }
  }

  return {putTask,getTask,deleteTask,getAllTasks,putMeta,getMeta,close};
})();
