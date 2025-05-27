// --- view_log_page_logic.js ---
// Handles fetching, displaying a specific daily log, and applying random readable colors.

// --- Constants for this page ---
const LOG_FILES_BASE_URL = 'data/dailylogs_v8/'; // Ensure this path is correct for your deployment
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
            logContentEl.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
            logContentEl.style.borderColor = "rgba(255, 255, 255, 0.15)";
        } else { 
            logContentEl.style.backgroundColor = "rgba(0, 0, 0, 0.03)";
            logContentEl.style.borderColor = "rgba(0, 0, 0, 0.1)";
        }
         // Add some padding and border to the main content area for better visual separation
        logContentEl.style.padding = "15px";
        logContentEl.style.border = `1px solid ${contrastTextColor === '#FFFFFF' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`;
        logContentEl.style.borderRadius = "8px";
        logContentEl.style.marginTop = "10px";
    }
}

/**
 * Helper function to create a key-value pair list item.
 * @param {string} key The label.
 * @param {string|number|boolean} value The value.
 * @param {boolean} isHtmlValue If true, value is treated as raw HTML.
 * @returns {string} HTML string for a list item.
 */
function createKeyValueListItem(key, value, isHtmlValue = false) {
    const displayKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    let displayValue = (value === undefined || value === null || value === '') ? 'N/A' : value;
    
    if (typeof value === 'object' && value !== null && !isHtmlValue) {
        displayValue = `<pre class="nested-json">${JSON.stringify(value, null, 2)}</pre>`;
    } else if ( (key.toLowerCase().includes('timestamp') || key.toLowerCase().includes('time')) && 
                typeof value === 'string' && value !== 'N/A' && value !== 'Not Set' && !value.includes('GMT') && !value.includes('Closed') && !value.includes('Aborted')) {
        // Attempt to format if it looks like an ISO string or Unix ms timestamp
        const date = new Date(value);
        if (!isNaN(date.getTime())) { // Check if date is valid
             displayValue = `${value} (${date.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} ART)`;
        }
    }

    return `<li><strong class="log-key">${displayKey}:</strong> <span class="log-value">${isHtmlValue ? displayValue : (displayValue === 'N/A' ? displayValue : String(displayValue).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))}</span></li>`;
}


/**
 * Renders the log data into a more readable HTML format.
 * @param {object} logData The parsed JSON log data.
 * @returns {string} An HTML string representing the log data.
 */
function renderLogDataAsHtml(logData) {
    let html = '<div class="log-details-container">';

    // Helper to render a section object into a list
    const renderObjectAsList = (obj) => {
        let listHtml = '<ul class="log-key-values">';
        for (const [key, value] of Object.entries(obj)) {
            listHtml += createKeyValueListItem(key, value);
        }
        listHtml += '</ul>';
        return listHtml;
    };

    html += `<div class="log-section"><h2>Log Overview</h2><ul class="log-key-values">`;
    html += createKeyValueListItem('Log Generated At', logData.logTimestamp);
    html += createKeyValueListItem('Contract Address', logData.contractAddress);
    html += createKeyValueListItem('Chain Timestamp (at log)', logData.currentChainTimestamp);
    html += createKeyValueListItem('Block Number (at log)', logData.currentBlockNumber);
    html += createKeyValueListItem('Current Round ID (at log)', logData.currentRoundIdOnChain);
    html += `</ul></div>`;

    if (logData.errorEncountered) {
        html += `<div class="log-section error-section"><h2>⚠️ Error During Log Generation</h2><ul class="log-key-values">`;
        html += createKeyValueListItem('Message', logData.errorEncountered.message);
        html += createKeyValueListItem('Stack', `<pre>${logData.errorEncountered.stack || "N/A"}</pre>`, true);
        html += `</ul></div>`;
    }

    html += `<div class="log-section"><h2>Current Round Details (Snapshot at time of log)</h2>${renderObjectAsList(logData.currentRoundDetails)}</div>`;
    
    // --- Evaluated Round Info ---
    const evalInfo = logData.evaluatedRoundInfo;
    html += `<div class="log-section"><h2>Evaluated Round Information (Round ID: ${evalInfo.roundId || 'N/A'})</h2>`;
    if (evalInfo && evalInfo.roundId !== 'N/A' && evalInfo.roundId !== '0') {
        html += `<ul class="log-key-values">`;
        html += createKeyValueListItem('Status', evalInfo.isAborted ? 'Aborted' : (evalInfo.resultsEvaluated ? 'Results Evaluated' : 'Status Unknown/Not Fully Evaluated'));
        if (evalInfo.note) html += createKeyValueListItem('Note', evalInfo.note);
        html += createKeyValueListItem('Start Time', evalInfo.startTime);
        html += createKeyValueListItem('Start Snapshot Submitted', evalInfo.startSnapshotSubmitted);
        html += createKeyValueListItem('End Snapshot Submitted', evalInfo.endSnapshotSubmitted);
        html += `</ul>`;

        if (Array.isArray(evalInfo.startPrices) && evalInfo.startPrices.length > 0) {
            html += `<h3>Token Prices & Outcomes</h3>`;
            html += `<div class="table-responsive"><table class="log-data-table"><thead><tr><th>#</th><th>Start Price</th><th>End Price</th><th>Outcome (Price Up?)</th></tr></thead><tbody>`;
            for (let i = 0; i < 10; i++) { // Assuming 10 tokens always
                const startP = (evalInfo.startPrices && evalInfo.startPrices[i] !== undefined) ? evalInfo.startPrices[i] : 'N/A';
                const endP = (evalInfo.endPrices && evalInfo.endPrices[i] !== undefined) ? evalInfo.endPrices[i] : 'N/A';
                const outcomeVal = (evalInfo.actualOutcomes && evalInfo.actualOutcomes[i] !== undefined) ? evalInfo.actualOutcomes[i] : null;
                const outcomeDisplay = outcomeVal === null ? 'N/A' : (outcomeVal ? '⬆️ Yes (Up)' : '⬇️ No (Down/Same)');
                html += `<tr><td>${i + 1}</td><td>${startP}</td><td>${endP}</td><td>${outcomeDisplay}</td></tr>`;
            }
            html += `</tbody></table></div>`;
        } else {
            html += `<p>Token price data (startPrices, endPrices, outcomes) not available or empty for this evaluated round.</p>`;
        }

        html += `<h3>Evaluation Summary</h3><ul class="log-key-values">`;
        html += createKeyValueListItem('Highest Score Achieved', evalInfo.highestScoreAchieved);
        html += createKeyValueListItem('Prize Pool (Global at log time)', `${logData.currentRoundDetails.prizePoolJANS || 'N/A'} JANS`);
        html += createKeyValueListItem('JANS Distributed This Round', `${evalInfo.totalPrizeJansDistributedThisRound || 'N/A'} JANS`);
        html += createKeyValueListItem('Winning Ticket Count', evalInfo.winningTicketCount === undefined ? 'N/A' : evalInfo.winningTicketCount);
        
        let playersText = "None";
        if (Array.isArray(evalInfo.winningPlayers) && evalInfo.winningPlayers.length > 0) {
            playersText = `<ul>${evalInfo.winningPlayers.map(p => `<li>${p} (Wallet)</li>`).join('')}</ul>`;
        }
        html += createKeyValueListItem('Winning Players (Wallets)', playersText, true);
        
        if (evalInfo.transactionHash && evalInfo.transactionHash !== 'N/A') {
             html += createKeyValueListItem('Evaluation/Prize Tx Hash', evalInfo.transactionHash);
             html += createKeyValueListItem('Evaluation Block', evalInfo.blockNumber);
        }
        html += createKeyValueListItem('Event Processed in Log Run', evalInfo.evaluatedThisLogRun);
        html += `</ul>`;

    } else {
        html += `<p>No specific evaluated round information available in this log, or Round ID is 0/N/A.</p>`;
    }
    html += '</div>';

    html += `<div class="log-section"><h2>General Contract State (Snapshot at time of log)</h2>${renderObjectAsList(logData.generalContractState)}</div>`;

    html += '</div>';
    return html;
}


async function displayLogContent() {
    const logContentEl = document.getElementById(LOG_CONTENT_ELEMENT_ID);
    const logTitleEl = document.getElementById(LOG_TITLE_ELEMENT_ID);

    if (!logContentEl || !logTitleEl) {
        console.error("ViewLogPage: Essential HTML elements (log-title or log-content) are missing.");
        showLogPageViewMessage("Error: Page structure is incomplete.", "error");
        return;
    }

    applyRandomColors(); 

    logTitleEl.textContent = "Loading Log...";
    logContentEl.innerHTML = "<p>Fetching log data...</p>"; // Use innerHTML for rich content

    try {
        const queryParams = new URLSearchParams(window.location.search);
        const logFileName = queryParams.get('logFile');

        if (!logFileName) {
            throw new Error("No log file specified in the URL (e.g., ?logFile=filename.json).");
        }

        logTitleEl.textContent = `Log Details: ${decodeURIComponent(logFileName)}`;
        
        const logUrl = `${LOG_FILES_BASE_URL}${logFileName}`;
        console.log("Attempting to fetch log from URL:", logUrl);
        
        const response = await fetch(logUrl);
        if (!response.ok) {
            console.error(`Failed to fetch: ${response.url}, Status: ${response.status}`);
            throw new Error(`Failed to fetch log file '${decodeURIComponent(logFileName)}'. Status: ${response.status} ${response.statusText}. Tried URL: ${logUrl}`);
        }
        const logData = await response.json();

        logContentEl.innerHTML = renderLogDataAsHtml(logData);
        showLogPageViewMessage("Log loaded successfully!", "success");

    } catch (error) {
        console.error("ViewLogPage: Error loading or displaying log content:", error);
        logTitleEl.textContent = "Error Loading Log";
        const errorMessage = `Could not load log details. ${error.message}`;
        logContentEl.innerHTML = `<p class="error-text">${errorMessage}</p><p>Attempted URL: ${error.message.includes("Tried URL:") ? error.message.split("Tried URL:")[1] : 'N/A'}</p>`;
        showLogPageViewMessage(errorMessage, "error");
    }
}

// --- Page Load Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded for View Log Page. Initializing displayLogContent...");
    displayLogContent();
});
