// --- main_page_logic.js ---
// Handles primary display of read-only game info, snapshot, logs list, simplified transactions, and UI timers.


import {
    // Ethers Core & Setup from wallet.js
    initializeEthersCore,
    getReadOnlyProvider,
    getReadOnlyJansGameContract,
    connectWalletAndGetSignerInstances, // Might be used by ticket_modal_logic, but good to have access
    ethersInstance, // Direct access if initializeEthersCore exports it or sets a global via window.ethers

    // Constants from wallet.js
    JANS_GAME_CONTRACT_ADDRESS,
    TARGET_CHAIN_ID,
    TARGET_NETWORK_NAME,
    
    TARAXA_RPC_URL,
    DEX_ROUTER_ADDRESS,
    TARA_WETH_ADDRESS,
    JANS_TOKEN_ADDRESS,
    NATIVE_TARA_DECIMALS,
    JANS_DECIMALS,
    LP_TOKEN_DECIMALS,
    formatPriceWithZeroCount,
    COINGECKO_TARA_PRICE_URL, // If not used directly by wallet.js service

    // ABI Getters from wallet.js
    getJansGameABI,
    getJansTokenABI,

    // Helper Utilities from wallet.js
    shortenAddress,
    showGlobalMessage,
    clearGlobalMessage,
    

    // Data Fetching Services from wallet.js
    fetchTaraUsdPriceFromCoinGecko,
    getJansPerTaraFromDEX,
    getTokenTotalSupply,
    getLpTokenPriceUsd,
    fetchJsonFile,
    // MINIMAL_ERC20_ABI_FOR_BALANCES_TOTALSUPPLY, // If needed directly
    // LP_PAIR_ABI // If needed directly
} from './wallet.js'; // Assuming wallet.js is in the same directory or adjust path

// ***** NEW IMPORT FOR TICKET MODAL *****
import { openTicketPurchaseModal } from './ticket_modal_logic.js';


// --- Configuration for this module (main_page_logic.js) ---

// Path to fetch the latest snapshot JSON.
// Assumes HTML file is in frontend/ and data is in frontend/data/
// For GitHub Pages, this will be relative to the site root.
const SNAPSHOT_FILE_PATH = './data/snapshots/latest_snapshot.json';
// const SNAPSHOT_FILE_PATH = '/data/snapshots/latest_snapshot.json';

// Base path for daily logs, relative to the HTML file or site root.
const DAILY_LOGS_BASE_PATH_RELATIVE_TO_DATA = './data/'; // This is relative to the `data` folder
const DAILY_LOG_INDEX_FILE = './data/dailylogs_v8/index.json';// Or, absolute from site root:
// Or, if you prefer an absolute path from the site root:
// const DAILY_LOG_INDEX_FILE_URL = `/data/${DAILY_LOGS_BASE_PATH_RELATIVE_TO_DATA}index.json`;


// When constructing links to individual log files from the index, you'll use:
// e.g., `href = \`./data/${logEntry.file}\`` if logEntry.file is like "dailylogs_v8/log_YYYY-MM-DD.json"
// or if logEntry.file is just "log_YYYY-MM-DD.json", then
// `href = \`./data/${DAILY_LOGS_BASE_PATH_RELATIVE_TO_DATA}${logEntry.file}\``

const POOLS_TO_SELECT = 10; // Number of tokens in the snapshot
const DATA_REFRESH_INTERVAL_MS = 60000; // 1 minute
const GLOBAL_MESSAGE_DISPLAY_ID_MAIN = "global-message-main"; // ID for global messages on this page

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

// --- DOM Element ID Constants (examples) ---
const DOM_IDS = {
    currentRound: "current-round",
    ticketPrice: "ticket-price",
    salesStatus: "sales-status-message", // New example element for sales open/closed
    snapshotTableBody: "token-table-body", // Assuming <tbody> for rows
    buyTicketButton: "buy-ticket-button",
    statsPrizePool: "stats-prize-pool",
    statsPrizePoolUsd: "stats-prize-pool-usd",
    statsJansBurned: "stats-jans-burned",
    statsJansBurnedUsd: "stats-jans-burned-usd",
    statsJansBurnedPercentage: "stats-jans-burned-percentage",
    statsLpBalance: "stats-lp-balance",
    statsLpBalanceUsd: "stats-lp-balance-usd",
    transactionList: "transaction-list", // For simplified transactions
    dailyLogLinksContainer: "daily-log-list",
    snapshotTimestamp: "snapshot-time", // For snapshot time display
    countdownTimer: "time-remaining", // For countdown
    currentTimeDisplay: "current-time-utc" // For current UTC time
};

// --- Initialization ---
async function initializeMainPage() {
    if (localIsAppInitialized) return;
    console.log("MainPageLogic: Initializing...");

    try {
        if (!window.ethers) {
            showGlobalMessage("Ethers.js (blockchain library) not found. Page cannot operate.", "error", 0, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
            throw new Error("Ethers.js not loaded on window.");
        }
        // Initialize shared Ethers.js core from wallet.js
        await initializeEthersCore(window.ethers);
        console.log("MainPageLogic: Ethers core initialized via wallet.js.");

        // Fetch initial data
        await loadAndDisplaySnapshotTable(); // Includes fetching snapshotTokens
        await displayDailyLogLinks();
        await refreshAllPageData();       // Fetches prices, round info, stats, tx, logs

        // Setup periodic refresh
        setInterval(refreshAllPageData, DATA_REFRESH_INTERVAL_MS);

        // Setup UI timers
        initializeUiTimers();

        // Setup event listeners
        const buyBtn = document.getElementById(DOM_IDS.buyTicketButton);
        if (buyBtn) {
            buyBtn.addEventListener('click', () => {
                // This will eventually call a function from ticket_modal_logic.js
                if (!localIsSalesOpen || !localSnapshotTokens || localSnapshotTokens.length !== POOLS_TO_SELECT) {
                    showGlobalMessage("Cannot buy ticket: Sales might be closed or snapshot data not ready.", "warning", 5000, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
                    return;
                }
                console.log("MainPageLogic: 'Buy Ticket' clicked. Placeholder for opening ticket modal.");
                showGlobalMessage("Ticket modal logic not yet implemented in this module.", "info", 3000, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
                // Example: import { openTicketModal } from './ticket_modal_logic.js';
                          openTicketPurchaseModal(localSnapshotTokens, localTicketPriceNativeWei);
            });
        } else {
            console.warn(`MainPageLogic: Buy ticket button with ID '${DOM_IDS.buyTicketButton}' not found.`);
        }

        localIsAppInitialized = true;
        console.log("MainPageLogic: Initialization complete.");
        showGlobalMessage("Page initialized successfully!", "success", 3000, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);

    } catch (error) {
        console.error("MainPageLogic: CRITICAL Initialization Error:", error);
        showGlobalMessage(`Page Init Failed: ${error.message}. Check console.`, "error", 0, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
        updateAllDisplaysOnError("Init Failed");
    }
}

function generateUniqueRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}


// --- Data Fetching Orchestration ---
async function refreshAllPageData() {
    if (!getReadOnlyJansGameContract()) { // Check if contract instance is ready from wallet.js
        console.warn("MainPageLogic: Read-only contract not available, skipping refresh cycle.");
        return;
    }
    console.log("MainPageLogic: Refreshing all page data...");
    try {
        // Fetch external prices first as they might be needed for USD calculations
        localTaraUsdPrice = await fetchTaraUsdPriceFromCoinGecko();
        const roProvider = getReadOnlyProvider();
        if (roProvider) {
             localJansPerTaraRate = await getJansPerTaraFromDEX(roProvider); // Use read-only provider
        } else {
            console.warn("MainPageLogic: ReadOnlyProvider not available for JANS/TARA rate fetch.");
        }


        // Parallelize fetching where possible
        await updateCurrentRoundDisplay(); 
        await Promise.all([
            updateGlobalStatsDisplay(),
            fetchAndDisplaySimplifiedTransactions(), // This fetches its own events
            // Snapshot and log list are usually loaded once at init or on demand, not every refresh.
            // If latest_snapshot.json can change and needs refresh, add loadAndDisplaySnapshotTable() here.
        ]);
        console.log("MainPageLogic: Page data refreshed.");
    } catch (error) {
        console.error("MainPageLogic: Error during data refresh:", error);
        showGlobalMessage("Error refreshing some page data.", "warning", 5000, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
    }
}

// --- main_page_logic.js ---

// ... (other imports and code) ...

// Helper function to generate a random hex color
function getRandomHexColor() {
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += Math.floor(Math.random() * 16).toString(16);
    }
    return color;
}

// ... (rest of your code, then the modified function below) ...

// --- Snapshot Display ---
async function loadAndDisplaySnapshotTable() {
    const snapshotTableBody = document.getElementById(DOM_IDS.snapshotTableBody);
    if (!snapshotTableBody) { console.warn("MainPageLogic: Snapshot table body not found."); return; }
    snapshotTableBody.innerHTML = `<tr><td colspan="6">Loading snapshot...</td></tr>`;

    try {
        const data = await fetchJsonFile(SNAPSHOT_FILE_PATH); // Uses service from wallet.js
        if (data && Array.isArray(data)) {
            localSnapshotTokens = data.map(token => ({ ...token, prediction: undefined })); // Store for modal
            if (localSnapshotTokens.length !== POOLS_TO_SELECT && POOLS_TO_SELECT > 0) {
                console.warn(`MainPageLogic: Snapshot has ${localSnapshotTokens.length} tokens, expected ${POOLS_TO_SELECT}.`);
            }
            console.log("MainPageLogic: Snapshot loaded:", localSnapshotTokens.length, "tokens.");
            renderSnapshotTable();
        } else {
            throw new Error("Snapshot data is not a valid array or is null.");
        }
    } catch (error) {
        console.error("MainPageLogic: Failed to load or parse snapshot:", error);
        snapshotTableBody.innerHTML = `<tr><td colspan="6" style="color:red;">Error loading snapshot: ${error.message}</td></tr>`;
        localSnapshotTokens = [];
    }
}

// Make sure formatDisplayPrice is defined in this file or imported from wallet.js

// In main_page_logic.js

function renderSnapshotTable() {
    const tableBody = document.getElementById(DOM_IDS.snapshotTableBody);
    if (!tableBody) { 
        console.warn("MainPageLogic: Snapshot table body not found."); 
        return; 
    }

    if (!localSnapshotTokens || localSnapshotTokens.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No token data in current snapshot.</td></tr>`;
        return;
    }
    tableBody.innerHTML = ''; 
    localSnapshotTokens.forEach(token => {
        const tr = document.createElement('tr');

        // Helper to add cells, differentiating between text and HTML content
        const addCell = (content, isHtml = false) => {
            const td = document.createElement('td');
            if (isHtml) {
                td.innerHTML = content; // Use innerHTML for content with HTML tags
            } else {
                td.textContent = content; // Use textContent for plain text
            }
            // Apply text-align center here if all cells in this table need it
            // Or you can add a class to td and style it in CSS
            td.style.textAlign = 'center'; // As per your original table td styling
            return td;
        };

        tr.appendChild(addCell(token.name || 'N/A'));

        // Use the new formatting function for the price
        const priceDisplayOptions = { 
            zeroCountThreshold: 4, 
            significantDigits: 4,
            defaultDisplayDecimals: 6, // How many decimals for "normal" numbers
            minNormalDecimals: 2
        };
        const formattedPrice = formatPriceWithZeroCount(token.base_token_price_usd, priceDisplayOptions);
        tr.appendChild(addCell(formattedPrice, true)); // Pass true because it might contain HTML (<span>)

        tr.appendChild(addCell(token.price_change_percentage_1h ? `${parseFloat(token.price_change_percentage_1h).toFixed(2)}%` : 'N/A'));
        tr.appendChild(addCell(token.price_change_percentage_6h ? `${parseFloat(token.price_change_percentage_6h).toFixed(2)}%` : 'N/A'));
        tr.appendChild(addCell(token.price_change_percentage_24h ? `${parseFloat(token.price_change_percentage_24h).toFixed(2)}%` : 'N/A'));

        const fdv = token.fdv_usd ? Number(parseFloat(String(token.fdv_usd).replace(/[$,]/g, ''))).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }) : 'N/A';
        tr.appendChild(addCell(fdv));

        tableBody.appendChild(tr);
    });
}

// --- Current Round & Ticket Price Display ---
async function updateCurrentRoundDisplay() {
    const roundSpan = document.getElementById(DOM_IDS.currentRound);
    const priceSpan = document.getElementById(DOM_IDS.ticketPrice);
    const salesStatusSpan = document.getElementById(DOM_IDS.salesStatus);
    const roContract = getReadOnlyJansGameContract();

    if (!roContract) {
        if(roundSpan) roundSpan.textContent = "N/A"; if(priceSpan) priceSpan.textContent = "N/A"; if(salesStatusSpan) salesStatusSpan.textContent = "Contract not loaded.";
        return;
    }

    try {
        const newRoundId = await roContract.currentRoundId();
        if ((localCurrentRoundId === null && newRoundId > 0n) || (localCurrentRoundId !== null && newRoundId.toString() !== localCurrentRoundId.toString())) {
            console.log(`MainPageLogic: Round changed from ${localCurrentRoundId ? localCurrentRoundId.toString() : 'N/A'} to ${newRoundId.toString()}. Resetting tx log.`);
            localTicketTransactions = []; // Reset transactions for new round
            localLastFetchedTxBlock = null;
        }
        localCurrentRoundId = newRoundId;
        if (roundSpan) roundSpan.textContent = localCurrentRoundId.toString();

        if (localCurrentRoundId > 0n) {
            const roundData = await roContract.roundsData(localCurrentRoundId);
            if (roundData.startSnapshotSubmitted) {
                const salesDurationSec = await roContract.ticketSalesDurationSeconds();
                const provider = getReadOnlyProvider();
                const latestBlock = await provider.getBlock("latest");

                if (latestBlock.timestamp <= (Number(roundData.startTime) + Number(salesDurationSec))) {
                    const priceNative = await roContract.getCurrentTicketPriceNative();
                    localTicketPriceNativeWei = priceNative;
                    localIsSalesOpen = true;
                    if (priceSpan) priceSpan.textContent = `${ethersInstance.formatUnits(localTicketPriceNativeWei, NATIVE_TARA_DECIMALS)} TARA`;
                     // --- MODIFICATION START ---
                    if (priceSpan) {
                        const priceString = ethersInstance.formatUnits(localTicketPriceNativeWei, NATIVE_TARA_DECIMALS);
                        const priceNumber = parseFloat(priceString);
                        priceSpan.textContent = `${priceNumber.toFixed(2)} TARA`;
                    }
                    // --- MODIFICATION END ---
                    if (salesStatusSpan) { salesStatusSpan.textContent = "Sales OPEN"; salesStatusSpan.className = "status-open"; }
                } else {
                    localTicketPriceNativeWei = null;
                    localIsSalesOpen = false;
                    if (priceSpan) priceSpan.textContent = "Sales Closed";
                    if (salesStatusSpan) { salesStatusSpan.textContent = "Sales CLOSED"; salesStatusSpan.className = "status-closed"; }
                }
            } else {
                localTicketPriceNativeWei = null; localIsSalesOpen = false;
                if (priceSpan) priceSpan.textContent = "Pending Start";
                if (salesStatusSpan) { salesStatusSpan.textContent = "Round Pending Start"; salesStatusSpan.className = "status-pending"; }
            }
        } else {
            localTicketPriceNativeWei = null; localIsSalesOpen = false;
            if (priceSpan) priceSpan.textContent = "N/A (No active round)";
            if (salesStatusSpan) { salesStatusSpan.textContent = "No Active Round"; salesStatusSpan.className = "status-pending"; }
        }
    } catch (error) {
        console.error("MainPageLogic: Error fetching current round/ticket price:", error);
        if(roundSpan) roundSpan.textContent = "Error"; if(priceSpan) priceSpan.textContent = "Error";
        if(salesStatusSpan) { salesStatusSpan.textContent = "Error loading status"; salesStatusSpan.className = "status-error"; }
        localCurrentRoundId = null; localTicketPriceNativeWei = null; localIsSalesOpen = false;
    }
}

// --- Global Stats Display ---
async function updateGlobalStatsDisplay() {
    const roContract = getReadOnlyJansGameContract();
    if (!roContract) return;

    const elements = {
        prizePool: document.getElementById(DOM_IDS.statsPrizePool),
        prizePoolUsd: document.getElementById(DOM_IDS.statsPrizePoolUsd),
        jansBurned: document.getElementById(DOM_IDS.statsJansBurned),
        jansBurnedUsd: document.getElementById(DOM_IDS.statsJansBurnedUsd),
        jansBurnedPercentage: document.getElementById(DOM_IDS.statsJansBurnedPercentage),
        lpBalance: document.getElementById(DOM_IDS.statsLpBalance),
        lpBalanceUsd: document.getElementById(DOM_IDS.statsLpBalanceUsd),
    };

    try {
        // Prize Pool
        const prizePoolRaw = await roContract.prizePoolJANS();
        const prizePoolNum = parseFloat(ethersInstance.formatUnits(prizePoolRaw, JANS_DECIMALS));
        if (elements.prizePool) elements.prizePool.textContent = `${prizePoolNum.toFixed(2)} JANS`;

        // JANS Burned
        const burnedRaw = await roContract.totalJansBurnedInGame();
        const burnedNum = parseFloat(ethersInstance.formatUnits(burnedRaw, JANS_DECIMALS));
        if (elements.jansBurned) elements.jansBurned.textContent = `${burnedNum.toFixed(2)} JANS`;

        // Calculate JANS USD price (dependent on TARA USD and JANS/TARA rate)
        let jansUsdPrice = null;
        if (localTaraUsdPrice && localJansPerTaraRate !== null && localJansPerTaraRate > 0) {
            jansUsdPrice = localTaraUsdPrice / localJansPerTaraRate;
        } else if (localJansPerTaraRate === 0) {
            jansUsdPrice = 0; // JANS has no value if rate is 0
        }

        if (elements.prizePoolUsd) {
            elements.prizePoolUsd.textContent = (jansUsdPrice !== null && prizePoolNum > 0) ? `(${(prizePoolNum * jansUsdPrice).toFixed(2)} USD)` : (prizePoolNum === 0 ? "($0.00 USD)" : "(USD N/A)");
        }
        if (elements.jansBurnedUsd) {
            elements.jansBurnedUsd.textContent = (jansUsdPrice !== null && burnedNum > 0) ? `(${(burnedNum * jansUsdPrice).toFixed(2)} USD)` : (burnedNum === 0 ? "($0.00 USD)" : "(USD N/A)");
        }

        // Burned Percentage
        if (elements.jansBurnedPercentage) {
            const roProvider = getReadOnlyProvider();
            const jansAbi = await getJansTokenABI() || MINIMAL_ERC20_ABI_FOR_BALANCES_TOTALSUPPLY; // Fallback
            const supplyData = await getTokenTotalSupply(roProvider, JANS_TOKEN_ADDRESS, jansAbi, JANS_DECIMALS);
            if (supplyData && supplyData.raw > 0n) {
                const totalNum = parseFloat(supplyData.formatted);
                if (totalNum > 0 && burnedNum >= 0) {
                    elements.jansBurnedPercentage.textContent = `(${(burnedNum / totalNum * 100).toFixed(4)}% of Total)`;
                } else { elements.jansBurnedPercentage.textContent = "(Supply 0)"; }
            } else { elements.jansBurnedPercentage.textContent = "(Supply N/A)"; }
        }

        // LP Token Balance
        if (!localGameLpTokenAddress) { // Fetch if not already fetched
             try { localGameLpTokenAddress = await roContract.GAME_LP_TOKEN(); } catch(e){ console.warn("Could not get game LP token address for stats.");}
        }
        const lpBalRaw = await roContract.getContractLpTokenBalance(); // This is specific to the game contract
        const lpBalNum = parseFloat(ethersInstance.formatUnits(lpBalRaw, LP_TOKEN_DECIMALS));
        if (elements.lpBalance) elements.lpBalance.textContent = `${lpBalNum.toFixed(4)} Game LP`;

        if (elements.lpBalanceUsd && localGameLpTokenAddress && localGameLpTokenAddress !== ethersInstance.ZeroAddress) {
            if (lpBalNum > 0) {
                 const roProvider = getReadOnlyProvider();
                const lpTokenPrice = await getLpTokenPriceUsd(localGameLpTokenAddress, LP_TOKEN_DECIMALS, roProvider, localTaraUsdPrice, localJansPerTaraRate);
                if (lpTokenPrice !== null && lpTokenPrice >= 0) {
                    elements.lpBalanceUsd.textContent = `(${(lpBalNum * lpTokenPrice).toFixed(2)} USD)`;
                } else { elements.lpBalanceUsd.textContent = "(USD Value N/A)"; }
            } else {
                elements.lpBalanceUsd.textContent = "($0.00 USD)";
            }
        } else if (elements.lpBalanceUsd) {
             elements.lpBalanceUsd.textContent = "(LP Address N/A)";
        }

    } catch (error) {
        console.error("MainPageLogic: Error fetching global stats:", error);
        // Potentially set stat elements to "Error"
    }
}


// --- Transaction Log Display (Simplified) ---
async function fetchAndDisplaySimplifiedTransactions() {
    const txListUl = document.getElementById(DOM_IDS.transactionList);
    const roContract = getReadOnlyJansGameContract();
    const roProvider = getReadOnlyProvider();
    console.log("TX_LOG: Attempting to fetch transactions."); // <--- ADD THIS

     if (!roContract || !roProvider || !localCurrentRoundId || localCurrentRoundId === 0n || !txListUl) {
        console.warn("TX_LOG: Bailing early. Conditions:", { // <--- ADD THIS
            roContract: !!roContract,
            roProvider: !!roProvider,
            localCurrentRoundId: localCurrentRoundId ? localCurrentRoundId.toString() : null,
            txListUl: !!txListUl
        });
        if (txListUl && (!localCurrentRoundId || localCurrentRoundId === 0n)) {
            txListUl.innerHTML = '<li>Round not active. No transactions to display.</li>';
        } else if (txListUl) {
            // txListUl.innerHTML = '<li>Loading transactions... (dependencies not ready)</li>';
        }
        return;
    }

    try {
        let fromBlockForQuery;
        const currentBlockNumber = await roProvider.getBlockNumber();
        console.log("TX_LOG: Current block number:", currentBlockNumber); // <--- ADD THIS
        console.log("TX_LOG: localLastFetchedTxBlock:", localLastFetchedTxBlock); // <--- ADD THIS


        if (localLastFetchedTxBlock !== null && localLastFetchedTxBlock < currentBlockNumber) {
            fromBlockForQuery = localLastFetchedTxBlock + 1;
        } else if (localLastFetchedTxBlock === null) { // First fetch for this session or round
            const roundData = await roContract.roundsData(localCurrentRoundId);
            console.log("TX_LOG: First fetch for round. Round data startTime:", roundData.startTime.toString()); // <--- ADD THIS
            if (roundData.startTime > 0n) {
                fromBlockForQuery = Math.max(0, currentBlockNumber - 20000); // Approx last ~2.7 days if 12s blocks
            } else {
                 fromBlockForQuery = Math.max(0, currentBlockNumber - 2000); // Fallback for very new round
            }
        } else { // No new blocks
            console.log("TX_LOG: No new blocks since last fetch."); // <--- ADD THIS
            if (localTicketTransactions.length === 0 && txListUl) txListUl.innerHTML = '<li>No new ticket purchases logged in this period.</li>'; // Modified message slightly
            return; 
        }
        fromBlockForQuery = Math.max(0, fromBlockForQuery);

        console.log(`TX_LOG: Fetching TicketPurchased events for round ${localCurrentRoundId.toString()} from block ${fromBlockForQuery} to ${currentBlockNumber}`); // <--- MODIFIED THIS
        const eventFilter = roContract.filters.TicketPurchased(localCurrentRoundId);
        const events = await roContract.queryFilter(eventFilter, fromBlockForQuery, currentBlockNumber);
        console.log("TX_LOG: Fetched events:", events); // <--- ADD THIS
        
        let newTxFound = false;
        for (const event of events) {
            console.log("TX_LOG: Processing event:", event); // <--- ADD THIS
            if (!localTicketTransactions.find(tx => tx.txHash === event.transactionHash && tx.ticketId.toString() === event.args.ticketId.toString())) {
                try { // <--- ADD TRY-CATCH for event.getBlock()
                    const block = await event.getBlock(); 
                    console.log("TX_LOG: Fetched block for event, timestamp:", block.timestamp); // <--- ADD THIS
                    localTicketTransactions.push({ 
                        player: event.args.player,
                        timestamp: Number(block.timestamp), 
                        txHash: event.transactionHash, 
                        ticketId: event.args.ticketId 
                    });
                    newTxFound = true;
                } catch (blockError) {
                    console.error("TX_LOG: Error fetching block for event:", blockError, event); // <--- ADD THIS
                }
            } else {
                console.log("TX_LOG: Duplicate event found, skipping:", event.transactionHash); // <--- ADD THIS
            }
        }
        
        if (newTxFound) {
            console.log("TX_LOG: New transactions found, sorting and rendering."); // <--- ADD THIS
            localTicketTransactions.sort((a, b) => b.timestamp - a.timestamp); 
            renderSimplifiedTransactionList();
        } else if (localTicketTransactions.length === 0 && events.length === 0) {
            console.log("TX_LOG: No new transactions and no existing local transactions for this round."); // <--- ADD THIS
            txListUl.innerHTML = '<li>No ticket purchases yet for this round.</li>';
        } else {
            console.log("TX_LOG: No new transactions found, but local transactions might exist or fetched events were duplicates."); // <--- ADD THIS
            // If localTicketTransactions is not empty, it means renderSimplifiedTransactionList was called before or will be called if newTxFound was true.
            // If it is empty, and newTxFound is false, but events.length > 0 (meaning all were duplicates), it could also mean "No new ticket purchases".
            if (txListUl.innerHTML.includes('Loading') || localTicketTransactions.length === 0) { // Avoid overwriting existing list if nothing new
                 if(events.length > 0 && !newTxFound) { // All fetched events were duplicates
                     txListUl.innerHTML = '<li>No *new* ticket purchases logged.</li>';
                 } else if (localTicketTransactions.length > 0 && !newTxFound) {
                    // List already showing older tx, do nothing or just log
                 }
                 else { // Default for empty and no new events
                     txListUl.innerHTML = '<li>No ticket purchases logged for this round in this period.</li>';
                 }
            }
        }
        localLastFetchedTxBlock = currentBlockNumber;
        console.log("TX_LOG: Updated localLastFetchedTxBlock to:", localLastFetchedTxBlock); // <--- ADD THIS
    } catch (error) { 
        console.error("TX_LOG: Failed to fetch ticket transactions:", error); // <--- MODIFIED THIS
        if(txListUl && localTicketTransactions.length === 0) txListUl.innerHTML = '<li>Error loading transactions.</li>'; 
    }
}

function renderSimplifiedTransactionList() {
    const ulElement = document.getElementById(DOM_IDS.transactionList);
    if (!ulElement) return;
    
    ulElement.innerHTML = ''; // Clear previous
    if (localTicketTransactions.length === 0) {
        ulElement.innerHTML = '<li>No ticket purchases recorded.</li>';
        return;
    }
    const maxToShow = 10; // Show latest N transactions
    const transactionsToDisplay = localTicketTransactions.slice(0, maxToShow);

    transactionsToDisplay.forEach(tx => {
        const li = document.createElement('li');
        const date = new Date(tx.timestamp * 1000);
        // More concise time format
        const timeString = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
        
        li.innerHTML = `${timeString} - Wallet: ${shortenAddress(tx.player, 4)}`;
        // --- MODIFICATION START ---
        const randomColor = generateUniqueRandomColor();
        li.style.backgroundColor = randomColor;
        li.style.color = '#fff'; // Optional: to ensure text is readable

        // --- MODIFICATION END ---
        // Optionally, add a link to explorer if you have tx.txHash
        // li.innerHTML = `${timeString} - Wallet: <a href="YOUR_EXPLORER_URL/tx/${tx.txHash}" target="_blank">${shortenAddress(tx.player, 4)}</a>`;
        li.style.cssText = "padding: 3px 0; font-size: 0.8em;"; // Example styling
        ulElement.appendChild(li);
    });
}


// --- Daily Log List Display ---
async function displayDailyLogLinks() {
    const logLinksContainer = document.getElementById(DOM_IDS.dailyLogLinksContainer);
    if (!logLinksContainer) { console.warn("MainPageLogic: Daily log links container not found."); return; }
    logLinksContainer.innerHTML = '<span>Loading log list...</span>';

    try {
        const logIndex = await fetchJsonFile(DAILY_LOG_INDEX_FILE); // Uses service from wallet.js
        if (logIndex && Array.isArray(logIndex) && logIndex.length > 0) {
            logLinksContainer.innerHTML = ''; // Clear loading message
            // Sort logs by date descending if needed, assuming `logEntry.date` is YYYY-MM-DD
            logIndex.sort((a,b) => b.date.localeCompare(a.date)); 

            logIndex.forEach(logEntry => {
                const link = document.createElement('a');
                link.href = `view_log_page.html?logFile=${encodeURIComponent(logEntry.file)}`;
                link.textContent = `Log: ${logEntry.date}`;
                link.target = "_blank"; // Open in new tab
                link.style.display = "block"; link.style.marginBottom = "5px";
                logLinksContainer.appendChild(link);
            });
        } else {
            logLinksContainer.innerHTML = '<span>No daily logs found.</span>';
        }
    } catch (error) {
        console.error("MainPageLogic: Error loading or displaying daily log links:", error);
        logLinksContainer.innerHTML = '<span style="color:red;">Error loading log list.</span>';
    }
}

// --- UI Timers ---
function initializeUiTimers() {
    const updateAllTimes = () => {
        updateSnapshotTimeDisplay();
        updateCountdownTimerDisplay();
        updateCurrentTimeUtcDisplay();
    };
    updateAllTimes();
    setInterval(updateAllTimes, 1000); // Update every second
}

function updateSnapshotTimeDisplay() {
    const span = document.getElementById(DOM_IDS.snapshotTimestamp);
    if (!span) return;
    const now = new Date();
    const snapshotTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 21, 0, 0, 0));
    if (now.getUTCHours() < 21 && now.getUTCDate() === snapshotTime.getUTCDate()) { // If today but before 21:00 UTC
        snapshotTime.setUTCDate(snapshotTime.getUTCDate() - 1); // Show previous day's 21:00 UTC
    } else if (now.getUTCHours() >= 21 && now.getUTCDate() !== snapshotTime.getUTCDate()) {
        // This case handles if the date has rolled over past midnight UTC but it's still before 21:00 UTC on the new day
        // It's a bit tricky, usually the above logic is fine if we assume the snapshot *for* a day is generated AT 21:00 UTC of that day.
        // For "latest available snapshot was for date X at 21:00 UTC"
    }
    span.textContent = snapshotTime.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
}

function updateCountdownTimerDisplay() {
    const span = document.getElementById(DOM_IDS.countdownTimer);
    if (!span) return;
    const now = new Date();
    let targetTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 21, 0, 0, 0));
    if (now.getTime() >= targetTime.getTime()) { // If past 21:00 UTC today, target next day's 21:00 UTC
        targetTime.setUTCDate(targetTime.getUTCDate() + 1);
    }
    const diff = targetTime.getTime() - now.getTime();
    if (diff < 0) { span.textContent = "Calculating..."; return; }
    const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    span.textContent = `${h}h ${m}m ${s}s`;
}

function updateCurrentTimeUtcDisplay() {
    const span = document.getElementById(DOM_IDS.currentTimeDisplay);
    if (!span) return;
    span.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }) + " UTC";
}

// --- Fallback Error Display ---
function updateAllDisplaysOnError(message = "Error") {
    const idsToUpdate = [
        DOM_IDS.currentRound, DOM_IDS.ticketPrice, DOM_IDS.salesStatus,
        DOM_IDS.statsPrizePool, DOM_IDS.statsJansBurned, DOM_IDS.statsLpBalance
    ];
    idsToUpdate.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = message;
    });
    const usdSpans = [
        DOM_IDS.statsPrizePoolUsd, DOM_IDS.statsJansBurnedUsd, DOM_IDS.statsLpBalanceUsd,
        DOM_IDS.statsJansBurnedPercentage
    ];
    usdSpans.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = ""; // Clear USD values on error
    });
     const txList = document.getElementById(DOM_IDS.transactionList);
     if(txList) txList.innerHTML = `<li>${message} loading transactions.</li>`;
     const snapshotBody = document.getElementById(DOM_IDS.snapshotTableBody);
     if(snapshotBody) snapshotBody.innerHTML = `<tr><td colspan="6">${message} loading snapshot.</td></tr>`;
     const logLinks = document.getElementById(DOM_IDS.dailyLogLinksContainer);
     if(logLinks) logLinks.innerHTML = `<span>${message} loading logs.</span>`;

    const buyBtn = document.getElementById(DOM_IDS.buyTicketButton);
    if (buyBtn) buyBtn.disabled = true;
}


// --- Main Event Listener ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded for Main Page. Attempting to initialize logic...");
    // Ethers.js is usually loaded via CDN and available on window object.
    // This script is type="module", so window.ethers might not be immediately available
    // if the CDN script for ethers is also loaded async or defer.
    // A common pattern is to have a global event 'ethersReady' or check in a loop.

    function attemptInit() {
        if (window.ethers && !localIsAppInitialized) {
            initializeMainPage().catch(err => {
                console.error("Error during initial page load sequence:", err);
                showGlobalMessage(`Initialization failed: ${err.message}`, "error", 0, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
                updateAllDisplaysOnError("Init Error");
            });
        } else if (localIsAppInitialized) {
            console.log("Main Page Logic: Already initialized.");
        }
         else {
            console.warn("MainPageLogic: Ethers.js not found on window. Waiting...");
            showGlobalMessage("Loading blockchain library...", "info", 0, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
            setTimeout(attemptInit, 500); // Retry after a short delay
        }
    }
    attemptInit();
});