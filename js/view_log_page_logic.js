// --- view_log_page_logic.js ---
// Handles fetching, displaying a specific daily log, and applying random readable colors.

// --- Constants for this page ---
// MODIFIED: Updated the path to the parent 'data' directory to reflect the new folder structure.
// This change ensures compatibility with the updated organization of log files.
// The 'logFile' URL parameter should now provide the rest of the path (e.g., "dailylogs_v8/your_log.json").
// Implication: Any changes to the folder structure will require updating this constant accordingly.
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
    return (
        "#" +
        [r, g, b]
            .map((x) => {
                const hex = x.toString(16);
                return hex.length === 1 ? "0" + hex : hex;
            })
            .join("")
    );
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

  // Removed duplicated and malformed async logic; see loadAndDisplayLog() for correct implementation.


// Display message in fallback element
function displayMessage(msg) {
  const el = document.getElementById(LOG_CONTENT_ELEMENT_ID);
  if (el) el.innerText = msg;
}


function renderLog(log, title = "") {
  const container = document.getElementById(LOG_CONTENT_ELEMENT_ID);
  const titleEl = document.getElementById(LOG_TITLE_ELEMENT_ID);
  if (!container) return;

  if (titleEl) titleEl.innerText = `Viewing Log: ${title}`;

  const shorten = (s) => s && s.length > 12 ? s.slice(0, 8) + "..." + s.slice(-4) : s;
  const formatTime = (iso) => iso ? new Date(iso).toLocaleString() : 'N/A';

  const currentRound = log?.currentRoundDetails || {};
  const evaluatedRound = log?.evaluatedRoundInfo || {};
  const generalState = log?.generalContractState || {};

  const html = `
    <h3>🧾 Log Metadata</h3>
    <p><strong>Timestamp:</strong> ${formatTime(log?.logTimestamp)}</p>
    <p><strong>Contract:</strong> ${shorten(log?.contractAddress) ?? 'N/A'}</p>
    <p><strong>Block Number:</strong> ${log?.currentBlockNumber ?? 'N/A'}</p>
    <p><strong>Chain Timestamp:</strong> ${formatTime(log?.currentChainTimestamp)}</p>

    <h3>📍 Current Round (${log?.currentRoundIdOnChain ?? 'N/A'})</h3>
    <ul>
      <li>Start: ${formatTime(currentRound.startTime)}</li>
      <li>Start Snapshot: ${currentRound.startSnapshotSubmitted ?? 'N/A'}</li>
      <li>End Snapshot: ${currentRound.endSnapshotSubmitted ?? 'N/A'}</li>
      <li>Results Evaluated: ${currentRound.resultsEvaluated ?? 'N/A'}</li>
      <li>Prize Pool (JANS): ${currentRound.prizePoolJANS !== undefined ? Number(currentRound.prizePoolJANS).toFixed(2) : 'N/A'}</li>
      <li>Ticket Price (TARA): ${currentRound.calculatedTicketPriceTara ?? 'N/A'}</li>
      <li>Ticket Price (USD Cents): ${currentRound.calculatedTicketPriceUsdCents ?? 'N/A'}</li>
      <li>Share Allocation: ${currentRound.calculatedShareAllocation ?? 'N/A'}</li>
    </ul>

    <h3>✅ Last Evaluated Round</h3>
    <ul>
      <li>Round ID: ${evaluatedRound.roundId ?? 'N/A'}</li>
      <li>Start: ${formatTime(evaluatedRound.startTime)}</li>
      <li>Results Evaluated: ${evaluatedRound.resultsEvaluated ?? 'N/A'}</li>
      <li>Transaction Hash: ${evaluatedRound.transactionHash ?? 'N/A'}</li>
      <li>Block Number: ${evaluatedRound.blockNumber ?? 'N/A'}</li>
      <li>Outcomes: ${Array.isArray(evaluatedRound.actualOutcomes) ? evaluatedRound.actualOutcomes.map(o => o ? '↑' : '↓').join(' ') : 'N/A'}</li>
      <li>Winning Tickets: ${evaluatedRound.winningTicketCount ?? 'N/A'}</li>
      <li>Total Prize: ${evaluatedRound.totalPrizeJansDistributedThisRound ?? 'N/A'}</li>
      <li>Note: ${evaluatedRound.note ?? ''}</li>
    </ul>

    <h3>🔗 General Contract State</h3>
    <ul>
      <li>Owner: ${shorten(generalState.owner) ?? 'N/A'}</li>
      <li>TARA/UsdCent: ${generalState.currentTaraWeiPerUsdCent ?? 'N/A'}</li>
      <li>Configured Start Price (USD Cents): ${generalState.configuredStartPriceUsdCents ?? 'N/A'}</li>
      <li>Configured Mid Price (USD Cents): ${generalState.configuredMidPriceUsdCents ?? 'N/A'}</li>
      <li>Configured End Price (USD Cents): ${generalState.configuredEndPriceUsdCents ?? 'N/A'}</li>
      <li>Ticket Sales Duration (s): ${generalState.ticketSalesDurationSeconds ?? 'N/A'}</li>
      <li>Total JANS Burned: ${generalState.totalJansBurnedInGame ?? 'N/A'}</li>
      <li>Total Shares: ${generalState.currentTotalTrackedShares ?? 'N/A'}</li>
      <li>Total TARA for LP: ${generalState.totalNativeTaraAccumulatedForLPSide ?? 'N/A'}</li>
      <li>Total JANS for LP: ${generalState.totalJansAccumulatedForLPSide ?? 'N/A'}</li>
      <li>Total TARA Reward for LP: ${generalState.totalNativeTaraRewardForLPFormers ?? 'N/A'}</li>
      <li>LP Token Balance: ${generalState.contractGameLpTokenBalance ?? 'N/A'}</li>
      <li>Current LP Distribution ID: ${generalState.currentLpDistributionId ?? 'N/A'}</li>
      <li>LP Distribution Finalized: ${generalState.isCurrentLpDistributionFinalized ?? 'N/A'}</li>
      <li>LP Distribution Triggerable: ${generalState.isLpDistributionTriggerable ?? 'N/A'}</li>
      <li>LP Burn Target Divisor: ${generalState.lpDistributionBurnTargetDivisor ?? 'N/A'}</li>
    </ul>
  `;

  container.innerHTML = html;
}


/**
 * Loads the log file specified in the URL and displays it.
 */
async function loadAndDisplayLog() {
  const logFile = getLogFilenameFromUrl();
  if (!logFile) {
    showLogPageViewMessage("No log file specified in the URL.", "error");
    displayMessage("No log file specified in the URL.");
    return;
  }
  try {
    const response = await fetch(LOG_FILES_BASE_URL + logFile);
    if (!response.ok) {
      throw new Error(`Failed to fetch log file: ${response.status} ${response.statusText}`);
    }
    const logData = await response.json();
    renderLog(logData, logFile);
  } catch (err) {
    showLogPageViewMessage("Error loading log file: " + err.message, "error");
    displayMessage("Error loading log file: " + err.message);
  }
}


document.addEventListener('DOMContentLoaded', () => {
  applyRandomColors();
  loadAndDisplayLog();
});
