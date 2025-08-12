// Simple rich-text editor built on contenteditable
export const Editor = (function(){
  // The 'init' function now accepts an 'onAttach' callback to handle file attachments.
  // This allows the editor to send attachment data to the UI layer that manages the task data.
  function init(container, { onAttach } = {}){
    container.innerHTML = `
      <div class="toolbar">
        <button data-cmd="bold"><b>B</b></button>
        <button data-cmd="italic"><i>I</i></button>
        <button data-cmd="underline"><u>U</u></button>
        <button data-cmd="insertUnorderedList">• List</button>
        <button data-cmd="insertOrderedList">1. List</button>
        <button data-cmd="createLink">Link</button>
        <input type="file" accept="image/*,application/*" data-attach style="display:none">
        <button data-cmd="attach">Attach</button>
      </div>
      <div class="text-area" contenteditable="true" style="min-height:200px;border:1px solid #eef2f7;padding:8px;border-radius:6px"></div>
    `;

    const toolbar = container.querySelector('.toolbar');
    const ed = container.querySelector('.text-area');
    const attachInput = container.querySelector('[data-attach]');

    toolbar.addEventListener('click', (e)=>{
      const btn = e.target.closest('button');
      if(!btn) return;
      const cmd = btn.dataset.cmd;
      if(cmd === 'createLink'){
        const url = prompt('Enter URL'); if(url) document.execCommand('createLink',false,url);
      } else if(cmd === 'attach'){
        // The attach button now simply triggers the hidden file input.
        attachInput.click();
      } else {
        document.execCommand(cmd,false,null);
      }
    });

    // This event listener triggers when a user selects a file.
    attachInput.addEventListener('change', async (e)=>{
      const f = e.target.files[0]; if(!f) return;
      // The selected file is converted to a Base64 Data URL for storage.
      const dataUrl = await fileToDataURL(f);
      
      // If the 'onAttach' callback was provided during initialization, it is called here.
      // We pass an object containing the file's name, type, and its data URL content.
      // This decouples the editor from the main UI's attachment handling logic.
      if(onAttach){
        onAttach({
          name: f.name,
          type: f.type,
          data: dataUrl
        });
      }
      // The file input is reset to allow attaching the same file again if needed.
      e.target.value = '';
    });

    // Helper function to convert a File object to a Data URL.
    function fileToDataURL(file){
      return new Promise((res,rej)=>{
        const r = new FileReader();
        r.onload = ()=>res(r.result);
        r.onerror = e=>rej(e);
        r.readAsDataURL(file);
      });
    }

    return {
      getHTML: ()=>ed.innerHTML,
      setHTML: html => ed.innerHTML = html,
      focus: ()=>ed.focus()
    };
  }
  return { init };
})();
