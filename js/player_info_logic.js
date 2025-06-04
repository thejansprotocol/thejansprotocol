// player_info_logic.js

// 1. Import necessary items from wallet.js
import {
    getJansGameABI,
    TARAXA_RPC_URL as RPC_URL_FROM_WALLET,
    JANS_GAME_CONTRACT_ADDRESS as CONTRACT_ADDRESS_FROM_WALLET
} from './wallet.js'; // ENSURE THIS PATH IS CORRECT relative to this file

// --- Configuration ---
const RPC_URL = (RPC_URL_FROM_WALLET && !String(RPC_URL_FROM_WALLET).includes("YOUR_"))
    ? RPC_URL_FROM_WALLET
    : "https://rpc.mainnet.taraxa.io"; // YOUR ACTUAL FALLBACK RPC URL
const JANSGAME_CONTRACT_ADDRESS = (CONTRACT_ADDRESS_FROM_WALLET && !String(CONTRACT_ADDRESS_FROM_WALLET).includes("YOUR_"))
    ? CONTRACT_ADDRESS_FROM_WALLET
    : "0xd69E5A84108ce8d50244fBfaE9B9199A6e1ab752"; // YOUR ACTUAL FALLBACK CONTRACT ADDRESS

const NATIVE_TARA_DECIMALS = 18;
const SHARE_DECIMALS = 18;

// Module-scoped variables
let jansGameABI_loaded = null;
let provider;
let contract;

// --- DOM Elements ---
let playerAddressInput, roundIdInput;
let globalErrorDisplay, playerSummaryDisplay, allTicketsDisplayArea, specificRoundDisplayArea;

// --- Helper Functions ---
function displayMessage(message, type = "info", duration = 0) {
    if (!globalErrorDisplay) globalErrorDisplay = document.getElementById("global-error-display");
    if (globalErrorDisplay) {
        globalErrorDisplay.textContent = message;
        globalErrorDisplay.className = type;
        globalErrorDisplay.style.display = "block";
        if (duration > 0) {
            setTimeout(() => {
                if (globalErrorDisplay.textContent === message) {
                    globalErrorDisplay.style.display = "none";
                }
            }, duration);
        }
    } else { console.error("displayMessage: globalErrorDisplay DOM not found for message:", message); }
}

function clearGlobalMessage() {
    if (globalErrorDisplay) {
        globalErrorDisplay.textContent = "";
        globalErrorDisplay.style.display = "none";
    }
}

function formatUnits(amount, decimals) {
    if (typeof amount === 'undefined' || amount === null) return 'N/A';
    try { return window.ethers.formatUnits(amount, decimals); } catch (e) { console.warn("Format Units Error:", amount, e); return 'Error'; }
}

function safeTimestampToDateString(timestampBigInt) {
    if (typeof timestampBigInt !== 'bigint' || timestampBigInt <= 0n) return 'N/A';
    try {
        const tsMillis = Number(timestampBigInt * 1000n);
        if (!Number.isSafeInteger(tsMillis)) return 'Timestamp out of JS range';
        const date = new Date(tsMillis);
        return isNaN(date.getTime()) ? 'Invalid Date' : date.toLocaleString(navigator.language || 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) { console.warn("Timestamp Conversion Error:", timestampBigInt, e); return 'Conversion Error'; }
}

function renderTicketPicks(picks, actualOutcomes = [], roundEvaluated = false, roundAborted = false) {
    let html = '<div class="picks-grid">';
    if (roundAborted) {
        html += '<p class="pick-info">Picks N/A (Round Aborted)</p>';
    } else if (!picks || !Array.isArray(picks)) {
        html += '<p class="pick-info pick-text-error">Error: Ticket picks data missing.</p>';
    } else {
        picks.forEach((pick, index) => {
            const pickText = pick ? 'UP' : 'DOWN';
            let textClass = pick ? 'pick-text-up' : 'pick-text-down';
            let itemClasses = "pick-item " + textClass;
            if (roundEvaluated && actualOutcomes && actualOutcomes.length > index) {
                itemClasses += pick === actualOutcomes[index] ? " correct" : " incorrect";
            }
            html += `<div class="${itemClasses}">Prediction ${index + 1}: ${pickText}</div>`;
        });
    }
    html += '</div>';
    return html;
}

function renderRoundOutcomesDisplay(actualOutcomes, isEvaluated, isAborted) {
    let html = "<h4>Round Outcomes:</h4>";
    if (isAborted) return html + "<p><em>Round was aborted. No outcomes.</em></p>";
    if (!isEvaluated) return html + "<p><em>Outcomes not yet evaluated.</em></p>";
    if (!actualOutcomes || actualOutcomes.length === 0) return html + "<p><em>Outcomes not available.</em></p>";

    html += "<ul class='round-outcomes-list'>";
    actualOutcomes.forEach((outcome, index) => {
        const outcomeText = outcome ? "UP" : "DOWN";
        const textClass = outcome ? "pick-text-up" : "pick-text-down";
        html += `<li class="${textClass}">Prediction ${index + 1}: ${outcomeText}</li>`;
    });
    html += "</ul>";
    return html;
}

// --- Main Initialization and Logic ---
async function initializeApp() {
    playerAddressInput = document.getElementById("playerAddressInput");
    roundIdInput = document.getElementById("roundIdInput");
    globalErrorDisplay = document.getElementById("global-error-display");
    playerSummaryDisplay = document.getElementById("playerSummaryDisplay");
    allTicketsDisplayArea = document.getElementById("allTicketsDisplayArea");
    specificRoundDisplayArea = document.getElementById("specificRoundDisplayArea");
    console.log("player_info_logic.js: DOM elements assigned.");

    allTicketsDisplayArea.innerHTML = `<p class="initial-message">Enter a player address and press Enter.</p>`;
    specificRoundDisplayArea.innerHTML = `<p class="initial-message">Enter a Round ID and press Enter for round details.</p>`;

    try {
        if (typeof getJansGameABI !== 'function') {
            throw new Error("'getJansGameABI' not imported correctly from wallet.js or not defined as a function in wallet.js. Check wallet.js exports and the import statement at the top of this file.");
        }
        console.log("player_info_logic.js: Loading ABI via wallet.js...");
        const abiResult = await getJansGameABI();
        jansGameABI_loaded = (abiResult && abiResult.abi && Array.isArray(abiResult.abi)) ? abiResult.abi : (Array.isArray(abiResult) ? abiResult : null);

        if (!jansGameABI_loaded || jansGameABI_loaded.length < 5) {
            throw new Error("Loaded ABI is invalid or too short (less than 5 entries).");
        }
        console.log("player_info_logic.js: ABI loaded successfully via wallet.js:", jansGameABI_loaded.length, "entries");

        if (!JANSGAME_CONTRACT_ADDRESS || JANSGAME_CONTRACT_ADDRESS.includes("YOUR_")) throw new Error("Game Contract Address not configured. Check import from wallet.js or local fallback.");
        if (!RPC_URL || RPC_URL.includes("YOUR_")) throw new Error("RPC URL not configured. Check import from wallet.js or local fallback.");
        if (!window.ethers) throw new Error("Ethers.js global library not loaded. Check HTML script tag for ethers CDN.");

        provider = new window.ethers.JsonRpcProvider(RPC_URL);
        contract = new window.ethers.Contract(JANSGAME_CONTRACT_ADDRESS, jansGameABI_loaded, provider);
        console.log("player_info_logic.js: Provider and Contract initialized. Contract target:", contract.target);
        displayMessage("Ready. Enter address and/or round ID, then press Enter.", "info", 5000);

    } catch (err) {
        console.error("player_info_logic.js: Initialization Error:", err);
        displayMessage(`Initialization Error: ${err.message}`, "error");
        return; // Stop further execution if initialization fails
    }

    const handleEnterKey = (event) => { if (event.key === 'Enter') { event.preventDefault(); handleFetchPlayerInfo(); } };
    playerAddressInput.addEventListener('keypress', handleEnterKey);
    roundIdInput.addEventListener('keypress', handleEnterKey);
    console.log("player_info_logic.js: Event listeners attached.");
}

function setLoadingState(isLoading) {
    if (playerAddressInput) playerAddressInput.disabled = isLoading;
    if (roundIdInput) roundIdInput.disabled = isLoading;
    console.log(isLoading ? "Fetching data..." : "Data fetching attempt complete.");
}

async function handleFetchPlayerInfo() {
    clearGlobalMessage();
    const playerAddr = playerAddressInput.value.trim();
    const roundIdStr = roundIdInput.value.trim();

    if (!contract) {
        displayMessage("Error: Application not initialized correctly. Please refresh.", "error");
        return;
    }

    setLoadingState(true);

    let performedAddressLookup = false;
    let performedRoundLookup = false;

    // Handle Address Input
    if (playerAddr) {
        if (window.ethers.isAddress(playerAddr)) {
            playerSummaryDisplay.style.display = "block"; // Show summary area
            try {
                const sharesRaw = await contract.jansPoolShares(playerAddr);
                playerSummaryDisplay.innerHTML = `<div class="player-summary-block"><h3>Player Summary (${playerAddr.substring(0,6)}...${playerAddr.substring(playerAddr.length - 4)})</h3><p><strong>Total Jans Pool Shares:</strong> ${formatUnits(sharesRaw, SHARE_DECIMALS)}</p></div>`;
            } catch (e) {
                console.warn("Could not fetch player shares for address:", playerAddr, e.message);
                playerSummaryDisplay.innerHTML = `<div class="player-summary-block"><p>Could not load player shares data.</p></div>`;
            }
            await fetchAllPlayerTickets(playerAddr);
            performedAddressLookup = true;
        } else {
            displayMessage("Invalid Player Wallet Address format entered.", "error");
            allTicketsDisplayArea.innerHTML = `<p class="error-message">Invalid player address format.</p>`;
            playerSummaryDisplay.style.display = "none";
        }
    } else {
        allTicketsDisplayArea.innerHTML = `<p class="initial-message">Enter a player address and press Enter.</p>`;
        playerSummaryDisplay.style.display = "none";
    }

    // Handle Round ID Input
    if (roundIdStr) {
        if (!isNaN(parseInt(roundIdStr)) && parseInt(roundIdStr) > 0) {
            const roundId = BigInt(roundIdStr);
            await fetchGeneralRoundDetails(roundId);
            performedRoundLookup = true;
        } else {
            displayMessage("Round ID entered is invalid (must be a positive number).", "error");
            specificRoundDisplayArea.innerHTML = `<p class="error-message">Invalid Round ID format.</p>`;
        }
    } else {
        specificRoundDisplayArea.innerHTML = `<p class="initial-message">Enter a Round ID and press Enter for round details.</p>`;
    }

    if (!performedAddressLookup && !performedRoundLookup && !playerAddr && !roundIdStr) {
        // This case is if both fields were empty and Enter was pressed.
        // Initial messages are already set, can add a temporary info message.
        displayMessage("Please enter a Player Address or a Round ID.", "info", 3000);
    }

    setLoadingState(false);
}

async function fetchAllPlayerTickets(playerAddr) {
    allTicketsDisplayArea.innerHTML = `<div class="loading-message">Loading all tickets for ${playerAddr.substring(0,10)}...</div>`;
    let contentHtml = "<h3>All Tickets for Player</h3>";
    let ticketsFoundOverall = false;
    try {
        if (!contract) throw new Error("Contract instance not available for fetchAllPlayerTickets");
        const currentChainRoundId = await contract.currentRoundId();

        if (currentChainRoundId == 0n) {
            contentHtml += "<p>No rounds have started on the contract yet.</p>";
        } else {
           contentHtml += `<p><em>Searching tickets in rounds ${currentChainRoundId.toString()} down to 1...</em></p><hr class='minimal-hr'>`;
        }

        for (let rId = currentChainRoundId; rId >= 1n; rId--) {
            let roundTicketHtml = "";
            let roundTicketsFoundThisIteration = false;
            try {
                const playerTicketIds = await contract.getPlayerTicketIdsForRound(rId, playerAddr);
                if (playerTicketIds.length > 0) {
                    ticketsFoundOverall = true;
                    roundTicketsFoundThisIteration = true;
                    roundTicketHtml += `<h4 class="round-ticket-header">Tickets in Round ${rId.toString()}:</h4>`;
                    let roundDataForContext = null;
                    try { roundDataForContext = await contract.roundsData(rId); } catch (rdErr) { console.warn(`WorkspaceAllPlayerTickets: Could not fetch roundData for round ${rId}: ${rdErr.message}`); }

                    for (const ticketId of playerTicketIds) {
                        try {
                            const ticket = await contract.getTicketById(ticketId); // ✅ Using getTicketById
                            if (!ticket || typeof ticket.picks === 'undefined') {
                                console.error(`Ticket ID ${ticketId.toString()} (Round ${rId}): getTicketById returned invalid data/missing 'picks'. Ticket data:`, ticket);
                                roundTicketHtml += `<div class="ticket-block error-ticket"><p>Error for ticket ${ticketId.toString()}: Data structure issue.</p></div><hr class='minimal-hr-dotted'>`;
                                continue;
                            }
                            roundTicketHtml += `
                                <div class="ticket-block">
                                    <p><strong>ID ${ticketId.toString()}</strong> | <span class="small-text">Bought: ${safeTimestampToDateString(ticket.timestamp)}</span></p>
                                    <p>Paid: ${formatUnits(ticket.amountPaidNative, NATIVE_TARA_DECIMALS)} TARA | Shares: ${formatUnits(ticket.sharesEarned, SHARE_DECIMALS)}</p>
                                    <p>Score: ${ticket.score.toString()}</p>
                                    ${renderTicketPicks(ticket.picks, roundDataForContext?.actualOutcomes, roundDataForContext?.resultsEvaluated, roundDataForContext?.isAborted)}
                                </div><hr class='minimal-hr-dotted'>`;
                        } catch (tErr) {
                            console.error(`Error processing ticket ${ticketId} in round ${rId}:`, tErr);
                            roundTicketHtml += `<div class="ticket-block error-ticket"><p>Error loading details for ticket ${ticketId}: ${tErr.message.substring(0,100)}</p></div><hr class='minimal-hr-dotted'>`;
                        }
                    }
                     if(roundTicketHtml.endsWith("<hr class='minimal-hr-dotted'>")) {
                        roundTicketHtml = roundTicketHtml.slice(0, -"<hr class='minimal-hr-dotted'>".length);
                    }
                }
            } catch (e) { console.warn(`WorkspaceAllPlayerTickets: Error fetching playerTicketIds for round ${rId}: ${e.message}`); }
            if(roundTicketsFoundThisIteration) contentHtml += roundTicketHtml;
        }
        if (!ticketsFoundOverall && currentChainRoundId > 0n) {
            if (contentHtml.includes("Searching tickets")) contentHtml = `<h3>All Tickets for Player</h3><p>No tickets found for player ${playerAddr.substring(0,10)}...</p>`;
            else contentHtml += `<p>No tickets found for player ${playerAddr.substring(0,10)}...</p>`;
        } else if (!ticketsFoundOverall && currentChainRoundId == 0n) { /* Already handled */ }
        
        if (contentHtml.endsWith("<hr class='minimal-hr'>")) {
            contentHtml = contentHtml.slice(0, -"<hr class='minimal-hr'>".length);
        }
    } catch (error) {
        console.error("Error in fetchAllPlayerTickets:", error);
        contentHtml = `<h3>All Tickets for Player</h3><p class="error-message">Error loading tickets: ${error.message}</p>`;
    }
    allTicketsDisplayArea.innerHTML = contentHtml;
}

async function fetchGeneralRoundDetails(roundId) {
    specificRoundDisplayArea.innerHTML = `<div class="loading-message">Loading general info for Round ${roundId.toString()}...</div>`;
    let contentHtml = "";
    try {
        if (!contract) throw new Error("Contract instance not available.");
        const roundData = await contract.roundsData(roundId);
        if (!roundData.startTime || roundData.startTime === 0n) throw new Error(`Round ${roundId} does not exist or not initialized.`);

        const isRoundAborted = roundData.isAborted;
        let statusText = "";
        if (isRoundAborted) statusText = "ABORTED";
        else if (roundData.resultsEvaluated) statusText = "Results Evaluated";
        else if (roundData.endSnapshotSubmitted) statusText = "End Snapshot Submitted (Awaiting Evaluation)";
        else if (roundData.startSnapshotSubmitted) statusText = "Active (Awaiting End Snapshot)";
        else statusText = "Not Officially Started by Snapshot";

        let totalTicketsInRound = "N/A", winningTicketsInfo = "N/A", prizePoolInfo = "N/A";
        try {
            const ids = await contract.getAllTicketIdsForRound(roundId);
            totalTicketsInRound = ids.length.toString();
            if (roundData.resultsEvaluated && !isRoundAborted && roundData.highestScoreAchieved >= 8) {
                let winnerCount = 0;
                for (const tId of ids.slice(0, 200)) { // Performance: limit calls for large rounds
                    const t = await contract.getTicketById(tId);
                    if (t.score === roundData.highestScoreAchieved) winnerCount++;
                }
                winningTicketsInfo = `${winnerCount} ticket(s) achieved the highest score` + (ids.length > 200 ? " (from first 200 tickets)" : "") + ".";
            } else if (roundData.resultsEvaluated && !isRoundAborted) {
                winningTicketsInfo = "No tickets reached the minimum winning score (8+).";
            }
            const currentTotalPrizePool = await contract.prizePoolJANS();
            prizePoolInfo = `${formatUnits(currentTotalPrizePool, SHARE_DECIMALS)} JANS (Current Total Pool)`;
        } catch (e) { console.warn(`Could not get ticket/prize counts for round ${roundId}: ${e.message}`); }

        contentHtml = `
            <h3>Round ${roundId.toString()} General Info</h3>
            <p><strong>Start Time:</strong> ${safeTimestampToDateString(roundData.startTime)}</p>
            <p><strong>Status:</strong> ${statusText}</p>
            <p><strong>Total Tickets Sold:</strong> ${totalTicketsInRound}</p>`;
        if (roundData.resultsEvaluated && !isRoundAborted) {
            contentHtml += `<p><strong>Highest Score Achieved:</strong> ${roundData.highestScoreAchieved.toString()}</p>`;
            contentHtml += `<p><strong>Winning Tickets Summary:</strong> ${winningTicketsInfo}</p>`;
            contentHtml += `<p><strong>Prize Pool Info:</strong> ${prizePoolInfo}</p>`;
        }
        contentHtml += renderRoundOutcomesDisplay(roundData.actualOutcomes, roundData.resultsEvaluated, isRoundAborted);

    } catch (error) {
        console.error(`Error in fetchGeneralRoundDetails for round ${roundId}:`, error);
        contentHtml = `<p class="error-message">Error loading Round ${roundId}: ${error.message}</p>`;
    }
    specificRoundDisplayArea.innerHTML = contentHtml;
}

// --- Initialize ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}