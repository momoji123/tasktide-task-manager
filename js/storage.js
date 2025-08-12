export const DB = (function(){
  const DB_NAME = 'taskmgr-v1';
  const STORE_TASKS = 'tasks';
  const STORE_META = 'meta';
  let db;

  function open(){
    return new Promise((resolve,reject)=>{
      if(db) return resolve(db);
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = e => {
        const idb = e.target.result;
        if(!idb.objectStoreNames.contains(STORE_TASKS)){
          const tstore = idb.createObjectStore(STORE_TASKS,{keyPath:'id'});
          tstore.createIndex('deadline','deadline',{unique:false});
          tstore.createIndex('updatedAt','updatedAt',{unique:false});
        }
        if(!idb.objectStoreNames.contains(STORE_META)){
          idb.createObjectStore(STORE_META,{keyPath:'key'});
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
      const req = tx.objectStore(STORE_META).get(key);
      req.onsuccess = e => res(e.target.result?.value);
      req.onerror = e => rej(e.target.error);
    });
  }

  return { putTask, getTask, deleteTask, getAllTasks, putMeta, getMeta };
})();