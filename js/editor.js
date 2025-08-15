// Simple rich-text editor built on contenteditable
export const Editor = (function(){
  // Internal references to the editor elements, used by setEditable
  let currentEditorInstance = null; // Stores the currently active .text-area
  let currentToolbar = null; // Stores the toolbar for the current editor
  let currentAttachInput = null; // Stores the attachment input for the current editor

  /**
   * Initializes a rich text editor on a given container element.
   * The editor will create a contenteditable div inside the container.
   * @param {HTMLElement} container - The DOM element to transform into an editor.
   * @param {object} options - Optional configuration options.
   * @param {function} options.onAttach - Callback function for handling attachments.
   */
  function init(container, { onAttach } = {}){
    if (!container) {
      console.error('Editor container element not found for initialization.');
      return {
        getHTML: () => '',
        setHTML: () => {},
        focus: () => {},
        setEditable: () => {} // Return a no-op setEditable for consistency
      };
    }

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

    // Store references to these elements for setEditable
    currentEditorInstance = ed;
    currentToolbar = toolbar;
    currentAttachInput = attachInput;

    toolbar.addEventListener('click', (e)=>{
      const btn = e.target.closest('button');
      if(!btn || btn.disabled) return; // Prevent action if button is disabled

      const cmd = btn.dataset.cmd;
      if(cmd === 'createLink'){
        const url = prompt('Enter URL');
        if(url) document.execCommand('createLink',false,url);
      } else if(cmd === 'attach'){
        // The attach button now simply triggers the hidden file input.
        attachInput.click();
      } else {
        document.execCommand(cmd,false,null);
      }
    });

    // This event listener triggers when a user selects a file.
    attachInput.addEventListener('change', async (e)=>{
      const f = e.target.files[0];
      if(!f) return;
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
      focus: ()=>ed.focus(),
      setEditable: (editable) => {
        // This closure ensures setEditable has access to 'ed', 'toolbar', 'attachInput'
        setEditable(ed, toolbar, attachInput, editable);
      }
    };
  }

  /**
   * Sets the editability of the rich text editor's content area and its toolbar.
   * This is a private helper, called by the public setEditable method returned by init.
   * @param {HTMLElement} editorTextArea - The contenteditable div (e.g., element with class 'text-area').
   * @param {HTMLElement} toolbarEl - The toolbar element.
   * @param {HTMLElement} attachInputEl - The hidden file input for attachments.
   * @param {boolean} editable - True to make it editable, false to make it read-only.
   */
  function setEditable(editorTextArea, toolbarEl, attachInputEl, editable) {
    if (editorTextArea) {
      editorTextArea.contentEditable = editable;
      // Add/remove a class for visual feedback (e.g., dimmer background for read-only)
      if (editable) {
        editorTextArea.classList.remove('read-only');
      } else {
        editorTextArea.classList.add('read-only');
      }
    }

    // Disable/enable toolbar buttons
    if (toolbarEl) {
      toolbarEl.querySelectorAll('button').forEach(button => {
        button.disabled = !editable;
      });
    }

    // Disable/enable attachment input
    if (attachInputEl) {
      attachInputEl.disabled = !editable;
    }
  }


  /**
   * Renders static HTML content into a given element.
   * This is used for the read-only view in TaskViewerUI.
   * @param {HTMLElement} element - The DOM element to render content into.
   * @param {string} content - The HTML string content to display.
   */
  function renderStaticContent(element, content) {
    if (element) {
        element.innerHTML = content || ''; // Simply set the innerHTML
        // In a production environment, you might want to sanitize the content
        // to prevent XSS attacks if it comes from untrusted sources.
    }
  }

  // Return both init and renderStaticContent as part of the public API of Editor.
  // The setEditable returned by init is a closure specific to that editor instance.
  // We keep the main Editor object simpler here.
  return { init, renderStaticContent };
})();
