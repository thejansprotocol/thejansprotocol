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
    // JANS_GAME_CONTRACT_ADDRESS, // Not directly used here
    // TARGET_CHAIN_ID, // Not used directly here
    // TARGET_NETWORK_NAME, // Not used directly here
    
    // TARAXA_RPC_URL, // Not directly used here
    // DEX_ROUTER_ADDRESS, // Not directly used here
    // TARA_WETH_ADDRESS, // Not directly used here
    JANS_TOKEN_ADDRESS,
    NATIVE_TARA_DECIMALS,
    JANS_DECIMALS,
    LP_TOKEN_DECIMALS,
    formatPriceWithZeroCount, // Used for formatting token prices
    // COINGECKO_TARA_PRICE_URL, // Not directly used here

    // ABI Getters from wallet.js
    // getJansGameABI, // Not used directly, getReadOnlyJansGameContract uses it internally
    getJansTokenABI,

    // Helper Utilities from wallet.js
    shortenAddress,
    showGlobalMessage,
    // clearGlobalMessage, // Not explicitly used but available
    
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
const SNAPSHOT_FILE_PATH = './data/snapshots/latest_snapshot.json';
const DAILY_LOG_INDEX_FILE = './data/dailylogs_v8/index.json';
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
    if (luminance > 200) { return getRandomHexColor(); } // Evita colores muy claros (para texto)
    // Considera el color de fondo de la página para el contraste. Si es claro (#ffed91), evita colores muy claros.
    // Si el fondo puede ser oscuro, también evita colores muy oscuros.
    // Esta es una heurística simple; el contraste real depende del fondo.
    return color;
}

// --- Initialization ---
async function initializeMainPage() {
    if (localIsAppInitialized) return;
    console.log("MainPageLogic: Initializing...");
    try {
        if (!window.ethers) throw new Error("Ethers.js not loaded.");
        await initializeEthersCore(window.ethers);
        console.log("MainPageLogic: Ethers core initialized.");

        const roContract = getReadOnlyJansGameContract();
        if (roContract && !localRoundDurationSeconds) {
            try {
                localRoundDurationSeconds = Number(await roContract.ROUND_RESULT_DURATION_SECONDS());
            } catch (e) { console.error("MainPageLogic: Error fetching ROUND_RESULT_DURATION_SECONDS", e); }
        }

        await loadAndDisplaySnapshotTable();
        await displayDailyLogLinks();
        await refreshAllPageData(); 
        setInterval(refreshAllPageData, DATA_REFRESH_INTERVAL_MS);
        initializeUiTimers();

        const buyBtnDesktop = document.getElementById(DOM_IDS.buyTicketButton);
        if (buyBtnDesktop) buyBtnDesktop.addEventListener('click', handleBuyTicketClick);
        else console.warn(`Desktop buy button '${DOM_IDS.buyTicketButton}' not found.`);
        
        const buyBtnMobile = document.getElementById(DOM_IDS_MOBILE.mobileBuyTicketButton);
        if (buyBtnMobile) buyBtnMobile.addEventListener('click', handleBuyTicketClick);
        else console.warn(`Mobile buy button '${DOM_IDS_MOBILE.mobileBuyTicketButton}' not found.`);

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
    const nowUTC = new Date();
    const dayUTC = nowUTC.getUTCDay();
    const hourUTC = nowUTC.getUTCHours();
    const minuteUTC = nowUTC.getMinutes();

    let inBreakPeriod = false;
    // Período de pausa: Desde Sábado 21:00 UTC hasta Domingo 20:45 UTC (sin incluir 20:45)
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
        if (!localSnapshotTokens || localSnapshotTokens.length !== POOLS_TO_SELECT) message += "Snapshot data not ready. ";
        if (localTicketPriceNativeWei === null) message += "Ticket price not available. ";
        showGlobalMessage(message.trim(), "warning", 7000, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
        return;
    }
    openTicketPurchaseModal(localSnapshotTokens, localTicketPriceNativeWei);
}

// --- Data Fetching Orchestration ---
async function refreshAllPageData() { /* ... (Sin cambios respecto a la última versión) ... */
    const roContract = getReadOnlyJansGameContract();
    if (!roContract) { console.warn("MainPageLogic: Read-only contract not available."); return; }
    try {
        localTaraUsdPrice = await fetchTaraUsdPriceFromCoinGecko();
        const roProvider = getReadOnlyProvider();
        if (roProvider) localJansPerTaraRate = await getJansPerTaraFromDEX(roProvider);
        else console.warn("MainPageLogic: ReadOnlyProvider not available for JANS/TARA rate fetch.");

        await updateCurrentRoundDisplay(); 
        await Promise.all([updateGlobalStatsDisplay(), fetchAndDisplaySimplifiedTransactions()]);
    } catch (error) {
        console.error("MainPageLogic: Error during data refresh:", error);
        showGlobalMessage("Error refreshing some page data.", "warning", 5000, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
    }
 }

// --- Snapshot Display ---
async function loadAndDisplaySnapshotTable() { /* ... (Sin cambios respecto a la última versión) ... */
    const desktopTableBody = document.getElementById(DOM_IDS.snapshotTableBody);
    const mobileTableBody = document.getElementById(DOM_IDS_MOBILE.mobileTokenTableBody);
    const loadingMsg = (cols) => `<tr><td colspan="${cols}" style="text-align:center;">Loading snapshot...</td></tr>`;
    if (desktopTableBody) desktopTableBody.innerHTML = loadingMsg(6);
    if (mobileTableBody) mobileTableBody.innerHTML = loadingMsg(3);

    try {
        const data = await fetchJsonFile(SNAPSHOT_FILE_PATH);
        if (data && Array.isArray(data)) {
            localSnapshotTokens = data.map(token => ({ ...token, prediction: undefined }));
            if (desktopTableBody) renderDesktopSnapshotTable();
            if (mobileTableBody) renderMobileSnapshotTable();
        } else throw new Error("Snapshot data is not a valid array or is null.");
    } catch (error) {
        console.error("MainPageLogic: Failed to load or parse snapshot:", error);
        const errorMsg = (cols) => `<tr><td colspan="${cols}" style="color:red;">Error loading snapshot data.</td></tr>`;
        if (desktopTableBody) desktopTableBody.innerHTML = errorMsg(6);
        if (mobileTableBody) mobileTableBody.innerHTML = errorMsg(3);
        localSnapshotTokens = [];
    }
}
function renderDesktopSnapshotTable() { /* ... (Sin cambios respecto a la última versión) ... */ 
    const tableBody = document.getElementById(DOM_IDS.snapshotTableBody);
    if (!tableBody) return;
    if (!localSnapshotTokens || localSnapshotTokens.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No token data.</td></tr>`; return;
    }
    tableBody.innerHTML = '';
    localSnapshotTokens.forEach(token => {
        const tr = document.createElement('tr');
        const addCell = (content, isHtml = false, textAlign = 'center') => {
            const td = document.createElement('td');
            if (isHtml) { td.innerHTML = content; } else { td.textContent = content; }
            td.style.textAlign = textAlign; return td;
        };
        let baseTokenName = token.name || 'N/A';
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
function renderMobileSnapshotTable() { /* ... (Sin cambios respecto a la última versión) ... */ 
    const mobileTableBody = document.getElementById(DOM_IDS_MOBILE.mobileTokenTableBody);
    if (!mobileTableBody) return;
    if (!localSnapshotTokens || localSnapshotTokens.length === 0) {
        mobileTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">No token data.</td></tr>`; return;
    }
    mobileTableBody.innerHTML = '';
    localSnapshotTokens.forEach(token => {
        const tr = document.createElement('tr');
        const addCell = (content, isHtml = false, textAlign = 'center') => {
            const td = document.createElement('td');
            if (isHtml) { td.innerHTML = content; } else { td.textContent = content; }
            td.style.textAlign = textAlign; return td;
        };
        let baseTokenName = token.name || 'N/A';
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

// --- Current Round & Ticket Price Display (AJUSTADO PARA NUEVO HORARIO UTC) ---
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
    // Período de pausa: Desde Sábado 21:00 UTC hasta Domingo 20:45 UTC (sin incluir 20:45)
    if ( (dayUTC === 6 && hourUTC >= 21) || 
         (dayUTC === 0 && (hourUTC < 20 || (hourUTC === 20 && minuteUTC < 45))) ) {
        inBreakPeriod = true;
    }

    if (inBreakPeriod) {
        if (roundSpan) roundSpan.textContent = "N/A";
        if (priceSpan) priceSpan.textContent = "Paused";
        if (salesStatusSpan) {
            salesStatusSpan.textContent = "Game Paused. Next round: Sunday 20:45 UTC";
            salesStatusSpan.className = "status-pending"; // O una clase "status-paused"
        }
        localIsSalesOpen = false;
        localTicketPriceNativeWei = null;
        localRoundStartTime = null; 
        localCurrentRoundId = 0n;   
        return; 
    }

    try {
        const newRoundId = await roContract.currentRoundId();
        if (localCurrentRoundId?.toString() !== newRoundId.toString()) {
            localTicketTransactions = []; localLastFetchedTxBlock = null;
        }
        localCurrentRoundId = newRoundId;
        if (roundSpan) roundSpan.textContent = localCurrentRoundId > 0n ? localCurrentRoundId.toString() : "0 (Awaiting Start)";

        if (localCurrentRoundId > 0n) {
            const roundData = await roContract.roundsData(localCurrentRoundId);
            localRoundStartTime = Number(roundData.startTime);

            if (roundData.startSnapshotSubmitted) {
                const salesDurationSec = await roContract.ticketSalesDurationSeconds();
                const provider = getReadOnlyProvider();
                const latestBlock = await provider.getBlock("latest");
                const currentBlockTimestamp = Number(latestBlock.timestamp);

                if (currentBlockTimestamp <= (localRoundStartTime + Number(salesDurationSec))) {
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
            } else {
                localTicketPriceNativeWei = null; localIsSalesOpen = false; localRoundStartTime = null;
                if (priceSpan) priceSpan.textContent = "Pending Start";
                if (salesStatusSpan) { salesStatusSpan.textContent = "Round Pending Start"; salesStatusSpan.className = "status-pending"; }
            }
        } else {
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

// --- Global Stats Display (Sin cambios respecto a la última versión proporcionada) ---
async function updateGlobalStatsDisplay() { /* ... (Tu código existente aquí) ... */ 
    const roContract = getReadOnlyJansGameContract();
    if (!roContract) return;
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
        } else if (localJansPerTaraRate === 0) jansUsdPrice = 0;

        if (statElements.prizePoolUsd) statElements.prizePoolUsd.textContent = (jansUsdPrice !== null && prizePoolNum > 0) ? `(${(prizePoolNum * jansUsdPrice).toLocaleString(undefined, { style: 'currency', currency: 'USD' })})` : (prizePoolNum === 0 ? "($0.00 USD)" : "(USD N/A)");
        if (statElements.jansBurnedUsd) statElements.jansBurnedUsd.textContent = (jansUsdPrice !== null && burnedNum > 0) ? `(${(burnedNum * jansUsdPrice).toLocaleString(undefined, { style: 'currency', currency: 'USD' })})` : (burnedNum === 0 ? "($0.00 USD)" : "(USD N/A)");

        if (statElements.jansBurnedPercentage) {
            const roProvider = getReadOnlyProvider();
            const jansAbi = await getJansTokenABI();
            const supplyData = await getTokenTotalSupply(roProvider, JANS_TOKEN_ADDRESS, jansAbi, JANS_DECIMALS);
            if (supplyData && supplyData.raw > 0n) {
                const totalNum = parseFloat(supplyData.formatted);
                if (totalNum > 0 && burnedNum >= 0) statElements.jansBurnedPercentage.textContent = `(${(burnedNum / totalNum * 100).toFixed(4)}% of Total)`;
                else statElements.jansBurnedPercentage.textContent = "(Supply 0)";
            } else statElements.jansBurnedPercentage.textContent = "(Supply N/A)";
        }

        if (!localGameLpTokenAddress) {
            try { localGameLpTokenAddress = await roContract.GAME_LP_TOKEN(); } catch(e){ console.warn("Could not get game LP token address.");}
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
        Object.values(statElements).forEach(el => { if(el) el.textContent = "Error"; });
    }
}

// --- Transaction Log Display (AJUSTADO PARA NUEVO HORARIO UTC Y COLORES) ---
async function fetchAndDisplaySimplifiedTransactions() { /* ... (Como en la versión completa anterior, con la lógica de inBreakPeriod) ... */
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
            const roundData = await roContract.roundsData(localCurrentRoundId);
            const blockNumFromRound = Number(roundData.blockNumber || currentBlockNumber - 70000); // Fallback if blockNumber not on roundData
            const range = (currentBlockNumber - blockNumFromRound) > 2000 ? 70000 : 5000;
            fromBlockForQuery = (roundData.startTime > 0n) ? Math.max(0, currentBlockNumber - range) : Math.max(0, currentBlockNumber - 5000);
        } else {
            if (localTicketTransactions.length > 0) renderMobileLastTransaction();
            return; 
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
                        player: event.args.player, timestamp: Number(block.timestamp), 
                        txHash: event.transactionHash, ticketId: event.args.ticketId 
                    });
                    newTxFound = true;
                } catch (blockError) { console.error("TX_LOG: Error fetching block:", blockError); }
            }
        }
        
        if (newTxFound) {
            localTicketTransactions.sort((a, b) => b.timestamp - a.timestamp);
            if (txListUl) renderDesktopTransactionList();
            renderMobileLastTransaction();
        } else if (localTicketTransactions.length === 0 && events.length === 0) {
            const noTxMsg = 'No ticket purchases yet for this round.';
            if(txListUl) txListUl.innerHTML = `<li>${noTxMsg}</li>`;
            if (mobileLastTxDiv) mobileLastTxDiv.textContent = noTxMsg;
        } else if (localTicketTransactions.length > 0 && !newTxFound) {
            renderMobileLastTransaction(); 
        }
        localLastFetchedTxBlock = currentBlockNumber;
    } catch (error) { 
        console.error("TX_LOG: Failed to fetch/process transactions:", error);
        if(txListUl && localTicketTransactions.length === 0) txListUl.innerHTML = '<li>Error loading txs.</li>';
        if (mobileLastTxDiv && localTicketTransactions.length === 0) mobileLastTxDiv.textContent = 'Error loading tx.';
    }
}

function renderDesktopTransactionList() { /* ... (Como en la versión completa anterior, con li.style.color = getRandomHexColor();) ... */
    const ulElement = document.getElementById(DOM_IDS.transactionList);
    if (!ulElement) return;
    ulElement.innerHTML = '';
    if (localTicketTransactions.length === 0) {
        ulElement.innerHTML = '<li>No ticket purchases recorded.</li>'; return;
    }
    const maxToShow = 10;
    localTicketTransactions.slice(0, maxToShow).forEach(tx => {
        const li = document.createElement('li');
        const date = new Date(tx.timestamp * 1000);
        const timeString = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
        li.innerHTML = `${timeString} - Wallet: <span title="${tx.player}">${shortenAddress(tx.player, 4)}</span>`;
        li.style.color = getRandomHexColor();
        li.style.padding = "3px 5px"; li.style.fontSize = "0.8em";
        li.style.marginBottom = "2px"; li.style.borderRadius = "3px";
        ulElement.appendChild(li);
    });
 }
function renderMobileLastTransaction() { /* ... (Como en la versión completa anterior, con mobileTxDiv.style.color = getRandomHexColor();) ... */
    const mobileTxDiv = document.getElementById(DOM_IDS_MOBILE.mobileLastTransaction);
    if (!mobileTxDiv) return;
    if (localTicketTransactions.length === 0) {
        mobileTxDiv.textContent = 'No purchases this round.'; return;
    }
    const lastTx = localTicketTransactions[0];
    const date = new Date(lastTx.timestamp * 1000);
    const timeString = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
    mobileTxDiv.innerHTML = `Latest: ${timeString} - Wallet <span title="${lastTx.player}">${shortenAddress(lastTx.player, 4)}</span>`;
    mobileTxDiv.style.color = getRandomHexColor();
}

// --- Daily Log List Display (AJUSTADO PARA COLOR DE TEXTO ALEATORIO) ---
async function displayDailyLogLinks() { /* ... (Como en la versión completa anterior, con link.style.color = getRandomHexColor();) ... */
    const logLinksContainer = document.getElementById(DOM_IDS.dailyLogLinksContainer);
    if (!logLinksContainer) { console.warn("Daily log links container not found."); return; }
    logLinksContainer.innerHTML = '<li>Loading log list...</li>';

    try {
        const logIndex = await fetchJsonFile(DAILY_LOG_INDEX_FILE);
        if (logIndex && Array.isArray(logIndex) && logIndex.length > 0) {
            logLinksContainer.innerHTML = '';
            logIndex.sort((a,b) => b.date.localeCompare(a.date)); 
            logIndex.forEach(logEntry => {
                const li = document.createElement('li');
                const link = document.createElement('a');
                link.href = `view_log_page.html?logFile=dailylogs_v8/${encodeURIComponent(logEntry.file)}`;
                let textContent = `Log: ${logEntry.date}`;
                if(logEntry.roundStartedId || logEntry.roundClosedId) {
                    textContent += ` (R${logEntry.roundStartedId || '_'}S / R${logEntry.roundClosedId || '_'}E)`;
                }
                link.textContent = textContent;
                link.target = "_blank";
                link.style.color = getRandomHexColor(); 
                li.appendChild(link);
                li.style.marginBottom = "3px";
                logLinksContainer.appendChild(li);
            });
        } else { logLinksContainer.innerHTML = '<li>No daily logs found.</li>'; }
    } catch (error) {
        console.error("Error loading daily log links:", error);
        logLinksContainer.innerHTML = '<li style="color:red;">Error loading log list.</li>';
    }
}


// --- UI Timers (AJUSTADO PARA NUEVO HORARIO UTC DE FIN DE SEMANA) ---
function initializeUiTimers() {
    const updateAllTimes = () => { updateSnapshotTimeDisplay(); updateCountdownTimerDisplay(); };
    updateAllTimes();
    setInterval(updateAllTimes, 1000);
}

function updateSnapshotTimeDisplay() { /* Sin cambios */
    const span = document.getElementById(DOM_IDS.snapshotTimestamp);
    if (!span) return;
    const now = new Date();
    let snapshotForDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 21, 0, 0, 0));
    if (now.getUTCHours() < 21) snapshotForDate.setUTCDate(snapshotForDate.getUTCDate() - 1);
    span.textContent = snapshotForDate.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + " UTC";
}

function updateCountdownTimerDisplay() {
    const span = document.getElementById(DOM_IDS.countdownTimer);
    if (!span) return;
    const nowUTC = new Date();
    const dayUTC = nowUTC.getUTCDay();
    const hourUTC = nowUTC.getUTCHours();
    const minuteUTC = nowUTC.getMinutes();

    let inBreakPeriod = false;
    // Período de pausa: Desde Sábado 21:00 UTC hasta Domingo 20:45 UTC (sin incluir 20:45)
    if ( (dayUTC === 6 && hourUTC >= 21) || 
         (dayUTC === 0 && (hourUTC < 20 || (hourUTC === 20 && minuteUTC < 45))) ) {
        inBreakPeriod = true;
    }

    if (inBreakPeriod) {
        // Contar hasta Domingo 20:45 UTC
        let targetTimeForBreakCountdown = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate()));
        // El objetivo es el próximo Domingo 20:45 UTC
        if (dayUTC === 6) { // Si es Sábado después de las 21:00, el target es Domingo 20:45
            targetTimeForBreakCountdown.setUTCDate(targetTimeForBreakCountdown.getUTCDate() + 1);
        }
        // Si ya es Domingo pero antes de las 20:45, el target es hoy (Domingo) 20:45 UTC.
        targetTimeForBreakCountdown.setUTCHours(20, 45, 0, 0);

        const diff = targetTimeForBreakCountdown.getTime() - nowUTC.getTime();
        if (diff > 0) {
            const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
            const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
            const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
            span.textContent = `Next round (Sun 20:45 UTC) in: ${h}h ${m}m ${s}s`;
        } else {
            // Ya pasó la hora de inicio del Domingo 20:45 UTC o es exactamente esa hora.
            // El backend debería haber iniciado la ronda. El próximo refreshAllPageData lo detectará.
            span.textContent = "New round starting soon / Awaiting data...";
        }
        return; 
    }

    // Si NO es el "break", lógica normal para la ronda activa o en espera
    if (localCurrentRoundId > 0n && localRoundStartTime && localRoundDurationSeconds) {
        const roundEndTimeEpoch = localRoundStartTime + localRoundDurationSeconds;
        const nowEpoch = Math.floor(nowUTC.getTime() / 1000);
        const diff = roundEndTimeEpoch - nowEpoch;
        if (diff > 0) {
            const h = String(Math.floor(diff / 3600)).padStart(2, '0');
            const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
            const s = String(Math.floor(diff % 60)).padStart(2, '0');
            span.textContent = `${h}h ${m}m ${s}s until current round ends`;
        } else {
            span.textContent = "Round ended, evaluating...";
        }
    } else if ((localCurrentRoundId === 0n && !localIsSalesOpen) || (!localRoundStartTime && !inBreakPeriod)) { 
        // Si no hay ronda activa Y no estamos en el break (ej. Lunes antes de que el backend inicie la ronda)
        span.textContent = "Awaiting new round";
    } else if (!localIsSalesOpen) { 
        span.textContent = "Sales closed / Pending start";
    } else {
        span.textContent = "Calculating...";
    }
}

// --- Fallback Error Display ---
function updateAllDisplaysOnError(message = "Error") { /* ... (Sin cambios respecto a la última versión proporcionada) ... */
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
    if(txList) txList.innerHTML = `<li>${message} txs.</li>`;
    const mobileTx = document.getElementById(DOM_IDS_MOBILE.mobileLastTransaction);
    if(mobileTx) mobileTx.textContent = `${message} tx.`;
    const desktopTable = document.getElementById(DOM_IDS.snapshotTableBody);
    if(desktopTable) desktopTable.innerHTML = `<tr><td colspan="6" style="text-align:center;">${message} snapshot.</td></tr>`;
    const mobileTable = document.getElementById(DOM_IDS_MOBILE.mobileTokenTableBody);
    if(mobileTable) mobileTable.innerHTML = `<tr><td colspan="3" style="text-align:center;">${message} snapshot.</td></tr>`;
    const logLinks = document.getElementById(DOM_IDS.dailyLogLinksContainer);
    if(logLinks) logLinks.innerHTML = `<li>${message} logs.</li>`;
    const buyBtnDesktop = document.getElementById(DOM_IDS.buyTicketButton);
    if (buyBtnDesktop) buyBtnDesktop.disabled = true;
    const buyBtnMobile = document.getElementById(DOM_IDS_MOBILE.mobileBuyTicketButton);
    if (buyBtnMobile) buyBtnMobile.disabled = true;
}

// --- Main Event Listener ---
document.addEventListener('DOMContentLoaded', () => { /* ... (Sin cambios respecto a la última versión proporcionada) ... */
    console.log("DOM Loaded for Main Page. Attempting init...");
    function attemptInit() {
        if (window.ethers && !localIsAppInitialized) {
            initializeMainPage().catch(err => {
                console.error("Init sequence error:", err);
                showGlobalMessage(`Initialization failed: ${err.message}`, "error", 0, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
                updateAllDisplaysOnError("Init Error");
            });
        } else if (localIsAppInitialized) { /* console.log("Already initialized."); */ }
        else {
            console.warn("Ethers.js not found. Waiting...");
            showGlobalMessage("Loading blockchain library...", "info", 0, GLOBAL_MESSAGE_DISPLAY_ID_MAIN);
            setTimeout(attemptInit, 500);
        }
    }
    attemptInit();
});