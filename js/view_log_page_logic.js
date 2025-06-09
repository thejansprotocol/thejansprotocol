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


// Helper to get ?logFile=... from URL
function getLogFilenameFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("logFile");
}

// Main logic
async function loadAndDisplayLog() {
  const logFileName = getLogFilenameFromUrl();
  if (!logFileName) {
    displayMessage("No log file specified in URL.");
    return;
  }

  const logUrl = LOG_FILES_BASE_URL + logFileName;

  try {
    const response = await fetch(logUrl);
    if (!response.ok) throw new Error(`Failed to fetch log: ${response.statusText}`);
    const log = await response.json();
    console.log("========== JANS Prediction Game Log ==========");
    console.log(log); // ✅ log is defined here
    renderLog(log, logFileName);
  } catch (err) {
    displayMessage("Error loading log file: " + err.message);
    console.error(err);
  }
}

// Display message in fallback element
function displayMessage(msg) {
  const el = document.getElementById(LOG_CONTENT_ELEMENT_ID);
  if (el) el.innerText = msg;
}

// Main render function
function renderLog(log, title = "") {
  const container = document.getElementById(LOG_CONTENT_ELEMENT_ID);
  const titleEl = document.getElementById(LOG_TITLE_ELEMENT_ID);
  if (!container) return;

  if (titleEl) titleEl.innerText = `Viewing Log: ${title}`;

  const shorten = (s) => s.length > 12 ? s.slice(0, 8) + "..." + s.slice(-4) : s;
  const formatTime = (iso) => new Date(iso).toLocaleString();

  const html = `
    <h3>🧾 Log Metadata</h3>
    <p><strong>Timestamp:</strong> ${formatTime(log.logTimestamp)}</p>
    <p><strong>Contract:</strong> ${shorten(log.contractAddress)}</p>
    <p><strong>Block Number:</strong> ${log.currentBlockNumber}</p>

    <h3>📍 Current Round (${log.currentRoundIdOnChain})</h3>
    <ul>
      <li>Start: ${formatTime(log.currentRoundDetails.startTime)}</li>
      <li>Start Snapshot: ${log.currentRoundDetails.startSnapshotSubmitted}</li>
      <li>End Snapshot: ${log.currentRoundDetails.endSnapshotSubmitted}</li>
      <li>Results Evaluated: ${log.currentRoundDetails.resultsEvaluated}</li>
      <li>Prize Pool (JANS): ${Number(log.currentRoundDetails.prizePoolJANS).toFixed(2)}</li>
      <li>Ticket Price (TARA): ${log.currentRoundDetails.calculatedTicketPriceTara}</li>
      <li>Share Allocation: ${log.currentRoundDetails.calculatedShareAllocation}</li>
    </ul>

    <h3>✅ Last Evaluated Round</h3>
    <ul>
      <li>Round ID: ${log.evaluatedRoundInfo.roundId}</li>
      <li>Start: ${formatTime(log.evaluatedRoundInfo.startTime)}</li>
      <li>Results Evaluated: ${log.evaluatedRoundInfo.resultsEvaluated}</li>
      <li>Outcomes: ${log.evaluatedRoundInfo.actualOutcomes.map(o => o ? '↑' : '↓').join(' ')}</li>
      <li>Winning Tickets: ${log.evaluatedRoundInfo.winningTicketCount}</li>
      <li>Total Prize: ${log.evaluatedRoundInfo.totalPrizeJansDistributedThisRound}</li>
    </ul>
  `;

  container.innerHTML = html;
}

// Kick it off
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


// Helper to get ?logFile=... from URL
function getLogFilenameFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("logFile");
}

// Main logic
async function loadAndDisplayLog() {
  const logFileName = getLogFilenameFromUrl();
  if (!logFileName) {
    displayMessage("No log file specified in URL.");
    return;
  }

  const logUrl = LOG_FILES_BASE_URL + logFileName;

  try {
    const response = await fetch(logUrl);
    if (!response.ok) throw new Error(`Failed to fetch log: ${response.statusText}`);
    const log = await response.json();
    console.log("========== JANS Prediction Game Log ==========");
    console.log(log); // ✅ log is defined here
    renderLog(log, logFileName);
  } catch (err) {
    displayMessage("Error loading log file: " + err.message);
    console.error(err);
  }
}

// Display message in fallback element
function displayMessage(msg) {
  const el = document.getElementById(LOG_CONTENT_ELEMENT_ID);
  if (el) el.innerText = msg;
}

// Main render function
function renderLog(log, title = "") {
  const container = document.getElementById(LOG_CONTENT_ELEMENT_ID);
  const titleEl = document.getElementById(LOG_TITLE_ELEMENT_ID);
  if (!container) return;

  if (titleEl) titleEl.innerText = `Viewing Log: ${title}`;

  const shorten = (s) => s.length > 12 ? s.slice(0, 8) + "..." + s.slice(-4) : s;
  const formatTime = (iso) => new Date(iso).toLocaleString();

  const html = `
    <h3>🧾 Log Metadata</h3>
    <p><strong>Timestamp:</strong> ${formatTime(log.logTimestamp)}</p>
    <p><strong>Contract:</strong> ${shorten(log.contractAddress)}</p>
    <p><strong>Block Number:</strong> ${log.currentBlockNumber}</p>

    <h3>📍 Current Round (${log.currentRoundIdOnChain})</h3>
    <ul>
      <li>Start: ${formatTime(log.currentRoundDetails.startTime)}</li>
      <li>Start Snapshot: ${log.currentRoundDetails.startSnapshotSubmitted}</li>
      <li>End Snapshot: ${log.currentRoundDetails.endSnapshotSubmitted}</li>
      <li>Results Evaluated: ${log.currentRoundDetails.resultsEvaluated}</li>
      <li>Prize Pool (JANS): ${Number(log.currentRoundDetails.prizePoolJANS).toFixed(2)}</li>
      <li>Ticket Price (TARA): ${log.currentRoundDetails.calculatedTicketPriceTara}</li>
      <li>Share Allocation: ${log.currentRoundDetails.calculatedShareAllocation}</li>
    </ul>

    <h3>✅ Last Evaluated Round</h3>
    <ul>
      <li>Round ID: ${log.evaluatedRoundInfo.roundId}</li>
      <li>Start: ${formatTime(log.evaluatedRoundInfo.startTime)}</li>
      <li>Results Evaluated: ${log.evaluatedRoundInfo.resultsEvaluated}</li>
      <li>Outcomes: ${log.evaluatedRoundInfo.actualOutcomes.map(o => o ? '↑' : '↓').join(' ')}</li>
      <li>Winning Tickets: ${log.evaluatedRoundInfo.winningTicketCount}</li>
      <li>Total Prize: ${log.evaluatedRoundInfo.totalPrizeJansDistributedThisRound}</li>
    </ul>
  `;

  container.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
  applyRandomColors();
  loadAndDisplayLog();
});
