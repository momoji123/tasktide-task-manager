// js/apiService.js
// Centralized service for making API calls to the backend.

const API_BASE_URL = 'http://localhost:12345'; // Define your API base URL here

// Module-level variables to store authentication credentials for the current session.
// These are NOT persisted to IndexedDB for security reasons.
let _authUsername = null;
let _authPassword = null;

/**
 * Sets the authentication credentials to be used for all subsequent API calls.
 * These credentials are held in memory for the current session only.
 * @param {string} username - The username for authentication.
 * @param {string} password - The password for authentication.
 */
export function setAuthCredentials(username, password) {
    _authUsername = username;
    _authPassword = password;
}

/**
 * Generates the Basic Authorization header string.
 * @returns {string|null} The Authorization header value (e.g., "Basic base64encodedcredentials") or null if credentials are not set.
 */
function _getAuthHeader() {
    if (_authUsername && _authPassword) {
        // Encode username and password in Base64 for Basic Auth
        const credentials = btoa(`${_authUsername}:${_authPassword}`);
        return `Basic ${credentials}`;
    }
    return null; // No auth header if credentials are not set
}

/**
 * Handles common API response processing, including error handling.
 * @param {Response} response - The fetch API Response object.
 * @returns {Promise<object>} The JSON data from the response.
 * @throws {Error} If the response is not OK (status code outside 200-299),
 * or if authentication is required (401 status).
 */
async function handleApiResponse(response) {
    if (!response.ok) {
        let errorData = {};
        try {
            errorData = await response.json();
        } catch (e) {
            // Ignore if response body isn't JSON
        }
        const errorMessage = errorData.error || `Server error: ${response.status} ${response.statusText}`;

        if (response.status === 401) {
            // Specific error for authentication issues, so the UI can prompt the user
            throw new Error(`Authentication Required: ${errorMessage}. Please go to Settings > Manage Username & Password.`);
        }
        throw new Error(errorMessage);
    }
    return response.json();
}

/**
 * Attaches the Authorization header to the request options.
 * Throws an error if authentication credentials are not set.
 * @param {object} options - The fetch request options.
 * @returns {object} The updated options object with Authorization header.
 * @throws {Error} If authentication credentials are not set.
 */
function _withAuth(options = {}) {
    const authHeader = _getAuthHeader();
    if (!authHeader) {
        throw new Error("Authentication credentials are not set. Please go to Settings > Manage Username & Password to proceed with server operations.");
    }
    return {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': authHeader
        }
    };
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
        const response = await fetch(`${API_BASE_URL}/load-task/${taskId}`, _withAuth());
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to load task from server:', error);
        throw error; // Re-throw to allow calling modules to handle alerts
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
        throw new Error('API Error: Username is not set. Cannot save task.');
    }
    try {
        const response = await fetch(`${API_BASE_URL}/save-task/${task.id}`, _withAuth({
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(task)
        }));
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to save task to server:', error);
        throw error;
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
        throw new Error('API Error: Username is not set. Cannot delete task.');
    }
    try {
        const response = await fetch(`${API_BASE_URL}/delete-task/${taskId}`, _withAuth({
            method: 'DELETE'
        }));
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to delete task and its folder from server:', error);
        throw error;
    }
}

/**
 * Loads all milestones for a given task from the server.
 * @param {string} username - The username (creator) of the task.
 * @param {string} taskId - The ID of the parent task.
 * @returns {Promise<object[]|null>} An array of milestone objects or null if not found/error.
 */
export async function loadMilestonesForTaskFromServer(username, taskId) {
    if (!username || !taskId) {
        console.error('API Error: Missing parameters for loading milestones from server.');
        return null;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/load-milestones/${taskId}`, _withAuth());
        return await handleApiResponse(response);
    } catch (error) {
        console.error(`Failed to load milestones for task '${taskId}' from server:`, error);
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
        throw new Error('API Error: Task creator username is not available. Cannot save milestone.');
    }
    try {
        const response = await fetch(`${API_BASE_URL}/save-milestone/${taskId}/${milestone.id}`, _withAuth({
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(milestone)
        }));
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to save milestone to server:', error);
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
        const response = await fetch(`${API_BASE_URL}/load-milestone/${taskId}/${milestoneId}`, _withAuth());
        return await handleApiResponse(response);
    } catch (error) {
        console.error(`Failed to load milestone '${milestoneId}' from server:`, error);
        throw error;
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
        throw new Error('API Error: Task creator username is not available. Cannot delete milestone.');
    }
    try {
        const response = await fetch(`${API_BASE_URL}/delete-milestone/${taskId}/${milestoneId}`, _withAuth({
            method: 'DELETE'
        }));
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to delete milestone from server:', error);
        throw error;
    }
}
