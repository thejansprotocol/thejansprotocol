// burn_logic.js

// --- Configuration ---
// OPTION 1: Import from wallet.js (if wallet.js exports them and is correctly set up)
// import {
//     TARAXA_RPC_URL as RPC_URL,
//     JANS_GAME_CONTRACT_ADDRESS,
//     JANS_TOKEN_ADDRESS, // You need the JANS token contract address
//     getJansGameABI,     // Function to get JansGame ABI
//     // You might need a function for minimal ERC20 ABI or define it here
// } from './wallet.js'; // Adjust path as needed

// OPTION 2: Define directly (Simpler for a standalone page)
const RPC_URL = "https://rpc.mainnet.taraxa.io"; // YOUR ACTUAL RPC URL
const JANSGAME_CONTRACT_ADDRESS = "0x097D172977a7d75C0e326ED7A0e53284263095D3"; // YOUR JANS GAME CONTRACT ADDRESS
const JANS_TOKEN_ADDRESS = "0xA52fc8BD9b64cb971cCa78b558de8DE8615c9a28"; // ❗ IMPORTANT: Add your JANS token address

// Minimal ABI for ERC20 totalSupply function
const MINIMAL_ERC20_ABI = [
    {"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},
    {"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"}
];

// Module-scoped variables for JansGame ABI (assuming it's loaded via wallet.js or fetched)
let jansGameABI_loaded = null; // This will be loaded

// If NOT using wallet.js to provide the JansGame ABI, you'd fetch it here or paste it.
// For this example, let's assume you have a way to get it (e.g., a JSON file)
// Or, if wallet.js is used, getJansGameABI would be imported.
// To keep this script more standalone for now, I'll show a fetch example for JansGame ABI:
const JANS_GAME_ABI_PATH = 'abi/JansPredictionGameABI.json'; // ADJUST PATH if using this

let provider;
let jansGameContract;
let jansTokenContract;

// --- DOM Elements ---
const totalSupplyEl = document.getElementById("total-supply");
const totalBurnedEl = document.getElementById("total-burned");
const percentBurnedEl = document.getElementById("percent-burned");
const burningCycleEl = document.getElementById("burning-cycle");
// const burnRatio24hEl = document.getElementById("burn-ratio-24h"); // Already set to N/A

// --- Helper Functions ---
function formatBigNumber(bn, decimals = 18, precision = 2) {
    if (typeof bn === 'undefined' || bn === null) return 'N/A';
    try {
        const formatted = window.ethers.formatUnits(bn, decimals);
        // Ensure precision formatting
        const num = parseFloat(formatted);
        if (isNaN(num)) return formatted; // If somehow not a number after formatting
        return num.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision });
    } catch (e) {
        console.warn("Format BigNumber Error:", bn, e);
        return bn.toString(); // Fallback to raw string
    }
}

async function loadJansGameABI() {
    // If importing from wallet.js:
    // if (typeof getJansGameABI === 'function') {
    //     const abiResult = await getJansGameABI();
    //     jansGameABI_loaded = (abiResult && abiResult.abi && Array.isArray(abiResult.abi)) ? abiResult.abi : (Array.isArray(abiResult) ? abiResult : null);
    //     if (!jansGameABI_loaded || jansGameABI_loaded.length < 5) throw new Error("Jans Game ABI from wallet.js is invalid.");
    //     return;
    // }
    // Fallback to fetching if not using wallet.js import for ABI:
    try {
        const response = await fetch(JANS_GAME_ABI_PATH);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} fetching ${JANS_GAME_ABI_PATH}`);
        const abiData = await response.json();
        jansGameABI_loaded = (abiData && abiData.abi && Array.isArray(abiData.abi)) ? abiData.abi : (Array.isArray(abiData) ? abiData : null);
        if (!jansGameABI_loaded || jansGameABI_loaded.length < 5) throw new Error("Jans Game ABI fetched is invalid.");
    } catch (error) {
        console.error("Failed to load JansGame ABI:", error);
        throw error;
    }
}


// --- Main Logic ---
async function initializeAndFetchStats() {
    if (!RPC_URL || RPC_URL.includes("YOUR_") ||
        !JANSGAME_CONTRACT_ADDRESS || JANSGAME_CONTRACT_ADDRESS.includes("YOUR_") ||
        !JANS_TOKEN_ADDRESS || JANS_TOKEN_ADDRESS.includes("YOUR_")) {
        console.error("FATAL: RPC_URL, JANSGAME_CONTRACT_ADDRESS, or JANS_TOKEN_ADDRESS is not configured.");
        if(totalSupplyEl) totalSupplyEl.textContent = "Config Error";
        // Display a more prominent error on the page if possible
        return;
    }

    try {
        await loadJansGameABI(); // Make sure this is loaded before creating jansGameContract
        if (!jansGameABI_loaded) {
            throw new Error("JansGame ABI could not be loaded.");
        }

        provider = new window.ethers.JsonRpcProvider(RPC_URL);
        jansGameContract = new window.ethers.Contract(JANSGAME_CONTRACT_ADDRESS, jansGameABI_loaded, provider);
        jansTokenContract = new window.ethers.Contract(JANS_TOKEN_ADDRESS, MINIMAL_ERC20_ABI, provider);

        console.log("Contracts initialized. Fetching burn stats...");
        await fetchBurnStats();
        // setInterval(fetchBurnStats, 60000); // Optional: Refresh every 60 seconds
    } catch (err) {
        console.error("Initialization or initial fetch Error:", err);
        if(totalSupplyEl) totalSupplyEl.textContent = "Error";
        if(totalBurnedEl) totalBurnedEl.textContent = "Error";
        if(percentBurnedEl) percentBurnedEl.textContent = "Error";
        if(burningCycleEl) burningCycleEl.textContent = "Error";
        // Display error on page if globalErrorDisplay element existed
    }
}

async function fetchBurnStats() {
    try {
        if (!jansTokenContract || !jansGameContract) {
            console.error("Contracts not initialized yet for fetchBurnStats.");
            return;
        }

        console.log("Fetching totalSupply from JANS token...");
        const currentTotalSupplyRaw = await jansTokenContract.totalSupply();
        const jansDecimals = await jansTokenContract.decimals() || 18; // Fetch decimals or default

        console.log("Fetching totalJansBurnedInGame from JansGame contract...");
        const totalBurnedRaw = await jansGameContract.totalJansBurnedInGame();

        // Calculate original total supply (assuming JANS is not mintable beyond initial and only burning reduces it)
        // This calculation assumes totalBurnedRaw is the amount burned from an initial, larger supply.
        const originalTotalSupplyRaw = currentTotalSupplyRaw + totalBurnedRaw;

        totalSupplyEl.textContent = formatBigNumber(currentTotalSupplyRaw, Number(jansDecimals));
        totalBurnedEl.textContent = formatBigNumber(totalBurnedRaw, Number(jansDecimals));

        if (originalTotalSupplyRaw > 0n) { // Avoid division by zero
            const percentBurned = (Number(totalBurnedRaw) / Number(originalTotalSupplyRaw)) * 100;
            percentBurnedEl.textContent = percentBurned.toFixed(2) + "%";

            const fivePercentThreshold = originalTotalSupplyRaw / 20n; // 5% = 1/20th
            if (fivePercentThreshold > 0n) {
                const completedCycles = totalBurnedRaw / fivePercentThreshold; // Integer division gives completed cycles
                burningCycleEl.textContent = (completedCycles + 1n).toString(); // Current cycle is one more than completed
            } else {
                 burningCycleEl.textContent = originalTotalSupplyRaw > 0n ? "1" : "N/A"; // If 5% is 0, means original supply is too small
            }
        } else {
            percentBurnedEl.textContent = "0.00%";
            burningCycleEl.textContent = "N/A"; // Or "1" if supply is 0 implies cycle 1
        }

        // "% Burning ratio every 24 hs" - This remains N/A as it requires historical data logging.
        // document.getElementById("burn-ratio-24h").textContent = "N/A"; // Already set in HTML

    } catch (error) {
        console.error("Error fetching burn stats:", error);
        if(totalSupplyEl) totalSupplyEl.textContent = "Error";
        if(totalBurnedEl) totalBurnedEl.textContent = "Error";
        if(percentBurnedEl) percentBurnedEl.textContent = "Error";
        if(burningCycleEl) burningCycleEl.textContent = "Error";
    }
}

// --- Initialize ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAndFetchStats);
} else {
    initializeAndFetchStats();
}
