// ui.js
// This is the central UI orchestration module.
// It imports and initializes all component UI modules and manages shared application state.

import { DB } from './storage.js';
// Import all component UI modules
import * as HeaderUI from './headerUI.js';
import * as LeftMenuTaskUI from './leftMenuTaskUI.js';
import * as TaskEditorUI from './taskEditorUI.js';
import * as TaskViewerUI from './taskViewerUI.js'; // New: Import TaskViewerUI
import * as MilestoneGraphUI from './milestoneGraphUI.js';
import * as MilestoneEditorUI from './milestoneEditorUI.js';
import { showModalAlert } from './utilUI.js'; // Just for error/info modals

export const UI = (function() {
  // Application-wide state variables
  let categories = [];
  let statuses = [];
  let froms = [];
  let filterSectionVisible = true;
  let selectedFilterCategories = [];

  /**
   * Initializes the entire application UI.
   * This function is the main entry point for UI setup.
   */
  async function init() {
    // 1. Load custom options and application settings from DB
    // Ensure categories is always an array. If DB.getMeta('categories') returns
    // something that's not an array, default to ['General'].
    const storedCategories = await DB.getMeta('categories');
    categories = Array.isArray(storedCategories) ? storedCategories : ['General'];

    statuses = (await DB.getMeta('statuses')) || ['todo', 'in-progress', 'done'];
    froms = (await DB.getMeta('froms')) || ['Work', 'Personal', 'Shopping'];
    filterSectionVisible = (await DB.getMeta('filterSectionVisible')) ?? true;
    selectedFilterCategories = (await DB.getMeta('selectedFilterCategories')) || [];

    // 2. Prepare initial state object for passing to components
    const commonState = {
      categories: categories,
      statuses: statuses,
      froms: froms,
      filterSectionVisible: filterSectionVisible,
      selectedFilterCategories: selectedFilterCategories
    };

    // 3. Initialize individual UI components, passing necessary state and callbacks
    // Callbacks are crucial for inter-component communication without direct coupling.

    // HeaderUI needs: initial state, and callbacks to re-render task list, categories filter, and status options
    // Also pass callbacks to update other UI modules' states
    HeaderUI.initHeader(
      commonState,
      LeftMenuTaskUI.renderTaskList,
      LeftMenuTaskUI.renderFilterCategoriesMultiSelect,
      LeftMenuTaskUI.renderStatusOptions,
      // New callbacks for state propagation
      LeftMenuTaskUI.updateLeftMenuTaskUIState,
      TaskEditorUI.updateTaskEditorUIState,
      MilestoneEditorUI.updateMilestoneEditorUIState
    );

    // LeftMenuTaskUI needs: initial state, and callback to open the task viewer (default)
    // When a task is clicked, it opens in view mode
    LeftMenuTaskUI.initLeftMenuTaskUI(commonState, TaskViewerUI.openTaskViewer);

    // TaskEditorUI needs: initial state, and callbacks to re-render task list, open milestone view, and open task viewer
    // TaskEditorUI now gets a callback to open the viewer after saving a task
    TaskEditorUI.initTaskEditorUI(commonState, LeftMenuTaskUI.renderTaskList, MilestoneGraphUI.openMilestonesView, TaskViewerUI.openTaskViewer);

    // TaskViewerUI needs: callback to open the task editor
    // TaskViewerUI also needs a callback to open milestone view
    TaskViewerUI.initTaskViewerUI(TaskEditorUI.openTaskEditor, MilestoneGraphUI.openMilestonesView);

    // MilestoneGraphUI needs: callback to open the milestone editor
    MilestoneGraphUI.initMilestoneGraphUI(MilestoneEditorUI.openMilestoneEditor);

    // MilestoneEditorUI needs: initial state, and callbacks to re-render milestone bubbles, and update current milestone in graph
    MilestoneEditorUI.initMilestoneEditorUI(commonState, MilestoneGraphUI.renderMilestoneBubbles, MilestoneGraphUI.updateCurrentMilestone);

    // 4. Set up listeners for global state changes originating from child components
    // This is where `ui.js` acts as an intermediary or central state manager
    // For simplicity in this refactor, some direct updates to DB are done within modules,
    // and then callbacks are used to re-render. For more complex apps, a proper
    // central state management pattern (like Redux or simple event bus) would be ideal.

    // For now, the existing direct updates and callbacks suffice for the current flow.

    // Handle new task button: it should open the editor directly for new tasks
    document.getElementById('newTaskBtn')?.addEventListener('click', () => {
        TaskEditorUI.openTaskEditor({
            id: 't_' + Date.now(),
            title: '',
            description: '',
            notes: '',
            status: statuses[0] || 'todo',
            priority: 3,
            from: froms[0] || 'Personal',
            deadline: null,
            finishDate: null,
            categories: [],
            attachments: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    });

  }

  // Expose init function
  return { init };
})();

