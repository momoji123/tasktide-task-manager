// js/apiService.js
// Centralized service for making API calls to the backend.

const API_BASE_URL = 'http://localhost:12345'; // Define your API base URL here

/**
 * Handles common API response processing, including error handling.
 * @param {Response} response - The fetch API Response object.
 * @returns {Promise<object>} The JSON data from the response.
 * @throws {Error} If the response is not OK (status code outside 200-299).
 */
async function handleApiResponse(response) {
    if (!response.ok) {
        // Attempt to parse error details from the response body if available
        let errorData = {};
        try {
            errorData = await response.json();
        } catch (e) {
            // Ignore if response body isn't JSON
        }
        const errorMessage = errorData.error || `Server error: ${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
    }
    return response.json();
}

/**
 * Loads a task's full details from the server.
 * @param {string} username - The username (creator) of the task.
 * @param {string} taskId - The ID of the task to load.
 * @returns {Promise<object|null>} The full task object or null if not found/error.
 */
export async function loadTaskFromServer(username, taskId) {
    if (!username) {
        console.error('API Error: Username is not set. Cannot load task from server.');
        return null;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/load-task/${username}/${taskId}`);
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to load task from server:', error);
        // showModalAlert(`Error loading task from server: ${error.message}`); // Decouple alerts from API service
        return null;
    }
}

/**
 * Sends task data to the Python server.
 * @param {object} task - The task object to save.
 * @param {string} username - The username of the task creator.
 */
export async function saveTaskToServer(task, username) {
    if (!username) {
        console.error('API Error: Username is not set. Cannot save task.');
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/save-task/${username}/${task.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(task)
        });
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to save task to server:', error);
        // showModalAlert(`Error saving task to server: ${error.message}`);
        throw error; // Re-throw to allow calling modules to handle alerts
    }
}

/**
 * Deletes a task and its associated folder from the Python server.
 * @param {string} taskId - The ID of the task to delete.
 * @param {string} username - The username of the task creator.
 */
export async function deleteTaskFromServer(taskId, username) {
    if (!username) {
        console.error('API Error: Username is not set. Cannot delete task.');
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/delete-task/${username}/${taskId}`, {
            method: 'DELETE'
        });
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to delete task and its folder from server:', error);
        // showModalAlert(`Error deleting task and its folder from server: ${error.message}`);
        throw error;
    }
}

/**
 * Sends milestone data to the Python server.
 * @param {object} milestone - The milestone object to save.
 * @param {string} taskId - The ID of the parent task.
 * @param {string} username - The username of the task creator.
 */
export async function saveMilestoneToServer(milestone, taskId, username) {
    if (!username) {
        console.error('API Error: Task creator username is not available. Cannot save milestone.');
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/save-milestone/${username}/${taskId}/${milestone.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(milestone)
        });
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to save milestone to server:', error);
        // showModalAlert(`Error saving milestone to server: ${error.message}`);
        throw error;
    }
}

/**
 * Loads a single milestone's full details (including notes) from the server.
 * @param {string} username - The username (creator) of the task.
 * @param {string} taskId - The ID of the parent task.
 * @param {string} milestoneId - The ID of the milestone to load.
 * @returns {Promise<object|null>} The full milestone object or null if not found/error.
 */
export async function loadMilestoneFromServer(username, taskId, milestoneId) {
    if (!username || !taskId || !milestoneId) {
        console.error('API Error: Missing parameters for loading milestone from server.');
        return null;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/load-milestone/${username}/${taskId}/${milestoneId}`);
        return await handleApiResponse(response);
    } catch (error) {
        console.error(`Failed to load milestone '${milestoneId}' from server:`, error);
        return null;
    }
}

/**
 * Deletes milestone data from the Python server.
 * @param {string} milestoneId - The ID of the milestone to delete.
 * @param {string} taskId - The ID of the parent task.
 * @param {string} username - The username of the task creator.
 */
export async function deleteMilestoneFromServer(milestoneId, taskId, username) {
    if (!username) {
        console.error('API Error: Task creator username is not available. Cannot delete milestone.');
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/delete-milestone/${username}/${taskId}/${milestoneId}`, {
            method: 'DELETE'
        });
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to delete milestone from server:', error);
        // showModalAlert(`Error deleting milestone from server: ${error.message}`);
        throw error;
    }
}
