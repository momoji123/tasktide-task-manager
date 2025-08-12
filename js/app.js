import {DB} from './storage.js';
import {UI} from './ui.js';

(async function main(){
  // small compatibility guard
  if(!('indexedDB' in window)){
    document.getElementById('app').innerHTML = '<div style="padding:20px;color:#900">IndexedDB not available in this browser.</div>';
    return;
  }
  // ensure DB opens
  await DB.putMeta('init','ok').catch(()=>{});
  await UI.init();
})();