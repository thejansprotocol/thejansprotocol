// --- wallet.js ---
// Manages constants, ABI loading, Ethers.js core setup, shared utilities, and data fetching services.

// --- Core Contract and Network Configuration ---
export const JANS_GAME_CONTRACT_ADDRESS = "0x90A5b4f5f3bbD72F6b5DCC9226a7CF1E00437011"; 
export const TARGET_CHAIN_ID = 841n; // Taraxa Mainnet Chain ID
export const TARGET_NETWORK_NAME = "Taraxa Mainnet";
export const TARAXA_RPC_URL = "https://rpc.mainnet.taraxa.io/";

// --- DEX and Token Addresses ---
export const DEX_ROUTER_ADDRESS = "0x329553E2706859Ab82636950c96A8dbbEb28f14A";
export const TARA_WETH_ADDRESS = "0x5d0Fa4C5668E5809c83c95A7CeF3a9dd7C68d4fE";
export const JANS_TOKEN_ADDRESS = "0xA52fc8BD9b64cb971cCa78b558de8DE8615c9a28";

// --- Decimal Constants ---
export const NATIVE_TARA_DECIMALS = 18;
export const JANS_DECIMALS = 18;
export const LP_TOKEN_DECIMALS = 18;

// --- Configuration Constants ---
export const COINGECKO_TARA_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=taraxa&vs_currencies=usd';

// --- Shared ABIs ---
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
export let cachedJansGameABI = null;
export let cachedJansTokenABI = null;

export { ethersInstance };

/**
 * Initializes shared Ethers.js components.
 */
export async function initializeEthersCore(ethersGlobal) {
    if (!ethersGlobal) {
        throw new Error("Ethers.js global object not provided to initializeEthersCore.");
    }
    if (ethersInstance) {
        console.log("Wallet.js: Ethers Core already initialized.");
        return { ethersInstance, readOnlyProvider, readOnlyJansGameContract };
    }

    ethersInstance = ethersGlobal;
    console.log("Wallet.js: Ethers.js instance assigned.");

    try {
        readOnlyProvider = new ethersInstance.JsonRpcProvider(TARAXA_RPC_URL);
        const network = await readOnlyProvider.getNetwork();
        if (network.chainId !== TARGET_CHAIN_ID) {
            console.warn(`Wallet.js: Read-only provider connected to ${network.name}, but TARGET is ${TARGET_NETWORK_NAME}.`);
        } else {
            console.log(`Wallet.js: Read-only provider connected to ${TARGET_NETWORK_NAME}.`);
        }
    } catch (e) {
        throw new Error(`Wallet.js: Failed to initialize read-only provider. ${e.message}`);
    }

    const gameABI = await getJansGameABI(); // Load and cache the ABI
    if (gameABI) {
        readOnlyJansGameContract = new ethersInstance.Contract(
            JANS_GAME_CONTRACT_ADDRESS,
            gameABI,
            readOnlyProvider
        );
        console.log("Wallet.js: Read-only JansGame contract instance created.");
    } else {
        throw new Error("Wallet.js: Could not create read-only JansGame contract, ABI loading failed.");
    }
    
    // Also load the token ABI into cache on initialization
    await getJansTokenABI();

    return { ethersInstance, readOnlyProvider, readOnlyJansGameContract };
}

export function getReadOnlyProvider() {
    if (!readOnlyProvider) {
        throw new Error("Wallet.js: Read-only provider not initialized. Call initializeEthersCore first.");
    }
    return readOnlyProvider;
}

export function getReadOnlyJansGameContract() {
    if (!readOnlyJansGameContract) {
        throw new Error("Wallet.js: Read-only JansGame contract not initialized. Call initializeEthersCore first.");
    }
    return readOnlyJansGameContract;
}

export async function connectWalletAndGetSignerInstances() {
    if (!ethersInstance) {
        if (window.ethers) {
            await initializeEthersCore(window.ethers);
        } else {
            throw new Error("Ethers.js not available. Wallet connection failed.");
        }
    }
    if (typeof window.ethereum === "undefined") {
        throw new Error("Wallet (e.g., MetaMask) not found.");
    }

    try {
        const browserProvider = new ethersInstance.BrowserProvider(window.ethereum, "any");
        
        try {
            await browserProvider.send("eth_requestAccounts", []);
        } catch (accError) {
            if (accError.code === 4001) throw new Error("Wallet connection rejected by user.");
            throw new Error(`Wallet account access failed: ${accError.message}`);
        }

        const signer = await browserProvider.getSigner();
        const userAddress = await signer.getAddress();
        const network = await browserProvider.getNetwork();

        if (network.chainId !== TARGET_CHAIN_ID) {
            const message = `Please switch your wallet to ${TARGET_NETWORK_NAME}.`;
            showGlobalMessage(message, "warning", 10000, "global-message-main");
            
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: ethersInstance.toBeHex(TARGET_CHAIN_ID) }],
                });
                const newProviderAfterSwitch = new ethersInstance.BrowserProvider(window.ethereum);
                const newSigner = await newProviderAfterSwitch.getSigner();
                const newUserAddress = await newSigner.getAddress();
                
                if (!cachedJansGameABI) {
                    throw new Error("JansGame ABI not cached after network switch.");
                }
                const gameContractWithSigner = new ethersInstance.Contract(JANS_GAME_CONTRACT_ADDRESS, cachedJansGameABI, newSigner);
                
                console.log("Wallet.js: Network switched. New signer and contract instance created.");
                return { signer: newSigner, provider: newProviderAfterSwitch, gameContractWithSigner, userAddress: newUserAddress };

            } catch (switchError) {
                if (switchError.code === 4902) throw new Error(`${TARGET_NETWORK_NAME} not found. Please add it to your wallet.`);
                if (switchError.code === 4001) throw new Error("Network switch rejected by user.");
                throw new Error(`Failed to switch network: ${switchError.message}`);
            }
        }

        if (!cachedJansGameABI) {
            throw new Error("JansGame ABI not cached. Ensure initializeEthersCore has run successfully.");
        }
        const gameContractWithSigner = new ethersInstance.Contract(JANS_GAME_CONTRACT_ADDRESS, cachedJansGameABI, signer);
        
        console.log("Wallet.js: Wallet connected successfully on the correct network.");
        return { signer, provider: browserProvider, gameContractWithSigner, userAddress };

    } catch (e) {
        let finalMessage = e.message || 'Wallet connection/setup failed.';
        if (e.code === 4001 && !finalMessage.toLowerCase().includes("rejected")) {
            finalMessage = 'Wallet operation rejected by user.';
        }
        console.error("Wallet.js connectWalletAndGetSignerInstances error:", finalMessage, e);
        throw new Error(finalMessage);
    }
}

// --- ABI Loading Functions ---
export async function getJansGameABI() {
    if (cachedJansGameABI) return cachedJansGameABI;
    const abiPath = 'abi/JansPredictionGameABI.json';
    console.log(`Wallet.js: Attempting to load JansGame ABI from: ${abiPath}`);
    try {
        const response = await fetch(abiPath);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const abiData = await response.json();
        cachedJansGameABI = abiData.abi || abiData;
        if (!Array.isArray(cachedJansGameABI) || cachedJansGameABI.length === 0) {
            cachedJansGameABI = null;
            throw new Error("Parsed JansGame ABI data is not a valid array.");
        }
        console.log("Wallet.js: JansGame ABI loaded and cached.");
        return cachedJansGameABI;
    } catch (error) {
        console.error("Wallet.js: Failed to load or parse JansGame ABI:", error);
        cachedJansGameABI = null;
        throw new Error(`Could not load JansGame contract ABI. Reason: ${error.message}`);
    }
}

export async function getJansTokenABI() {
    if (cachedJansTokenABI) return cachedJansTokenABI;
    const abiPath = 'abi/JansTokenABI.json';
    console.log(`Wallet.js: Attempting to load JANS Token ABI from: ${abiPath}`);
    try {
        const response = await fetch(abiPath);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const abiData = await response.json();
        cachedJansTokenABI = abiData.abi || abiData;
        if (!Array.isArray(cachedJansTokenABI) || cachedJansTokenABI.length === 0) {
            cachedJansTokenABI = null;
            throw new Error("Parsed JANS Token ABI is not a valid array.");
        }
        console.log("Wallet.js: JANS Token ABI loaded and cached.");
        return cachedJansTokenABI;
    } catch (error) {
        console.error("Wallet.js: Failed to load or parse JANS Token ABI:", error);
        cachedJansTokenABI = null;
        throw new Error(`Could not load JANS Token ABI. Reason: ${error.message}`);
    }
}

// --- Helper & Data Fetching Functions ---
export function formatPriceWithZeroCount(priceStr, opts = {}) {
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
        const additionalZeros = leadingZerosInFraction - 1;
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

export function shortenAddress(address, chars = 4) {
    if (!ethersInstance || typeof address !== 'string' || !address.startsWith('0x')) return String(address);
    try {
        const parsed = ethersInstance.getAddress(address);
        return `${parsed.substring(0, chars + 2)}...${parsed.substring(parsed.length - chars)}`;
    } catch { return String(address); }
}

let globalMessageHideTimeout = null;
export function showGlobalMessage(message, type = 'error', autoHideDelay = 0, targetElementId = "global-message-main") {
    const messageDiv = document.getElementById(targetElementId);
    if (messageDiv) {
        messageDiv.textContent = message;
        messageDiv.className = `message-container message-${type}`;
        messageDiv.style.display = 'block';
        if (globalMessageHideTimeout) clearTimeout(globalMessageHideTimeout);
        if (autoHideDelay > 0) {
            globalMessageHideTimeout = setTimeout(() => {
                if (messageDiv.textContent === message) {
                    clearGlobalMessage(targetElementId);
                }
            }, autoHideDelay);
        }
    } else {
        const logMethod = type === 'error' ? console.error : (type === 'warning' ? console.warn : console.log);
        logMethod(`GLOBAL MESSAGE (DOM ID "${targetElementId}" not found) [${type.toUpperCase()}]: ${message}`);
    }
}

export function clearGlobalMessage(targetElementId = "global-message-main") {
    const messageDiv = document.getElementById(targetElementId);
    if (messageDiv) {
        messageDiv.style.display = 'none';
        messageDiv.textContent = '';
        messageDiv.className = 'message-container';
        if (globalMessageHideTimeout) { clearTimeout(globalMessageHideTimeout); globalMessageHideTimeout = null; }
    }
}

export async function fetchTaraUsdPriceFromCoinGecko() {
    try {
        const response = await fetch(COINGECKO_TARA_PRICE_URL, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`CoinGecko API Error: ${response.status}`);
        const data = await response.json();
        const price = data?.taraxa?.usd;
        if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
            throw new Error(`Invalid price data from CoinGecko: ${price}`);
        }
        return price;
    } catch (e) {
        console.error(`Wallet.js: Error fetching TARA/USD price: ${e.message}`);
        return null;
    }
}

export async function getJansPerTaraFromDEX(providerOrSignerInstance) {
    if (!providerOrSignerInstance || !DEX_ROUTER_ADDRESS || !TARA_WETH_ADDRESS || !JANS_TOKEN_ADDRESS || !ethersInstance) {
        return null;
    }
    try {
        const routerAbi = ["function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)"];
        const routerContract = new ethersInstance.Contract(DEX_ROUTER_ADDRESS, routerAbi, providerOrSignerInstance);
        const oneTaraWei = ethersInstance.parseUnits("1", NATIVE_TARA_DECIMALS);
        const path = [TARA_WETH_ADDRESS, JANS_TOKEN_ADDRESS];
        const amountsOut = await routerContract.getAmountsOut(oneTaraWei, path);
        if (amountsOut && amountsOut.length >= 2) {
            const jansForOneTaraWei = amountsOut[1];
            return parseFloat(ethersInstance.formatUnits(jansForOneTaraWei, JANS_DECIMALS));
        }
    } catch (error) {
        console.error("Wallet.js: Error fetching JANS/TARA DEX rate:", error.message);
    }
    return null;
}

export async function getTokenTotalSupply(providerOrSignerInstance, tokenAddr, tokenAbi, tokenDecimals) {
    if (!providerOrSignerInstance || !tokenAddr || !tokenAbi || tokenDecimals === undefined || !ethersInstance) {
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
    lpTokenDecimals,
    providerOrSignerInstance,
    currentTaraUsdPriceExt,
    currentJansPerTaraRateExt
) {
    const zeroAddr = "0x0000000000000000000000000000000000000000";
    if (!lpTokenAddr || lpTokenAddr === zeroAddr || !providerOrSignerInstance || !ethersInstance ||
        currentTaraUsdPriceExt === null || currentTaraUsdPriceExt <= 0 ||
        currentJansPerTaraRateExt === null || currentJansPerTaraRateExt < 0) {
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

        if (lpTotalSupplyRaw === 0n) return 0;

        const reserve0 = reserves._reserve0;
        const reserve1 = reserves._reserve1;
        
        let jansPriceInUsd = 0;
        if (currentJansPerTaraRateExt > 0) {
            jansPriceInUsd = currentTaraUsdPriceExt / currentJansPerTaraRateExt;
        }

        let totalPoolValueUsd = 0;
        const t0AddrNormalized = ethersInstance.getAddress(token0Address);
        const wTaraAddrNormalized = ethersInstance.getAddress(TARA_WETH_ADDRESS);
        const jansAddrNormalized = ethersInstance.getAddress(JANS_TOKEN_ADDRESS);

        if (t0AddrNormalized === wTaraAddrNormalized) {
            totalPoolValueUsd += parseFloat(ethersInstance.formatUnits(reserve0, NATIVE_TARA_DECIMALS)) * currentTaraUsdPriceExt;
            totalPoolValueUsd += parseFloat(ethersInstance.formatUnits(reserve1, JANS_DECIMALS)) * jansPriceInUsd;
        } else if (t0AddrNormalized === jansAddrNormalized) {
            totalPoolValueUsd += parseFloat(ethersInstance.formatUnits(reserve0, JANS_DECIMALS)) * jansPriceInUsd;
            totalPoolValueUsd += parseFloat(ethersInstance.formatUnits(reserve1, NATIVE_TARA_DECIMALS)) * currentTaraUsdPriceExt;
        }

        if (totalPoolValueUsd <= 0) return 0;
        
        const lpTotalSupplyFormatted = parseFloat(ethersInstance.formatUnits(lpTotalSupplyRaw, lpTokenDecimals));
        if (lpTotalSupplyFormatted > 0) {
            return totalPoolValueUsd / lpTotalSupplyFormatted;
        }
        return 0;
    } catch (error) {
        console.error(`Wallet.js: Error calculating LP token USD price for ${lpTokenAddr}:`, error.message);
        return null;
    }
}

export async function fetchJsonFile(filePath) {
    try {
        const response = await fetch(`${filePath}?v=${Date.now()}`);
        if (!response.ok) {
            console.error(`Wallet.js: Failed to fetch JSON file at ${filePath}. Status: ${response.status}`);
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error(`Wallet.js: Error fetching or parsing JSON from ${filePath}:`, error);
        return null;
    }
}
