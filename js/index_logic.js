// --- index_logic.js ---
// Handles dynamic content, LP creation, LP reward claims, and enhanced stats display for index.html

// IMPORTANT: Ensure wallet.js exports ALL necessary constants and functions used here.
// Specifically:
// - initializeEthersCore, getReadOnlyProvider, getReadOnlyJansGameContract, connectWalletAndGetSignerInstances, ethersInstance
// - JANS_GAME_CONTRACT_ADDRESS, TARGET_CHAIN_ID, TARGET_NETWORK_NAME, DEX_ROUTER_ADDRESS, TARA_WETH_ADDRESS, JANS_TOKEN_ADDRESS
// - NATIVE_TARA_DECIMALS, JANS_DECIMALS, LP_TOKEN_DECIMALS
// - shortenAddress, showGlobalMessage, clearGlobalMessage, formatPriceWithZeroCount
// - Also ensure wallet.js exports cachedJansGameABI and cachedJansTokenABI directly.

import {
    initializeEthersCore,
    getReadOnlyProvider,
    getReadOnlyJansGameContract,
    connectWalletAndGetSignerInstances,
    ethersInstance, // The Ethers.js library instance itself

    JANS_GAME_CONTRACT_ADDRESS,
    TARGET_CHAIN_ID,
    TARGET_NETWORK_NAME,
    DEX_ROUTER_ADDRESS,
    TARA_WETH_ADDRESS,
    JANS_TOKEN_ADDRESS,
    NATIVE_TARA_DECIMALS,
    JANS_DECIMALS,
    LP_TOKEN_DECIMALS,
    
    shortenAddress,
    showGlobalMessage, 
    clearGlobalMessage,
    formatPriceWithZeroCount, // Your custom price formatter from wallet.js
    
    // --- IMPORTACION CLAVE: ABI variables directamente ---
    cachedJansGameABI,
    cachedJansTokenABI 
} from './wallet.js'; // <<< ADJUST THIS PATH IF NEEDED (e.g., './utils/wallet.js')

// --- Constants specific to this page ---
const COINGECKO_TARA_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=taraxa&vs_currencies=usd';
const MINIMAL_ERC20_ABI_FOR_TOTAL_SUPPLY = ["function totalSupply() view returns (uint256)"];

const LP_PAIR_ABI = [
    "function getReserves() view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function totalSupply() view returns (uint256)"
];

// DOM ID for global messages on this page (ensure it exists in index.html)
const GLOBAL_MESSAGE_ID_INDEX = "global-error-display"; // Or your chosen ID

// --- Module State (managed by this script) ---
let isIndexAppInitialized = false; // Flag to indicate if the app's logic is ready
let currentTaraPriceUSD = null; // Price of 1 TARA in USD (fetched from CoinGecko)
let currentJansPerTaraRate = null; // How many JANS for 1 TARA (fetched from DEX)
let gameLpTokenAddress = null; // Address of the JANS/TARA LP token (fetched from contract)


// --- UI Update & Event Handling Helper Functions (defined at module scope) ---

/**
 * Updates the UI elements to reflect an error state.
 * @param {string} message The error message to display.
 */
function updateDisplayOnErrorState(message = "Error") {
    const createLpButton = document.getElementById("create-lp-button");
    const claimButton = document.getElementById("claim-lp-rewards-button");

    if (createLpButton) { createLpButton.disabled = true; createLpButton.title = message; }
    if (claimButton) { claimButton.disabled = true; claimButton.title = message; }
    showGlobalMessage(message, "error", 0, GLOBAL_MESSAGE_ID_INDEX);
}

/**
 * Helper to setup event listeners for buttons once DOM is ready.
 */
function setupEventListeners() {
    const createLpButton = document.getElementById("create-lp-button");
    if (createLpButton) {
        createLpButton.addEventListener("click", (e) => {
            e.preventDefault();
            if (!isIndexAppInitialized || !ethersInstance) { 
                showGlobalMessage("Application not fully initialized. Please wait or refresh.", "warning", 5000, GLOBAL_MESSAGE_ID_INDEX); return;
            }
            handleCreateLP();
        });
    }

    const claimLpButton = document.getElementById("claim-lp-rewards-button");
    if (claimLpButton) {
        claimLpButton.disabled = true; // Ensure button starts disabled
        claimLpButton.addEventListener("click", (e) => {
            e.preventDefault();
            if (!isIndexAppInitialized || !ethersInstance) {
                showGlobalMessage("Application not fully initialized. Please wait or refresh.", "warning", 5000, GLOBAL_MESSAGE_ID_INDEX); return;
            }
            handleClaimLpRewards();
        });
    }
}


// --- Initialization Functions ---

/**
 * Initializes the main logic for the index page, setting up contract interactions and UI updates.
 */
async function initializeIndexPageLogic() {
    if (isIndexAppInitialized) {
        console.log("Index page logic already initialized.");
        return;
    }
    console.log("Initializing index_logic.js...");

    const localReadOnlyProvider = getReadOnlyProvider();
    const localReadOnlyContract = getReadOnlyJansGameContract();

    if (!localReadOnlyProvider || !localReadOnlyContract) {
        throw new Error("Read-only provider or contract not available after Ethers core initialization.");
    }

    try { // Outer try-catch to log general initialization errors
        let networkName = 'unknown';
        try { 
            const network = await localReadOnlyProvider.getNetwork();
            networkName = network.name;
            console.log(`Index Provider connected: ${networkName} (ID: ${network.chainId.toString()})`);
        } catch (e) {
            console.error("ERROR during localReadOnlyProvider.getNetwork():", e);
            throw new Error(`Failed to get network details: ${e.message}`); 
        }
        
        console.log("Read-only JansGame contract instance obtained.");

        try { 
            gameLpTokenAddress = await localReadOnlyContract.GAME_LP_TOKEN(); 
            console.log("Game LP Token Address (from contract):", gameLpTokenAddress);
            if (!gameLpTokenAddress || gameLpTokenAddress === ethersInstance.ZeroAddress) {
                throw new Error("GAME_LP_TOKEN address is invalid or zero.");
            }
        } catch (e) {
            console.error("ERROR fetching GAME_LP_TOKEN address from contract:", e);
            throw new Error(`Failed to fetch LP token address from game contract: ${e.message}`); 
        }

        setupEventListeners(); // Call setupEventListeners here, AFTER it's defined at the module level.

        try { 
            await fetchAllStatsAndUpdateDisplay(); 
            setInterval(fetchAllStatsAndUpdateDisplay, 60000); 
        } catch (e) {
            console.error("ERROR during fetchAllStatsAndUpdateDisplay():", e);
            throw new Error(`Failed to fetch all stats and update display: ${e.message}`); 
        }

        console.log("Index page logic initialization complete.");
        isIndexAppInitialized = true; 

    } catch (error) { 
        console.error("CRITICAL: Index page logic initialization failed:", error.stack);
        console.error("ACTUAL ERROR MESSAGE CAUGHT IN initializeIndexPageLogic:", error.message); 
        showGlobalMessage(`Initialization Error: ${error.message.substring(0, 150)}. Check console.`, "error", 0, GLOBAL_MESSAGE_ID_INDEX);
        updateDisplayOnErrorState("Init Error");
        isIndexAppInitialized = false; 
    }
}

// --- Data Fetching Functions ---

/**
 * Fetches TARA/USD price from CoinGecko.
 * @returns {Promise<number|null>} The TARA price in USD, or null if an error occurs.
 */
async function fetchTaraUsdPriceFromCoinGecko() {
    if (!ethersInstance) { console.warn("Ethers instance not ready for CoinGecko fetch."); return null; }
    try {
        const response = await fetch(COINGECKO_TARA_PRICE_URL, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) { 
            console.error(`CoinGecko API Error: ${response.status} - ${response.statusText}`); 
            return null; 
        }
        const data = await response.json(); 
        const price = data?.taraxa?.usd;
        if (typeof price !== 'number' || !isFinite(price) || price <= 0) { 
            console.error(`Invalid or non-positive price received from CoinGecko: ${price}`); 
            return null;
        }
        return price;
    } catch (e) { 
        if (e.name === 'AbortError') console.error(`❌ Error TARA/USD price fetch: Request timed out.`);
        else console.error(`❌ Error TARA/USD price fetch: ${e.message}`); 
        return null; 
    }
}

/**
 * Gets the JANS/TARA exchange rate from the DEX router.
 * @returns {Promise<number|null>} JANS amount per 1 TARA, or null on error.
 */
async function getJansPerTaraFromDEX() { 
    const provider = getReadOnlyProvider();
    if (!provider || !DEX_ROUTER_ADDRESS || !TARA_WETH_ADDRESS || !JANS_TOKEN_ADDRESS || !ethersInstance || NATIVE_TARA_DECIMALS === undefined || JANS_DECIMALS === undefined) {
        console.error("DEBUG: Missing dependencies for getJansPerTaraFromDEX. Ensure wallet.js constants are imported and Ethers core initialized."); 
        return null;
    }
    try {
        const routerAbi = ["function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)"];
        const routerContract = new ethersInstance.Contract(DEX_ROUTER_ADDRESS, routerAbi, provider);
        const oneTaraWei = ethersInstance.parseUnits("1", NATIVE_TARA_DECIMALS); 
        const path = [TARA_WETH_ADDRESS, JANS_TOKEN_ADDRESS]; 
        const amountsOut = await routerContract.getAmountsOut(oneTaraWei, path);
        if (amountsOut && amountsOut.length >= 2) {
            const jansForOneTaraWei = amountsOut[amountsOut.length - 1]; 
            if (jansForOneTaraWei >= 0n) { 
                return parseFloat(ethersInstance.formatUnits(jansForOneTaraWei, JANS_DECIMALS)); 
            }
        }
    } catch (error) { 
        console.error("Error fetching JANS/TARA DEX rate:", error.message); 
    }
    return null;
}

/**
 * Gets the total supply of JANS token.
 * @returns {Promise<{raw: bigint, formatted: string}>} Total supply in raw BigInt and formatted string.
 */
async function getJansTotalSupply() { 
    const provider = getReadOnlyProvider();
    
    // --- USO CLAVE: ABI variable directamente ---
    // Make sure cachedJansTokenABI is exported from wallet.js and populated during wallet.js's initialization
    let currentJansTokenAbi = cachedJansTokenABI; // <--- USANDO LA VARIABLE IMPORTADA DIRECTAMENTE
    
    if (!currentJansTokenAbi || currentJansTokenAbi.length <= MINIMAL_ERC20_ABI_FOR_TOTAL_SUPPLY.length) {
        console.warn("Using minimal ERC20 ABI for JANS token as full ABI is not available or too short.");
        currentJansTokenAbi = MINIMAL_ERC20_ABI_FOR_TOTAL_SUPPLY; 
    }

    if (!provider || !JANS_TOKEN_ADDRESS || !currentJansTokenAbi || JANS_DECIMALS === undefined || !ethersInstance) {
        console.error("DEBUG: Missing dependencies for getJansTotalSupply.");
        return { raw: 0n, formatted: "N/A" };
    }
    try {
        const contract = new ethersInstance.Contract(JANS_TOKEN_ADDRESS, currentJansTokenAbi, provider);
        const raw = await contract.totalSupply();
        return { raw, formatted: ethersInstance.formatUnits(raw, JANS_DECIMALS) };
    } catch (e) { 
        console.error(`Error fetching Total Supply for ${JANS_TOKEN_ADDRESS}:`, e.message); 
        return { raw: 0n, formatted: "Error" }; 
    }
}

/**
 * Calculates the USD price of one Game LP token.
 * @param {string} lpTokenAddr The address of the LP token.
 * @returns {Promise<number|null>} The USD price of one LP token, or null on error.
 */
async function getLpTokenPriceUsd(lpTokenAddr) { 
    const provider = getReadOnlyProvider();
    const lpDecimals = LP_TOKEN_DECIMALS; // Use imported constant

    if (currentTaraPriceUSD === null || currentTaraPriceUSD <= 0 || currentJansPerTaraRate === null || currentJansPerTaraRate < 0) {
        console.warn("LP Token Price: TARA USD price or JANS/TARA rate is missing/zero. Cannot calculate LP price.");
        return 0; // Return 0 to allow UI to display $0.00 instead of N/A or crashing
    }

    if (!lpTokenAddr || lpTokenAddr === ethersInstance.ZeroAddress || !provider || !ethersInstance || JANS_TOKEN_ADDRESS === undefined || NATIVE_TARA_DECIMALS === undefined || JANS_DECIMALS === undefined) {
        console.warn("LP Token Price: Missing fundamental dependencies or LP address.");
        return null;
    }

    try {
        const lpPairContract = new ethersInstance.Contract(lpTokenAddr, LP_PAIR_ABI, provider);
        const [reserves, token0Address, token1Address, lpTotalSupplyRaw] = await Promise.all([
            lpPairContract.getReserves(), lpPairContract.token0(), lpPairContract.token1(), lpPairContract.totalSupply()
        ]);

        if (lpTotalSupplyRaw === 0n) { console.warn("LP Token Price: Total supply of LP token is 0."); return 0; }

        const reserve0 = reserves._reserve0; 
        const reserve1 = reserves._reserve1;
        
        let jansPriceInUsd = currentTaraPriceUSD / currentJansPerTaraRate; 

        let token0ValueUsd = 0; 
        let token1ValueUsd = 0;
        const t0Addr = ethersInstance.getAddress(token0Address);
        const t1Addr = ethersInstance.getAddress(token1Address);
        const wTaraAddr = ethersInstance.getAddress(TARA_WETH_ADDRESS);
        const jansAddr = ethersInstance.getAddress(JANS_TOKEN_ADDRESS);

        if (t0Addr === wTaraAddr) {
            token0ValueUsd = parseFloat(ethersInstance.formatUnits(reserve0, NATIVE_TARA_DECIMALS)) * currentTaraPriceUSD;
        } else if (t0Addr === jansAddr) {
            token0ValueUsd = parseFloat(ethersInstance.formatUnits(reserve0, JANS_DECIMALS)) * jansPriceInUsd;
        } else { console.warn(`LP Token Price: Token0 (${token0Address}) is not recognized TARA_WETH or JANS_TOKEN.`); }

        if (t1Addr === wTaraAddr) {
            token1ValueUsd = parseFloat(ethersInstance.formatUnits(reserve1, NATIVE_TARA_DECIMALS)) * currentTaraPriceUSD;
        } else if (t1Addr === jansAddr) {
            token1ValueUsd = parseFloat(ethersInstance.formatUnits(reserve1, JANS_DECIMALS)) * jansPriceInUsd;
        } else { console.warn(`LP Token Price: Token1 (${token1Address}) is not recognized TARA_WETH or JANS_TOKEN.`); }
        
        const totalPoolValueUsd = token0ValueUsd + token1ValueUsd;
        if (totalPoolValueUsd <= 0 && (reserve0 > 0n || reserve1 > 0n)) {    
            console.warn("LP Token Price: Calculated total pool value is zero or negative with non-zero reserves."); 
            return 0;    
        }
        if (totalPoolValueUsd <= 0) return 0;


        const lpTotalSupplyFormatted = parseFloat(ethersInstance.formatUnits(lpTotalSupplyRaw, lpDecimals));
        if (lpTotalSupplyFormatted > 0) return totalPoolValueUsd / lpTotalSupplyFormatted;
        
        console.warn("LP Token Price: Formatted LP total supply is zero."); 
        return 0;
    } catch (error) {
        console.error(`Error calculating LP token USD price for ${lpTokenAddr}:`, error.message, error.stack);
        return null;
    }
}

// --- UI Display Update Functions ---

/**
 * Main function to fetch all relevant stats from contract and external APIs and update the UI.
 * This should be called periodically and after transactions.
 */
async function fetchAllStatsAndUpdateDisplay() {
    const localReadOnlyContract = getReadOnlyJansGameContract(); 
    if (!localReadOnlyContract || !ethersInstance) {    
        updateDisplayOnErrorState("Loading Contract...");    
        console.warn("fetchAllStatsAndUpdateDisplay: Contract or ethersInstance not ready.");
        return;    
    }

    currentTaraPriceUSD = await fetchTaraUsdPriceFromCoinGecko();
    currentJansPerTaraRate = await getJansPerTaraFromDEX(); 

    if (currentTaraPriceUSD === null || currentTaraPriceUSD <= 0) {
        console.warn("TARA/USD price N/A or invalid. USD values in stats might be affected.");
    }
    if (currentJansPerTaraRate === null || currentJansPerTaraRate < 0) {
        console.warn("JANS/TARA rate N/A or invalid. USD values for JANS in stats might be affected.");
    }

    await fetchAndDisplayAccumulatedLPFunds(); 
    await fetchAndDisplayOtherIndexStats();    
    await updateClaimLpButtonStatus();      
}

/**
 * Fetches and displays accumulated LP funds and controls the LP creation button.
 */
async function fetchAndDisplayAccumulatedLPFunds() {
    const createLpButton = document.getElementById("create-lp-button");
    const accumulatedTaraSpan = document.getElementById("accumulated-tara-for-lp");
    const accumulatedJansSpan = document.getElementById("accumulated-jans-for-lp");
    const rewardTaraSpan = document.getElementById("reward-tara-for-lp");

    const localReadOnlyContract = getReadOnlyJansGameContract();
    if (!localReadOnlyContract || !ethersInstance) {    
        if(createLpButton) { createLpButton.disabled = true; createLpButton.title = "App not ready."; }
        return;    
    }

    try {
        const funds = await localReadOnlyContract.getAccumulatedLpFormingFunds();
        const taraForLPNum = parseFloat(ethersInstance.formatUnits(funds.taraForLPSide_, NATIVE_TARA_DECIMALS));
        const jansForLPNum = parseFloat(ethersInstance.formatUnits(funds.jansForLPSide_, JANS_DECIMALS));
        const rewardNum = parseFloat(ethersInstance.formatUnits(funds.taraForReward_, NATIVE_TARA_DECIMALS));

        if (accumulatedTaraSpan) accumulatedTaraSpan.textContent = `${taraForLPNum.toFixed(4)} TARA`;
        if (accumulatedJansSpan) accumulatedJansSpan.textContent = `${jansForLPNum.toFixed(4)} JANS`;
        if (rewardTaraSpan) rewardTaraSpan.textContent = `${rewardNum.toFixed(4)} TARA`;

        if (createLpButton) {
            const canCreateLp = taraForLPNum > 0 && jansForLPNum > 0;
            createLpButton.disabled = !canCreateLp;
            createLpButton.title = canCreateLp
                ? `Form LP (uses ${taraForLPNum.toFixed(4)} TARA + ${jansForLPNum.toFixed(4)} JANS from contract). Reward for forming: ${rewardNum.toFixed(4)} TARA.`
                : "Insufficient TARA or JANS accumulated in contract to form LP.";
        }
    } catch (e) {
        console.error("Error fetching accumulated LP funds:", e.message);
        if (createLpButton) { createLpButton.disabled = true; createLpButton.title = "Error fetching LP funds info."; }
        if (accumulatedTaraSpan) accumulatedTaraSpan.textContent = "Error";
        if (accumulatedJansSpan) accumulatedJansSpan.textContent = "Error";
        if (rewardTaraSpan) rewardTaraSpan.textContent = "Error";
    }
}

/**
 * Fetches and displays various game statistics.
 */
async function fetchAndDisplayOtherIndexStats() {
    const localReadOnlyContract = getReadOnlyJansGameContract();
    const localReadOnlyProvider = getReadOnlyProvider(); 

    // DOM element references (ensure these IDs exist in index.html)
    const dailyPoolSpan = document.getElementById("current-daily-pool");
    const dailyPoolUsdSpan = document.getElementById("daily-pool-usd");
    const burnedSpan = document.getElementById("total-jans-burned");
    const burnedUsdSpan = document.getElementById("total-burned-usd");
    const burnedPercSpan = document.getElementById("total-burned-percentage");
    const lpPoolSpan = document.getElementById("jans-lp-pool-balance");
    const lpPoolUsdSpan = document.getElementById("jans-lp-pool-balance-usd");

    if (!localReadOnlyContract || !ethersInstance || !localReadOnlyProvider) {    
        updateDisplayOnErrorState("Contract Read Err"); 
        return;    
    }

    try {
        // Prize Pool JANS
        const prizePoolRaw = await localReadOnlyContract.prizePoolJANS();
        const prizePoolJansNum = parseFloat(ethersInstance.formatUnits(prizePoolRaw, JANS_DECIMALS));
        if (dailyPoolSpan) dailyPoolSpan.textContent = `${prizePoolJansNum.toFixed(2)} JANS`;

        // JANS Burned
        const burnedRaw = await localReadOnlyContract.totalJansBurnedInGame();
        const burnedJansNum = parseFloat(ethersInstance.formatUnits(burnedRaw, JANS_DECIMALS));
        if (burnedSpan) burnedSpan.textContent = `${burnedJansNum.toFixed(2)} JANS`;

        let jansPriceInUsdForDisplay = null;
        if (currentTaraPriceUSD && currentTaraPriceUSD > 0 && currentJansPerTaraRate !== null && currentJansPerTaraRate > 0) {
            jansPriceInUsdForDisplay = currentTaraPriceUSD / currentJansPerTaraRate;
        }

        // Prize Pool USD Value - Added null/NaN checks
        if (dailyPoolUsdSpan) {
            let usdValue = prizePoolJansNum * jansPriceInUsdForDisplay;
            if (jansPriceInUsdForDisplay !== null && jansPriceInUsdForDisplay >= 0 && !isNaN(usdValue) && prizePoolJansNum > 0) {
                dailyPoolUsdSpan.textContent = `(${formatPriceWithZeroCount(usdValue.toString(), {minNormalDecimals:2, defaultDisplayDecimals:2})} USD)`;
            } else { 
                dailyPoolUsdSpan.textContent = (prizePoolJansNum === 0) ? "($0.00 USD)" : "(USD Value N/A)";
            }
        }
        // Burned USD Value - Added null/NaN checks
        if (burnedUsdSpan) {
            let usdValue = burnedJansNum * jansPriceInUsdForDisplay;
            if (jansPriceInUsdForDisplay !== null && jansPriceInUsdForDisplay >= 0 && !isNaN(usdValue) && burnedJansNum > 0) {
                burnedUsdSpan.textContent = `(${formatPriceWithZeroCount(usdValue.toString(), {minNormalDecimals:2, defaultDisplayDecimals:2})} USD)`;
            } else { 
                burnedUsdSpan.textContent = (burnedJansNum === 0) ? "($0.00 USD)" : "(USD Value N/A)";
            }
        }
        
        // LP Balance
        const lpBalRaw = await localReadOnlyContract.getContractLpTokenBalance();
        const lpBalNum = parseFloat(ethersInstance.formatUnits(lpBalRaw, LP_TOKEN_DECIMALS));
        if (lpPoolSpan) lpPoolSpan.textContent = `${lpBalNum.toFixed(4)} Game LP Tokens`;

        // LP Pool USD Value - Added null/NaN checks
        if (lpPoolUsdSpan && gameLpTokenAddress && gameLpTokenAddress !== ethersInstance.ZeroAddress) {
            if (lpBalNum > 0) {
                const lpTokenPrice = await getLpTokenPriceUsd(gameLpTokenAddress); 
                let usdValue = lpBalNum * lpTokenPrice;
                if (lpTokenPrice !== null && lpTokenPrice >= 0 && !isNaN(usdValue)) {
                    lpPoolUsdSpan.textContent = `(${formatPriceWithZeroCount(usdValue.toString(), {minNormalDecimals:2, defaultDisplayDecimals:2})} USD)`;
                } else { lpPoolUsdSpan.textContent = "(USD Value N/A)"; }
            } else { lpPoolUsdSpan.textContent = "($0.00 USD)"; }
        } else if (lpPoolUsdSpan) {
            lpPoolUsdSpan.textContent = (gameLpTokenAddress === null || gameLpTokenAddress === ethersInstance.ZeroAddress) ? "(LP Invalid Address)" :"(LP Address N/A)";
        }

        // Burned Percentage
        if (burnedPercSpan) {
            const supplyData = await getJansTotalSupply(); 
            if (supplyData.raw > 0n) {
                const totalNum = parseFloat(supplyData.formatted);
                if (totalNum > 0 && burnedJansNum >= 0) {
                    const percentageBurned = (burnedJansNum / totalNum) * 100;
                    burnedPercSpan.textContent = `(${percentageBurned.toFixed(4)}% of Total Supply)`;
                } else { burnedPercSpan.textContent = burnedJansNum < 0 ? "(Invalid Burn)" : "(Supply 0 or No Burn)"; }
            } else { burnedPercSpan.textContent = supplyData.formatted === "Error" ? "(Supply Err)" : "(Supply 0)"; }
        }

    } catch (e) { 
        console.error("Error fetching other stats:", e.message, e.stack); 
        updateDisplayOnErrorState("Stats Fetch Err"); 
        // Set all related spans to "Error" or "N/A"
        if (dailyPoolSpan) dailyPoolSpan.textContent = "Error";
        if (dailyPoolUsdSpan) dailyPoolUsdSpan.textContent = "Error";
        if (burnedSpan) burnedSpan.textContent = "Error";
        if (burnedUsdSpan) burnedUsdSpan.textContent = "Error";
        if (burnedPercSpan) burnedPercSpan.textContent = "Error";
        if (lpPoolSpan) lpPoolSpan.textContent = "Error";
        if (lpPoolUsdSpan) lpPoolUsdSpan.textContent = "Error";
    }
}

/**
 * Handles the LP creation transaction.
 */
async function handleCreateLP() {
    console.log("Attempting to create LP...");
    showGlobalMessage("Processing LP creation...", "info", 0, "global-message-main");

    try {
        const localReadOnlyProvider = getReadOnlyProvider();
        const localReadOnlyContract = getReadOnlyJansGameContract();
        if (!localReadOnlyContract || !localReadOnlyProvider) {
            throw new Error("Read-only contract or provider is not available.");
        }

        // Fetch accumulated funds
        const { taraForLPSide_, jansForLPSide_ } = await localReadOnlyContract.getAccumulatedLpFormingFunds();

        // --- DEBUGGING LOGS (using the CORRECT full ABI for the token) ---
        // Ensure cachedJansTokenABI is imported at the top of the file
        if (!cachedJansTokenABI) {
            throw new Error("Jans Token ABI is not loaded. Check wallet.js initialization.");
        }
        const jansTokenContractInstance = new ethersInstance.Contract(JANS_TOKEN_ADDRESS, cachedJansTokenABI, localReadOnlyProvider);
        
        const actualContractTaraBalance = await localReadOnlyProvider.getBalance(JANS_GAME_CONTRACT_ADDRESS);
        const actualContractJansBalance = await jansTokenContractInstance.balanceOf(JANS_GAME_CONTRACT_ADDRESS);
        
        console.log(`Debug - Accumulated TARA (Wei): ${taraForLPSide_.toString()}`);
        console.log(`Debug - Accumulated JANS (Wei): ${jansForLPSide_.toString()}`);
        console.log(`Debug - ACTUAL Contract TARA Balance: ${actualContractTaraBalance.toString()}`);
        console.log(`Debug - ACTUAL Contract JANS Balance: ${actualContractJansBalance.toString()}`);
        // --- End of Debugging ---

        if (taraForLPSide_ <= 0n || jansForLPSide_ <= 0n) {
            throw new Error("No accumulated funds in the contract to form LP.");
        }

        // Slippage calculation (e.g., 5%)
        const SLIPPAGE_PERCENT = 5; 
        const slippageBps = BigInt(SLIPPAGE_PERCENT * 100);
        const HUNDRED_PERCENT_BPS = 10000n;

        const amountNativeTaraMinForLP = (taraForLPSide_ * (HUNDRED_PERCENT_BPS - slippageBps)) / HUNDRED_PERCENT_BPS;
        const amountJansMinForLP = (jansForLPSide_ * (HUNDRED_PERCENT_BPS - slippageBps)) / HUNDRED_PERCENT_BPS;

        // Connect wallet to get the signer
        const { gameContractWithSigner, userAddress } = await connectWalletAndGetSignerInstances();
        console.log(`LP Creation transaction initiated by: ${userAddress}`);
        
        showGlobalMessage("Sending LP creation transaction... Please confirm in your wallet.", "info", 0, "global-message-main");

        const tx = await gameContractWithSigner.formAndDepositLPFromAccumulated(
            amountJansMinForLP,
            amountNativeTaraMinForLP,
            { gasLimit: 1200000 } 
        );

        showGlobalMessage(`Transaction sent: ${shortenAddress(tx.hash)}. Waiting for confirmation...`, "info", 0, "global-message-main");
        const receipt = await tx.wait();

        if (receipt && receipt.status === 1) {
            showGlobalMessage("LP successfully created!", "success", 7000, "global-message-main");
            refreshAllPageData(); 
        } else {
            throw new Error(`LP Creation transaction failed on-chain. Status: ${receipt ? receipt.status : 'unknown'}.`);
        }
    } catch (error) {
        console.error("LP Creation Failed (handleCreateLP):", error);
        let detailedMessage = error.reason || error.message || "Unknown error during LP Creation.";
        if (error.code === "ACTION_REJECTED") {
            detailedMessage = "Transaction rejected by user.";
        }
        showGlobalMessage(`LP Creation Failed: ${detailedMessage}`, "error", 0, "global-message-main");
    }
}/**
 * Handles the LP rewards claim transaction.
 */
async function handleClaimLpRewards() {
    const statusDiv = document.getElementById("lp-claim-status");    
    const claimButton = document.getElementById("claim-lp-rewards-button");
    if (!statusDiv || !claimButton) { showGlobalMessage("LP claim UI elements missing (DOM IDs 'lp-claim-status' or 'claim-lp-rewards-button').", "error", 0, GLOBAL_MESSAGE_ID_INDEX); return; }
    
    clearGlobalMessage(GLOBAL_MESSAGE_ID_INDEX);    
    statusDiv.textContent = "Preparing to claim LP rewards...";        
    statusDiv.style.color = "#f39c12"; // Orange for processing
    statusDiv.style.display = 'block'; // Ensure status div is visible
    claimButton.disabled = true; // Disable button during processing

    const localReadOnlyContract = getReadOnlyJansGameContract();
    if (!isIndexAppInitialized || !ethersInstance || !localReadOnlyContract) {    
        showGlobalMessage("Application not ready. Please refresh.", "error", 0, GLOBAL_MESSAGE_ID_INDEX);
        statusDiv.textContent = "Failed: App not ready."; statusDiv.style.color = "#e74c3c"; // Red
        return;
    }

    try {
        statusDiv.textContent = "Connecting wallet...";
        const { signer, gameContractWithSigner, userAddress } = await connectWalletAndGetSignerInstances();
        console.log(`LP Claim attempt by: ${userAddress}`);

        const currentDistroId = await localReadOnlyContract.currentLpDistributionId();
        if (currentDistroId === 0n) {
            showGlobalMessage("No active LP distribution period to claim from.", "info", 6000, GLOBAL_MESSAGE_ID_INDEX);
            statusDiv.textContent = "No active distribution."; statusDiv.style.color = "#3498db"; // Blue for info
            updateClaimLpButtonStatus(); return;
        }

        const snapshot = await localReadOnlyContract.distributionSnapshots(currentDistroId);
        if (!snapshot.finalized) {
            showGlobalMessage(`LP Distribution Period ${currentDistroId.toString()} is not yet finalized.`, "info", 8000, GLOBAL_MESSAGE_ID_INDEX);
            statusDiv.textContent = "Distribution not finalized."; statusDiv.style.color = "#3498db";
            updateClaimLpButtonStatus(); return;
        }

        const hasClaimed = await localReadOnlyContract.hasClaimedLpReward(currentDistroId, userAddress);
        if (hasClaimed) {
            showGlobalMessage(`Already claimed rewards for distribution period ${currentDistroId.toString()}.`, "info", 8000, GLOBAL_MESSAGE_ID_INDEX);
            statusDiv.textContent = "Already claimed for this period."; statusDiv.style.color = "#2ecc71"; // Green
            updateClaimLpButtonStatus(); return;
        }

        const userJansPoolShares = await localReadOnlyContract.jansPoolShares(userAddress);
        if (userJansPoolShares === 0n) {
            showGlobalMessage("You have no JANS Pool Shares to claim LP rewards with.", "info", 8000, GLOBAL_MESSAGE_ID_INDEX);
            statusDiv.textContent = "No shares to claim."; statusDiv.style.color = "#3498db";
            updateClaimLpButtonStatus(); return;
        }
        console.log(`User has ${userJansPoolShares.toString()} JANS Pool Shares.`);

        statusDiv.textContent = `Claiming for Distribution ID ${currentDistroId.toString()}... Confirm in wallet.`;
        const tx = await gameContractWithSigner.claimMyLpReward(currentDistroId, { gasLimit: 500000 }); // Fixed gas limit

        statusDiv.textContent = `Claim Tx Sent (${shortenAddress(tx.hash, 6)})... Waiting for confirmation...`;
        const receipt = await tx.wait(1);

        if (receipt && receipt.status === 1) {
            showGlobalMessage(`LP Rewards for period ${currentDistroId.toString()} claimed successfully!`, "success", 10000, GLOBAL_MESSAGE_ID_INDEX);
            statusDiv.textContent = `Claimed! Tx: ${shortenAddress(receipt.transactionHash || tx.hash, 10)}`;
            statusDiv.style.color = "#2ecc71"; // Green
        } else {
            throw new Error(`LP Reward Claim Tx failed. Period: ${currentDistroId.toString()}. Hash: ${receipt ? receipt.transactionHash : tx.hash}. Status: ${receipt ? receipt.status : 'unknown'}`);
        }

    } catch (error) {
        console.error("Claim LP Rewards Failed:", error);
        let userMessage = error.reason || (error.data && error.data.message) || error.message || 'Unknown LP claim error.';
        if (error.code === "ACTION_REJECTED") userMessage = "Transaction rejected by user.";
        
        showGlobalMessage(`LP Claim Failed: ${userMessage.substring(0,150)}`, "error", 0, GLOBAL_MESSAGE_ID_INDEX);
        statusDiv.textContent = `Failed: ${userMessage.substring(0,100)}`;
        statusDiv.style.color = "#e74c3c"; // Red
    } finally {
        fetchAllStatsAndUpdateDisplay(); // Always refresh UI after attempt
    }
}

/**
 * Updates the visual status of the LP claim button, including a blinking effect.
 */
// --- Replace your entire updateClaimLpButtonStatus function with this one ---

async function updateClaimLpButtonStatus() {
    const claimButton = document.getElementById("claim-lp-rewards-button");
    if (!claimButton) return;

    const localReadOnlyContract = getReadOnlyJansGameContract();

    // Reset styles and state before checks
    claimButton.disabled = true;
    claimButton.classList.remove('claim-available', 'claim-blink');
    claimButton.style.backgroundColor = ''; // Let CSS handle the disabled style

    if (!localIsAppInitialized || !ethersInstance || !localReadOnlyContract) {
        claimButton.title = "Status cannot be determined yet (app not ready).";
        return;
    }

    try {
        claimButton.title = "Checking LP claim status...";

        const currentDistroId = await localReadOnlyContract.currentLpDistributionId();
        if (currentDistroId === 0n) {
            claimButton.title = "No active LP distribution period.";
            return;
        }

        const snapshot = await localReadOnlyContract.distributionSnapshots(currentDistroId);
        if (!snapshot.finalized) {
            claimButton.title = `Distribution period ${currentDistroId.toString()} is not finalized yet.`;
            return;
        }

        let playerAddress = null;
        if (window.ethereum && window.ethereum.selectedAddress) {
            playerAddress = ethersInstance.getAddress(window.ethereum.selectedAddress);
        }

        if (playerAddress) {
            const hasClaimed = await localReadOnlyContract.hasClaimedLpReward(currentDistroId, playerAddress);
            if (hasClaimed) {
                claimButton.title = `Already claimed for distribution ${currentDistroId.toString()}.`;
                claimButton.style.backgroundColor = '#28a745'; // Green (claimed)
                return;
            }
            
            const userJansPoolShares = await localReadOnlyContract.jansPoolShares(playerAddress);
            if (userJansPoolShares === 0n) {
                claimButton.title = `No JANS Pool Shares to claim LP rewards for distribution ${currentDistroId.toString()}.`;
                return;
            }

            // --- SUCCESS CASE ---
            // If all checks pass, enable the button and make it blink
            claimButton.disabled = false;
            claimButton.title = `CLAIM LP REWARDS NOW for distribution period ${currentDistroId.toString()}!`;
            claimButton.classList.add('claim-available', 'claim-blink');

        } else {
            claimButton.title = `Connect wallet to check LP claim status for distribution ${currentDistroId.toString()}.`;
        }

    } catch (error) {
        console.warn("Could not update claim button status:", error.message);
        claimButton.title = "Error determining claim status. See console.";
    }
}

// --- Page Load Initialization (Entry Point) ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded for index.html. Attempting to initialize Ethers and App logic...");

    function attemptEthersCoreSetup() {
        if (window.ethers) {
            initializeEthersCore(window.ethers) // Calls the core setup from wallet.js
                .then(() => {
                    console.log("Index page: Ethers core (via wallet.js) initialized successfully.");
                    initializeIndexPageLogic(); // Proceed with this page's specific logic
                })
                .catch(error => {
                    console.error("Index page: CRITICAL Ethers Core Initialization Error (from wallet.js):", error);
                    showGlobalMessage(`Critical Error: ${error.message.substring(0, 150)}. Page may not function.`, "error", 0, GLOBAL_MESSAGE_ID_INDEX);
                    updateDisplayOnErrorState("Ethers Init Failed");
                });
        } else {
            console.warn("Index page: Ethers.js not found on window. Waiting for 'ethersReady' or retrying...");
            showGlobalMessage("Waiting for blockchain library...", "info", 0, GLOBAL_MESSAGE_ID_INDEX);
            
            const ethersLoadTimeout = setTimeout(() => {
                if (!window.ethers && !isIndexAppInitialized) { 
                    console.error("Ethers.js did not load after 7 seconds. This is a fatal issue.");
                    showGlobalMessage("Fatal Error: Blockchain library (Ethers.js) failed to load. Please refresh.", "error", 0, GLOBAL_MESSAGE_ID_INDEX);
                    updateDisplayOnErrorState("Ethers Load Failed");
                }
            }, 7000);

            document.addEventListener('ethersReady', () => {
                console.log("Index page: 'ethersReady' event fired. Retrying Ethers core setup.");
                clearTimeout(ethersLoadTimeout); 
                if (window.ethers) attemptEthersCoreSetup(); 
            }, { once: true }); 
        }
    }

    attemptEthersCoreSetup();
});
