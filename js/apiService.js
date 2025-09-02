// js/apiService.js
// Centralized service for making API calls to the backend using JWT authentication.

const API_BASE_URL = 'http://localhost:12345'; // Define your API base URL here

// Module-level variables to store authentication token and associated username.
// These are NOT persisted to IndexedDB for security reasons.
let _authToken = null;
let _authUsername = null; // Username extracted from the token payload, or set on login

/**
 * Initializes authentication by attempting to load the token from sessionStorage.
 * This should be called once on application load.
 */
export function initAuth() {
    const storedToken = sessionStorage.getItem('authToken');
    const storedUsername = sessionStorage.getItem('authUsername');
    if (storedToken && storedUsername) {
        _authToken = storedToken;
        _authUsername = storedUsername;
        console.log('Auth token and username loaded from sessionStorage.');
    }
}

/**
 * Attempts to log in the user and retrieve a JWT.
 * @param {string} username - The username for authentication.
 * @param {string} password - The password for authentication.
 * @returns {Promise<object>} The server response containing the token and username.
 * @throws {Error} If login fails or network error occurs.
 */
export async function login(username, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await handleApiResponse(response);
        _authToken = data.token;
        _authUsername = data.username;
        sessionStorage.setItem('authToken', _authToken); // Persist token in session storage
        sessionStorage.setItem('authUsername', _authUsername); // Persist username in session storage
        return { token: _authToken, username: _authUsername };
    } catch (error) {
        console.error('Failed to login:', error);
        throw error;
    }
}

/**
 * Logs out the user by clearing the token from memory and sessionStorage.
 */
export function logout() {
    _authToken = null;
    _authUsername = null;
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('authUsername');
    console.log('User logged out.');
}

/**
 * Returns the currently authenticated username.
 * @returns {string|null} The username or null if not authenticated.
 */
export function getAuthenticatedUsername() {
    return _authUsername;
}

/**
 * Generates the Bearer Authorization header string.
 * @returns {string|null} The Authorization header value (e.g., "Bearer token") or null if no token is set.
 */
function _getAuthHeader() {
    if (_authToken) {
        return `Bearer ${_authToken}`;
    }
    return null; // No auth header if no token is set
}

/**
 * Handles common API response processing, including error handling.
 * @param {Response} response - The fetch API Response object.
 * @returns {Promise<object>} The JSON data from the response.
 * @throws {Error} If the response is not OK (status code outside 200-299).
 */
async function handleApiResponse(response) {
    let errorData = {};
    try {
        errorData = await response.json(); // Attempt to parse JSON even on error for more details
    } catch (e) {
        // Ignore if response body isn't JSON
    }

    if (!response.ok) {
        const errorMessage = errorData.error || `Server error: ${response.status} ${response.statusText}`;
        console.error('API Response Error:', errorMessage, response);
        // Specifically handle 401 Unauthorized errors
        if (response.status === 401) {
            // Depending on the app flow, you might want to automatically logout or
            // show a specific message to re-login.
            // For now, we'll just throw the error, and the calling function
            // can decide whether to prompt for re-authentication.
            logout(); // Clear token on 401 to ensure user must re-login
            throw new Error(`Authentication Required: ${errorMessage}. Please re-login.`);
        }
        throw new Error(errorMessage);
    }
    return errorData; // If response.ok, errorData is actually the success data
}

/**
 * Attaches the Authorization header to the request options.
 * Throws an error if authentication token is not set.
 * @param {object} options - The fetch request options.
 * @returns {object} The updated options object with Authorization header.
 * @throws {Error} If authentication token is not set.
 */
function _withAuth(options = {}) {
    const authHeader = _getAuthHeader();
    if (!authHeader) {
        throw new Error("Authentication token is not set. Please login to proceed with server operations.");
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
 * @param {string} taskId - The ID of the task to load.
 * @returns {Promise<object|null>} The full task object or null if not found/error.
 */
export async function loadTaskFromServer(taskId) {
    // Username is no longer passed as a separate parameter; it's implicit in the token
    try {
        const response = await fetch(`${API_BASE_URL}/load-task/${taskId}`, _withAuth());
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to load task from server:', error);
        throw error;
    }
}

/**
 * Loads a summary of tasks from the server, applying provided filters and sorting.
 * This endpoint is optimized for the left menu, returning only necessary fields.
 * @param {object} filters - An object containing filter parameters (q, categories, statuses, sortBy, date ranges).
 * @param {object} pagination - An object containing pagination parameters (limit, offset).
 * @returns {Promise<object[]>} An array of summarized task objects.
 */
export async function loadTasksSummaryFromServer(filters = {}, pagination = {}) {
    try {
        const params = new URLSearchParams();
        if (filters.q) params.append('q', filters.q);
        if (filters.categories && filters.categories.length > 0) params.append('categories', filters.categories.join(','));
        if (filters.statuses && filters.statuses.length > 0) params.append('statuses', filters.statuses.join(','));
        if (filters.sortBy) params.append('sortBy', filters.sortBy);
        if (filters.createdRF) params.append('createdRF', filters.createdRF);
        if (filters.createdRT) params.append('createdRT', filters.createdRT);
        if (filters.updatedRF) params.append('updatedRF', filters.updatedRF);
        if (filters.updatedRT) params.append('updatedRT', filters.updatedRT);
        if (filters.deadlineRF) params.append('deadlineRF', filters.deadlineRF);
        if (filters.deadlineRT) params.append('deadlineRT', filters.deadlineRT);
        if (filters.finishedRF) params.append('finishedRF', filters.finishedRF);
        if (filters.finishedRT) params.append('finishedRT', filters.finishedRT);

        // Add pagination parameters
        if (pagination.limit) params.append('limit', pagination.limit);
        if (pagination.offset) params.append('offset', pagination.offset);

        const url = `${API_BASE_URL}/load-tasks-summary?${params.toString()}`;
        const response = await fetch(url, _withAuth());
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to load task summaries from server:', error);
        throw error;
    }
}

/**
 * Sends task data to the Python server.
 * @param {object} task - The task object to save.
 */
export async function saveTaskToServer(task) {
    // Username is no longer passed as a separate parameter; it's implicit in the token
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
 */
export async function deleteTaskFromServer(taskId) {
    // Username is no longer passed as a separate parameter; it's implicit in the token
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
 * @param {string} taskId - The ID of the parent task.
 * @returns {Promise<object[]|null>} An array of milestone objects or null if not found/error.
 */
export async function loadMilestonesForTaskFromServer(taskId) {
    // Username is no longer passed as a separate parameter; it's implicit in the token
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
 */
export async function saveMilestoneToServer(milestone, taskId) {
    // Username is no longer passed as a separate parameter; it's implicit in the token
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
 * @param {string} taskId - The ID of the parent task.
 * @param {string} milestoneId - The ID of the milestone to load.
 * @returns {Promise<object|null>} The full milestone object or null if not found/error.
 */
export async function loadMilestoneFromServer(taskId, milestoneId) {
    // Username is no longer passed as a separate parameter; it's implicit in the token
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
 */
export async function deleteMilestoneFromServer(milestoneId, taskId) {
    // Username is no longer passed as a separate parameter; it's implicit in the token
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

/**
 * Loads a distinct list of statuses from the server for the current user.
 * @returns {Promise<string[]>} An array of distinct status strings.
 */
export async function getStatusesFromServer() {
    try {
        const response = await fetch(`${API_BASE_URL}/get-statuses/`, _withAuth());
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to load statuses from server:', error);
        throw error;
    }
}

/**
 * Loads a distinct list of 'from' values from the server for the current user.
 * @returns {Promise<string[]>} An array of distinct 'from' strings.
 */
export async function getFromValuesFromServer() {
    try {
        const response = await fetch(`${API_BASE_URL}/get-from-values/`, _withAuth());
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to load from values from server:', error);
        throw error;
    }
}

/**
 * Loads a distinct list of categories from the server for the current user.
 * @returns {Promise<string[]>} An array of distinct category strings.
 */
export async function getCategoriesFromServer() {
    try {
        const response = await fetch(`${API_BASE_URL}/get-categories/`, _withAuth());
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to load categories from server:', error);
        throw error;
    }
}
