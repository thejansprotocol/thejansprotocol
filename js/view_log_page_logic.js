// --- view_log_page_logic.js ---
// Handles fetching, displaying a specific daily log, and applying random readable colors.

// --- Constants for this page ---
// MODIFIED: Path to the parent 'data' directory. 
// The 'logFile' URL parameter should now provide the rest of the path (e.g., "dailylogs_v8/your_log.json")
const LOG_FILES_BASE_URL = './data/dailylogs_v8/';
const LOG_CONTENT_ELEMENT_ID = "log-content";
const LOG_TITLE_ELEMENT_ID = "log-title";
const GLOBAL_MESSAGE_DISPLAY_ID_LOG_VIEW = "global-message-log-view";

/**
 * Generates random R, G, B color parts.
 * @returns {{r: number, g: number, b: number}}
 */
function getRandomRgbColorParts() {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return { r, g, b };
}

/**
 * Converts RGB color parts to a hex string.
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255)
 * @param {number} b - Blue component (0-255)
 * @returns {string} Hex color string (e.g., "#RRGGBB")
 */
function rgbToHex(r, g, b) {
    const toHex = (c) => {
        const hex = c.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Determines a contrasting text color (black or white) for a given hex background color.
 * @param {string} hexBgColor - The background color in hex format (e.g., "#RRGGBB").
 * @returns {string} "#000000" (black) or "#FFFFFF" (white).
 */
function getContrastTextColor(hexBgColor) {
    const hex = hexBgColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

/**
 * Displays a message on this page.
 * @param {string} message The message.
 * @param {'error'|'info'|'success'|'warning'} type The type of message.
 */
function showLogPageViewMessage(message, type = 'info') {
    const messageDiv = document.getElementById(GLOBAL_MESSAGE_DISPLAY_ID_LOG_VIEW);
    if (messageDiv) {
        messageDiv.textContent = message;
        messageDiv.className = `message-container message-${type}`; // Ensure you have these CSS classes
        messageDiv.style.display = 'block';
        if (type !== 'info' && type !== 'success') { // Auto-hide for info/success might not be needed
            setTimeout(() => { messageDiv.style.display = 'none'; }, 7000);
        }
    } else {
        alert(`[${type.toUpperCase()}] ${message}`); // Fallback
    }
}

/**
 * Applies random background (with transparency) and contrasting text colors to the page.
 */
function applyRandomColors() {
    const { r, g, b } = getRandomRgbColorParts();
    const alpha = 0.80; 
    
    const randomBgColorRgba = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    const opaqueHexColorForContrast = rgbToHex(r, g, b);
    
    const contrastTextColor = getContrastTextColor(opaqueHexColorForContrast);

    document.body.style.backgroundColor = randomBgColorRgba;
    document.body.style.color = contrastTextColor;

    const logTitleEl = document.getElementById(LOG_TITLE_ELEMENT_ID);
    if (logTitleEl) {
        logTitleEl.style.color = contrastTextColor;
    }

    const logContentEl = document.getElementById(LOG_CONTENT_ELEMENT_ID);
    if (logContentEl) {
        logContentEl.style.color = contrastTextColor;
        if (contrastTextColor === '#FFFFFF') { 
            logContentEl.style.backgroundColor = "rgba(30, 30, 30, 0.5)"; // Darker background for white text
            logContentEl.style.borderColor = "rgba(255, 255, 255, 0.25)";
        } else { 
            logContentEl.style.backgroundColor = "rgba(240, 240, 240, 0.5)"; // Lighter background for black text
            logContentEl.style.borderColor = "rgba(0, 0, 0, 0.2)";
        }
        logContentEl.style.padding = "15px";
        logContentEl.style.border = `1px solid ${contrastTextColor === '#FFFFFF' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`;
        logContentEl.style.borderRadius = "8px";
        logContentEl.style.marginTop = "10px";
    }
}

/**
 * Helper function to create a key-value pair list item.
 * @param {string} key The label.
 * @param {string|number|boolean|object} value The value.
 * @param {boolean} isHtmlValue If true, value is treated as raw HTML.
 * @returns {string} HTML string for a list item.
 */
function createKeyValueListItem(key, value, isHtmlValue = false) {
    const displayKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    let displayValue = (value === undefined || value === null || String(value).trim() === '') ? 'N/A' : value;
    
    if (typeof value === 'object' && value !== null && !isHtmlValue) {
        if (Array.isArray(value)) {
            // Smart display for arrays, especially actualOutcomes which are booleans
            if (key.toLowerCase().includes('outcomes') && value.every(item => typeof item === 'boolean')) {
                displayValue = value.map((val, idx) => `${idx+1}: ${val ? '⬆️ Up' : '⬇️ Down/Same'}`).join('<br>');
                isHtmlValue = true; // Since we added <br>
            } else {
                 displayValue = `<pre class="nested-json">${JSON.stringify(value, null, 2)}</pre>`;
            }
        } else {
             displayValue = `<pre class="nested-json">${JSON.stringify(value, null, 2)}</pre>`;
        }
    } else if ( (key.toLowerCase().includes('timestamp') || key.toLowerCase().includes('time') || key.toLowerCase().includes('utc')) && 
                typeof value === 'string' && value !== 'N/A' && value !== 'Not Set' && 
                !value.includes('GMT') && !value.includes('ART') && // Avoid re-formatting if already formatted
                !value.toLowerCase().includes('closed') && !value.toLowerCase().includes('aborted')) {
        
        const date = new Date(value); // Handles ISO strings like "2025-06-02T00:01:33.384Z"
        let unixTimestamp = value.length === 10 || value.length === 13 ? parseInt(value, 10) : NaN;

        if (!isNaN(date.getTime())) { 
             displayValue = `${value} <br><small>(${date.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })} ART)</small>`;
             isHtmlValue = true;
        } else if (!isNaN(unixTimestamp) && String(unixTimestamp).length === 10) { // Unix seconds
            const dateFromUnix = new Date(unixTimestamp * 1000);
             displayValue = `${value} <br><small>(${dateFromUnix.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })} ART)</small>`;
             isHtmlValue = true;
        } else if (!isNaN(unixTimestamp) && String(unixTimestamp).length === 13) { // Unix ms
            const dateFromUnixMs = new Date(unixTimestamp);
             displayValue = `${value} <br><small>(${dateFromUnixMs.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })} ART)</small>`;
             isHtmlValue = true;
        }
    }

    return `<li><strong class="log-key">${displayKey}:</strong> <span class="log-value">${isHtmlValue ? displayValue : (displayValue === 'N/A' ? displayValue : String(displayValue).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))}</span></li>`;
}


/**
 * Renders the log data into a more readable HTML format.
 * @param {object} logData The parsed JSON log data from snapshot_history_YYYY-MM-DD.json.
 * @returns {string} An HTML string representing the log data.
 */
function renderLogDataAsHtml(logData) {
    let html = '<div class="log-details-container">';

    const renderObjectAsList = (obj, sectionTitle = "") => {
        if (obj === null || typeof obj !== 'object' || Object.keys(obj).length === 0) {
            if (sectionTitle) return `<div class="log-section"><h2>${sectionTitle}</h2><p>N/A or empty.</p></div>`;
            return 'N/A';
        }
        let listHtml = sectionTitle ? `<div class="log-section"><h2>${sectionTitle}</h2><ul class="log-key-values">` : '<ul class="log-key-values">';
        for (const [key, value] of Object.entries(obj)) {
            listHtml += createKeyValueListItem(key, value);
        }
        listHtml += '</ul>';
        if (sectionTitle) listHtml += '</div>';
        return listHtml;
    };

    // Top-level info from the log file itself
    html += `<div class="log-section"><h2>Log File Overview</h2><ul class="log-key-values">`;
    html += createKeyValueListItem('Log Date', logData.date);
    html += createKeyValueListItem('Processed At UTC', logData.processedAtUTC);
    html += `</ul></div>`;

    // Display roundStartedInfo if it exists and has content
    if (logData.roundStartedInfo && Object.keys(logData.roundStartedInfo).length > 0) {
        html += renderObjectAsList(logData.roundStartedInfo, `Round Started Info (Attempted Next Round ID: ${logData.roundStartedInfo.roundId || 'N/A'})`);
    } else {
        html += `<div class="log-section"><h2>Round Started Info</h2><p>No new round start was attempted in this run.</p></div>`;
    }
    
    // Display roundClosedInfo if it exists and has content
    const evalInfo = logData.roundClosedInfo;
    if (evalInfo && Object.keys(evalInfo).length > 0 && evalInfo.roundId && evalInfo.roundId !== "0") {
        let title = `Round Closed/Processed Info (Round ID: ${evalInfo.roundId})`;
        // Use the status field to determine if it was aborted or evaluated.
        // This relies on your automator script setting a clear 'status' field.
        let statusDisplay = evalInfo.status || 'Status Unknown';
        if (evalInfo.status && evalInfo.status.toLowerCase().includes('aborted')) {
             title = `Round ABORTED (Round ID: ${evalInfo.roundId})`;
        } else if (evalInfo.status && evalInfo.status.toLowerCase().includes('evaluated')) {
             title = `Round EVALUATED (Round ID: ${evalInfo.roundId})`;
        }

        html += `<div class="log-section"><h2>${title}</h2><ul class="log-key-values">`;
        html += createKeyValueListItem('Recorded Status', statusDisplay);

        // Iterate over other fields in evalInfo, excluding 'roundId' and 'status' if already handled
        for (const [key, value] of Object.entries(evalInfo)) {
            if (key !== 'roundId' && key !== 'status') {
                html += createKeyValueListItem(key, value);
            }
        }
        html += `</ul>`;

        // If it was evaluated and has actualOutcomes (ensure your automator logs this for evaluated rounds)
        if (evalInfo.status && evalInfo.status.toLowerCase().includes('evaluated') && Array.isArray(evalInfo.actualOutcomes)) {
            html += `<h3>Token Outcomes for Evaluated Round</h3>`;
            html += `<div class="table-responsive"><table class="log-data-table"><thead><tr><th>#</th><th>Outcome (Price Up?)</th></tr></thead><tbody>`;
            for (let i = 0; i < 10; i++) { 
                const outcomeVal = (evalInfo.actualOutcomes[i] !== undefined) ? evalInfo.actualOutcomes[i] : null;
                const outcomeDisplay = outcomeVal === null ? 'N/A' : (outcomeVal ? '⬆️ Yes (Up)' : '⬇️ No (Down/Same)');
                html += `<tr><td>${i + 1}</td><td>${outcomeDisplay}</td></tr>`;
            }
            html += `</tbody></table></div>`;
        }
        html += '</div>';

    } else if (evalInfo && evalInfo.status === "NoPriorRound") {
        html += `<div class="log-section"><h2>Round Closed/Processed Info</h2><p>No prior round to process (Round ID was 0).</p></div>`;
    } else {
        html += `<div class="log-section"><h2>Round Closed/Processed Info</h2><p>No specific round closing/evaluation information in this log.</p></div>`;
    }

    html += '</div>'; // Close log-details-container
    return html;
}



function displayLogContent(logData) {
    // Convert logData back to pretty JSON string to show raw JSON if needed
    const rawJsonString = JSON.stringify(logData, null, 2);
    
    // Render your existing processed HTML log (using your renderLogDataAsHtml function)
    const formattedHtml = renderLogDataAsHtml(logData);

    const logContentEl = document.getElementById(LOG_CONTENT_ELEMENT_ID);
    if (!logContentEl) return;

    // Clear previous content
    logContentEl.innerHTML = '';

    // Create a container div to hold the button and JSON text
    const container = document.createElement('div');
    container.style.position = 'relative';

    // Create the "Copy JSON" button
    const copyButton = document.createElement('button');
    copyButton.textContent = 'Copy JSON to Clipboard';
    copyButton.style.marginBottom = '10px';
    copyButton.style.cursor = 'pointer';

    // When button is clicked, copy raw JSON text
    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(rawJsonString)
            .then(() => {
                showLogPageViewMessage('JSON copied to clipboard!', 'success');
            })
            .catch(() => {
                showLogPageViewMessage('Failed to copy JSON.', 'error');
            });
    });

    // Create a <pre> element to show raw JSON (optional, if you want to display it)
    const pre = document.createElement('pre');
    pre.textContent = rawJsonString;
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.maxHeight = '400px';
    pre.style.overflow = 'auto';
    pre.style.border = '1px solid #ccc';
    pre.style.padding = '10px';
    pre.style.borderRadius = '5px';
    pre.style.backgroundColor = '#f5f5f5';
    pre.style.color = '#333';

    // Append the button and the JSON display inside container
    container.appendChild(copyButton);
    container.appendChild(pre);

    // Append the formatted HTML log view below or above the raw JSON
    const formattedDiv = document.createElement('div');
    formattedDiv.innerHTML = formattedHtml;
    formattedDiv.style.marginTop = '20px';

    container.appendChild(formattedDiv);

    // Finally add the container to the page
    logContentEl.appendChild(container);
}
// --- Page Load Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded for View Log Page. Initializing displayLogContent...");
    displayLogContent();
});
