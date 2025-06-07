// --- wallet.js ---
// Manages constants, ABI loading, Ethers.js core setup, shared utilities, and data fetching services.

// --- Core Contract and Network Configuration ---
export const JANS_GAME_CONTRACT_ADDRESS = "0x7964861254d0e3Dd30f732DB49052198A9b90eae"; // Replace with your V8 contract address
export const TARGET_CHAIN_ID = 841n; // Taraxa Mainnet Chain ID
export const TARGET_NETWORK_NAME = "Taraxa Mainnet";
//export const TARAXA_RPC_URL = "https://rpc.mainnet.taraxa.io/";
export const TARAXA_RPC_URL = "https://841.rpc.thirdweb.com";

// --- DEX and Token Addresses (Ensure these are correct for Taraxa Mainnet and your V8 setup) ---
export const DEX_ROUTER_ADDRESS = "0x329553E2706859Ab82636950c96A8dbbEb28f14A"; // Example, verify this
export const TARA_WETH_ADDRESS = "0x5d0Fa4C5668E5809c83c95A7CeF3a9dd7C68d4fE"; // Example, verify (WETH equivalent on Taraxa)
export const JANS_TOKEN_ADDRESS = "0xA52fc8BD9b64cb971cCa78b558de8DE8615c9a28"; // Example, verify your JANS token address

// --- Decimal Constants ---
export const NATIVE_TARA_DECIMALS = 18;
export const JANS_DECIMALS = 18;
export const LP_TOKEN_DECIMALS = 18; // Assuming your JANS/TARA LP token uses 18 decimals

// --- Configuration Constants ---
export const DEFAULT_SLIPPAGE_BPS_LP = 50n; // 0.5% slippage for LP operations
export const COINGECKO_API_KEY = undefined; // Not used for public API
export const COINGECKO_TARA_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=taraxa&vs_currencies=usd';

// --- Shared ABIs (Minimal versions for common ERC20/LP operations) ---
export const MINIMAL_ERC20_ABI_FOR_BALANCES_TOTALSUPPLY = [
    "function balanceOf(address account) view returns (uint256)",
    "function totalSupply() view returns (uint256)",
    "function decimals() view returns (uint8)"
];
export const LP_PAIR_ABI = [
    "function getReserves() view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function totalSupply() view returns (uint256)",
    "function decimals() view returns (uint8)"
];

// --- Ethers.js Core Instances (Module Scoped) ---
let ethersInstance = null;
let readOnlyProvider = null;
let readOnlyJansGameContract = null;
let cachedJansGameABI = null;
let cachedJansTokenABI = null;

export { ethersInstance }; // Export the instance so other modules can use the same Ethers library reference

/**
 * Initializes shared Ethers.js components. Must be called once ethers.js is available.
 * @param {object} ethersGlobal - The global Ethers.js object (e.g., window.ethers).
 * @throws {Error} If ethersGlobal is not provided or if setup fails.
 */
export async function initializeEthersCore(ethersGlobal) {
    if (!ethersGlobal) {
        throw new Error("Ethers.js global object not provided to initializeEthersCore.");
    }
    if (ethersInstance && readOnlyProvider && readOnlyJansGameContract) {
        console.log("Wallet.js: Ethers Core already initialized.");
        return { ethersInstance, readOnlyProvider, readOnlyJansGameContract };
    }

    ethersInstance = ethersGlobal;
    console.log("Wallet.js: Ethers.js instance assigned (version:", ethersInstance.version || 'unknown', ").");

    try {
        if (!readOnlyProvider) {
            readOnlyProvider = new ethersInstance.JsonRpcProvider(TARAXA_RPC_URL);
            const network = await readOnlyProvider.getNetwork();
            if (network.chainId !== TARGET_CHAIN_ID) {
                console.warn(`Wallet.js: Read-only provider connected to ${network.name} (ID: ${network.chainId}), but TARGET is ${TARGET_NETWORK_NAME} (ID: ${TARGET_CHAIN_ID}).`);
                // Potentially throw an error or alert the user, as this will cause issues.
                // For now, just a warning.
            } else {
                console.log(`Wallet.js: Read-only provider connected to ${TARGET_NETWORK_NAME} (ID: ${network.chainId}).`);
            }
        }
    } catch (e) {
        readOnlyProvider = null;
        ethersInstance = null; // Reset if provider setup fails
        throw new Error(`Wallet.js: Failed to initialize read-only provider with ${TARAXA_RPC_URL}. ${e.message}`);
    }

    if (!readOnlyJansGameContract && readOnlyProvider) {
        const gameABI = await getJansGameABI(); // Ensures ABI is loaded via the corrected path
        if (gameABI) {
            readOnlyJansGameContract = new ethersInstance.Contract(
                JANS_GAME_CONTRACT_ADDRESS,
                gameABI,
                readOnlyProvider
            );
            console.log("Wallet.js: Read-only JansGame contract instance created:", readOnlyJansGameContract.target);
        } else {
            throw new Error("Wallet.js: Could not create read-only JansGame contract, ABI loading failed.");
        }
    }
    return { ethersInstance, readOnlyProvider, readOnlyJansGameContract };
}

export function getReadOnlyProvider() {
    if (!readOnlyProvider) {
        if (window.ethers && !ethersInstance) {
            console.warn("Wallet.js: getReadOnlyProvider attempting late Ethers core init.");
            initializeEthersCore(window.ethers).catch(e => {
                console.error("Wallet.js: Late Ethers core initialization failed in getReadOnlyProvider:", e.message);
            });
        }
        if (!readOnlyProvider) { // Re-check
            throw new Error("Wallet.js: Read-only provider not initialized. Call and await initializeEthersCore first.");
        }
    }
    return readOnlyProvider;
}

export function getReadOnlyJansGameContract() {
    if (!readOnlyJansGameContract) {
         if (window.ethers && !ethersInstance) {
            console.warn("Wallet.js: getReadOnlyJansGameContract attempting late Ethers core init.");
            initializeEthersCore(window.ethers).catch(e => {
                console.error("Wallet.js: Late Ethers core initialization failed in getReadOnlyJansGameContract:", e.message);
            });
        }
        if (!readOnlyJansGameContract) { // Re-check
            throw new Error("Wallet.js: Read-only JansGame contract not initialized. Call and await initializeEthersCore first.");
        }
    }
    return readOnlyJansGameContract;
}

export async function connectWalletAndGetSignerInstances() {
    if (!ethersInstance) {
        if (window.ethers) {
            console.log("Wallet.js: Ethers not globally initialized for connectWallet, attempting now.");
            await initializeEthersCore(window.ethers);
        } else {
            throw new Error("Ethers.js not available. Wallet connection failed.");
        }
    }
    if (typeof window.ethereum === "undefined") {
        throw new Error("Wallet (e.g., MetaMask) not found. Please install a compatible wallet extension.");
    }

    try {
        const browserProvider = new ethersInstance.BrowserProvider(window.ethereum, "any"); // "any" allows network changes
        let accounts;
        try {
            accounts = await browserProvider.send("eth_requestAccounts", []);
            if (!accounts || accounts.length === 0) {
                throw new Error("No accounts returned from wallet provider.");
            }
        } catch (accError) {
            if (accError.code === 4001) throw new Error("Wallet connection rejected by user.");
            throw new Error(`Wallet account access failed: ${accError.message || 'Unknown error'}`);
        }

        const signer = await browserProvider.getSigner();
        const userAddress = await signer.getAddress();
        const network = await browserProvider.getNetwork();

        if (network.chainId !== TARGET_CHAIN_ID) {
            const message = `Please switch your wallet to ${TARGET_NETWORK_NAME} (Chain ID: ${TARGET_CHAIN_ID}). You are on ${network.name} (${network.chainId}).`;
            showGlobalMessage(message, "warning", 10000, "global-message-main"); // Assumes global-message-main exists
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: ethersInstance.toBeHex(TARGET_CHAIN_ID) }],
                });
                // After switch, Ethers.js recommends re-creating provider and signer for safety
                const newProviderAfterSwitch = new ethersInstance.BrowserProvider(window.ethereum);
                const newSigner = await newProviderAfterSwitch.getSigner();
                const newNetwork = await newProviderAfterSwitch.getNetwork();
                const newUserAddress = await newSigner.getAddress();

                if (newNetwork.chainId !== TARGET_CHAIN_ID) { // Double check
                    throw new Error(`Still on incorrect network after switch attempt. Expected ${TARGET_NETWORK_NAME}.`);
                }
                const gameABI = await getJansGameABI();
                const gameContractWithSigner = new ethersInstance.Contract(JANS_GAME_CONTRACT_ADDRESS, gameABI, newSigner);
                console.log("Wallet.js: Network switched. New signer and contract instance created.");
                return { signer: newSigner, provider: newProviderAfterSwitch, gameContractWithSigner, userAddress: newUserAddress };
            } catch (switchError) {
                if (switchError.code === 4902) throw new Error(`${TARGET_NETWORK_NAME} network configuration not found. Please add it to your wallet.`);
                if (switchError.code === 4001) throw new Error("Network switch request rejected by user.");
                throw new Error(`Failed to switch network: ${switchError.message || 'Unknown error during network switch'}`);
            }
        }

        const gameABI = await getJansGameABI();
        const gameContractWithSigner = new ethersInstance.Contract(JANS_GAME_CONTRACT_ADDRESS, gameABI, signer);
        console.log("Wallet.js: Wallet connected successfully on the correct network.");
        return { signer, provider: browserProvider, gameContractWithSigner, userAddress };

    } catch (e) {
        let finalMessage = e.message || 'Wallet connection/setup failed.';
        if (e.code === 4001 && !finalMessage.toLowerCase().includes("rejected")) {
             finalMessage = 'Wallet operation rejected by user.';
        }
        console.error("Wallet.js connectWalletAndGetSignerInstances error:", finalMessage, e);
        throw new Error(finalMessage); // Re-throw for UI to catch
    }
}

export function formatPriceWithZeroCount(priceStr, opts = {}) {
    // ... (Your existing formatPriceWithZeroCount function - kept as is) ...
    const { additionalZeroThreshold = 3, significantDigits = 3, defaultDisplayDecimals = 6, minNormalDecimals = 2 } = opts;
    if (priceStr === undefined || priceStr === null || String(priceStr).trim() === '') return 'N/A';
    const num = parseFloat(String(priceStr).replace(/,/g, ''));
    if (isNaN(num)) return 'Invalid';
    if (num === 0) return num.toFixed(minNormalDecimals);
    const sign = num < 0 ? "-" : "";
    const absNum = Math.abs(num);
    if (absNum > 0 && absNum < 1) {
        const fullPrecisionFractionalPart = absNum.toFixed(20).split('.')[1] || '';
        let leadingZerosInFraction = 0;
        for (let i = 0; i < fullPrecisionFractionalPart.length; i++) {
            if (fullPrecisionFractionalPart[i] === '0') leadingZerosInFraction++;
            else break;
        }
        const additionalZeros = leadingZerosInFraction - 1; // Zeros after "0.0"
        if (additionalZeros >= 0 && leadingZerosInFraction > additionalZeroThreshold) {
            const significantPartStartIndex = leadingZerosInFraction;
            const significantPart = fullPrecisionFractionalPart.substring(significantPartStartIndex);
            const displaySignificant = significantPart.substring(0, significantDigits);
            if (additionalZeros > 0) return `${sign}0.0<span class="zero-count-superscript">(${additionalZeros})</span>${displaySignificant}`;
            return `${sign}0.0${displaySignificant}`;
        }
    }
    let fixedStr = absNum.toFixed(Math.max(minNormalDecimals, defaultDisplayDecimals));
    if (fixedStr.includes('.')) {
        let [integerPart, decimalP] = fixedStr.split('.');
        if (absNum % 1 === 0) return `${sign}${integerPart}.${'0'.repeat(minNormalDecimals)}`;
        decimalP = decimalP.replace(/0+$/, '');
        if (decimalP.length < minNormalDecimals) decimalP = (decimalP + "0".repeat(minNormalDecimals)).substring(0, minNormalDecimals);
        decimalP = decimalP.substring(0, defaultDisplayDecimals);
        if (decimalP === "") return `${sign}${integerPart}.${"0".repeat(minNormalDecimals)}`;
        return `${sign}${integerPart}.${decimalP}`;
    }
    return `${sign}${fixedStr}.${"0".repeat(minNormalDecimals)}`;
}


// --- ABI Loading Functions (Corrected Paths) ---
export async function getJansGameABI() {
    if (cachedJansGameABI) return cachedJansGameABI;
    // Path relative to HTML file (e.g., from frontend/index.html to frontend/abi/...)
    // Assumes wallet.js is in frontend/js/ and ABIs are in frontend/abi/
    const abiPath = 'abi/JansPredictionGameABI.json'; // Corrected path
    console.log(`Wallet.js: Attempting to load JansGame ABI from: ${abiPath}`);
    try {
        const response = await fetch(abiPath); // Use fetch for client-side
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status} while fetching ${abiPath}`);
        }
        const abiData = await response.json();
        cachedJansGameABI = abiData.abi || abiData; // Handle wrapper object
        if (!Array.isArray(cachedJansGameABI) || cachedJansGameABI.length === 0) {
            cachedJansGameABI = null; // Reset cache on invalid ABI
            throw new Error("Parsed JansGame ABI data is not a valid array or is empty.");
        }
        console.log("Wallet.js: JansGame ABI loaded and cached.");
        return cachedJansGameABI;
    } catch (error) {
        console.error("Wallet.js: Failed to load or parse JansGame ABI:", error);
        cachedJansGameABI = null; // Reset cache on error
        throw new Error(`Could not load JansGame contract ABI from ${abiPath}. Reason: ${error.message}`);
    }
}

export async function getJansTokenABI() {
    if (cachedJansTokenABI) return cachedJansTokenABI;
    // Path relative to HTML file
    // Assumes wallet.js is in frontend/js/ and ABIs are in frontend/abi/
    const abiPath = 'abi/JansTokenABI.json'; // Corrected path
    console.log(`Wallet.js: Attempting to load JANS Token ABI from: ${abiPath}`);
    try {
        const response = await fetch(abiPath); // Use fetch for client-side
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status} while fetching ${abiPath}`);
        }
        const abiData = await response.json();
        cachedJansTokenABI = abiData.abi || abiData; // Handle wrapper object
        if (!Array.isArray(cachedJansTokenABI) || cachedJansTokenABI.length === 0) {
            cachedJansTokenABI = null; // Reset cache
            throw new Error("Parsed JANS Token ABI is not a valid array or is empty.");
        }
        console.log("Wallet.js: JANS Token ABI loaded and cached.");
        return cachedJansTokenABI;
    } catch (error) {
        console.error("Wallet.js: Failed to load or parse JANS Token ABI:", error);
        cachedJansTokenABI = null; // Reset cache
        throw new Error(`Could not load JANS Token ABI from ${abiPath}. Reason: ${error.message}`);
    }
}

// --- Helper Utility Functions ---
export function shortenAddress(address, chars = 4) {
    if (!ethersInstance || typeof address !== 'string' || !address.startsWith('0x')) return String(address);
    try {
        const parsed = ethersInstance.getAddress(address); // Validates & checksums
        return `${parsed.substring(0, chars + 2)}...${parsed.substring(parsed.length - chars)}`;
    } catch { return String(address); } // Fallback if getAddress fails (shouldn't if it's a valid address string)
}

let globalMessageHideTimeout = null;
export function showGlobalMessage(message, type = 'error', autoHideDelay = 0, targetElementId = "global-message-main") { // Defaulted targetElementId
    const messageDiv = document.getElementById(targetElementId);
    if (messageDiv) {
        messageDiv.textContent = message;
        // Assumes CSS classes like .message-container .message-error, .message-success etc. exist
        messageDiv.className = `message-container message-${type}`; // Example class structure
        messageDiv.style.display = 'block';

        if (globalMessageHideTimeout) clearTimeout(globalMessageHideTimeout);
        if (autoHideDelay > 0) {
            globalMessageHideTimeout = setTimeout(() => {
                // Check if the current message is still the one we set, to avoid hiding a newer message
                if (messageDiv.textContent === message && messageDiv.classList.contains(`message-${type}`)) {
                    clearGlobalMessage(targetElementId);
                }
            }, autoHideDelay);
        }
    } else {
        // Fallback if the targetElementId is not found on the current page
        const logMethod = type === 'error' ? console.error : (type === 'warning' ? console.warn : console.log);
        logMethod(`GLOBAL MESSAGE (DOM Element ID "${targetElementId}" not found) [${type.toUpperCase()}]: ${message}`);
    }
}

export function clearGlobalMessage(targetElementId = "global-message-main") { // Defaulted targetElementId
    const messageDiv = document.getElementById(targetElementId);
    if (messageDiv) {
        messageDiv.style.display = 'none';
        messageDiv.textContent = '';
        messageDiv.className = 'message-container'; // Reset class
        if (globalMessageHideTimeout) { clearTimeout(globalMessageHideTimeout); globalMessageHideTimeout = null; }
    }
}

// --- Data Fetching Service Functions ---
export async function fetchTaraUsdPriceFromCoinGecko() {
    try {
        const response = await fetch(COINGECKO_TARA_PRICE_URL, { signal: AbortSignal.timeout(10000) }); // 10s timeout
        if (!response.ok) {
            throw new Error(`CoinGecko API Error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        const price = data?.taraxa?.usd;
        if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
            throw new Error(`Invalid or non-positive price data from CoinGecko: ${price}`);
        }
        return price;
    } catch (e) {
        console.error(`Wallet.js: Error fetching TARA/USD price: ${e.message}`);
        return null; // Or throw to let caller handle
    }
}

export async function getJansPerTaraFromDEX(providerOrSignerInstance) {
    if (!providerOrSignerInstance || !DEX_ROUTER_ADDRESS || !TARA_WETH_ADDRESS || !JANS_TOKEN_ADDRESS || !ethersInstance) {
        console.error("Wallet.js: Missing dependencies for getJansPerTaraFromDEX. Ensure Ethers is initialized and constants are correct.");
        return null;
    }
    try {
        const routerAbi = ["function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)"];
        const routerContract = new ethersInstance.Contract(DEX_ROUTER_ADDRESS, routerAbi, providerOrSignerInstance);
        const oneTaraWei = ethersInstance.parseUnits("1", NATIVE_TARA_DECIMALS);
        const path = [TARA_WETH_ADDRESS, JANS_TOKEN_ADDRESS]; // Path: TARA (WETH) -> JANS
        const amountsOut = await routerContract.getAmountsOut(oneTaraWei, path);

        if (amountsOut && amountsOut.length >= 2) {
            const jansForOneTaraWei = amountsOut[amountsOut.length - 1]; // Last element is the output amount
            if (jansForOneTaraWei >= 0n) { // Should always be positive if successful
                return parseFloat(ethersInstance.formatUnits(jansForOneTaraWei, JANS_DECIMALS));
            }
        }
        console.warn("Wallet.js (getJansPerTaraFromDEX): getAmountsOut did not return expected data.");
    } catch (error) {
        console.error("Wallet.js: Error fetching JANS/TARA DEX rate:", error.message);
    }
    return null;
}

export async function getTokenTotalSupply(providerOrSignerInstance, tokenAddr, tokenAbi, tokenDecimals) {
    if (!providerOrSignerInstance || !tokenAddr || !tokenAbi || tokenDecimals === undefined || !ethersInstance) {
        console.error("Wallet.js: Missing dependencies for getTokenTotalSupply.");
        return { raw: 0n, formatted: "N/A" };
    }
    try {
        const contract = new ethersInstance.Contract(tokenAddr, tokenAbi, providerOrSignerInstance);
        const raw = await contract.totalSupply();
        return { raw, formatted: ethersInstance.formatUnits(raw, tokenDecimals) };
    } catch (e) {
        console.error(`Wallet.js: Error fetching TotalSupply for ${tokenAddr}:`, e.message);
        return { raw: 0n, formatted: "Error" };
    }
}

export async function getLpTokenPriceUsd(
    lpTokenAddr,
    lpTokenDecimals, // Typically 18 for Uniswap V2 LP tokens
    providerOrSignerInstance,
    currentTaraUsdPriceExt, // Pass externally fetched TARA price
    currentJansPerTaraRateExt // Pass externally fetched JANS/TARA rate
) {
    const zeroAddr = "0x0000000000000000000000000000000000000000";
    if (!lpTokenAddr || lpTokenAddr === zeroAddr || !providerOrSignerInstance || !ethersInstance ||
        currentTaraUsdPriceExt === null || currentTaraUsdPriceExt <= 0 ||
        currentJansPerTaraRateExt === null || currentJansPerTaraRateExt < 0) { // Jans/TARA can be 0 if JANS price is extremely low
        console.warn("Wallet.js (LP Price): Missing critical data for LP price calculation.", { lpTokenAddr, currentTaraUsdPriceExt, currentJansPerTaraRateExt });
        return null;
    }

    try {
        const lpPairContract = new ethersInstance.Contract(lpTokenAddr, LP_PAIR_ABI, providerOrSignerInstance);
        const [reserves, token0Address, token1Address, lpTotalSupplyRaw] = await Promise.all([
            lpPairContract.getReserves(),
            lpPairContract.token0(),
            lpPairContract.token1(),
            lpPairContract.totalSupply()
        ]);

        if (lpTotalSupplyRaw === 0n) {
            console.warn("Wallet.js (LP Price): Total supply of LP token is 0.");
            return 0; // Price is 0 if no LP tokens exist
        }

        const reserve0 = reserves._reserve0; // This is a BigInt
        const reserve1 = reserves._reserve1; // This is a BigInt

        let jansPriceInUsd = 0;
        if (currentJansPerTaraRateExt > 0) { // Avoid division by zero if JANS has no value relative to TARA
            jansPriceInUsd = currentTaraUsdPriceExt / currentJansPerTaraRateExt;
        } else if (currentJansPerTaraRateExt === 0 && currentTaraUsdPriceExt > 0) {
            // This implies JANS price is effectively infinite relative to TARA or TARA has value and JANS doesn't.
            // For simplicity, if JANS/TARA is 0, JANS USD price is 0 unless TARA USD is also 0.
            jansPriceInUsd = 0;
        }


        let totalPoolValueUsd = 0;
        const t0AddrNormalized = ethersInstance.getAddress(token0Address);
        const t1AddrNormalized = ethersInstance.getAddress(token1Address);
        const wTaraAddrNormalized = ethersInstance.getAddress(TARA_WETH_ADDRESS);
        const jansAddrNormalized = ethersInstance.getAddress(JANS_TOKEN_ADDRESS);

        // Calculate value of reserve0
        if (t0AddrNormalized === wTaraAddrNormalized) {
            totalPoolValueUsd += parseFloat(ethersInstance.formatUnits(reserve0, NATIVE_TARA_DECIMALS)) * currentTaraUsdPriceExt;
        } else if (t0AddrNormalized === jansAddrNormalized) {
            totalPoolValueUsd += parseFloat(ethersInstance.formatUnits(reserve0, JANS_DECIMALS)) * jansPriceInUsd;
        } else {
            console.warn(`Wallet.js (LP Price): LP Token0 (${t0AddrNormalized}) is neither recognized TARA_WETH nor JANS_TOKEN.`);
        }

        // Calculate value of reserve1
        if (t1AddrNormalized === wTaraAddrNormalized) {
            totalPoolValueUsd += parseFloat(ethersInstance.formatUnits(reserve1, NATIVE_TARA_DECIMALS)) * currentTaraUsdPriceExt;
        } else if (t1AddrNormalized === jansAddrNormalized) {
            totalPoolValueUsd += parseFloat(ethersInstance.formatUnits(reserve1, JANS_DECIMALS)) * jansPriceInUsd;
        } else {
            console.warn(`Wallet.js (LP Price): LP Token1 (${t1AddrNormalized}) is neither recognized TARA_WETH nor JANS_TOKEN.`);
        }

        if (totalPoolValueUsd <= 0) {
            if (reserve0 > 0n || reserve1 > 0n) {
                 console.warn(`Wallet.js (LP Price): Calculated total pool USD value is <=0 despite non-zero reserves. Check token price inputs. Pool value: ${totalPoolValueUsd}`);
            }
            return 0; // If pool value is 0, LP token price is 0
        }

        const lpTotalSupplyFormatted = parseFloat(ethersInstance.formatUnits(lpTotalSupplyRaw, lpTokenDecimals));
        if (lpTotalSupplyFormatted > 0) {
            return totalPoolValueUsd / lpTotalSupplyFormatted;
        }

        console.warn("Wallet.js (LP Price): Formatted LP total supply is zero, or calculation led to zero price.");
        return 0;
    } catch (error) {
        console.error(`Wallet.js: Error calculating LP token USD price for ${lpTokenAddr}:`, error.message, error.stack);
        return null; // Or throw
    }
}

export async function fetchJsonFile(filePath) {
    // This function is for fetching JSON files that are part of the frontend deployment (e.g., in frontend/data/)
    try {
        // Adding cache-busting parameter for development; remove or adjust for production if using HTTP caching.
        const response = await fetch(`${filePath}?v=${Date.now()}`);
        if (!response.ok) {
            console.error(`Wallet.js: Failed to fetch JSON file at ${filePath}. Status: ${response.status} ${response.statusText}`);
            // Consider specific handling for 404 vs other errors
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error(`Wallet.js: Error fetching or parsing JSON from ${filePath}:`, error);
        return null;
    }
}

// Example of how other scripts might initialize and use this wallet.js:
// This section is for illustrative purposes and would typically be in consuming scripts like main_page_logic.js
/*
import {
    initializeEthersCore,
    getReadOnlyJansGameContract,
    // ... other functions and constants needed by the consuming script
    ethersInstance // Exported for direct use if necessary
} from './wallet.js'; // Assuming wallet.js is in the same directory or path is adjusted

document.addEventListener('DOMContentLoaded', async () => {
    if (window.ethers) { // Check if Ethers.js from CDN is loaded
        try {
            await initializeEthersCore(window.ethers); // Initialize shared Ethers components
            console.log("Main App: Wallet.js core initialized. Ethers version in use:", ethersInstance.version);

            const readOnlyGameContract = getReadOnlyJansGameContract();
            console.log("Main App: Read-only game contract target:", readOnlyGameContract.target);

            // ... rest of your application logic that depends on wallet.js components ...

        } catch (initError) {
            console.error("Main App: Critical initialization error from wallet.js:", initError);
            // Display user-friendly error message, e.g., using showGlobalMessage if available
            // showGlobalMessage(`Initialization Failed: ${initError.message}`, "error", 0, "your-main-message-div");
            alert(`Initialization Error: ${initError.message}. The application might not work correctly.`);
        }
    } else {
        console.error("Main App: Ethers.js library not found on window object! Cannot initialize blockchain interactions.");
        alert("Required blockchain library (Ethers.js) not loaded. Please check your internet connection or browser console.");
    }
});
*/
