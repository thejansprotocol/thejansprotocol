// --- main_page_logic.js ---
// Handles primary display of read-only game info, snapshot, logs list, simplified transactions, and UI timers.

import {
    // Ethers Core & Setup from wallet.js
    initializeEthersCore,
    getReadOnlyProvider,
    getReadOnlyJansGameContract,
    // connectWalletAndGetSignerInstances, // Not directly used in this script's functions
    ethersInstance,

    // Constants from wallet.js
    JANS_TOKEN_ADDRESS,
    NATIVE_TARA_DECIMALS,
    JANS_DECIMALS,
    LP_TOKEN_DECIMALS,
    formatPriceWithZeroCount, // Used for formatting token prices

    // ABI Getters from wallet.js
    getJansTokenABI,

    // Helper Utilities from wallet.js
    shortenAddress,
    showGlobalMessage,
    
    // Data Fetching Services from wallet.js
    fetchTaraUsdPriceFromCoinGecko,
    getJansPerTaraFromDEX,
    getTokenTotalSupply,
    getLpTokenPriceUsd,
    fetchJsonFile,
} from './wallet.js';

// Import for Ticket Modal
import { openTicketPurchaseModal } from './ticket_modal_logic.js';

// --- Configuration ---
// REVIEW THESE PATHS based on your deployed site structure
const SNAPSHOT_FILE_PATH = './public/data/snapshots/latest_snapshot.json'; 
const DAILY_LOG_INDEX_FILE = './data/dailylogs_v8/index.json'; 
// const SNAPSHOT_FILE_PATH = '/data/snapshots/latest_snapshot.json'; 
// const DAILY_LOG_INDEX_FILE = '/data/dailylogs_v8/index.json';

const POOLS_TO_SELECT = 10; // Should match contract snapshot size
const DATA_REFRESH_INTERVAL_MS = 60000; // 1 minute
const GLOBAL_MESSAGE_DISPLAY_ID_MAIN = "global-message-main";

// --- Module State ---
let localSnapshotTokens = [];
let localCurrentRoundId = null;
let localTicketPriceNativeWei = null;
let localIsSalesOpen = false;
let localTicketTransactions = [];
let localLastFetchedTxBlock = null;
let localTaraUsdPrice = null;
let localJansPerTaraRate = null;
let localGameLpTokenAddress = null;
let localIsAppInitialized = false;
let localRoundStartTime = null; 
let localRoundDurationSeconds = null; 

// --- DOM Element ID Constants ---
const DOM_IDS = {
    currentRound: "current-round", ticketPrice: "ticket-price", salesStatus: "sales-status-message",
    snapshotTableBody: "token-table-body", buyTicketButton: "buy-ticket-button",
    statsPrizePool: "stats-prize-pool", statsPrizePoolUsd: "stats-prize-pool-usd",
    statsJansBurned: "stats-jans-burned", statsJansBurnedUsd: "stats-jans-burned-usd",
    statsJansBurnedPercentage: "stats-jans-burned-percentage", statsLpBalance: "stats-lp-balance",
    statsLpBalanceUsd: "stats-lp-balance-usd", transactionList: "transaction-list",
    dailyLogLinksContainer: "daily-log-list", snapshotTimestamp: "snapshot-time",
    countdownTimer: "time-remaining",
};
const DOM_IDS_MOBILE = {
    mobileTokenTableBody: "mobile-token-table-body", mobileLastTransaction: "mobile-last-transaction",
    mobileBuyTicketButton: "mobile-buy-ticket-button"
};
const TABLE_PRICE_DISPLAY_OPTIONS = {
    zeroCountThreshold: 4, significantDigits: 4, defaultDisplayDecimals: 6, minNormalDecimals: 2
};

// --- Helper Functions ---
function getRandomHexColor() {
    let color = '#';
    const letters = '0123456789ABCDEF';
    for (let i = 0; i < 6; i++) { color += letters[Math.floor(Math.random() * 16)]; }
    const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b; 
    if (luminance > 200) { return getRandomHexColor(); } 
    return color;
}

// --- Data Fetching Orchestration ---
async function refreshAllPageData() { 
    const roContract = getReadOnlyJansGameContract();
    if (!roContract) { console.warn("MainPageLogic: Read-only contract not available for data refresh."); return; }
    try {
        // Fetch external prices first as they might be needed by other contract data interpretations
        localTaraUsdPrice = await fetchTaraUsdPriceFromCoinGecko();
        const roProvider = getReadOnlyProvider();
        if (roProvider) {
            localJansPerTaraRate = await getJansPerTaraFromDEX(roProvider);
        } else {
            console.warn("MainPageLogic: ReadOnlyProvider not available for JANS/TARA rate fetch during refresh.");
        }

        // Update game status display (round, ticket price, sales status)
        await updateCurrentRoundDisplay(); 
        
        // Update stats and transaction list concurrently
        await Promise.all([
            updateGlobalStatsDisplay(), 
            fetchAndDisplaySimplifiedTransactions()
        ]);
    } catch (error) {
        console.error("MainPageLogic: Error during data refresh cycle:", error);
        showGlobalMessage("Error refreshing some page data. Retrying soon.", "warning", 5000, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
    }
}

// --- Snapshot Display ---
async function loadAndDisplaySnapshotTable() { 
    const desktopTableBody = document.getElementById(DOM_IDS.snapshotTableBody);
    const mobileTableBody = document.getElementById(DOM_IDS_MOBILE.mobileTokenTableBody);
    const loadingMsg = (cols) => `<tr><td colspan="${cols}" style="text-align:center; padding:10px;">Loading snapshot data...</td></tr>`;
    
    if (desktopTableBody) desktopTableBody.innerHTML = loadingMsg(6);
    if (mobileTableBody) mobileTableBody.innerHTML = loadingMsg(3);

    try {
        // Ensure SNAPSHOT_FILE_PATH is correct relative to your deployed index.html
        const data = await fetchJsonFile(SNAPSHOT_FILE_PATH + `?v=${Date.now()}`); // Cache buster
        if (data && Array.isArray(data)) {
            localSnapshotTokens = data.map(token => ({ ...token, prediction: undefined })); // Used by ticket modal
            if (desktopTableBody) renderDesktopSnapshotTable();
            if (mobileTableBody) renderMobileSnapshotTable();
        } else {
            // Handle case where data is empty array (valid JSON, but no tokens)
            if (Array.isArray(data) && data.length === 0) {
                console.warn("MainPageLogic: Snapshot file is empty (no active round data).");
                const noDataMsg = (cols) => `<tr><td colspan="${cols}" style="text-align:center; padding:10px;">No active round snapshot available.</td></tr>`;
                if (desktopTableBody) desktopTableBody.innerHTML = noDataMsg(6);
                if (mobileTableBody) mobileTableBody.innerHTML = noDataMsg(3);
            } else {
                throw new Error("Snapshot data is not a valid array or is null.");
            }
        }
    } catch (error) {
        console.error("MainPageLogic: Failed to load or parse snapshot:", error);
        const errorMsg = (cols) => `<tr><td colspan="${cols}" style="color:red; text-align:center; padding:10px;">Error loading snapshot. Please try again later.</td></tr>`;
        if (desktopTableBody) desktopTableBody.innerHTML = errorMsg(6);
        if (mobileTableBody) mobileTableBody.innerHTML = errorMsg(3);
        localSnapshotTokens = []; // Reset on error
    }
}

function renderDesktopSnapshotTable() { 
    const tableBody = document.getElementById(DOM_IDS.snapshotTableBody);
    if (!tableBody) { console.warn("Desktop snapshot table body not found."); return; }
    if (!localSnapshotTokens || localSnapshotTokens.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:10px;">No token data available for the current snapshot.</td></tr>`; return;
    }
    tableBody.innerHTML = ''; // Clear previous
    localSnapshotTokens.forEach(token => {
        const tr = document.createElement('tr');
        const addCell = (content, isHtml = false, textAlign = 'center') => {
            const td = document.createElement('td');
            if (isHtml) { td.innerHTML = content; } else { td.textContent = content; }
            td.style.textAlign = textAlign; return td;
        };
        let baseTokenName = token.pool_name || 'N/A'; // Use token.pool_name
        if (baseTokenName.includes('/')) baseTokenName = baseTokenName.split('/')[0].trim();
        tr.appendChild(addCell(baseTokenName, false, 'left'));
        const formattedPrice = formatPriceWithZeroCount(token.base_token_price_usd, TABLE_PRICE_DISPLAY_OPTIONS);
        tr.appendChild(addCell(formattedPrice, true, 'right'));
        tr.appendChild(addCell(token.price_change_percentage_1h ? `${parseFloat(token.price_change_percentage_1h).toFixed(2)}%` : 'N/A', false, 'right'));
        tr.appendChild(addCell(token.price_change_percentage_6h ? `${parseFloat(token.price_change_percentage_6h).toFixed(2)}%` : 'N/A', false, 'right'));
        tr.appendChild(addCell(token.price_change_percentage_24h ? `${parseFloat(token.price_change_percentage_24h).toFixed(2)}%` : 'N/A', false, 'right'));
        const fdvNum = parseFloat(String(token.fdv_usd || '0').replace(/[$,]/g, ''));
        const fdv = !isNaN(fdvNum) ? fdvNum.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }) : 'N/A';
        tr.appendChild(addCell(fdv, false, 'right'));
        tableBody.appendChild(tr);
    });
}

function renderMobileSnapshotTable() { 
    const mobileTableBody = document.getElementById(DOM_IDS_MOBILE.mobileTokenTableBody);
    if (!mobileTableBody) { console.warn("Mobile snapshot table body not found."); return; }
    if (!localSnapshotTokens || localSnapshotTokens.length === 0) {
        mobileTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:10px;">No token data for current snapshot.</td></tr>`; return;
    }
    mobileTableBody.innerHTML = ''; // Clear previous
    localSnapshotTokens.forEach(token => {
        const tr = document.createElement('tr');
        const addCell = (content, isHtml = false, textAlign = 'center') => {
            const td = document.createElement('td');
            if (isHtml) { td.innerHTML = content; } else { td.textContent = content; }
            td.style.textAlign = textAlign; return td;
        };
        let baseTokenName = token.pool_name || 'N/A'; // Use token.pool_name
        if (baseTokenName.includes('/')) baseTokenName = baseTokenName.split('/')[0].trim();
        tr.appendChild(addCell(baseTokenName, false, 'left'));
        const formattedPrice = formatPriceWithZeroCount(token.base_token_price_usd, TABLE_PRICE_DISPLAY_OPTIONS);
        tr.appendChild(addCell(formattedPrice, true, 'right'));
        const fdvNum = parseFloat(String(token.fdv_usd || '0').replace(/[$,]/g, ''));
        const fdv = !isNaN(fdvNum) ? fdvNum.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }) : 'N/A';
        tr.appendChild(addCell(fdv, false, 'right'));
        mobileTableBody.appendChild(tr);
    });
}

// --- Current Round & Ticket Price Display ---
async function updateCurrentRoundDisplay() {
    const roundSpan = document.getElementById(DOM_IDS.currentRound);
    const priceSpan = document.getElementById(DOM_IDS.ticketPrice);
    const salesStatusSpan = document.getElementById(DOM_IDS.salesStatus);
    const roContract = getReadOnlyJansGameContract();

    if (!roContract) {
        if(roundSpan) roundSpan.textContent = "N/A";
        if(priceSpan) priceSpan.textContent = "N/A";
        if(salesStatusSpan) { salesStatusSpan.textContent = "Contract N/A"; salesStatusSpan.className = "status-error"; }
        localIsSalesOpen = false; localRoundStartTime = null; localCurrentRoundId = 0n;
        return;
    }

    const nowUTC = new Date();
    const dayUTC = nowUTC.getUTCDay();
    const hourUTC = nowUTC.getUTCHours();
    const minuteUTC = nowUTC.getMinutes();

    let inBreakPeriod = false;
    if ( (dayUTC === 6 && hourUTC >= 21) || 
         (dayUTC === 0 && (hourUTC < 20 || (hourUTC === 20 && minuteUTC < 45))) ) {
        inBreakPeriod = true;
    }

    if (inBreakPeriod) {
        if (roundSpan) roundSpan.textContent = "N/A";
        if (priceSpan) priceSpan.textContent = "Paused";
        if (salesStatusSpan) {
            salesStatusSpan.textContent = "Game Paused. Next round: Sunday 20:45 UTC";
            salesStatusSpan.className = "status-pending"; 
        }
        localIsSalesOpen = false;
        localTicketPriceNativeWei = null;
        localRoundStartTime = null; 
        localCurrentRoundId = 0n;       
        return; 
    }

    try {
        const newRoundId = await roContract.currentRoundId();
        if (localCurrentRoundId?.toString() !== newRoundId.toString()) { // If round changed, reset tx log
            localTicketTransactions = []; localLastFetchedTxBlock = null;
        }
        localCurrentRoundId = newRoundId;
        if (roundSpan) roundSpan.textContent = localCurrentRoundId > 0n ? localCurrentRoundId.toString() : "0 (Awaiting Start)";

        if (localCurrentRoundId > 0n) {
            const roundData = await roContract.roundsData(localCurrentRoundId);
            // Ensure roundData fields are accessed safely
            localRoundStartTime = roundData.startTime ? Number(roundData.startTime.toString()) : null;

            // <<< MODIFIED: Check for 'aborted' field from the new contract ABI >>>
            if (roundData.aborted) { 
                localTicketPriceNativeWei = null; localIsSalesOpen = false;
                if (priceSpan) priceSpan.textContent = "Round Aborted";
                if (salesStatusSpan) { salesStatusSpan.textContent = `Round ${localCurrentRoundId} Aborted`; salesStatusSpan.className = "status-error"; }
            } else if (roundData.startSnapshotSubmitted) {
                const salesDurationSec = await roContract.ticketSalesDurationSeconds();
                const provider = getReadOnlyProvider();
                const latestBlock = await provider.getBlock("latest");
                const currentBlockTimestamp = Number(latestBlock.timestamp);

                if (localRoundStartTime !== null && currentBlockTimestamp <= (localRoundStartTime + Number(salesDurationSec.toString()))) {
                    const priceNative = await roContract.getCurrentTicketPriceNative();
                    localTicketPriceNativeWei = priceNative;
                    localIsSalesOpen = true;
                    if (priceSpan) {
                        const priceString = ethersInstance.formatUnits(localTicketPriceNativeWei, NATIVE_TARA_DECIMALS);
                        priceSpan.textContent = `${parseFloat(priceString).toFixed(2)} TARA`;
                    }
                    if (salesStatusSpan) { salesStatusSpan.textContent = "Sales OPEN"; salesStatusSpan.className = "status-open"; }
                } else {
                    localTicketPriceNativeWei = null; localIsSalesOpen = false;
                    if (priceSpan) priceSpan.textContent = "Sales Closed";
                    if (salesStatusSpan) { salesStatusSpan.textContent = "Sales CLOSED"; salesStatusSpan.className = "status-closed"; }
                }
            } else { // Start snapshot not yet submitted for the current round ID
                localTicketPriceNativeWei = null; localIsSalesOpen = false; localRoundStartTime = null;
                if (priceSpan) priceSpan.textContent = "Pending Start";
                if (salesStatusSpan) { salesStatusSpan.textContent = "Round Pending Start"; salesStatusSpan.className = "status-pending"; }
            }
        } else { // currentRoundId is 0
            localTicketPriceNativeWei = null; localIsSalesOpen = false; localRoundStartTime = null;
            if (priceSpan) priceSpan.textContent = "N/A";
            if (salesStatusSpan) { salesStatusSpan.textContent = "Awaiting New Round"; salesStatusSpan.className = "status-pending"; }
        }
    } catch (error) {
        console.error("MainPageLogic: Error fetching current round/ticket price:", error);
        if(roundSpan) roundSpan.textContent = "Error"; if(priceSpan) priceSpan.textContent = "Error";
        if(salesStatusSpan) { salesStatusSpan.textContent = "Error"; salesStatusSpan.className = "status-error"; }
        localCurrentRoundId = null; localTicketPriceNativeWei = null; localIsSalesOpen = false; localRoundStartTime = null;
    }
}

// --- Global Stats Display ---
async function updateGlobalStatsDisplay() { 
    const roContract = getReadOnlyJansGameContract();
    if (!roContract) { console.warn("MainPageLogic: Read-only contract not available for stats."); return; }
    const statElements = {
        prizePool: document.getElementById(DOM_IDS.statsPrizePool),
        prizePoolUsd: document.getElementById(DOM_IDS.statsPrizePoolUsd),
        jansBurned: document.getElementById(DOM_IDS.statsJansBurned),
        jansBurnedUsd: document.getElementById(DOM_IDS.statsJansBurnedUsd),
        jansBurnedPercentage: document.getElementById(DOM_IDS.statsJansBurnedPercentage),
        lpBalance: document.getElementById(DOM_IDS.statsLpBalance),
        lpBalanceUsd: document.getElementById(DOM_IDS.statsLpBalanceUsd),
    };
    try {
        const prizePoolRaw = await roContract.prizePoolJANS();
        const prizePoolNum = parseFloat(ethersInstance.formatUnits(prizePoolRaw, JANS_DECIMALS));
        if (statElements.prizePool) statElements.prizePool.textContent = `${prizePoolNum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} JANS`;

        const burnedRaw = await roContract.totalJansBurnedInGame();
        const burnedNum = parseFloat(ethersInstance.formatUnits(burnedRaw, JANS_DECIMALS));
        if (statElements.jansBurned) statElements.jansBurned.textContent = `${burnedNum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} JANS`;

        let jansUsdPrice = null;
        if (localTaraUsdPrice && localJansPerTaraRate !== null && localJansPerTaraRate > 0) {
            jansUsdPrice = localTaraUsdPrice / localJansPerTaraRate;
        } else if (localJansPerTaraRate === 0) jansUsdPrice = 0; // Explicitly handle rate of 0 to avoid division by zero if logic changes

        if (statElements.prizePoolUsd) statElements.prizePoolUsd.textContent = (jansUsdPrice !== null && prizePoolNum > 0) ? `(${(prizePoolNum * jansUsdPrice).toLocaleString(undefined, { style: 'currency', currency: 'USD' })})` : (prizePoolNum === 0 ? "($0.00 USD)" : "(USD N/A)");
        if (statElements.jansBurnedUsd) statElements.jansBurnedUsd.textContent = (jansUsdPrice !== null && burnedNum > 0) ? `(${(burnedNum * jansUsdPrice).toLocaleString(undefined, { style: 'currency', currency: 'USD' })})` : (burnedNum === 0 ? "($0.00 USD)" : "(USD N/A)");

        if (statElements.jansBurnedPercentage) {
            const roProvider = getReadOnlyProvider();
            const jansAbi = await getJansTokenABI(); // Assuming JANS_TOKEN_ADDRESS is correct
            const supplyData = await getTokenTotalSupply(roProvider, JANS_TOKEN_ADDRESS, jansAbi, JANS_DECIMALS);
            if (supplyData && supplyData.raw > 0n) {
                const totalNum = parseFloat(supplyData.formatted);
                if (totalNum > 0 && burnedNum >= 0) statElements.jansBurnedPercentage.textContent = `(${(burnedNum / totalNum * 100).toFixed(4)}% of Total)`;
                else statElements.jansBurnedPercentage.textContent = "(Supply 0)";
            } else statElements.jansBurnedPercentage.textContent = "(Supply N/A)";
        }

        if (!localGameLpTokenAddress) {
            try { localGameLpTokenAddress = await roContract.GAME_LP_TOKEN(); } 
            catch(e){ console.warn("MainPageLogic: Could not get game LP token address from contract.", e.message);}
        }
        const lpBalRaw = await roContract.getContractLpTokenBalance();
        const lpBalNum = parseFloat(ethersInstance.formatUnits(lpBalRaw, LP_TOKEN_DECIMALS));
        if (statElements.lpBalance) statElements.lpBalance.textContent = `${lpBalNum.toFixed(4)} Game LP`;

        if (statElements.lpBalanceUsd && localGameLpTokenAddress && localGameLpTokenAddress !== ethersInstance.ZeroAddress) {
            if (lpBalNum > 0) {
                const roProvider = getReadOnlyProvider();
                const lpTokenPrice = await getLpTokenPriceUsd(localGameLpTokenAddress, LP_TOKEN_DECIMALS, roProvider, localTaraUsdPrice, localJansPerTaraRate);
                if (lpTokenPrice !== null && lpTokenPrice >= 0) statElements.lpBalanceUsd.textContent = `(${(lpBalNum * lpTokenPrice).toLocaleString(undefined, { style: 'currency', currency: 'USD' })})`;
                else statElements.lpBalanceUsd.textContent = "(USD Value N/A)";
            } else statElements.lpBalanceUsd.textContent = "($0.00 USD)";
        } else if (statElements.lpBalanceUsd) statElements.lpBalanceUsd.textContent = "(LP Address N/A)";
    } catch (error) {
        console.error("MainPageLogic: Error fetching global stats:", error);
        // Set all stat elements to "Error" or similar to indicate failure
        Object.values(statElements).forEach(el => { if(el) el.textContent = "Error"; });
    }
}

// --- Transaction Log Display (UPDATED) ---
async function fetchAndDisplaySimplifiedTransactions() { 
    const txListUl = document.getElementById(DOM_IDS.transactionList);
    const mobileLastTxDiv = document.getElementById(DOM_IDS_MOBILE.mobileLastTransaction);
    const roContract = getReadOnlyJansGameContract();
    const roProvider = getReadOnlyProvider();

    if (!roContract || !roProvider || (!txListUl && !mobileLastTxDiv)) return;

    const nowUTC = new Date();
    const dayUTC = nowUTC.getUTCDay();
    const hourUTC = nowUTC.getUTCHours();
    const minuteUTC = nowUTC.getMinutes();
    let inBreakPeriod = (dayUTC === 6 && hourUTC >= 21) || (dayUTC === 0 && (hourUTC < 20 || (hourUTC === 20 && minuteUTC < 45)));

    if (inBreakPeriod) {
        const msg = "Game Paused";
        if (txListUl) txListUl.innerHTML = `<li>${msg}</li>`;
        if (mobileLastTxDiv) mobileLastTxDiv.textContent = msg;
        if (localTicketTransactions.length > 0) { localTicketTransactions = []; localLastFetchedTxBlock = null;}
        return;
    }
    if (!localCurrentRoundId || localCurrentRoundId === 0n) {
        const msg = "Awaiting new round";
        if (txListUl) txListUl.innerHTML = `<li>${msg}</li>`;
        if (mobileLastTxDiv) mobileLastTxDiv.textContent = msg;
        if (localTicketTransactions.length > 0) { localTicketTransactions = []; localLastFetchedTxBlock = null;}
        return;
    }
    
    try {
        let fromBlockForQuery;
        const currentBlockNumber = await roProvider.getBlockNumber();
        if (localLastFetchedTxBlock !== null && localLastFetchedTxBlock < currentBlockNumber) {
            fromBlockForQuery = localLastFetchedTxBlock + 1;
        } else if (localLastFetchedTxBlock === null) {
            // Initial fetch: try to get recent blocks, or further back if round has been active
            const roundData = await roContract.roundsData(localCurrentRoundId);
            const roundStartTimestamp = roundData.startTime ? Number(roundData.startTime.toString()) : 0;
            const secondsSinceRoundStart = Math.floor(Date.now()/1000) - roundStartTimestamp;
            const blocksPerDayApprox = 70000; // Rough estimate for Taraxa, adjust if known
            let blockRange = 5000; // Default for very new rounds
            if (secondsSinceRoundStart > 3600 * 6) blockRange = blocksPerDayApprox / 2; // 12 hours
            if (secondsSinceRoundStart > 3600 * 24) blockRange = blocksPerDayApprox * 2; // 2 days

            fromBlockForQuery = (roundStartTimestamp > 0) ? Math.max(0, currentBlockNumber - blockRange) : Math.max(0, currentBlockNumber - 5000);

        const eventFilter = roContract.filters.TicketPurchased(localCurrentRoundId);
        
        // ===========================================================================
        //                      *** THIS IS THE ONLY LINE WE CHANGED ***
        const events = await getPastEventsInBatches(roContract, eventFilter, fromBlockForQuery, currentBlockNumber);
        // ===========================================================================
        
        let newTxFound = false;
        for (const event of events) {
            if (!localTicketTransactions.some(tx => tx.txHash === event.transactionHash && tx.ticketId.toString() === event.args.ticketId.toString())) {
                try {
                    const block = await event.getBlock();
                    localTicketTransactions.push({ 
                        player: event.args.player, timestamp: Number(block.timestamp), 
                        txHash: event.transactionHash, ticketId: event.args.ticketId 
                    });
                    newTxFound = true;
                } catch (blockError) { console.error("TX_LOG: Error fetching block for event:", blockError); }
            }
        }
        
        if (newTxFound) {
            localTicketTransactions.sort((a, b) => b.timestamp - a.timestamp); // Sort by newest first
            if (txListUl) renderDesktopTransactionList();
            renderMobileLastTransaction(); // Always update mobile with the latest
        } else if (localTicketTransactions.length === 0 && events.length === 0) { // No Txs at all for this round yet
            const noTxMsg = 'No ticket purchases yet for this round.';
            if(txListUl) txListUl.innerHTML = `<li>${noTxMsg}</li>`;
            if (mobileLastTxDiv) mobileLastTxDiv.textContent = noTxMsg;
        } else if (localTicketTransactions.length > 0 && !newTxFound) { // No new txs, but some exist
             renderMobileLastTransaction(); // Ensure mobile is up-to-date
             // Desktop list remains unchanged if no new txs
        }
        localLastFetchedTxBlock = currentBlockNumber;
    } catch (error) { 
        console.error("TX_LOG: Failed to fetch/process transactions:", error);
        if(txListUl && localTicketTransactions.length === 0) txListUl.innerHTML = '<li>Error loading transaction history.</li>';
        if (mobileLastTxDiv && localTicketTransactions.length === 0) mobileLastTxDiv.textContent = 'Error loading latest transaction.';
    }
}

function renderDesktopTransactionList() {
    const ulElement = document.getElementById(DOM_IDS.transactionList);
    if (!ulElement) return;
    ulElement.innerHTML = ''; // Clear previous list
    if (localTicketTransactions.length === 0) {
        ulElement.innerHTML = '<li>No ticket purchases recorded for this round.</li>';
        return;
    }
    const maxToShow = 10;
    localTicketTransactions.slice(0, maxToShow).forEach(tx => {
        const li = document.createElement('li');
        const date = new Date(tx.timestamp * 1000);

        // Define actualTimeText correctly with the formatted time
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        // const seconds = date.getSeconds().toString().padStart(2, '0'); // Uncomment if you want seconds

        const actualTimeText = `${hours}:${minutes}`;
        // Or to include seconds: const actualTimeText = `${hours}:${minutes}:${seconds}`;

        // --- ALTERNATIVE (Recommended for locale-awareness): ---
        // const actualTimeText = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        // Or for default locale time with seconds:
        // const actualTimeText = date.toLocaleTimeString();

        // Set innerHTML correctly, using template literals properly
        li.innerHTML = `<span class="math-inline">${actualTimeText}</span> - Wallet: <span title="${tx.player}">${shortenAddress(tx.player, 4)}</span>`;
        
        li.style.color = getRandomHexColor();
        li.style.padding = "3px 5px";
        li.style.fontSize = "0.8em";
        li.style.marginBottom = "2px";
        li.style.borderRadius = "3px";
        ulElement.appendChild(li);
    });
}

function renderMobileLastTransaction() {
    const mobileTxDiv = document.getElementById(DOM_IDS_MOBILE.mobileLastTransaction);
    if (!mobileTxDiv) return;
    if (localTicketTransactions.length === 0) {
        mobileTxDiv.textContent = 'No purchases this round.';
        return;
    }
    const lastTx = localTicketTransactions[0]; // Already sorted newest first
    const date = new Date(lastTx.timestamp * 1000);

    // Define actualTimeText correctly with the formatted time
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    // const seconds = date.getSeconds().toString().padStart(2, '0'); // Uncomment if you want seconds

    const actualTimeText = `${hours}:${minutes}`;
    // Or to include seconds: const actualTimeText = `${hours}:${minutes}:${seconds}`;

    // --- ALTERNATIVE (Recommended for locale-awareness): ---
    // const actualTimeText = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    // Or for default locale time with seconds:
    // const actualTimeText = date.toLocaleTimeString();

    // Set innerHTML correctly
    mobileTxDiv.innerHTML = `Latest: <span class="math-inline">${actualTimeText}</span> - Wallet: <span title="${lastTx.player}">${shortenAddress(lastTx.player, 4)}</span>`;
    
    mobileTxDiv.style.color = getRandomHexColor();
}

// --- Daily Log List Display ---
async function displayDailyLogLinks() { 
    const logLinksContainer = document.getElementById(DOM_IDS.dailyLogLinksContainer);
    if (!logLinksContainer) { console.warn("Daily log links container not found."); return; }
    logLinksContainer.innerHTML = '<li>Loading log list...</li>';

    try {
        const logIndex = await fetchJsonFile(DAILY_LOG_INDEX_FILE + `?v=${Date.now()}`); // Cache buster
        if (logIndex && Array.isArray(logIndex) && logIndex.length > 0) {
            logLinksContainer.innerHTML = ''; // Clear loading message
            logIndex.sort((a,b) => b.date.localeCompare(a.date)); // Sort newest first
            logIndex.forEach(logEntry => {
                const li = document.createElement('li');
                const link = document.createElement('a');
                // Corrected path construction assuming dailylogs_v8 is at the same level as 'data' or handled by server routing
                link.href = `view_log_page.html?logFile=${encodeURIComponent(logEntry.file)}`;let textContent = `Log: ${logEntry.date}`;
                if(logEntry.roundStartedId || logEntry.roundClosedId) {
                    textContent += ` (R${logEntry.roundStartedId || '_'}S / R${logEntry.roundClosedId || '_'}E)`;
                }
                link.textContent = textContent;
                link.target = "_blank"; // Open in new tab
                link.style.color = getRandomHexColor(); 
                li.appendChild(link);
                li.style.marginBottom = "3px";
                logLinksContainer.appendChild(li);
            });
        } else { 
            logLinksContainer.innerHTML = '<li>No daily logs found.</li>'; 
        }
    } catch (error) {
        console.error("Error loading daily log links:", error);
        logLinksContainer.innerHTML = '<li style="color:red;">Error loading log list.</li>';
    }
}

// --- UI Timers ---
function initializeUiTimers() {
    const updateAllTimes = () => { updateSnapshotTimeDisplay(); updateCountdownTimerDisplay(); };
    updateAllTimes(); // Initial call
    setInterval(updateAllTimes, 1000); // Update every second
}

function updateSnapshotTimeDisplay() { 
    const span = document.getElementById(DOM_IDS.snapshotTimestamp);
    if (!span) return;
    const now = new Date();
    // Assumes snapshot is for 21:00 UTC of the current or previous day
    let snapshotForDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 21, 0, 0, 0));
    if (now.getUTCHours() < 21) { // If current UTC hour is before 21:00, snapshot is for yesterday
        snapshotForDate.setUTCDate(snapshotForDate.getUTCDate() - 1);
    }
    span.textContent = snapshotForDate.toLocaleString('en-GB', { 
        day: '2-digit', month: 'short', year: 'numeric', 
        hour: '2-digit', minute: '2-digit', timeZone: 'UTC' 
    }) + " UTC";
}

function updateCountdownTimerDisplay() {
    const span = document.getElementById(DOM_IDS.countdownTimer);
    if (!span) return;
    const nowUTC = new Date();
    const dayUTC = nowUTC.getUTCDay();
    const hourUTC = nowUTC.getUTCHours();
    const minuteUTC = nowUTC.getMinutes();

    let inBreakPeriod = false;
    if ( (dayUTC === 6 && hourUTC >= 21) || // Saturday 21:00 UTC onwards
         (dayUTC === 0 && (hourUTC < 20 || (hourUTC === 20 && minuteUTC < 45))) ) { // Sunday before 20:45 UTC
        inBreakPeriod = true;
    }

    if (inBreakPeriod) {
        let targetTimeForBreakCountdown = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate()));
        // Set to next Sunday 20:45 UTC
        targetTimeForBreakCountdown.setUTCDate(nowUTC.getUTCDate() + (7 - dayUTC) % 7); // Go to Sunday
        if (dayUTC === 0 && (hourUTC > 20 || (hourUTC === 20 && minuteUTC >= 45))) { // If it's Sunday past the time, aim for next Sunday
             targetTimeForBreakCountdown.setUTCDate(targetTimeForBreakCountdown.getUTCDate() + 7);
        }
        targetTimeForBreakCountdown.setUTCHours(20, 45, 0, 0);

        const diff = targetTimeForBreakCountdown.getTime() - nowUTC.getTime();
        if (diff > 0) {
            const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
            const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
            const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
            span.textContent = `Next round (Sun 20:45 UTC) in: ${h}h ${m}m ${s}s`;
        } else {
            span.textContent = "New round window opening soon...";
        }
        return; 
    }
    
    if (localCurrentRoundId > 0n && localRoundStartTime && localRoundDurationSeconds !== null && localRoundDurationSeconds > 0) {
        const roundEndTimeEpoch = localRoundStartTime + localRoundDurationSeconds;
        const nowEpoch = Math.floor(nowUTC.getTime() / 1000);
        const diff = roundEndTimeEpoch - nowEpoch;

        if (localIsSalesOpen) { // If sales are open, countdown to sales close
            const salesDuration = Number(localRoundDurationSeconds); // TEMP: Assuming salesDuration is what localRoundDurationSeconds is. This needs contract's ticketSalesDurationSeconds
            const salesEndTimeEpoch = localRoundStartTime + salesDuration; // This needs fixing
             // TODO: Fetch and use actual 'ticketSalesDurationSeconds' from contract for sales countdown
            const salesDiff = salesEndTimeEpoch - nowEpoch; // Placeholder, will be inaccurate
            if (salesDiff > 0) {
                const h = String(Math.floor(salesDiff / 3600)).padStart(2, '0');
                const m = String(Math.floor((salesDiff % 3600) / 60)).padStart(2, '0');
                const s = String(Math.floor(salesDiff % 60)).padStart(2, '0');
                 span.textContent = `Sales close in: ${h}h ${m}m ${s}s`;
            } else {
                 span.textContent = "Sales just closed. Round ending soon...";
            }
        } else if (diff > 0) { // Sales closed, but round still active
            const h = String(Math.floor(diff / 3600)).padStart(2, '0');
            const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
            const s = String(Math.floor(diff % 60)).padStart(2, '0');
            span.textContent = `Round ends in: ${h}h ${m}m ${s}s`;
        } else { // Round has ended based on duration
            span.textContent = "Round ended, awaiting evaluation...";
        }
    } else if ((localCurrentRoundId === 0n && !localIsSalesOpen) || (!localRoundStartTime && !inBreakPeriod)) { 
        span.textContent = "Awaiting new round start";
    } else if (!localIsSalesOpen && localCurrentRoundId > 0n) { // Round exists but sales not open (either pending start or closed)
        span.textContent = "Sales closed / Round pending/ended";
    } else {
        span.textContent = "Loading game status...";
    }
}

// --- Fallback Error Display ---
function updateAllDisplaysOnError(message = "Error") { 
    const idsToUpdate = [
        DOM_IDS.currentRound, DOM_IDS.ticketPrice, DOM_IDS.salesStatus,
        DOM_IDS.statsPrizePool, DOM_IDS.statsJansBurned, DOM_IDS.statsLpBalance,
        DOM_IDS.snapshotTimestamp, DOM_IDS.countdownTimer
    ];
    idsToUpdate.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = message; });
    const secondarySpans = [
        DOM_IDS.statsPrizePoolUsd, DOM_IDS.statsJansBurnedUsd, DOM_IDS.statsLpBalanceUsd,
        DOM_IDS.statsJansBurnedPercentage
    ];
    secondarySpans.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ""; });
    const txList = document.getElementById(DOM_IDS.transactionList);
    if(txList) txList.innerHTML = `<li>${message} (transactions).</li>`;
    const mobileTx = document.getElementById(DOM_IDS_MOBILE.mobileLastTransaction);
    if(mobileTx) mobileTx.textContent = `${message} (latest transaction).`;
    const desktopTable = document.getElementById(DOM_IDS.snapshotTableBody);
    if(desktopTable) desktopTable.innerHTML = `<tr><td colspan="6" style="text-align:center;">${message} (snapshot).</td></tr>`;
    const mobileTable = document.getElementById(DOM_IDS_MOBILE.mobileTokenTableBody);
    if(mobileTable) mobileTable.innerHTML = `<tr><td colspan="3" style="text-align:center;">${message} (snapshot).</td></tr>`;
    const logLinks = document.getElementById(DOM_IDS.dailyLogLinksContainer);
    if(logLinks) logLinks.innerHTML = `<li>${message} (logs).</li>`;
    const buyBtnDesktop = document.getElementById(DOM_IDS.buyTicketButton);
    if (buyBtnDesktop) buyBtnDesktop.disabled = true;
    const buyBtnMobile = document.getElementById(DOM_IDS_MOBILE.mobileBuyTicketButton);
    if (buyBtnMobile) buyBtnMobile.disabled = true;
}

// --- Initialization ---
async function initializeMainPageOnceEthersReady() {
    if (localIsAppInitialized) return;
    console.log("MainPageLogic: Initializing main page components...");
    try {
        console.log("MainPageLogic: Ethers core assumed initialized from previous step.");

        const roContract = getReadOnlyJansGameContract();
        if (roContract && localRoundDurationSeconds === null) { // Fetch only if not already set
            try {
                const durationFromContract = await roContract.currentRoundResultDurationSeconds(); 
                localRoundDurationSeconds = Number(durationFromContract.toString());
                console.log(`MainPageLogic: Fetched currentRoundResultDurationSeconds: ${localRoundDurationSeconds}`);
            } catch (e) { 
                console.error("MainPageLogic: Error fetching currentRoundResultDurationSeconds from contract:", e); 
                localRoundDurationSeconds = 86400; // Default to 24 hours as a fallback
                showGlobalMessage("Could not fetch round duration from contract, using default (24h).", "warning", 5000, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
            }
        } else if (!roContract) {
             console.error("MainPageLogic: Read-only contract instance is not available. Cannot fetch round duration.");
             localRoundDurationSeconds = 86400; // Default to 24 hours
             showGlobalMessage("Contract not available to fetch settings, using defaults.", "error", 5000, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
        }
        
        await loadAndDisplaySnapshotTable();
        await displayDailyLogLinks();
        await refreshAllPageData(); // Initial full data refresh
        setInterval(refreshAllPageData, DATA_REFRESH_INTERVAL_MS); // Set up periodic refresh
        initializeUiTimers(); // Initialize countdowns and other timers

        const buyBtnDesktop = document.getElementById(DOM_IDS.buyTicketButton);
        if (buyBtnDesktop) buyBtnDesktop.addEventListener('click', handleBuyTicketClick);
        else console.warn(`Desktop buy button ('${DOM_IDS.buyTicketButton}') not found.`);
        
        const buyBtnMobile = document.getElementById(DOM_IDS_MOBILE.mobileBuyTicketButton);
        if (buyBtnMobile) buyBtnMobile.addEventListener('click', handleBuyTicketClick);
        else console.warn(`Mobile buy button ('${DOM_IDS_MOBILE.mobileBuyTicketButton}') not found.`);

        window.triggerMainPageRefresh = async () => {
            console.log("MainPageLogic: Refresh triggered (e.g., by modal).");
            showGlobalMessage("Refreshing page data...", "info", 2000, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
            await refreshAllPageData();
        };

        localIsAppInitialized = true;
        console.log("MainPageLogic: Initialization complete.");
        showGlobalMessage("Page initialized successfully!", "success", 3000, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
    } catch (error) {
        console.error("MainPageLogic: CRITICAL Initialization Error:", error);
        showGlobalMessage(`Page Initialization Failed: ${error.message}. Check console for details.`, "error", 0, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
        updateAllDisplaysOnError("Page Init Failed");
    }
}

// --- Main Event Listener & Ethers.js Check ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded for Main Page. Setting up Ethers.js initialization check...");
    
    function attemptEthersInitAndRun() {
        if (window.ethers && typeof initializeEthersCore === 'function') {
            initializeEthersCore(window.ethers) 
                .then(() => {
                    console.log("Ethers Core initialized from DOMContentLoaded. Proceeding to main page logic.");
                    initializeMainPageOnceEthersReady().catch(err => { 
                        console.error("MainPageLogic: Init sequence error after Ethers ready:", err);
                        showGlobalMessage(`Initialization failed: ${err.message}`, "error", 0, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
                        updateAllDisplaysOnError("Init Error");
                    });
                })
                .catch(err => {
                    console.error("Ethers Core Initialization failed:", err);
                    showGlobalMessage(`Blockchain library (Ethers.js) failed to initialize: ${err.message}`, "error", 0, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
                    updateAllDisplaysOnError("Ethers Init Error");
                });
        } else {
            console.warn("Ethers.js or initializeEthersCore not found. Waiting to retry...");
            showGlobalMessage("Loading blockchain library, please wait...", "info", 0, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
            setTimeout(attemptEthersInitAndRun, 700); // Retry after a slightly longer delay
        }
    }
    attemptEthersInitAndRun();
});

function handleBuyTicketClick() {
    const nowUTC = new Date();
    const dayUTC = nowUTC.getUTCDay();
    const hourUTC = nowUTC.getUTCHours();
    const minuteUTC = nowUTC.getMinutes();

    let inBreakPeriod = false;
    if ( (dayUTC === 6 && hourUTC >= 21) || 
         (dayUTC === 0 && (hourUTC < 20 || (hourUTC === 20 && minuteUTC < 45))) ) {
        inBreakPeriod = true;
    }

    if (inBreakPeriod) {
        showGlobalMessage("Game Paused. Next round starts Sunday 20:45 UTC.", "warning", 7000, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
        return;
    }

    if (!localIsSalesOpen || !localSnapshotTokens || localSnapshotTokens.length !== POOLS_TO_SELECT || localTicketPriceNativeWei === null) {
        let message = "Cannot buy ticket: ";
        if (!localIsSalesOpen) message += "Sales are currently closed for this round. ";
        if (!localSnapshotTokens || localSnapshotTokens.length !== POOLS_TO_SELECT) message += "Snapshot data not ready or incomplete. ";
        if (localTicketPriceNativeWei === null) message += "Ticket price not available. ";
        showGlobalMessage(message.trim(), "warning", 7000, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
        return;
    }
    
    if (typeof openTicketPurchaseModal === 'function') {
        openTicketPurchaseModal(localSnapshotTokens, localTicketPriceNativeWei);
    } else {
        console.error("openTicketPurchaseModal is not defined or not imported correctly.");
        showGlobalMessage("Error: Ticket purchase feature is currently unavailable.", "error", 5000, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
    }
}

async function getPastEventsInBatches(contract, eventFilter, fromBlock, toBlock) {
    const BATCH_SIZE = 1000;
    const MAX_CONCURRENCY = 5; // Adjust based on RPC limits

    const batchRanges = [];
    for (let i = fromBlock; i <= toBlock; i += BATCH_SIZE) {
        batchRanges.push([
            i,
            Math.min(i + BATCH_SIZE - 1, toBlock)
        ]);
    }

    const allLogs = [];
    let currentIndex = 0;

    async function processBatch() {
        while (currentIndex < batchRanges.length) {
            const index = currentIndex++;
            const [start, end] = batchRanges[index];

            try {
                console.log(`   Querying batch: ${start} to ${end}`);
                const logs = await contract.queryFilter(eventFilter, start, end);
                allLogs.push(...logs);
            } catch (error) {
                console.error(`Failed to fetch logs for batch ${start}-${end}:`, error);
                throw new Error(`Batch failed: ${start}–${end}`);
            }
        }
    }

    // Launch concurrent batch processors
    const workers = Array.from({ length: MAX_CONCURRENCY }, () => processBatch());
    await Promise.all(workers);

    return allLogs;
}
