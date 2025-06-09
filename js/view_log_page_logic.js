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


// Helpers
const formatTime = iso => new Date(iso).toLocaleString();
const shorten = str => (str.length > 12 ? str.slice(0, 8) + '...' + str.slice(-4) : str);

// Display summary
console.log("========== JANS Prediction Game Log ==========");
console.log(`🕒 Log Timestamp:        ${formatTime(log.logTimestamp)}`);
console.log(`📦 Contract Address:     ${shorten(log.contractAddress)}`);
console.log(`🔗 Block Number:         ${log.currentBlockNumber}`);
console.log(`🔄 Chain Timestamp:      ${formatTime(log.currentChainTimestamp)}`);
console.log(`📍 Current Round ID:     ${log.currentRoundIdOnChain}`);
console.log("");

// Current Round
const round = log.currentRoundDetails;
console.log("🔘 Current Round Details");
console.log(`   • Start Time:             ${formatTime(round.startTime)}`);
console.log(`   • Start Snapshot:         ${round.startSnapshotSubmitted}`);
console.log(`   • End Snapshot:           ${round.endSnapshotSubmitted}`);
console.log(`   • Results Evaluated:      ${round.resultsEvaluated}`);
console.log(`   • Prize Pool (JANS):      ${Number(round.prizePoolJANS).toFixed(2)}`);
console.log(`   • Ticket Price (TARA):    ${round.calculatedTicketPriceTara}`);
console.log(`   • Ticket Price (USD):     ${round.calculatedTicketPriceUsdCents}¢`);
console.log(`   • Share Allocation:       ${round.calculatedShareAllocation}`);
console.log("");

// Last Evaluated Round
const evalInfo = log.evaluatedRoundInfo;
console.log("✅ Last Evaluated Round");
console.log(`   • Round ID:               ${evalInfo.roundId}`);
console.log(`   • Start Time:             ${formatTime(evalInfo.startTime)}`);
console.log(`   • Results Evaluated:      ${evalInfo.resultsEvaluated}`);
console.log(`   • Snapshot Status:        start=${evalInfo.startSnapshotSubmitted}, end=${evalInfo.endSnapshotSubmitted}`);
console.log(`   • Transaction Hash:       ${shorten(evalInfo.transactionHash)}`);
console.log(`   • Actual Outcomes:        ${evalInfo.actualOutcomes.map(b => b ? '↑' : '↓').join(' ')}`);
console.log(`   • Winning Tickets:        ${evalInfo.winningTicketCount}`);
console.log(`   • Prize Distributed:      ${evalInfo.totalPrizeJansDistributedThisRound}`);
console.log("");

// General Contract State
const state = log.generalContractState;
console.log("📊 General Contract State");
console.log(`   • Owner:                  ${shorten(state.owner)}`);
console.log(`   • TARA per USD cent:      ${state.currentTaraWeiPerUsdCent}`);
console.log(`   • Total JANS Burned:      ${Number(state.totalJansBurnedInGame).toFixed(2)}`);
console.log(`   • LP Accumulation (TARA): ${state.totalNativeTaraAccumulatedForLPSide}`);
console.log(`   • LP Accumulation (JANS): ${Number(state.totalJansAccumulatedForLPSide).toFixed(2)}`);
console.log(`   • LP Distribution ID:     ${state.currentLpDistributionId}`);
console.log(`   • LP Distribution Ready:  ${state.isLpDistributionTriggerable}`);
console.log("==============================================");
