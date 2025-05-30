// --- main_page_logic.js ---
// Handles primary display of read-only game info, snapshot, logs list, simplified transactions, and UI timers.

import {
    // Ethers Core & Setup from wallet.js
    initializeEthersCore,
    getReadOnlyProvider,
    getReadOnlyJansGameContract,
    connectWalletAndGetSignerInstances,
    ethersInstance,

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
    COINGECKO_TARA_PRICE_URL,

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
    // MINIMAL_ERC20_ABI_FOR_BALANCES_TOTALSUPPLY, // Not used directly in this version
    // LP_PAIR_ABI // Not used directly in this version
} from './wallet.js';

// Import for Ticket Modal
import { openTicketPurchaseModal } from './ticket_modal_logic.js';

// --- Configuration ---
const SNAPSHOT_FILE_PATH = './data/snapshots/latest_snapshot.json';
const DAILY_LOG_INDEX_FILE = './data/dailylogs_v8/index.json';
const POOLS_TO_SELECT = 10;
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

// --- DOM Element ID Constants ---
const DOM_IDS = {
    currentRound: "current-round",
    ticketPrice: "ticket-price",
    salesStatus: "sales-status-message",
    snapshotTableBody: "token-table-body",        // Desktop table
    buyTicketButton: "buy-ticket-button",         // Desktop buy button
    statsPrizePool: "stats-prize-pool",
    statsPrizePoolUsd: "stats-prize-pool-usd",
    statsJansBurned: "stats-jans-burned",
    statsJansBurnedUsd: "stats-jans-burned-usd",
    statsJansBurnedPercentage: "stats-jans-burned-percentage",
    statsLpBalance: "stats-lp-balance",
    statsLpBalanceUsd: "stats-lp-balance-usd",
    transactionList: "transaction-list",
    dailyLogLinksContainer: "daily-log-list",
    snapshotTimestamp: "snapshot-time",
    countdownTimer: "time-remaining",
    currentTimeDisplay: "current-time-utc"
};

const DOM_IDS_MOBILE = {
    mobileTokenTableBody: "mobile-token-table-body",    // Mobile table
    mobileLastTransaction: "mobile-last-transaction",
    mobileBuyTicketButton: "mobile-buy-ticket-button"  // Mobile buy button
};

// --- Helper Functions ---
function getRandomHexColor() { // Renamed from generateUniqueRandomColor for clarity
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += Math.floor(Math.random() * 16).toString(16);
    }
    return color;
}

// --- Initialization ---
async function initializeMainPage() {
    if (localIsAppInitialized) return;
    console.log("MainPageLogic: Initializing...");

    try {
        if (!window.ethers) {
            showGlobalMessage("Ethers.js (blockchain library) not found. Page cannot operate.", "error", 0, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
            throw new Error("Ethers.js not loaded on window.");
        }
        await initializeEthersCore(window.ethers);
        console.log("MainPageLogic: Ethers core initialized via wallet.js.");

        await loadAndDisplaySnapshotTable();
        await displayDailyLogLinks();
        await refreshAllPageData();

        setInterval(refreshAllPageData, DATA_REFRESH_INTERVAL_MS);
        initializeUiTimers();

        // Setup event listeners for buy buttons
        const buyBtnDesktop = document.getElementById(DOM_IDS.buyTicketButton);
        if (buyBtnDesktop) {
            buyBtnDesktop.addEventListener('click', handleBuyTicketClick);
        } else {
            console.warn(`MainPageLogic: Buy ticket button (desktop) with ID '${DOM_IDS.buyTicketButton}' not found.`);
        }
        
        const buyBtnMobile = document.getElementById(DOM_IDS_MOBILE.mobileBuyTicketButton);
        if (buyBtnMobile) {
            buyBtnMobile.addEventListener('click', handleBuyTicketClick);
        } else {
            console.warn(`MainPageLogic: Buy ticket button (mobile) ID '${DOM_IDS_MOBILE.mobileBuyTicketButton}' not found. Ensure this button ID exists in your mobile HTML.`);
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

function handleBuyTicketClick() {
    if (!localIsSalesOpen || !localSnapshotTokens || localSnapshotTokens.length !== POOLS_TO_SELECT || localTicketPriceNativeWei === null) {
        let message = "Cannot buy ticket: ";
        if (!localIsSalesOpen) message += "Sales are currently closed. ";
        if (!localSnapshotTokens || localSnapshotTokens.length !== POOLS_TO_SELECT) message += "Snapshot data not ready. ";
        if (localTicketPriceNativeWei === null) message += "Ticket price not available. ";
        showGlobalMessage(message.trim(), "warning", 7000, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
        return;
    }
    console.log("MainPageLogic: 'Buy Ticket' clicked. Opening modal...");
    openTicketPurchaseModal(localSnapshotTokens, localTicketPriceNativeWei);
}

// --- Data Fetching Orchestration ---
async function refreshAllPageData() {
    if (!getReadOnlyJansGameContract()) {
        console.warn("MainPageLogic: Read-only contract not available, skipping refresh cycle.");
        return;
    }
    // console.log("MainPageLogic: Refreshing all page data..."); // Can be noisy
    try {
        localTaraUsdPrice = await fetchTaraUsdPriceFromCoinGecko();
        const roProvider = getReadOnlyProvider();
        if (roProvider) {
            localJansPerTaraRate = await getJansPerTaraFromDEX(roProvider);
        } else {
            console.warn("MainPageLogic: ReadOnlyProvider not available for JANS/TARA rate fetch.");
        }

        await updateCurrentRoundDisplay();
        await Promise.all([
            updateGlobalStatsDisplay(),
            fetchAndDisplaySimplifiedTransactions(),
        ]);
        // console.log("MainPageLogic: Page data refreshed."); // Can be noisy
    } catch (error) {
        console.error("MainPageLogic: Error during data refresh:", error);
        showGlobalMessage("Error refreshing some page data.", "warning", 5000, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
    }
}

// --- Snapshot Display ---
async function loadAndDisplaySnapshotTable() {
    const desktopTableBody = document.getElementById(DOM_IDS.snapshotTableBody);
    const mobileTableBody = document.getElementById(DOM_IDS_MOBILE.mobileTokenTableBody);

    if (desktopTableBody) {
        desktopTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Loading snapshot...</td></tr>`;
    }
    if (mobileTableBody) {
        mobileTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Loading snapshot...</td></tr>`;
    }

    try {
        const data = await fetchJsonFile(SNAPSHOT_FILE_PATH);
        if (data && Array.isArray(data)) {
            localSnapshotTokens = data.map(token => ({ ...token, prediction: undefined }));
            if (localSnapshotTokens.length !== POOLS_TO_SELECT && POOLS_TO_SELECT > 0) {
                console.warn(`MainPageLogic: Snapshot has ${localSnapshotTokens.length} tokens, expected ${POOLS_TO_SELECT}.`);
            }
            // console.log("MainPageLogic: Snapshot loaded:", localSnapshotTokens.length, "tokens."); // Can be noisy

            if (desktopTableBody) renderDesktopSnapshotTable();
            if (mobileTableBody) renderMobileSnapshotTable();
        } else {
            throw new Error("Snapshot data is not a valid array or is null.");
        }
    } catch (error) {
        console.error("MainPageLogic: Failed to load or parse snapshot:", error);
        const errorMsg = `<tr><td colspan="6" style="color:red;">Error loading snapshot: ${error.message}</td></tr>`;
        const errorMsgMobile = `<tr><td colspan="3" style="color:red;">Error loading snapshot: ${error.message}</td></tr>`;
        if (desktopTableBody) desktopTableBody.innerHTML = errorMsg;
        if (mobileTableBody) mobileTableBody.innerHTML = errorMsgMobile;
        localSnapshotTokens = [];
    }
}

function renderDesktopSnapshotTable() {
    const tableBody = document.getElementById(DOM_IDS.snapshotTableBody);
    if (!tableBody) { // Should have been checked by caller, but good practice
        console.warn("MainPageLogic: Desktop snapshot table body not found for render.");
        return;
    }

    if (!localSnapshotTokens || localSnapshotTokens.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No token data in current snapshot.</td></tr>`;
        return;
    }
    tableBody.innerHTML = '';
    localSnapshotTokens.forEach(token => {
        const tr = document.createElement('tr');
        const addCell = (content, isHtml = false, textAlign = 'center') => {
            const td = document.createElement('td');
            if (isHtml) { td.innerHTML = content; } else { td.textContent = content; }
            td.style.textAlign = textAlign;
            return td;
        };

        let baseTokenName = token.name || 'N/A';
        if (baseTokenName.includes('/')) {
            baseTokenName = baseTokenName.split('/')[0].trim();
        }
        tr.appendChild(addCell(baseTokenName, false, 'left'));

        const priceDisplayOptions = {
            zeroCountThreshold: 4, significantDigits: 4,
            defaultDisplayDecimals: 6, minNormalDecimals: 2
        };
        const formattedPrice = formatPriceWithZeroCount(token.base_token_price_usd, priceDisplayOptions);
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
    if (!mobileTableBody) { // Should have been checked by caller
        console.warn("MainPageLogic: Mobile snapshot table body not found for render.");
        return;
    }

    if (!localSnapshotTokens || localSnapshotTokens.length === 0) {
        mobileTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">No token data.</td></tr>`;
        return;
    }
    mobileTableBody.innerHTML = '';
    localSnapshotTokens.forEach(token => {
        const tr = document.createElement('tr');
        const addCell = (content, isHtml = false, textAlign = 'center') => {
            const td = document.createElement('td');
            if (isHtml) { td.innerHTML = content; } else { td.textContent = content; }
            td.style.textAlign = textAlign;
            return td;
        };

        let baseTokenName = token.name || 'N/A';
        if (baseTokenName.includes('/')) {
            baseTokenName = baseTokenName.split('/')[0].trim();
        }
        tr.appendChild(addCell(baseTokenName, false, 'left'));

        const priceDisplayOptions = {
            zeroCountThreshold: 4, significantDigits: 4,
            defaultDisplayDecimals: 6, minNormalDecimals: 2
        };
        const formattedPrice = formatPriceWithZeroCount(token.base_token_price_usd, priceDisplayOptions);
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
        return;
    }

    try {
        const newRoundId = await roContract.currentRoundId();
        if ((localCurrentRoundId === null && newRoundId > 0n) || (localCurrentRoundId !== null && newRoundId.toString() !== localCurrentRoundId.toString())) {
            console.log(`MainPageLogic: Round changed from ${localCurrentRoundId ? localCurrentRoundId.toString() : 'N/A'} to ${newRoundId.toString()}. Resetting tx log.`);
            localTicketTransactions = [];
            localLastFetchedTxBlock = null;
        }
        localCurrentRoundId = newRoundId;
        if (roundSpan) roundSpan.textContent = localCurrentRoundId > 0n ? localCurrentRoundId.toString() : "0 (None Active)";

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
                    if (priceSpan) {
                        const priceString = ethersInstance.formatUnits(localTicketPriceNativeWei, NATIVE_TARA_DECIMALS);
                        const priceNumber = parseFloat(priceString);
                        priceSpan.textContent = `${priceNumber.toFixed(Math.min(8, Math.max(2, (priceString.split('.')[1] || '').length)))} TARA`; // Dynamic decimals
                    }
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
            if (priceSpan) priceSpan.textContent = "N/A";
            if (salesStatusSpan) { salesStatusSpan.textContent = "No Active Round"; salesStatusSpan.className = "status-pending"; }
        }
    } catch (error) {
        console.error("MainPageLogic: Error fetching current round/ticket price:", error);
        if(roundSpan) roundSpan.textContent = "Error";
        if(priceSpan) priceSpan.textContent = "Error";
        if(salesStatusSpan) { salesStatusSpan.textContent = "Error loading status"; salesStatusSpan.className = "status-error"; }
        localCurrentRoundId = null; localTicketPriceNativeWei = null; localIsSalesOpen = false;
    }
}

// --- Global Stats Display ---
async function updateGlobalStatsDisplay() {
    const roContract = getReadOnlyJansGameContract();
    if (!roContract) return;

    const elements = { /* ... Tu objeto elements ... */ }; 
    // (Código de updateGlobalStatsDisplay se mantiene igual, asegúrate de que `elements` se defina como antes)
    // Ejemplo de cómo estaba (asegúrate que sea igual o mejorado):
    // const elements = {
    //     prizePool: document.getElementById(DOM_IDS.statsPrizePool),
    //     prizePoolUsd: document.getElementById(DOM_IDS.statsPrizePoolUsd),
    //     jansBurned: document.getElementById(DOM_IDS.statsJansBurned),
    //     // ... y todos los demás elementos ...
    // };
    // TU LÓGICA COMPLETA DE updateGlobalStatsDisplay VA AQUÍ
    // Por brevedad, no la repito, pero debe estar aquí.
    // ... (el código que ya tenías para prizePool, jansBurned, LP balance, etc.) ...
    // Asegúrate de que la lógica para calcular jansUsdPrice y lpTokenPriceUsd también esté aquí.
    // Ejemplo de cómo se recuperan los elementos:
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
        // Prize Pool
        const prizePoolRaw = await roContract.prizePoolJANS();
        const prizePoolNum = parseFloat(ethersInstance.formatUnits(prizePoolRaw, JANS_DECIMALS));
        if (statElements.prizePool) statElements.prizePool.textContent = `${prizePoolNum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} JANS`;

        // JANS Burned
        const burnedRaw = await roContract.totalJansBurnedInGame();
        const burnedNum = parseFloat(ethersInstance.formatUnits(burnedRaw, JANS_DECIMALS));
        if (statElements.jansBurned) statElements.jansBurned.textContent = `${burnedNum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} JANS`;

        let jansUsdPrice = null;
        if (localTaraUsdPrice && localJansPerTaraRate !== null && localJansPerTaraRate > 0) {
            jansUsdPrice = localTaraUsdPrice / localJansPerTaraRate;
        } else if (localJansPerTaraRate === 0) {
            jansUsdPrice = 0;
        }

        if (statElements.prizePoolUsd) {
            statElements.prizePoolUsd.textContent = (jansUsdPrice !== null && prizePoolNum > 0) ? `(${(prizePoolNum * jansUsdPrice).toLocaleString(undefined, { style: 'currency', currency: 'USD' })})` : (prizePoolNum === 0 ? "($0.00 USD)" : "(USD N/A)");
        }
        if (statElements.jansBurnedUsd) {
            statElements.jansBurnedUsd.textContent = (jansUsdPrice !== null && burnedNum > 0) ? `(${(burnedNum * jansUsdPrice).toLocaleString(undefined, { style: 'currency', currency: 'USD' })})` : (burnedNum === 0 ? "($0.00 USD)" : "(USD N/A)");
        }

        if (statElements.jansBurnedPercentage) {
            const roProvider = getReadOnlyProvider();
            const jansAbi = await getJansTokenABI(); // Ya no usa MINIMAL_ERC20_ABI...
            const supplyData = await getTokenTotalSupply(roProvider, JANS_TOKEN_ADDRESS, jansAbi, JANS_DECIMALS);
            if (supplyData && supplyData.raw > 0n) {
                const totalNum = parseFloat(supplyData.formatted);
                if (totalNum > 0 && burnedNum >= 0) {
                    statElements.jansBurnedPercentage.textContent = `(${(burnedNum / totalNum * 100).toFixed(4)}% of Total)`;
                } else { statElements.jansBurnedPercentage.textContent = "(Supply 0)"; }
            } else { statElements.jansBurnedPercentage.textContent = "(Supply N/A)"; }
        }

        if (!localGameLpTokenAddress) {
            try { localGameLpTokenAddress = await roContract.GAME_LP_TOKEN(); } catch(e){ console.warn("Could not get game LP token address for stats.");}
        }
        const lpBalRaw = await roContract.getContractLpTokenBalance();
        const lpBalNum = parseFloat(ethersInstance.formatUnits(lpBalRaw, LP_TOKEN_DECIMALS));
        if (statElements.lpBalance) statElements.lpBalance.textContent = `${lpBalNum.toFixed(4)} Game LP`;

        if (statElements.lpBalanceUsd && localGameLpTokenAddress && localGameLpTokenAddress !== ethersInstance.ZeroAddress) {
            if (lpBalNum > 0) {
                const roProvider = getReadOnlyProvider();
                const lpTokenPrice = await getLpTokenPriceUsd(localGameLpTokenAddress, LP_TOKEN_DECIMALS, roProvider, localTaraUsdPrice, localJansPerTaraRate);
                if (lpTokenPrice !== null && lpTokenPrice >= 0) {
                    statElements.lpBalanceUsd.textContent = `(${(lpBalNum * lpTokenPrice).toLocaleString(undefined, { style: 'currency', currency: 'USD' })})`;
                } else { statElements.lpBalanceUsd.textContent = "(USD Value N/A)"; }
            } else {
                statElements.lpBalanceUsd.textContent = "($0.00 USD)";
            }
        } else if (statElements.lpBalanceUsd) {
            statElements.lpBalanceUsd.textContent = "(LP Address N/A)";
        }
    } catch (error) {
        console.error("MainPageLogic: Error fetching global stats:", error);
    }
}

// --- Transaction Log Display ---
async function fetchAndDisplaySimplifiedTransactions() {
    const txListUl = document.getElementById(DOM_IDS.transactionList);
    const mobileLastTxDiv = document.getElementById(DOM_IDS_MOBILE.mobileLastTransaction);
    const roContract = getReadOnlyJansGameContract();
    const roProvider = getReadOnlyProvider();

    if (!roContract || !roProvider || (!txListUl && !mobileLastTxDiv)) {
        // console.warn("TX_LOG: Dependencies not ready or UI elements missing. Skipping tx fetch.");
        return;
    }
    if (!localCurrentRoundId || localCurrentRoundId === 0n) {
        if (localTicketTransactions.length > 0) { // Clear if round became inactive
            localTicketTransactions = [];
            localLastFetchedTxBlock = null;
            if (txListUl) txListUl.innerHTML = '<li>Round not active.</li>';
            if (mobileLastTxDiv) mobileLastTxDiv.innerHTML = 'Round not active.';
        } else { // If already empty and round not active, ensure placeholder is there
             if (txListUl && !txListUl.innerHTML.includes('Round not active')) txListUl.innerHTML = '<li>Round not active.</li>';
             if (mobileLastTxDiv && !mobileLastTxDiv.innerHTML.includes('Round not active')) mobileLastTxDiv.innerHTML = 'Round not active.';
        }
        return;
    }

    try {
        let fromBlockForQuery;
        const currentBlockNumber = await roProvider.getBlockNumber();

        if (localLastFetchedTxBlock !== null && localLastFetchedTxBlock < currentBlockNumber) {
            fromBlockForQuery = localLastFetchedTxBlock + 1;
        } else if (localLastFetchedTxBlock === null) {
            const roundData = await roContract.roundsData(localCurrentRoundId);
            fromBlockForQuery = (roundData.startTime > 0n) ? Math.max(0, currentBlockNumber - 70000) : Math.max(0, currentBlockNumber - 5000); // Wider initial range for round start
        } else { // No new blocks
            if (localTicketTransactions.length > 0) renderMobileLastTransaction(); // Ensure mobile is up-to-date
            return; // No new blocks, nothing to fetch
        }
        fromBlockForQuery = Math.max(0, fromBlockForQuery);

        const eventFilter = roContract.filters.TicketPurchased(localCurrentRoundId);
        const events = await roContract.queryFilter(eventFilter, fromBlockForQuery, currentBlockNumber);
        
        let newTxFound = false;
        for (const event of events) {
            if (!localTicketTransactions.some(tx => tx.txHash === event.transactionHash && tx.ticketId.toString() === event.args.ticketId.toString())) {
                try {
                    const block = await event.getBlock();
                    localTicketTransactions.push({ 
                        player: event.args.player,
                        timestamp: Number(block.timestamp), 
                        txHash: event.transactionHash, 
                        ticketId: event.args.ticketId 
                    });
                    newTxFound = true;
                } catch (blockError) {
                    console.error("TX_LOG: Error fetching block for event:", blockError, "TX Hash:", event.transactionHash);
                }
            }
        }
        
        if (newTxFound) {
            localTicketTransactions.sort((a, b) => b.timestamp - a.timestamp);
            if (txListUl) renderDesktopTransactionList();
            renderMobileLastTransaction();
        } else if (localTicketTransactions.length === 0 && events.length === 0) {
            if(txListUl) txListUl.innerHTML = '<li>No ticket purchases yet for this round.</li>';
            if (mobileLastTxDiv) mobileLastTxDiv.innerHTML = 'No ticket purchases yet for this round.';
        } else if (localTicketTransactions.length > 0 && !newTxFound) {
            renderMobileLastTransaction(); // Ensure mobile is up-to-date even if no new Txs
        }

        localLastFetchedTxBlock = currentBlockNumber;
    } catch (error) { 
        console.error("TX_LOG: Failed to fetch/process transactions:", error);
        if(txListUl && localTicketTransactions.length === 0) txListUl.innerHTML = '<li>Error loading txs.</li>';
        if (mobileLastTxDiv && localTicketTransactions.length === 0) mobileLastTxDiv.innerHTML = 'Error loading tx.';
    }
}

function renderDesktopTransactionList() { // Renamed for clarity
    const ulElement = document.getElementById(DOM_IDS.transactionList);
    if (!ulElement) return;
    
    ulElement.innerHTML = '';
    if (localTicketTransactions.length === 0) {
        ulElement.innerHTML = '<li>No ticket purchases recorded.</li>';
        return;
    }
    const maxToShow = 10;
    const transactionsToDisplay = localTicketTransactions.slice(0, maxToShow);

    transactionsToDisplay.forEach(tx => {
        const li = document.createElement('li');
        const date = new Date(tx.timestamp * 1000);
        const timeString = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
        
        const playerShort = shortenAddress(tx.player, 4);
        li.innerHTML = `${timeString} - Wallet: <span title="${tx.player}">${playerShort}</span>`;
        
        const randomColor = getRandomHexColor(); // Renamed earlier
        li.style.backgroundColor = randomColor;
        li.style.color = '#fff'; // Example: White text for colored background
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
        mobileTxDiv.innerHTML = 'No purchases this round.';
        return;
    }
    const lastTx = localTicketTransactions[0]; // Assumes sorted by timestamp desc
    const date = new Date(lastTx.timestamp * 1000);
    const timeString = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
    const playerShort = shortenAddress(lastTx.player, 4);
    mobileTxDiv.innerHTML = `Latest: ${timeString} - Wallet <span title="${lastTx.player}">${playerShort}</span>`;
}

// --- Daily Log List Display ---
async function displayDailyLogLinks() {
    const logLinksContainer = document.getElementById(DOM_IDS.dailyLogLinksContainer);
    if (!logLinksContainer) { console.warn("MainPageLogic: Daily log links container not found."); return; }
    logLinksContainer.innerHTML = '<span>Loading log list...</span>';

    try {
        const logIndex = await fetchJsonFile(DAILY_LOG_INDEX_FILE);
        if (logIndex && Array.isArray(logIndex) && logIndex.length > 0) {
            logLinksContainer.innerHTML = '';
            logIndex.sort((a,b) => b.date.localeCompare(a.date)); 

            logIndex.forEach(logEntry => {
                const li = document.createElement('li'); // Changed to li for semantics with ul
                const link = document.createElement('a');
                // Assuming logEntry.file is like "snapshot_history_YYYY-MM-DD.json"
                // and these files are in the same directory as index.json (e.g., ./data/dailylogs_v8/)
                link.href = `view_log_page.html?logFile=dailylogs_v8/${encodeURIComponent(logEntry.file)}`;
                link.textContent = `Log: ${logEntry.date}`;
                if(logEntry.roundStartedId || logEntry.roundClosedId){
                    link.textContent += ` (R${logEntry.roundStartedId || 'N/A'} Start / R${logEntry.roundClosedId || 'N/A'} End)`;
                }
                link.target = "_blank";
                li.appendChild(link);
                logLinksContainer.appendChild(li);
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
        updateSnapshotTimeDisplay(); // Shows last 21:00 UTC
        updateCountdownTimerDisplay(); // Counts down to next 21:00 UTC
        // updateCurrentTimeUtcDisplay(); // Removed as it might be redundant if countdown implies it
    };
    updateAllTimes(); // Initial call
    setInterval(updateAllTimes, 1000); // Update every second
}

function updateSnapshotTimeDisplay() { // This function shows the timestamp OF THE LAST SNAPSHOT (assumed 21:00 UTC of current or previous day)
    const span = document.getElementById(DOM_IDS.snapshotTimestamp);
    if (!span) return;

    const now = new Date();
    let snapshotForDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 21, 0, 0, 0));

    if (now.getUTCHours() < 21) { // If it's currently before 21:00 UTC today
        snapshotForDate.setUTCDate(snapshotForDate.getUTCDate() - 1); // The latest snapshot available is from yesterday 21:00 UTC
    }
    // If it's 21:00 UTC or later today, snapshotForDate correctly refers to today at 21:00 UTC

    span.textContent = snapshotForDate.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + " UTC";
}

function updateCountdownTimerDisplay() { // This counts down TO THE NEXT 21:00 UTC
    const span = document.getElementById(DOM_IDS.countdownTimer);
    if (!span) return;

    const now = new Date();
    let nextSnapshotTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 21, 0, 0, 0));

    if (now.getTime() >= nextSnapshotTime.getTime()) { // If current time is past or at 21:00 UTC today
        nextSnapshotTime.setUTCDate(nextSnapshotTime.getUTCDate() + 1); // Target tomorrow's 21:00 UTC
    }

    const diff = nextSnapshotTime.getTime() - now.getTime();

    if (diff < 0) { // Should not happen if logic above is correct
        span.textContent = "Calculating...";
        return;
    }

    const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    span.textContent = `${h}h ${m}m ${s}s`;
}

// function updateCurrentTimeUtcDisplay() { // This was the third timer, consider if needed.
//     const span = document.getElementById(DOM_IDS.currentTimeDisplay);
//     if (!span) return;
//     span.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }) + " UTC";
// }

// --- Fallback Error Display ---
function updateAllDisplaysOnError(message = "Error") {
    const idsToUpdate = [
        DOM_IDS.currentRound, DOM_IDS.ticketPrice, DOM_IDS.salesStatus,
        DOM_IDS.statsPrizePool, DOM_IDS.statsJansBurned, DOM_IDS.statsLpBalance,
        DOM_IDS.snapshotTimestamp, DOM_IDS.countdownTimer
    ];
    idsToUpdate.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = message;
    });
    const secondarySpans = [ // Spans that show derived data like USD values
        DOM_IDS.statsPrizePoolUsd, DOM_IDS.statsJansBurnedUsd, DOM_IDS.statsLpBalanceUsd,
        DOM_IDS.statsJansBurnedPercentage
    ];
    secondarySpans.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = "";
    });

    const txList = document.getElementById(DOM_IDS.transactionList);
    if(txList) txList.innerHTML = `<li>${message} loading txs.</li>`;
    const mobileTx = document.getElementById(DOM_IDS_MOBILE.mobileLastTransaction);
    if(mobileTx) mobileTx.innerHTML = `${message} loading tx.`;

    const desktopTable = document.getElementById(DOM_IDS.snapshotTableBody);
    if(desktopTable) desktopTable.innerHTML = `<tr><td colspan="6">${message} loading snapshot.</td></tr>`;
    const mobileTable = document.getElementById(DOM_IDS_MOBILE.mobileTokenTableBody);
    if(mobileTable) mobileTable.innerHTML = `<tr><td colspan="3">${message} loading snapshot.</td></tr>`;
    
    const logLinks = document.getElementById(DOM_IDS.dailyLogLinksContainer);
    if(logLinks) logLinks.innerHTML = `<span>${message} loading logs.</span>`;

    const buyBtnDesktop = document.getElementById(DOM_IDS.buyTicketButton);
    if (buyBtnDesktop) buyBtnDesktop.disabled = true;
    const buyBtnMobile = document.getElementById(DOM_IDS_MOBILE.mobileBuyTicketButton);
    if (buyBtnMobile) buyBtnMobile.disabled = true;
}

// --- Main Event Listener ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded for Main Page. Attempting to initialize logic...");
    function attemptInit() {
        if (window.ethers && !localIsAppInitialized) {
            initializeMainPage().catch(err => {
                console.error("Error during initial page load sequence:", err);
                showGlobalMessage(`Initialization failed: ${err.message}`, "error", 0, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
                updateAllDisplaysOnError("Init Error");
            });
        } else if (localIsAppInitialized) {
            // console.log("Main Page Logic: Already initialized."); // Can be noisy
        } else {
            console.warn("MainPageLogic: Ethers.js not found on window. Waiting...");
            showGlobalMessage("Loading blockchain library...", "info", 0, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
            setTimeout(attemptInit, 500);
        }
    }
    attemptInit();
});