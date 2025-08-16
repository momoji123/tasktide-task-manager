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
    // open editor and re-render graph
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
 * Implements a layered graph layout to ensure children are below parents
 * and minimize line crossings by dynamically calculating positions.
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

  // --- Graph Data Structure Setup ---
  const milestoneMap = new Map();     // id -> milestone object
  const childrenMap = new Map();      // parentId -> [child milestone objects]
  const parentMap = new Map();        // childId -> parent milestone object (only one parent supported by data model)
  const rootMilestones = [];          // Milestones with no valid parent

  // Populate milestoneMap and initialize childrenMap
  milestones.forEach(m => {
    milestoneMap.set(m.id, m);
    childrenMap.set(m.id, []); // Initialize children array for all milestones
  });

  // Build childrenMap, parentMap, and identify root milestones
  milestones.forEach(m => {
    // If parentId is set and the parent exists in the current milestone set
    if (m.parentId && milestoneMap.has(m.parentId)) {
      childrenMap.get(m.parentId).push(m);
      parentMap.set(m.id, milestoneMap.get(m.parentId));
    } else {
      rootMilestones.push(m);
    }
  });

  // --- Level Assignment (Vertical Positioning) using BFS ---
  // Assigns each milestone to a 'level' based on its distance from a root.
  // This determines the Y-coordinate.
  const levelMap = new Map();     // milestoneId -> level_number
  const levels = new Map();       // level_number -> [milestone_ids (ordered)]
  const queue = [];

  // Sort root milestones for consistent initial horizontal ordering
  rootMilestones.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Initialize queue with roots and assign them level 0
  rootMilestones.forEach(m => {
    levelMap.set(m.id, 0);
    queue.push(m.id);
    if (!levels.has(0)) levels.set(0, []);
    levels.get(0).push(m.id);
  });

  let head = 0;
  let maxLevel = 0;
  while (head < queue.length) {
    const currentId = queue[head++];
    const currentLevel = levelMap.get(currentId);
    maxLevel = Math.max(maxLevel, currentLevel);

    const children = childrenMap.get(currentId) || [];
    // Sort children for consistent horizontal ordering within a parent's group
    children.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    children.forEach(child => {
      // Only process if child hasn't been assigned a level yet (prevents infinite loops for cycles)
      if (!levelMap.has(child.id)) {
        levelMap.set(child.id, currentLevel + 1);
        queue.push(child.id);
        if (!levels.has(currentLevel + 1)) levels.set(currentLevel + 1, []);
        levels.get(currentLevel + 1).push(child.id);
      }
    });
  }

  // --- Layout Constants (adjust for desired spacing and estimated bubble size) ---
  const estimatedBubbleWidth = 200;
  const estimatedBubbleHeight = 80;
  const horizontalSpacing = 60;   // Space between bubbles horizontally
  const verticalSpacing = 120;    // Space between levels vertically
  const paddingLeft = 40;         // Left padding for the entire graph
  const paddingTop = 40;          // Top padding for the entire graph

  const nodePositions = new Map(); // milestoneId -> { x, y, width, height }

  // First pass: Initialize positions and calculate preliminary widths for each level
  // This helps in distributing space more evenly.
  const levelWidths = new Map(); // level -> total width needed for this level
  for (let l = 0; l <= maxLevel; l++) {
      const levelMilestonesIds = levels.get(l) || [];
      let currentLevelCalculatedWidth = 0;
      levelMilestonesIds.forEach(id => {
          nodePositions.set(id, {
              x: 0, // Will be set later
              y: l * (estimatedBubbleHeight + verticalSpacing) + paddingTop,
              width: estimatedBubbleWidth,
              height: estimatedBubbleHeight
          });
          currentLevelCalculatedWidth += estimatedBubbleWidth + horizontalSpacing;
      });
      levelWidths.set(l, currentLevelCalculatedWidth - horizontalSpacing); // Remove last spacing
  }

  // Second pass: Recursive layout to position nodes horizontally
  // This aims to center children under parents and manage overlaps.
  function layoutNode(milestoneId, currentXOffset) {
      const milestone = milestoneMap.get(milestoneId);
      if (!milestone) return 0; // Should not happen

      const children = childrenMap.get(milestoneId);
      let totalChildrenWidth = 0;

      if (children && children.length > 0) {
          // Recursively layout children first to determine their positions and total width
          children.forEach(child => {
              totalChildrenWidth += layoutNode(child.id, currentXOffset + totalChildrenWidth);
          });

          // If children exist, position parent over the center of its children
          let leftmostChildX = Infinity;
          let rightmostChildX = -Infinity;
          children.forEach(child => {
              const childPos = nodePositions.get(child.id);
              leftmostChildX = Math.min(leftmostChildX, childPos.x);
              rightmostChildX = Math.max(rightmostChildX, childPos.x + childPos.width);
          });
          const centerOfChildrenX = (leftmostChildX + rightmostChildX) / 2;

          const parentPos = nodePositions.get(milestoneId);
          parentPos.x = centerOfChildrenX - (parentPos.width / 2); // Center parent above children
          nodePositions.set(milestoneId, parentPos);

      } else {
          // If no children, just place the node at the current offset
          const pos = nodePositions.get(milestoneId);
          pos.x = currentXOffset;
          nodePositions.set(milestoneId, pos);
          totalChildrenWidth = pos.width + horizontalSpacing; // For leaves, contribute their own width
      }

      return totalChildrenWidth;
  }

  // Start layout from root milestones
  let currentRootX = paddingLeft;
  rootMilestones.forEach(root => {
      currentRootX += layoutNode(root.id, currentRootX);
  });

  // Third Pass: Collision resolution and final positioning within levels
  // Adjusts positions to ensure no overlaps and maintain minimum spacing.
  for (let l = 0; l <= maxLevel; l++) {
      const currentLevelMilestonesIds = levels.get(l) || [];
      // Sort by current X position to process from left to right
      currentLevelMilestonesIds.sort((a, b) => nodePositions.get(a).x - nodePositions.get(b).x);

      let currentX = paddingLeft;
      currentLevelMilestonesIds.forEach(id => {
          const pos = nodePositions.get(id);
          if (pos) {
              // Ensure node is not placed to the left of the minimum required X for this level
              pos.x = Math.max(pos.x, currentX);
              nodePositions.set(id, pos);
              currentX = pos.x + pos.width + horizontalSpacing;
          }
      });
  }

  // --- Render Bubbles and Collect Actual Dimensions ---
  const tmpl = document.getElementById('milestone-bubble-template')?.content;
  if (!tmpl) {
    console.error('Milestone bubble template not found!');
    return;
  }
  const elements = new Map(); // milestoneId -> DOM element reference

  let graphMaxX = 0;
  let graphMaxY = 0;

  // Render all bubbles using calculated positions (x, y)
  for (const [milestoneId, pos] of nodePositions.entries()) {
    const milestone = milestoneMap.get(milestoneId);
    if (!milestone) continue;

    const node = tmpl.cloneNode(true);
    const el = node.querySelector('.milestone-bubble');
    if (!el) continue;

    el.dataset.milestoneId = milestone.id; // Store ID for easy lookup
    el.querySelector('.milestone-title').textContent = escapeHtml(milestone.title) || '(no title)';

    // Add status class for styling (e.g., status-in-progress)
    el.classList.add(`status-${milestone.status.replace(/\s+/g, '-').toLowerCase()}`);

    const statusSpan = el.querySelector('.milestone-status');
    statusSpan.textContent = escapeHtml(milestone.status);

    // Highlight the currently selected milestone
    if (currentMilestone && currentMilestone.id === milestone.id) {
      el.classList.add('selected');
    }

    // Set absolute position based on calculated x, y
    el.style.position = 'absolute';
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';

    el.addEventListener('click', () => {
      if (openMilestoneEditorCallback) openMilestoneEditorCallback(milestone, taskId);
    });

    containerEl.appendChild(el); // Append bubble directly to the graph container
    elements.set(milestoneId, el);

    // Update max dimensions of the graph based on initial estimates.
    // Actual dimensions will be used for lines after rendering.
    graphMaxX = Math.max(graphMaxX, pos.x + estimatedBubbleWidth + paddingLeft);
    graphMaxY = Math.max(graphMaxY, pos.y + estimatedBubbleHeight + paddingTop);
  }

  // Set container size to fit all content, allowing scroll
  containerEl.style.position = 'relative'; // Ensure container is positioned for absolute children
  // Removed minWidth and minHeight to allow natural scrolling
  // containerEl.style.minWidth = graphMaxX + 'px';
  // containerEl.style.minHeight = graphMaxY + 'px';


  // Create SVG layer for lines
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('milestone-graph-svg');
  containerEl.prepend(svg); // Add SVG first so it's behind the bubbles

  // Use a small timeout to allow bubbles to render and get their actual dimensions
  // This is crucial for correct positioning after dynamic layout changes (like resizing)
  setTimeout(() => {
    // Update stored dimensions with actual rendered sizes
    for (const [milestoneId, el] of elements.entries()) {
      const rect = el.getBoundingClientRect();
      const currentPos = nodePositions.get(milestoneId);
      if (currentPos) {
        currentPos.width = rect.width;
        currentPos.height = rect.height;
        nodePositions.set(milestoneId, currentPos);
      }
    }

    // Ensure the SVG is sized correctly to cover the full scrollable area
    svg.setAttribute('width', containerEl.scrollWidth);
    svg.setAttribute('height', containerEl.scrollHeight);

    // Draw lines using actual, updated positions
    milestones.forEach(milestone => {
      const parentMilestone = parentMap.get(milestone.id); // Get the actual parent object
      if (parentMilestone && elements.has(parentMilestone.id) && elements.has(milestone.id)) {
        const parentPos = nodePositions.get(parentMilestone.id);
        const childPos = nodePositions.get(milestone.id);

        if (!parentPos || !childPos) return; // Should not happen if `elements.has` passed

        // Calculate connector points relative to the SVG, which covers the container
        // These are already "absolute" within the container's coordinate system
        const x1 = parentPos.x + (parentPos.width / 2); // Center of parent bubble
        const y1 = parentPos.y + parentPos.height + 5; // Slightly below parent bubble

        const x2 = childPos.x + (childPos.width / 2); // Center of child bubble
        const y2 = childPos.y - 5; // Slightly above child bubble

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.classList.add('milestone-connector-line');
        svg.appendChild(line);
      }
    });

    // Scroll to the currently selected milestone if it exists
    if (currentMilestone && elements.has(currentMilestone.id)) {
      elements.get(currentMilestone.id).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }, 50); // Small delay to allow DOM to settle before calculating positions
}
