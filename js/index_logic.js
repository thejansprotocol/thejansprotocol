// --- index_logic.js ---
// Handles dynamic content, LP creation, LP reward claims, and enhanced stats display for index.html

// Make sure ethers is available globally via CDN <script> tag in index.html
// let ethers = window.ethers; // This can be used directly, or rely on ethersInstance from wallet.js

import {
    // Core Setup & Instances from wallet.js
    initializeEthersCore,
    getReadOnlyProvider,
    getReadOnlyJansGameContract,
    connectWalletAndGetSignerInstances, // Use this from wallet.js
    ethersInstance, // The Ethers.js library instance from wallet.js

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
    DEFAULT_SLIPPAGE_BPS_LP, // Assuming this is defined in wallet.js for LP slippage
    // COINGECKO_API_KEY, // If used

    // ABI Getters from wallet.js
    getJansGameABI,
    getJansTokenABI,

    // Utility Functions from wallet.js (assuming these are centralized)
    shortenAddress,
    showGlobalMessage,  // Assuming wallet.js exports a version of this for global messages
    clearGlobalMessage, // Assuming wallet.js exports this
    formatPriceWithZeroCount // Your custom price formatter
} from './wallet.js'; // <<< ADJUST THIS PATH IF NEEDED

// Constants specific to this page or defined here if not from wallet.js
const COINGECKO_TARA_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=taraxa&vs_currencies=usd';
const MINIMAL_ERC20_ABI_FOR_TOTAL_SUPPLY = ["function totalSupply() view returns (uint256)"];
const DEADLINE_MINUTES_LP = 20;

const LP_PAIR_ABI = [
    "function getReserves() view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function totalSupply() view returns (uint256)"
];

// Module State (managed by this script)
let isIndexAppInitialized = false;
let accumulatedLpFunds = { taraForLPSide: 0n, jansForLPSide: 0n, taraForReward: 0n };
let currentTaraPriceUSD = null;
let currentJansPerTaraRate = null;
let gameLpTokenAddress = null; // Will store the JANS/TARA LP token address

// DOM ID for global messages on this page (ensure it exists in index.html)
const GLOBAL_MESSAGE_ID_INDEX = "global-error-display"; // Or your chosen ID

// --- Initialization ---
async function initializeIndexPageLogic() {
    if (isIndexAppInitialized) {
        console.log("Index page logic already initialized.");
        return;
    }
    console.log("Initializing index_logic.js...");

    try {
        // Constants are now available directly from the import.
        // Ensure all necessary constants like NATIVE_TARA_DECIMALS etc. are exported from wallet.js
        if (!NATIVE_TARA_DECIMALS || !JANS_DECIMALS || !LP_TOKEN_DECIMALS) {
            console.warn("Decimal constants not fully loaded from wallet.js, using defaults.");
            // Provide fallbacks if truly necessary, but ideally they come from wallet.js
            // NATIVE_TARA_DECIMALS = NATIVE_TARA_DECIMALS || 18;
            // JANS_DECIMALS = JANS_DECIMALS || 18;
            // LP_TOKEN_DECIMALS = LP_TOKEN_DECIMALS || 18;
        }
        
        // Use the getter functions from wallet.js for provider and contract
        const localReadOnlyProvider = getReadOnlyProvider();
        const localReadOnlyContract = getReadOnlyJansGameContract();

        if (!localReadOnlyProvider || !localReadOnlyContract) {
            throw new Error("Read-only provider or contract not available from wallet.js after core initialization.");
        }

        const network = await localReadOnlyProvider.getNetwork();
        console.log(`Index Provider connected: ${network.name} (ID: ${network.chainId.toString()})`);
        console.log("Read-only JansGame contract instance obtained for V8 contract from wallet.js.");

        try {
            gameLpTokenAddress = await localReadOnlyContract.GAME_LP_TOKEN();
            console.log("Game LP Token Address (from V8 contract):", gameLpTokenAddress);
        } catch (e) {
            console.error("Failed to fetch GAME_LP_TOKEN address from V8 contract:", e);
            showGlobalMessage("Error: Could not get LP token address from game contract.", "error", 0, GLOBAL_MESSAGE_ID_INDEX);
        }

        await fetchAllStatsAndUpdateDisplay(); // Initial fetch
        console.log("Index page logic initialization complete for V8 contract.");
        isIndexAppInitialized = true; // Set flag only after successful initialization
        setInterval(fetchAllStatsAndUpdateDisplay, 60000); // Refresh stats every 60 seconds

    } catch (error) {
        console.error("CRITICAL: Index page logic initialization failed:", error.stack);
        showGlobalMessage(`Initialization Error: ${error.message.substring(0, 150)}. Check console.`, "error", 0, GLOBAL_MESSAGE_ID_INDEX);
        updateDisplayOnErrorState("Init Error");
        isIndexAppInitialized = false; // Ensure it's false on error
    }
}

// --- Price Fetching (using ethersInstance from wallet.js for consistency) ---
async function fetchTaraUsdPriceFromCoinGecko() {
    if (!ethersInstance) { console.warn("Ethers instance not ready for CoinGecko fetch."); return null; }
    try {
        const response = await fetch(COINGECKO_TARA_PRICE_URL, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) { console.error(`CoinGecko API Error: ${response.status}`); return null; }
        const data = await response.json(); const price = data?.taraxa?.usd;
        if (typeof price !== 'number' || !isFinite(price) || price <= 0) { console.error(`Invalid price from CoinGecko: ${price}`); return null;}
        return price;
    } catch (e) { console.error(`❌ Error TARA/USD price fetch: ${e.message}`); return null; }
}

async function getJansPerTaraFromDEX() { // Removed provider argument, will use getReadOnlyProvider
    const provider = getReadOnlyProvider();
    if (!provider || !DEX_ROUTER_ADDRESS || !TARA_WETH_ADDRESS || !JANS_TOKEN_ADDRESS || !ethersInstance || !NATIVE_TARA_DECIMALS || !JANS_DECIMALS) {
        console.error("DEBUG: Missing dependencies for getJansPerTaraFromDEX. Ensure wallet.js constants are imported and Ethers core initialized."); return null;
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
    } catch (error) { console.error("Error JANS/TARA DEX rate:", error.message); }
    return null;
}

async function getJansTotalSupply() { // Removed arguments, uses imported constants
    const provider = getReadOnlyProvider();
    let currentJansTokenAbi = await getJansTokenABI(); // Get full ABI if available
    if (!currentJansTokenAbi || currentJansTokenAbi.length <= MINIMAL_ERC20_ABI_FOR_TOTAL_SUPPLY.length) {
        currentJansTokenAbi = MINIMAL_ERC20_ABI_FOR_TOTAL_SUPPLY; // Fallback to minimal
    }

    if (!provider || !JANS_TOKEN_ADDRESS || !currentJansTokenAbi || !JANS_DECIMALS || !ethersInstance) {
         console.error("DEBUG: Missing dependencies for getJansTotalSupply.");
         return { raw: 0n, formatted: "N/A" };
    }
    try {
        const contract = new ethersInstance.Contract(JANS_TOKEN_ADDRESS, currentJansTokenAbi, provider);
        const raw = await contract.totalSupply();
        return { raw, formatted: ethersInstance.formatUnits(raw, JANS_DECIMALS) };
    } catch (e) { console.error(`Error TotalSupply for ${JANS_TOKEN_ADDRESS}:`, e.message); return { raw: 0n, formatted: "Error" }; }
}

async function getLpTokenPriceUsd(lpTokenAddr) { // Removed provider, lpTokenDecimals args
    const provider = getReadOnlyProvider();
    const lpDecimals = LP_TOKEN_DECIMALS; // Use imported constant

    if (!lpTokenAddr || lpTokenAddr === ethersInstance.ZeroAddress || !provider || !ethersInstance || currentTaraPriceUSD === null || currentJansPerTaraRate === null) {
        console.warn("LP Token Price: Missing critical data.", {lpTokenAddr, hasProvider: !!provider, currentTaraPriceUSD, currentJansPerTaraRate});
        return null;
    }

    try {
        const lpPairContract = new ethersInstance.Contract(lpTokenAddr, LP_PAIR_ABI, provider);
        const [reserves, token0Address, token1Address, lpTotalSupplyRaw] = await Promise.all([
            lpPairContract.getReserves(), lpPairContract.token0(), lpPairContract.token1(), lpPairContract.totalSupply()
        ]);

        if (lpTotalSupplyRaw === 0n) { console.warn("LP Token Price: Total supply of LP token is 0."); return 0; }

        const reserve0 = reserves._reserve0; const reserve1 = reserves._reserve1;
        let jansPriceInUsd = 0;
        if (currentJansPerTaraRate > 0 && currentTaraPriceUSD > 0) {
            jansPriceInUsd = currentTaraPriceUSD / currentJansPerTaraRate;
        } else if (currentJansPerTaraRate === 0) {
            jansPriceInUsd = 0;
        } else {
            console.warn("LP Token Price: Cannot determine JANS USD price for reserves calculation."); return null;
        }

        let token0ValueUsd = 0; let token1ValueUsd = 0;
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
            console.warn("LP Token Price: Calculated total pool value is zero or negative with non-zero reserves."); return 0; 
        }
        if (totalPoolValueUsd <= 0) return 0;


        const lpTotalSupplyFormatted = parseFloat(ethersInstance.formatUnits(lpTotalSupplyRaw, lpDecimals));
        if (lpTotalSupplyFormatted > 0) return totalPoolValueUsd / lpTotalSupplyFormatted;
        
        console.warn("LP Token Price: Formatted LP total supply is zero."); return 0;
    } catch (error) {
        console.error(`Error calculating LP token USD price for ${lpTokenAddr}:`, error.message, error.stack);
        return null;
    }
}

// --- UI Update Functions ---
async function fetchAllStatsAndUpdateDisplay() {
    const localReadOnlyContract = getReadOnlyJansGameContract(); // Use getter from wallet.js
    if (!localReadOnlyContract || !ethersInstance) { 
        updateDisplayOnErrorState("Loading Contract..."); 
        console.warn("fetchAllStatsAndUpdateDisplay: Contract or ethersInstance not ready.");
        return; 
    }

    // Fetch external prices first
    currentTaraPriceUSD = await fetchTaraUsdPriceFromCoinGecko();
    currentJansPerTaraRate = await getJansPerTaraFromDEX(); // Uses getReadOnlyProvider internally

    if (currentTaraPriceUSD === null || currentTaraPriceUSD <= 0) {
        console.warn("TARA/USD price N/A or invalid. USD values in stats might be affected.");
    }
    if (currentJansPerTaraRate === null || currentJansPerTaraRate < 0) {
        console.warn("JANS/TARA rate N/A or invalid. USD values for JANS in stats might be affected.");
    }

    await fetchAndDisplayAccumulatedLPFunds(); // Uses readOnlyContract via getReadOnlyJansGameContract
    await fetchAndDisplayOtherIndexStats();   // Uses readOnlyContract via getReadOnlyJansGameContract
    await updateClaimLpButtonStatus();        // Uses readOnlyContract via getReadOnlyJansGameContract
}

function updateDisplayOnErrorState(message = "Error") {
    // ... (your existing function is fine, ensure DOM IDs are correct) ...
    const elementIdsToUpdate = { /* your DOM IDs */ };
    // ...
    showGlobalMessage(message, "error", 0, GLOBAL_MESSAGE_ID_INDEX);
}

async function fetchAndDisplayAccumulatedLPFunds() {
    const createLpButton = document.getElementById("create-lp-button");
    const localReadOnlyContract = getReadOnlyJansGameContract();
    if (!localReadOnlyContract || !ethersInstance) { 
        if(createLpButton) { createLpButton.disabled = true; createLpButton.title = "App not ready."; }
        return; 
    }

    try {
        const funds = await localReadOnlyContract.getAccumulatedLpFormingFunds();
        accumulatedLpFunds = { taraForLPSide: funds.taraForLPSide_, jansForLPSide: funds.jansForLPSide_, taraForReward: funds.taraForReward_ };

        const taraForLPNum = parseFloat(ethersInstance.formatUnits(funds.taraForLPSide_, NATIVE_TARA_DECIMALS));
        const jansForLPNum = parseFloat(ethersInstance.formatUnits(funds.jansForLPSide_, JANS_DECIMALS));
        const rewardNum = parseFloat(ethersInstance.formatUnits(funds.taraForReward_, NATIVE_TARA_DECIMALS));

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
    }
}

async function fetchAndDisplayOtherIndexStats() {
    const localReadOnlyContract = getReadOnlyJansGameContract();
    const localReadOnlyProvider = getReadOnlyProvider(); // Get provider for JANS total supply

    const spans = { /* your DOM element getters */ }; 
    // Example: dailyPool: document.getElementById("current-daily-pool"), etc.
    // Ensure these DOM elements exist in your index.html
    // For brevity, I'm assuming they are correctly fetched as in your original code.

    if (!localReadOnlyContract || !ethersInstance || !localReadOnlyProvider) { 
        updateDisplayOnErrorState("Contract Read Err"); return; 
    }

    try {
        // Prize Pool
        const prizePoolRaw = await localReadOnlyContract.prizePoolJANS();
        const prizePoolJansNum = parseFloat(ethersInstance.formatUnits(prizePoolRaw, JANS_DECIMALS));
        // if (spans.dailyPool) spans.dailyPool.textContent = `${formatPriceWithZeroCount(prizePoolJansNum.toString(), {minNormalDecimals:2, defaultDisplayDecimals:2})} JANS`;
        if (document.getElementById("current-daily-pool")) document.getElementById("current-daily-pool").textContent = `${prizePoolJansNum.toFixed(2)} JANS`;


        // JANS Burned
        const burnedRaw = await localReadOnlyContract.totalJansBurnedInGame();
        const burnedJansNum = parseFloat(ethersInstance.formatUnits(burnedRaw, JANS_DECIMALS));
        // if (spans.burned) spans.burned.textContent = `${formatPriceWithZeroCount(burnedJansNum.toString(), {minNormalDecimals:2, defaultDisplayDecimals:2})} JANS`;
        if (document.getElementById("total-jans-burned")) document.getElementById("total-jans-burned").textContent = `${burnedJansNum.toFixed(2)} JANS`;


        let jansPriceInUsdForDisplay = null;
        if (currentTaraPriceUSD && currentTaraPriceUSD > 0 && currentJansPerTaraRate !== null && currentJansPerTaraRate >= 0) {
            jansPriceInUsdForDisplay = (currentJansPerTaraRate > 0) ? (currentTaraPriceUSD / currentJansPerTaraRate) : 0;
        }

        // if (spans.dailyPoolUsd) { /* Update USD value */ }
        if (document.getElementById("daily-pool-usd")) {
             document.getElementById("daily-pool-usd").textContent = (jansPriceInUsdForDisplay !== null && prizePoolJansNum > 0)
                ? `(${(prizePoolJansNum * jansPriceInUsdForDisplay).toFixed(2)} USD)` : (prizePoolJansNum === 0 ? "($0.00 USD)" : "");
        }
        // if (spans.burnedUsd) { /* Update USD value */ }
        if (document.getElementById("total-burned-usd")) {
            document.getElementById("total-burned-usd").textContent = (jansPriceInUsdForDisplay !== null && burnedJansNum > 0)
                ? `(${(burnedJansNum * jansPriceInUsdForDisplay).toFixed(2)} USD)` : (burnedJansNum === 0 ? "($0.00 USD)" : "");
        }
        

        // LP Balance
        const lpBalRaw = await localReadOnlyContract.getContractLpTokenBalance();
        const lpBalNum = parseFloat(ethersInstance.formatUnits(lpBalRaw, LP_TOKEN_DECIMALS));
        // if (spans.lpPool) spans.lpPool.textContent = `${formatPriceWithZeroCount(lpBalNum.toString(), {minNormalDecimals:4, defaultDisplayDecimals:4})} Game LP Tokens`;
        if (document.getElementById("jans-lp-pool-balance")) document.getElementById("jans-lp-pool-balance").textContent = `${lpBalNum.toFixed(4)} Game LP Tokens`;


        // if (spans.lpPoolUsd && gameLpTokenAddress && gameLpTokenAddress !== ethersInstance.ZeroAddress) { /* ... */ }
         if (document.getElementById("jans-lp-pool-balance-usd") && gameLpTokenAddress && gameLpTokenAddress !== ethersInstance.ZeroAddress) {
            const lpPoolUsdSpan = document.getElementById("jans-lp-pool-balance-usd");
            if (lpBalNum > 0) {
                const lpTokenPrice = await getLpTokenPriceUsd(gameLpTokenAddress); // Uses imported LP_TOKEN_DECIMALS internally
                if (lpTokenPrice !== null && lpTokenPrice >= 0) {
                    lpPoolUsdSpan.textContent = `(${(lpBalNum * lpTokenPrice).toFixed(2)} USD)`;
                } else { lpPoolUsdSpan.textContent = "(USD Value N/A)"; }
            } else { lpPoolUsdSpan.textContent = "($0.00 USD)"; }
        } else if (document.getElementById("jans-lp-pool-balance-usd")) {
            document.getElementById("jans-lp-pool-balance-usd").textContent = gameLpTokenAddress === ethersInstance.ZeroAddress ? "(LP Invalid Address)" :"(LP Address N/A)";
        }


        // Burned Percentage
        // if (spans.burnedPerc) { /* ... */ }
        if (document.getElementById("total-burned-percentage")) {
            const burnedPercSpan = document.getElementById("total-burned-percentage");
            if (JANS_TOKEN_ADDRESS && JANS_DECIMALS) { // ABI is fetched in getJansTotalSupply
                const supplyData = await getJansTotalSupply(); // Uses imported constants and getReadOnlyProvider
                if (supplyData.raw > 0n) {
                    const totalNum = parseFloat(supplyData.formatted);
                    if (totalNum > 0 && burnedJansNum >= 0) {
                        const percentageBurned = (burnedJansNum / totalNum) * 100;
                        burnedPercSpan.textContent = `(${percentageBurned.toFixed(4)}% of Total Supply)`;
                    } else { burnedPercSpan.textContent = burnedJansNum < 0 ? "(Invalid Burn)" : "(Supply 0 or No Burn)"; }
                } else { burnedPercSpan.textContent = supplyData.formatted === "Error" ? "(Supply Err)" : "(Supply 0)"; }
            } else { burnedPercSpan.textContent = "(Supply Config Err)"; }
        }

    } catch (e) { console.error("Error fetching other stats:", e.message, e.stack); updateDisplayOnErrorState("Stats Fetch Err"); }
}

// --- LP Creation & Claim Logic (using connectWalletAndGetSignerInstances from wallet.js) ---
async function handleCreateLP() {
    console.log("Attempting to create LP...");
    showGlobalMessage("Processing LP creation...", "info", 0, GLOBAL_MESSAGE_ID_INDEX); 

    try {
        const localReadOnlyContract = getReadOnlyJansGameContract();
        if (!localReadOnlyContract) throw new Error("Read-only contract instance not available for LP creation.");

        const { taraForLPSide_, jansForLPSide_ } = await localReadOnlyContract.getAccumulatedLpFormingFunds();
        console.log(`Raw accumulated TARA (Wei) from contract: ${taraForLPSide_.toString()}`);
        console.log(`Raw accumulated JANS (smallest unit) from contract: ${jansForLPSide_.toString()}`);

        if (taraForLPSide_ <= 0n || jansForLPSide_ <= 0n) {
            throw new Error("No accumulated TARA or JANS in the contract to form LP.");
        }

        // --- MODIFICATION: INCREASE SLIPPAGE TOLERANCE ---
        // Try a higher slippage percentage, e.g., 1%, 2%, or even 5% if necessary,
        // especially if the accumulated amounts are often imbalanced or small.
        const SLIPPAGE_PERCENT = 2; // Example: 2% slippage (was 0.5%) - TWEAK THIS VALUE
        // For very imbalanced or small amounts, you might need higher, but be aware of the implications.
        // --- END MODIFICATION ---

        const slippageBps = BigInt(Math.floor(SLIPPAGE_PERCENT * 100)); 
        const HUNDRED_PERCENT_BPS = 10000n;

        console.log(`Using slippage tolerance: ${SLIPPAGE_PERCENT}% (${slippageBps.toString()} BPS)`);

        const amountNativeTaraMinForLP = (taraForLPSide_ * (HUNDRED_PERCENT_BPS - slippageBps)) / HUNDRED_PERCENT_BPS;
        const amountJansMinForLP = (jansForLPSide_ * (HUNDRED_PERCENT_BPS - slippageBps)) / HUNDRED_PERCENT_BPS;

        console.log(`Calculated _amountNativeTaraMinForLP (Wei): ${amountNativeTaraMinForLP.toString()}`);
        console.log(`Calculated _amountJansMinForLP (smallest unit): ${amountJansMinForLP.toString()}`);

        const { signer, gameContractWithSigner, userAddress } = await connectWalletAndGetSignerInstances();
        console.log(`LP Creation transaction initiated by: ${userAddress}`);
        
        showGlobalMessage("Sending LP creation transaction... Please confirm in your wallet.", "info", 0, GLOBAL_MESSAGE_ID_INDEX);

        const tx = await gameContractWithSigner.formAndDepositLPFromAccumulated(
            amountJansMinForLP,
            amountNativeTaraMinForLP,
            { gasLimit: 1200000 } 
        );

        showGlobalMessage(`Transaction sent: ${shortenAddress(tx.hash)}. Waiting for confirmation...`, "info", 0, GLOBAL_MESSAGE_ID_INDEX);
        const receipt = await tx.wait();

        if (receipt && receipt.status === 1) {
            showGlobalMessage("LP successfully created and deposited!", "success", 7000, GLOBAL_MESSAGE_ID_INDEX);
            fetchAllStatsAndUpdateDisplay(); 
        } else {
            throw new Error("LP Creation transaction failed on-chain. Status: " + (receipt ? receipt.status : 'unknown'));
        }
    } catch (error) {
        console.error("LP Creation Failed (handleCreateLP):", error);
        let detailedMessage = error.reason || (error.data && error.data.message) || error.message || "Unknown error during LP Creation.";
        if (error.code === "ACTION_REJECTED") detailedMessage = "Transaction rejected by user.";
        else if (error.action === "estimateGas" && error.code === "CALL_EXCEPTION") detailedMessage = "Transaction would revert (estimateGas failed). Check contract funds and consider adjusting slippage if prices are volatile.";
        else if (error.action === "sendTransaction" && error.code === "CALL_EXCEPTION") detailedMessage = "Transaction reverted. Check contract funds, pool ratio, and slippage settings.";
        
        showGlobalMessage(`LP Creation Failed: ${detailedMessage.substring(0,200)}`, "error", 0, GLOBAL_MESSAGE_ID_INDEX);
    }
}


async function handleClaimLpRewards() {
    // ... (your existing function, ensure it uses connectWalletAndGetSignerInstances) ...
    // ... and ensure all contract calls use an ethers.Contract instance correctly initialized ...
    const statusDiv = document.getElementById("lp-claim-status"); // Make sure this ID exists in index.html
    const claimButton = document.getElementById("claim-lp-rewards-button");
    if (!statusDiv || !claimButton) { showGlobalMessage("LP claim UI elements missing.", "error", 0, GLOBAL_MESSAGE_ID_INDEX); return; }
    
    clearGlobalMessage(GLOBAL_MESSAGE_ID_INDEX); // Clear main global message
    statusDiv.textContent = "Preparing to claim LP rewards..."; 
    statusDiv.style.color = "#f39c12"; // Orange for processing
    statusDiv.style.display = 'block'; // Make sure it's visible
    claimButton.disabled = true;

    const localReadOnlyContract = getReadOnlyJansGameContract();
    if (!isIndexAppInitialized || !ethersInstance || !localReadOnlyContract) { // Check ethersInstance too
        showGlobalMessage("Application not ready. Please refresh.", "error", 0, GLOBAL_MESSAGE_ID_INDEX);
        statusDiv.textContent = "Failed: App not ready."; statusDiv.style.color = "#e74c3c"; // Red
        // updateClaimLpButtonStatus(); // This will re-enable button if appropriate after full init
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

        statusDiv.textContent = `Claiming for Distribution ID ${currentDistroId.toString()}... Confirm in wallet.`;
        const tx = await gameContractWithSigner.claimMyLpReward(currentDistroId, { gasLimit: 500000 }); // Added gas limit

        statusDiv.textContent = `Claim Tx Sent (${shortenAddress(tx.hash, 6)})... Waiting for confirmation...`;
        const receipt = await tx.wait(1);

        if (receipt && receipt.status === 1) {
            showGlobalMessage(`LP Rewards for period ${currentDistroId.toString()} claimed successfully!`, "success", 10000, GLOBAL_MESSAGE_ID_INDEX);
            statusDiv.textContent = `Claimed! Tx: ${shortenAddress(receipt.transactionHash || tx.hash, 10)}`;
            statusDiv.style.color = "#2ecc71"; // Green
        } else {
            throw new Error(`LP Reward Claim Tx failed. Period: ${currentDistroId.toString()}. Hash: ${receipt ? receipt.transactionHash : tx.hash}`);
        }

    } catch (error) {
        console.error("Claim LP Rewards Failed:", error);
        let userMessage = error.reason || (error.data && error.data.message) || error.message || 'Unknown LP claim error.';
        if (error.code === "ACTION_REJECTED") userMessage = "Transaction rejected by user.";
        
        showGlobalMessage(`LP Claim Failed: ${userMessage.substring(0,150)}`, "error", 0, GLOBAL_MESSAGE_ID_INDEX);
        statusDiv.textContent = `Failed: ${userMessage.substring(0,100)}`;
        statusDiv.style.color = "#e74c3c"; // Red
    } finally {
        fetchAllStatsAndUpdateDisplay(); // This also calls updateClaimLpButtonStatus
    }
}


async function updateClaimLpButtonStatus() {
    const claimButton = document.getElementById("claim-lp-rewards-button");
    const localReadOnlyContract = getReadOnlyJansGameContract();

    if (!claimButton || !localReadOnlyContract || !isIndexAppInitialized || !ethersInstance) {
        if(claimButton) {claimButton.disabled = true; claimButton.title = "Status cannot be determined yet.";}
        return;
    }

    try {
        claimButton.disabled = true; // Disable by default until checks pass
        const currentDistroId = await localReadOnlyContract.currentLpDistributionId();

        if (currentDistroId === 0n) {
            claimButton.title = "No active LP distribution period."; return;
        }

        const snapshot = await localReadOnlyContract.distributionSnapshots(currentDistroId);
        if (!snapshot.finalized) {
            claimButton.title = `Distribution period ${currentDistroId.toString()} is not finalized.`; return;
        }

        // Attempt to get currently connected address if possible, without forcing connection prompt
        let playerAddress = null;
        if (window.ethereum && window.ethereum.selectedAddress) {
            playerAddress = ethersInstance.getAddress(window.ethereum.selectedAddress);
        } else {
            // Alternative: if wallet was connected for other actions, we might have signer address
            // This part is tricky without a robust global "current user address" state.
            // For now, if not readily available, we might have to prompt or disable.
            // For a simple status update, we can try listAccounts if provider allows without prompt.
            const provider = getReadOnlyProvider(); // Use the read-only provider
            if (provider) {
                 const accounts = await provider.listAccounts();
                 if (accounts && accounts.length > 0) {
                     playerAddress = accounts[0].address; // This is the address string from the Signerlike object
                 }
            }
        }
        
        if (playerAddress) {
            const hasClaimed = await localReadOnlyContract.hasClaimedLpReward(currentDistroId, playerAddress);
            if (hasClaimed) {
                claimButton.title = `Already claimed for distribution ${currentDistroId.toString()}.`; 
                // claimButton.disabled = true; // Already disabled by default
                return;
            }
            claimButton.disabled = false; // Enable only if all checks pass and not claimed
            claimButton.title = `Claim LP rewards for distribution period ${currentDistroId.toString()}.`;
        } else {
            // claimButton.disabled = true; // Keep it disabled if no player address
            claimButton.title = `Connect wallet to check LP claim status for distribution ${currentDistroId.toString()}.`;
        }

    } catch (error) {
        console.warn("Could not update claim button status:", error.message);
        claimButton.disabled = true;
        claimButton.title = "Error determining claim status. See console.";
    }
}


// --- Page Load Initialization ---
// This replaces your previous DOMContentLoaded listener structure
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded for index.html. Attempting to initialize Ethers and App logic...");

    const setupEventListeners = () => {
        const createLpButton = document.getElementById("create-lp-button");
        if (createLpButton) {
            createLpButton.addEventListener("click", (e) => {
                e.preventDefault();
                if (!isIndexAppInitialized || !ethersInstance) { // Check ethersInstance from wallet.js
                    showGlobalMessage("Application not fully initialized. Please wait or refresh.", "warning", 5000, GLOBAL_MESSAGE_ID_INDEX); return;
                }
                handleCreateLP();
            });
        }

        const claimLpButton = document.getElementById("claim-lp-rewards-button");
        if (claimLpButton) {
            claimLpButton.disabled = true; // Start disabled
            claimLpButton.addEventListener("click", (e) => {
                e.preventDefault();
                if (!isIndexAppInitialized || !ethersInstance) {
                    showGlobalMessage("Application not fully initialized. Please wait or refresh.", "warning", 5000, GLOBAL_MESSAGE_ID_INDEX); return;
                }
                handleClaimLpRewards();
            });
        }
    };
    
    function attemptEthersCoreSetup() {
        if (window.ethers) {
            initializeEthersCore(window.ethers) // This is from wallet.js
                .then(() => {
                    console.log("Index page: Ethers core (via wallet.js) initialized successfully.");
                    // Now that ethers core in wallet.js is ready, initialize this page's logic
                    initializeIndexPageLogic(); 
                    setupEventListeners(); // Setup listeners after main logic init might be better
                })
                .catch(error => {
                    console.error("Index page: CRITICAL Ethers Core Initialization Error (from wallet.js):", error);
                    showGlobalMessage(`Critical Error: ${error.message}. Page may not function.`, "error", 0, GLOBAL_MESSAGE_ID_INDEX);
                    updateDisplayOnErrorState("Ethers Init Failed");
                });
        } else {
            console.warn("Index page: Ethers.js not found on window. Waiting for 'ethersReady' or retrying...");
            showGlobalMessage("Waiting for blockchain library...", "info", 0, GLOBAL_MESSAGE_ID_INDEX);
            // Fallback retry, but ethersReady event is better
            const ethersLoadTimeout = setTimeout(() => {
                if (!window.ethers && !isIndexAppInitialized) { // Check isIndexAppInitialized too
                    console.error("Ethers.js did not load after 7 seconds.");
                    showGlobalMessage("Fatal Error: Blockchain library (Ethers.js) failed to load. Please refresh.", "error", 0, GLOBAL_MESSAGE_ID_INDEX);
                }
            }, 7000);

            document.addEventListener('ethersReady', () => {
                console.log("Index page: 'ethersReady' event fired.");
                clearTimeout(ethersLoadTimeout);
                if (window.ethers) attemptEthersCoreSetup(); // Retry initialization
            }, { once: true });
        }
    }

    // Start the initialization process
    attemptEthersCoreSetup();
});
