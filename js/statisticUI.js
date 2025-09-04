
// js/statisticUI.js
import { DB } from './storage.js';
import * as apiService from './apiService.js';

const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
const twoWeeksInMs = 14 * 24 * 60 * 60 * 1000;

function getTaskCountsByStatus(tasks) {
    const counts = {};
    for (const task of tasks) {
        counts[task.status] = (counts[task.status] || 0) + 1;
    }
    return counts;
}

function getDueSoonAndOverdueTasks(tasks) {
    const dueSoon = [];
    const overdue = [];
    const now = new Date();

    for (const task of tasks) {
        if (task.deadline) {
            const deadline = new Date(task.deadline);
            const diff = deadline - now;

            if (diff > 0 && diff <= sevenDaysInMs) {
                dueSoon.push(task);
            } else if (diff < 0 && !task.finishDate) {
                overdue.push(task);
            }
        }
    }
    return { dueSoon, overdue };
}

function getRecentlyUpdatedTasks(tasks) {
    const recentlyUpdated = [];
    const now = new Date();

    for (const task of tasks) {
        if (task.updatedAt) {
            const updatedAt = new Date(task.updatedAt);
            const diff = now - updatedAt;

            if (diff <= twoWeeksInMs) {
                recentlyUpdated.push(task);
            }
        }
    }
    return recentlyUpdated;
}

function getRecentlyFinishedTasks(tasks) {
    const recentlyFinished = [];
    const now = new Date();

    for (const task of tasks) {
        if (task.finishDate) {
            const finishDate = new Date(task.finishDate);
            const diff = now - finishDate;


            if (diff <= twoWeeksInMs) {
                recentlyFinished.push(task);
            }
        }
    }
    return recentlyFinished;
}

function renderTaskList(tasks, showDeadline = true, showFinishDate = true, showUpdatedDate = true) {
    if (!tasks || tasks.length === 0) {
        return '<div>Nothing to show.</div>';
    }

    
    
    if (showDeadline) {
        tasks.sort((b, a) => {
            const dateA = a.deadline ? new Date(a.deadline).getTime() : 0;
            const dateB = b.deadline ? new Date(b.deadline).getTime() : 0;
            return dateA - dateB;
        });
    }
    
    if (showFinishDate) {
        tasks.sort((b, a) => {
            const dateA = a.finishDate ? new Date(a.finishDate).getTime() : 0;
            const dateB = b.finishDate ? new Date(b.finishDate).getTime() : 0;
            return dateA - dateB;
        });
    }
    
    if (showUpdatedDate) {
        tasks.sort((b, a) => {
            const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return dateA - dateB;
        });
    }
    
    
    let listItems = tasks.map(task => {
        let deadlineText = showDeadline && task.deadline ? ` (Deadline: ${new Date(task.deadline).toLocaleDateString()})` : '';
        let finishDateText = showFinishDate && task.finishDate ? ` (Finished: ${new Date(task.finishDate).toLocaleDateString()})` : '';
        let updatedDateText = showUpdatedDate && task.updatedAt ? ` (Updated: ${new Date(task.updatedAt).toLocaleDateString()})` : '';

        return `<li>${task.title}${deadlineText}${finishDateText}${updatedDateText}</li>`;
    }).join('');
    

    return `
        <ul>
            ${listItems}
        </ul>
    `;
}

export async function renderStatistics() {
    const placeholder = document.getElementById('statistics-placeholder');
    if (!placeholder) return;

    try {
        const tasks = await apiService.loadTasksSummaryFromServer();
        const statuses = await DB.getMeta('statuses');

        const taskCounts = getTaskCountsByStatus(tasks);
        const { dueSoon, overdue } = getDueSoonAndOverdueTasks(tasks);
        const recentlyUpdated = getRecentlyUpdatedTasks(tasks);
        const recentlyFinished = getRecentlyFinishedTasks(tasks);

        let statisticsHTML = `
            <div class="statistics-section">
                <h2>Statistics</h2>

                <div class="statistic-widget">
                    <h3>Task Counts by Status</h3>
                    <ul>
                        ${statuses.map(status => `<li><strong>${status}:</strong> ${taskCounts[status] || 0}</li>`).join('')}
                    </ul>
                </div>

                <div class="statistic-widget">
                    <h3>Due Soon (<= 7 days)</h3>
                    ${renderTaskList(dueSoon, true, false, false)}
                </div>

                <div class="statistic-widget">
                    <h3>Overdue Tasks</h3>
                    ${renderTaskList(overdue, true, false, false)}
                </div>

                <div class="statistic-widget">
                    <h3>Progress Last 2 Week (updated in last 14 days)</h3>
                    ${renderTaskList(recentlyUpdated, false, false, true)}
                </div>

                <div class="statistic-widget">
                    <h3>Finished Last 2 Week</h3>
                    ${renderTaskList(recentlyFinished, false, true, false)}
                </div>
            </div>
        `;

        placeholder.innerHTML = statisticsHTML;
    } catch (error) {
        console.error('Failed to render statistics:', error);
        placeholder.innerHTML = '<div class="error">Failed to load statistics.</div>';
    }
}
