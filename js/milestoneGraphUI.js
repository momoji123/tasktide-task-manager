// milestoneGraphUI.js
// This module handles rendering the milestone graph (bubbles and SVG lines)
// and related actions like opening the milestone editor or adding new milestones.

import { DB } from './storage.js';
import { escapeHtml } from './utilUI.js';

// Internal state
let currentMilestone = null; // Holds the currently selected milestone
let openMilestoneEditorCallback = null; // Callback to open the milestone editor
let resizeListener = null; // To hold the resize event listener for SVG updates

const selectors = {
  openMilestonesBtn: '#openMilestonesBtn', // This selector is in taskEditorUI context, not directly used here for init
  milestonesViewTitle: '#milestonesViewTitle',
  milestonesTaskTitle: '#milestonesTaskTitle',
  closeMilestonesView: '#closeMilestonesView',
  addMilestoneBtn: '#addMilestoneBtn',
  milestonesGraphContainer: '#milestonesGraphContainer',
  milestoneEditorArea: '#milestoneEditorArea',
  milestonesPage: '#milestonesPage', // New selector for the full-screen milestone page
};

/**
 * Initializes the Milestone Graph UI module.
 * This is primarily for setting up the overall milestone view.
 * @param {function} onOpenMilestoneEditor - Callback to open the milestone editor.
 */
export function initMilestoneGraphUI(onOpenMilestoneEditor) {
  openMilestoneEditorCallback = onOpenMilestoneEditor;
}

/**
 * Updates the currently selected milestone.
 * @param {object | null} milestone - The milestone object or null if none selected.
 */
export function updateCurrentMilestone(milestone) {
  currentMilestone = milestone;
}

/**
 * Opens the full-screen milestones view for a given task.
 * @param {string} taskId - The ID of the parent task.
 * @param {string} taskTitle - The title of the parent task.
 */
export async function openMilestonesView(taskId, taskTitle) {
  // Clear any previously selected milestone when opening a new view
  currentMilestone = null;

  const tmpl = document.getElementById('milestones-view-template')?.content;
  if (!tmpl) {
    console.error('Milestone view template not found!');
    return;
  }
  const modalFragment = tmpl.cloneNode(true);
  
  // Get references to key elements within the cloned template
  const milestonesPage = modalFragment.querySelector(selectors.milestonesPage); 
  const milestonesGraphContainer = milestonesPage?.querySelector(selectors.milestonesGraphContainer);
  const milestoneEditorArea = milestonesPage?.querySelector(selectors.milestoneEditorArea);

  if (!milestonesPage || !milestonesGraphContainer || !milestoneEditorArea) {
    console.error('Critical elements missing in milestone view template!');
    return;
  }

  milestonesPage.querySelector(selectors.milestonesTaskTitle).textContent = escapeHtml(taskTitle);

  const addMilestoneBtn = milestonesPage.querySelector(selectors.addMilestoneBtn);
  addMilestoneBtn?.addEventListener('click', async () => {
    const newMilestone = createEmptyMilestone(taskId);
    await DB.putMilestone(newMilestone); // Save the new milestone
    // Now that milestone is saved, open editor and re-render graph
    if (openMilestoneEditorCallback) {
      openMilestoneEditorCallback(newMilestone, taskId); 
    }
    renderMilestoneBubbles(taskId, milestonesGraphContainer); // Re-render graph
  });

  milestonesPage.querySelector(selectors.closeMilestonesView)?.addEventListener('click', () => {
    document.body.removeChild(milestonesPage); // Remove the full-screen page
    // Remove the resize listener when closing the milestone view
    if (resizeListener) {
      window.removeEventListener('resize', resizeListener);
      resizeListener = null;
    }
  });

  document.body.appendChild(milestonesPage); // Append the full-screen page

  // Initial render of milestones for the task
  renderMilestoneBubbles(taskId, milestonesGraphContainer);

  // Add resize listener for dynamic SVG line updates
  // Debounce the resize event for performance
  let resizeTimer;
  resizeListener = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderMilestoneBubbles(taskId, milestonesGraphContainer);
    }, 100); // Debounce for 100ms
  };
  window.addEventListener('resize', resizeListener);


  // Render an empty editor placeholder initially
  milestoneEditorArea.innerHTML = '<div class="placeholder">Select a milestone to edit or add a new one.</div>';
}

/**
 * Creates an empty milestone object for a given task.
 * @param {string} taskId - The ID of the parent task.
 * @returns {object} The new empty milestone object.
 */
function createEmptyMilestone(taskId) {
  const id = 'm_' + Date.now();
  return {
    id,
    taskId: taskId, // Link to parent task
    title: 'New Milestone',
    notes: '',
    deadline: null,
    finishDate: null,
    status: 'todo', // Default status, assuming 'todo' exists
    parentId: null, // New: Add parentId field, null by default
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Renders the milestone bubbles and SVG lines representing dependencies.
 * @param {string} taskId - The ID of the task whose milestones are being rendered.
 * @param {HTMLElement} containerEl - The container element for the graph.
 */
export async function renderMilestoneBubbles(taskId, containerEl) {
  containerEl.innerHTML = ''; // Clear existing bubbles and SVG
  const milestones = await DB.getMilestonesForTask(taskId);

  // If no milestones, show a placeholder and return
  if (milestones.length === 0) {
    containerEl.innerHTML = '<div class="placeholder">No milestones yet. Click "+ Add Milestone" to create one.</div>';
    return;
  }

  // Create a map for quick lookup of milestones by ID
  const milestoneMap = new Map(); // milestoneId -> milestone object
  const childrenMap = new Map(); // parentId -> [child1, child2, ...]

  milestones.forEach(m => {
      milestoneMap.set(m.id, m);
      // Ensure parentId is valid and exists in the current set of milestones
      if (m.parentId && milestoneMap.has(m.parentId)) {
          if (!childrenMap.has(m.parentId)) {
              childrenMap.set(m.parentId, []);
          }
          childrenMap.get(m.parentId).push(m);
      } else {
        // If parentId is invalid or points to a non-existent milestone, treat as root
        m.parentId = null;
      }
  });

  // Determine levels of all milestones using BFS
  const levelMap = new Map(); // milestoneId -> level
  const queue = [];

  // Find root milestones (no parent, or parent doesn't exist in current set)
  milestones.forEach(m => {
      if (!m.parentId || !milestoneMap.has(m.parentId)) {
          levelMap.set(m.id, 0);
          queue.push(m.id);
      }
  });

  let head = 0;
  while(head < queue.length) {
      const currentMilestoneId = queue[head++];
      const currentLevel = levelMap.get(currentMilestoneId);
      const children = childrenMap.get(currentMilestoneId) || [];
      children.forEach(child => {
          if (!levelMap.has(child.id)) { // Avoid reprocessing and infinite loops in case of cycles (though cycles shouldn't be allowed in data entry)
              levelMap.set(child.id, currentLevel + 1);
              queue.push(child.id);
          }
      });
  }

  // Group milestones by level
  const milestonesByLevel = new Map(); // level -> [milestone1, milestone2, ...]
  milestones.forEach(m => {
      const level = levelMap.has(m.id) ? levelMap.get(m.id) : 0; // Default to level 0 if not reachable from a root (orphan)
      if (!milestonesByLevel.has(level)) {
          milestonesByLevel.set(level, []);
      }
      milestonesByLevel.get(level).push(m);
  });

  // Sort milestones within each level (e.g., by creation date for consistency)
  Array.from(milestonesByLevel.values()).forEach(levelMilestones => {
      levelMilestones.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  });

  const tmpl = document.getElementById('milestone-bubble-template')?.content;
  if (!tmpl) {
    console.error('Milestone bubble template not found!');
    return;
  }
  const bubbleElements = {}; // Store references to bubble DOM elements by ID

  // Render structure level by level
  const sortedLevels = Array.from(milestonesByLevel.keys()).sort((a, b) => a - b);
  sortedLevels.forEach(level => {
      const levelRow = document.createElement('div');
      levelRow.classList.add('milestone-level-row');
      milestonesByLevel.get(level).forEach(milestone => {
          const node = tmpl.cloneNode(true);
          const el = node.querySelector('.milestone-bubble');
          if (!el) return;

          el.dataset.milestoneId = milestone.id; // Store ID for easy lookup
          el.querySelector('.milestone-title').textContent = milestone.title || '(no title)';
          
          // Add status class for styling
          el.classList.add(`status-${milestone.status.replace(/\s+/g, '-').toLowerCase()}`); // e.g., status-in-progress

          const statusSpan = el.querySelector('.milestone-status');
          statusSpan.textContent = escapeHtml(milestone.status);

          // Highlight the currently selected milestone
          if (currentMilestone && currentMilestone.id === milestone.id) {
              el.classList.add('selected');
          }

          el.addEventListener('click', () => {
            if (openMilestoneEditorCallback) openMilestoneEditorCallback(milestone, taskId);
          });
          levelRow.appendChild(el);
          bubbleElements[milestone.id] = el; // Store element by milestone ID
      });
      containerEl.appendChild(levelRow);
  });


  // Now, create SVG lines connecting the bubbles based on parentId
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('milestone-graph-svg');
  containerEl.prepend(svg); // Add SVG first so it's behind the bubbles

  // Use a small timeout to allow bubbles to render and get their dimensions
  // This is crucial for correct positioning after dynamic layout changes (like resizing)
  setTimeout(() => {
      // Ensure the SVG is sized correctly to the container before calculating positions
      svg.setAttribute('width', containerEl.offsetWidth);
      svg.setAttribute('height', containerEl.offsetHeight);

      milestones.forEach(milestone => {
          const parentId = milestone.parentId;
          if (parentId && bubbleElements[parentId] && bubbleElements[milestone.id]) {
              const parentBubble = bubbleElements[parentId];
              const childBubble = bubbleElements[milestone.id];

              const parentRect = parentBubble.getBoundingClientRect();
              const childRect = childBubble.getBoundingClientRect();
              const containerRect = containerEl.getBoundingClientRect();

              // Calculate center points relative to the container, accounting for scroll
              const scrollLeft = containerEl.scrollLeft;
              const scrollTop = containerEl.scrollTop;

              // Start point: bottom-center of parent bubble
              const x1 = (parentRect.left + parentRect.right) / 2 - containerRect.left + scrollLeft;
              const y1 = parentRect.bottom - containerRect.top + scrollTop + 5; // Offset slightly below parent

              // End point: top-center of child bubble
              const x2 = (childRect.left + childRect.right) / 2 - containerRect.left + scrollLeft;
              const y2 = childRect.top - containerRect.top + scrollTop - 5; // Offset slightly above child

              const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
              line.setAttribute('x1', x1);
              line.setAttribute('y1', y1);
              line.setAttribute('x2', x2);
              line.setAttribute('y2', y2);
              line.classList.add('milestone-connector-line');
              svg.appendChild(line);
          }
      });
  }, 50); // Small delay to allow DOM to settle before calculating positions
}
