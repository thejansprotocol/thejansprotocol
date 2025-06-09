// --- view_log_page_logic.js ---
// Handles fetching, displaying a specific daily log, and applying random readable colors.

// --- Constants for this page ---
// MODIFIED: Path to the parent 'data' directory. 
// The 'logFile' URL parameter should now provide the rest of the path (e.g., "dailylogs_v8/your_log.json")
const LOG_FILES_BASE_URL = './data/dailylogs_v8/';
const LOG_CONTENT_ELEMENT_ID = "log-content";
const LOG_TITLE_ELEMENT_ID = "log-title";
const GLOBAL_MESSAGE_DISPLAY_ID_LOG_VIEW = "global-message-log-view";


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
loadAndDisplayLog();
