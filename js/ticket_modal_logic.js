// --- ticket_modal_logic.js ---
// Handles the ticket purchase modal: display, predictions, and transaction submission.

import {
    // Ethers Core & Setup from wallet.js
    ethersInstance, // Assuming initializeEthersCore in wallet.js sets this from window.ethers
    connectWalletAndGetSignerInstances,
    getReadOnlyProvider, // For calculating minSwapOutput if needed by DEX interaction

    // Constants from wallet.js
    NATIVE_TARA_DECIMALS,
    JANS_DECIMALS,
    JANS_GAME_CONTRACT_ADDRESS, // Not directly used for contract instance creation here, but good to have for context
    DEX_ROUTER_ADDRESS,
    TARA_WETH_ADDRESS,
    JANS_TOKEN_ADDRESS,
    fetchJsonFile,
    formatPriceWithZeroCount, 
    // DEFAULT_SLIPPAGE_BPS, // Let's define slippage locally or pass it

    // Helper Utilities from wallet.js
    shortenAddress,
    showGlobalMessage, // For global messages outside the modal if needed
    // Consider a local status update function for the modal itself

    // Data Fetching (if needed directly, though better to pass data in)
    getJansPerTaraFromDEX
} from './wallet.js'; // Adjust path if necessary

// --- Constants for this module ---
const MAX_BULK_TICKETS_MODAL = 3;
const POOLS_TO_SELECT_MODAL = 10; // Should match contract expectation
const DEADLINE_MINUTES_MODAL = 20;
const MIN_SWAP_OUTPUT_FOR_SINGLE_TICKET_TX = 1n; // Minimum JANS expected if any swap happens for one ticket
const DEFAULT_SLIPPAGE_BPS_TICKET_PURCHASE = 50n; // 0.5% slippage for calculating minAmountOut for JANS swap

const MODAL_ID = "jans-ticket-purchase-modal";
const MODAL_CONTENT_ID = "jans-ticket-modal-content";
const PREDICTION_TABLE_BODY_ID = "modal-prediction-table-body";
const MODAL_STATUS_ID = "modal-ticket-submission-status";
const SINGLE_SUBMIT_BTN_ID = "modal-submit-single-ticket-btn";
const BULK_SUBMIT_BTN_ID = "modal-submit-bulk-ticket-btn";
const BULK_AMOUNT_INPUT_ID = "modal-bulk-amount-input";
const CANCEL_BTN_ID = "modal-cancel-ticket-btn";

// --- Module State ---
let currentSnapshotTokensInModal = []; // Stores { ...tokenData, prediction: boolean | undefined }
let currentTicketPriceAtModalOpenNativeWei = 0n;
let isModalOpen = false;

/**
 * Creates and displays the ticket purchase modal.
 * @param {Array<object>} snapshotTokens - Array of token data from latest_snapshot.json.
 * @param {bigint} ticketPriceNativeWei - Current ticket price in native TARA Wei.
 */
export function openTicketPurchaseModal(snapshotTokensFromMain, currentTicketPriceAtOpen) {
    if (isModalOpen) {
        console.warn("Ticket modal is already open.");
        return;
    }
    if (!ethersInstance) {
        alert("Error: Blockchain library (Ethers.js) not initialized. Cannot open modal.");
        return;
    }
    if (!Array.isArray(snapshotTokensFromMain) || snapshotTokensFromMain.length !== POOLS_TO_SELECT_MODAL) {
        alert(`Snapshot data error. Expected ${POOLS_TO_SELECT_MODAL} tokens for prediction.`);
        return;
    }
    if (typeof currentTicketPriceAtOpen !== 'bigint' || currentTicketPriceAtOpen <= 0n) {
        alert("Invalid ticket price provided or sales might be closed. Cannot open modal.");
        return;
    }

    currentSnapshotTokensInModal = JSON.parse(JSON.stringify(snapshotTokensFromMain)).map(token => ({ ...token, prediction: undefined }));
    currentTicketPriceAtModalOpenNativeWei = currentTicketPriceAtOpen;

    const existingModal = document.getElementById(MODAL_ID);
    if (existingModal) existingModal.remove();

    const modalOverlay = document.createElement('div');
    modalOverlay.id = MODAL_ID;
    modalOverlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.7); display: flex; align-items: center;
        justify-content: center; z-index: 1000; padding: 10px; box-sizing: border-box;
        font-family: Arial, sans-serif;
    `;

    modalOverlay.innerHTML = `
        <div id="${MODAL_CONTENT_ID}" style="background-color: #ffed91; color: #000000; padding: 15px 20px; border-radius: 8px; border: 1px solid #000000; width: 95%; max-width: 450px; max-height: 90vh; overflow-y: auto; box-shadow: 0 3px 10px rgba(0,0,0,0.3);">
            <h3 style="text-align: center; margin-top: 0; margin-bottom: 10px; color: #181818;">Make Your Predictions!</h3>
            <p style="text-align: center; margin-bottom: 15px; font-size: 0.85rem; color: #333;">
                Current Ticket Price: <strong>${ethersInstance.formatUnits(currentTicketPriceAtModalOpenNativeWei, NATIVE_TARA_DECIMALS)} TARA</strong>
            </p>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <thead>
                    <tr style="border-bottom: 1px solid #555;">
                        <th style="padding: 5px; text-align: left; font-size: 0.75rem;">Token</th>
                        <th style="padding: 5px; text-align: right; font-size: 0.75rem;">Snapshot Price (USD)</th>
                        <th style="padding: 5px; text-align: center; font-size: 0.75rem;">Your Call (24h)</th>
                    </tr>
                </thead>
                <tbody id="${PREDICTION_TABLE_BODY_ID}"></tbody>
            </table>
            <div style="text-align:center; margin-bottom: 15px;">
                <button id="${SINGLE_SUBMIT_BTN_ID}" class="buy-button" style="padding: 8px 15px; font-size: 0.95rem; margin-right: 10px;">Submit Predictions</button>
            </div>
            <div style="border-top: 1px dashed #888; padding-top: 15px; margin-top:15px;">
                <p style="text-align:center; margin-top:0; margin-bottom: 8px; font-size: 0.8rem; color: #333;">Or, buy with random predictions:</p>
                <div style="display: flex; justify-content: center; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <input type="number" id="${BULK_AMOUNT_INPUT_ID}" value="1" min="1" max="${MAX_BULK_TICKETS_MODAL}" style="width: 50px; padding: 5px; border-radius: 4px; border: 1px solid #777; text-align: center;">
                    <button id="${BULK_SUBMIT_BTN_ID}" class="buy-button" style="background-color: #e67e22; padding: 8px 12px; font-size: 0.9rem;">Buy Bulk Random</button>
                </div>
            </div>
            <div id="${MODAL_STATUS_ID}" style="text-align:center; margin-top: 15px; min-height: 18px; font-weight: bold; font-size: 0.85rem;"></div>
            <button id="${CANCEL_BTN_ID}" class="buy-button" style="background-color:#c0392b; padding: 8px 15px; font-size: 0.9rem; display: block; margin: 20px auto 0 auto;">Cancel</button>
        </div>
    `;
    document.body.appendChild(modalOverlay);
    isModalOpen = true;
    fillPredictionTableInModal();
    setupModalEventListeners();
}

// Make sure formatPriceWithZeroCount is defined in this file or imported, e.g.:
// import { formatPriceWithZeroCount } from './wallet.js'; 
// Or, if defined locally:
/*
function formatPriceWithZeroCount(priceStr, opts = {}) {
    const {
        zeroCountThreshold = 4, 
        significantDigits = 4, 
        defaultDisplayDecimals = 6, 
        minNormalDecimals = 2 
    } = opts;

    if (priceStr === undefined || priceStr === null || String(priceStr).trim() === '') {
        return 'N/A';
    }
    const num = parseFloat(String(priceStr).replace(/,/g, ''));
    if (isNaN(num)) { return 'Invalid'; }
    if (num === 0) { return num.toFixed(minNormalDecimals); }

    const sign = num < 0 ? "-" : "";
    const absNum = Math.abs(num);

    if (absNum > 0 && absNum < 1) {
        const fullPrecisionStr = absNum.toFixed(20);
        const fractionalPart = fullPrecisionStr.split('.')[1] || '';
        let leadingZeros = 0;
        for (let i = 0; i < fractionalPart.length; i++) {
            if (fractionalPart[i] === '0') { leadingZeros++; } else { break; }
        }
        if (leadingZeros > zeroCountThreshold) {
            const significantPart = fractionalPart.substring(leadingZeros);
            const displaySignificant = significantPart.substring(0, significantDigits);
            return `${sign}0.<span class="zero-count-superscript">(${leadingZeros})</span>${displaySignificant}`;
        }
    }
    let fixedStr = absNum.toFixed(Math.max(minNormalDecimals, defaultDisplayDecimals));
    if (fixedStr.includes('.')) {
        let [integerPart, decimalP] = fixedStr.split('.');
        if (absNum % 1 === 0) { return `${sign}${integerPart}.${'0'.repeat(minNormalDecimals)}`; }
        decimalP = decimalP.replace(/0+$/, '');
        if (decimalP.length < minNormalDecimals) {
            decimalP = (decimalP + "0".repeat(minNormalDecimals)).substring(0, minNormalDecimals);
        }
        decimalP = decimalP.substring(0, defaultDisplayDecimals);
        if (decimalP === "") return `${sign}${integerPart}.${"0".repeat(minNormalDecimals)}`;
        return `${sign}${integerPart}.${decimalP}`;
    }
    return `${sign}${fixedStr}.${"0".repeat(minNormalDecimals)}`;
}
*/

function fillPredictionTableInModal() {
    const tbody = document.getElementById(PREDICTION_TABLE_BODY_ID); // Assumes PREDICTION_TABLE_BODY_ID is defined
    if (!tbody) { 
        console.error("Modal prediction table body not found."); 
        return; 
    }
    tbody.innerHTML = ""; // Clear previous rows

    currentSnapshotTokensInModal.forEach((token, index) => {
        const row = document.createElement("tr");
        row.style.borderBottom = (index === currentSnapshotTokensInModal.length - 1) ? "none" : "1px solid #ddd";
        
        // Define options for price formatting
        const priceDisplayOptions = { 
            zeroCountThreshold: 4,      // Trigger custom format if more than 4 leading zeros after "0."
            significantDigits: 4,       // Show this many significant digits after the zero count
            defaultDisplayDecimals: 6,  // For numbers not using custom format
            minNormalDecimals: 2        // Always show at least 2 decimals for "normal" prices like 1.50
        };
        // Format the price using the new function
        const displayModalPrice = formatPriceWithZeroCount(token.base_token_price_usd, priceDisplayOptions);
        
        row.innerHTML = `
            <td style="padding: 6px 4px; text-align: left; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;" title="${token.name || 'N/A'}">${token.name || 'N/A'}</td>
            <td style="padding: 6px 4px; text-align: right; font-size: 0.8rem;">$${displayModalPrice}</td> 
            <td style="padding: 6px 4px; text-align: center;">
                <button type="button" class="prediction-btn up" data-index="${index}" data-value="true" style="background-color: #2ecc71; border: 1px solid #27ae60; color: white; padding: 3px 7px; margin: 2px; border-radius: 3px; cursor:pointer; font-size: 0.8rem; opacity: 0.7;">▲ Up</button>
                <button type="button" class="prediction-btn down" data-index="${index}" data-value="false" style="background-color: #e74c3c; border: 1px solid #c0392b; color: white; padding: 3px 7px; margin: 2px; border-radius: 3px; cursor:pointer; font-size: 0.8rem; opacity: 0.7;">▼ Down</button>
            </td>`;
        tbody.appendChild(row);
    });

    // Re-attach event listeners for prediction buttons (your existing highlighting logic)
    tbody.querySelectorAll(".prediction-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const clickedButton = e.currentTarget;
            const index = parseInt(clickedButton.dataset.index, 10);
            const predictionValue = (clickedButton.dataset.value === "true");

            if (isNaN(index) || index < 0 || index >= currentSnapshotTokensInModal.length) return;
            currentSnapshotTokensInModal[index].prediction = predictionValue;

            const rowButtons = clickedButton.parentElement.querySelectorAll('.prediction-btn');
            rowButtons.forEach(b => { 
                b.style.fontWeight = 'normal'; 
                b.style.opacity = '0.7'; 
                b.style.boxShadow = 'none'; 
            });
            clickedButton.style.fontWeight = 'bold';
            clickedButton.style.opacity = '1';
            clickedButton.style.boxShadow = '0 0 5px yellow';
        });
    });
}

function setupModalEventListeners() {
    document.getElementById(SINGLE_SUBMIT_BTN_ID)?.addEventListener("click", () => {
        handleSubmitPurchase(1, false, currentTicketPriceAtModalOpenNativeWei);
    });
    document.getElementById(BULK_SUBMIT_BTN_ID)?.addEventListener("click", () => {
        const amountInput = document.getElementById(BULK_AMOUNT_INPUT_ID);
        const amount = parseInt(amountInput?.value || "1", 10);
        if (isNaN(amount) || amount < 1 || amount > MAX_BULK_TICKETS_MODAL) {
            updateModalStatus(`Invalid bulk amount (1-${MAX_BULK_TICKETS_MODAL}).`, "error");
            return;
        }
        handleSubmitPurchase(amount, true, currentTicketPriceAtModalOpenNativeWei);
    });
    document.getElementById(CANCEL_BTN_ID)?.addEventListener("click", closeModal);

    const bulkAmountInput = document.getElementById(BULK_AMOUNT_INPUT_ID);
    if (bulkAmountInput) { 
        bulkAmountInput.addEventListener('input', () => {
            let amount = parseInt(bulkAmountInput.value, 10);
            if (isNaN(amount)) amount = 1; // Default to 1 if input is not a number
            if (amount < 1) amount = 1;
            if (amount > MAX_BULK_TICKETS_MODAL) amount = MAX_BULK_TICKETS_MODAL;
            bulkAmountInput.value = amount; // Correct the input field value
        });
    }
}

function closeModal() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) modal.remove();
    isModalOpen = false;
    currentSnapshotTokensInModal = [];
    currentTicketPriceAtModalOpenNativeWei = 0n;
}

function updateModalStatus(message, type = "info") {
    const statusDiv = document.getElementById(MODAL_STATUS_ID);
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.className = `message-${type}`; // Assumes you have CSS for .message-info, .message-error, .message-success
        statusDiv.style.color = type === "error" ? "red" : (type === "success" ? "green" : (type === "warning" ? "orange" : "black"));
    }
}

/**
 * Calculates minimum JANS output for swap applying slippage.
 * @param {bigint} taraAmountForSwap - Amount of TARA (in Wei) to be swapped for JANS.
 * @param {ethers.Provider} provider - Ethers provider for DEX query.
 * @returns {Promise<bigint>} Minimum JANS amount (in Wei).
 */
async function calculateDynamicMinSwapOutput(taraAmountForSwap, provider) {
    if (taraAmountForSwap <= 0n) return 0n;
    try {
        const jansPerTaraRateNum = await getJansPerTaraFromDEX(provider); // This returns a number
        if (jansPerTaraRateNum === null || jansPerTaraRateNum <= 0) {
            console.warn("Modal: JANS/TARA rate is 0 or unavailable for min output calculation. Using fixed minimum.");
            return MIN_SWAP_OUTPUT_FOR_SINGLE_TICKET_TX; // Fallback to a very small non-zero value
        }

        // Convert numeric rate to a high-precision string for BigInt math
        // Expected JANS = (taraAmountForSwap / 10^TARA_DECIMALS) * jansPerTaraRateNum
        const taraAmountFormatted = ethersInstance.formatUnits(taraAmountForSwap, NATIVE_TARA_DECIMALS);
        const expectedJansNum = parseFloat(taraAmountFormatted) * jansPerTaraRateNum;
        
        // Convert expected JANS (numeric) back to BigInt in JANS Wei
        const expectedJansWei = ethersInstance.parseUnits(expectedJansNum.toFixed(JANS_DECIMALS), JANS_DECIMALS);

        // Apply slippage
        const minJansOutput = (expectedJansWei * (10000n - DEFAULT_SLIPPAGE_BPS_TICKET_PURCHASE)) / 10000n;
        
        return minJansOutput > 0n ? minJansOutput : MIN_SWAP_OUTPUT_FOR_SINGLE_TICKET_TX;
    } catch (error) {
        console.error("Modal: Error calculating min swap output:", error);
        return MIN_SWAP_OUTPUT_FOR_SINGLE_TICKET_TX; // Fallback on error
    }
}


async function handleSubmitPurchase(numberOfTickets, isRandomBulk, ticketPriceAtOpenNativeWei) {
    updateModalStatus("Preparing transaction...", "info");

    let predictionsForContract;
    if (isRandomBulk) {
        predictionsForContract = Array.from({ length: numberOfTickets }, () =>
            Array.from({ length: POOLS_TO_SELECT_MODAL }, () => Math.random() < 0.5)
        );
    } else { // Single ticket
        const singlePredictionsArray = currentSnapshotTokensInModal.map(t => t.prediction);
        if (singlePredictionsArray.some(p => p === undefined) || singlePredictionsArray.length !== POOLS_TO_SELECT_MODAL) {
            updateModalStatus("Please make a prediction (Up/Down) for all tokens.", "error");
            return;
        }
        predictionsForContract = singlePredictionsArray.map(p => !!p); // Ensure boolean
    }

    let signer, gameContractWithSigner;
    try {
        updateModalStatus("Connecting wallet...", "info");
        const walletInstances = await connectWalletAndGetSignerInstances(); // From wallet.js
        signer = walletInstances.signer;
        gameContractWithSigner = walletInstances.gameContractWithSigner;

        const totalNativeTaraToSend = ticketPriceAtOpenNativeWei * BigInt(numberOfTickets);
        
        // Calculate the portion of TARA that will be swapped (79.4% as per contract logic)
        // FEE_MAINTENANCE_NATIVE_TARA_BPS = 10; TARA_FOR_LP_SIDE_ACCUMULATION_BPS = 1950; TARA_FOR_LP_FORMER_REWARD_ACCUMULATION_BPS = 100;
        // Total TARA BPS not swapped = 10 + 1950 + 100 = 2060 BPS
        // TARA BPS for swap = 10000 - 2060 = 7940 BPS
        const taraEffectivelyForSwap = (totalNativeTaraToSend * 7940n) / 10000n;
        
        let minSwapOutput = 0n;
        if (taraEffectivelyForSwap > 0n) {
            updateModalStatus("Calculating swap parameters...", "info");
            const roProvider = getReadOnlyProvider(); // Get read-only provider for DEX query
            minSwapOutput = await calculateDynamicMinSwapOutput(taraEffectivelyForSwap, roProvider);
        } else {
            minSwapOutput = 0n; // No TARA being swapped
        }
        // Ensure minSwapOutput is at least MIN_SWAP_OUTPUT_FOR_SINGLE_TICKET_TX if any swap is to occur
        if (taraEffectivelyForSwap > 0n && minSwapOutput < MIN_SWAP_OUTPUT_FOR_SINGLE_TICKET_TX) {
            minSwapOutput = MIN_SWAP_OUTPUT_FOR_SINGLE_TICKET_TX;
        }


        const deadline = Math.floor(Date.now() / 1000) + (DEADLINE_MINUTES_MODAL * 60);
        
        updateModalStatus("Awaiting transaction confirmation in wallet...", "info");
        let tx;
        // Simplified gas estimation for frontend, rely on wallet or a fixed high limit for now
        const txOverrides = { 
            value: totalNativeTaraToSend,
            gasLimit: isRandomBulk && numberOfTickets > 1 ? 1500000n + BigInt(numberOfTickets * 300000) : 1500000n // Generous gas
        };


        if (isRandomBulk && numberOfTickets > 0) { // For buyMultipleTickets
            tx = await gameContractWithSigner.buyMultipleTickets(predictionsForContract, minSwapOutput, deadline, txOverrides);
        } else { // For buyTicket (single)
            tx = await gameContractWithSigner.buyTicket(predictionsForContract, minSwapOutput, deadline, txOverrides);
        }

        updateModalStatus(`Transaction sent (${shortenAddress(tx.hash, 6)}). Waiting for confirmation...`, "info");
        const receipt = await tx.wait(1); // Wait for 1 confirmation

        if (receipt && receipt.status === 1) {
            updateModalStatus(`Success! ${numberOfTickets} Ticket(s) purchased.`, "success");
            showGlobalMessage(`Ticket purchase successful! Tx: ${shortenAddress(tx.hash)}`, "success", 7000, "global-message-main"); // Use main page global message
            
            // Trigger a refresh of data on the main page (if a callback or event system is set up)
            // For now, user will see updates on next periodic refresh of main_page_logic.js
            if (window.triggerMainPageRefresh) window.triggerMainPageRefresh();


            setTimeout(closeModal, 2500);
        } else {
            throw new Error(`Transaction failed on-chain. Status: ${receipt ? receipt.status : 'unknown'}. Hash: ${tx.hash}`);
        }

    } catch (error) {
        console.error(`Ticket Purchase Error (${isRandomBulk ? 'Bulk' : 'Single'}):`, error);
        let errorMsg = error.message || 'Unknown error during ticket purchase.';
        if (error.reason) errorMsg = error.reason;
        else if (error.data && error.data.message) errorMsg = error.data.message; // Some RPC errors
        else if (error.code === 4001) errorMsg = 'Transaction rejected by user.';
        
        updateModalStatus(`Failed: ${errorMsg.substring(0, 150)}`, "error");
        // Do not close modal on error, let user see the message
    }
}

// This script exports openTicketPurchaseModal.
// The main_page_logic.js will import and call it.
// Example:
// In main_page_logic.js:
// import { openTicketPurchaseModal } from './ticket_modal_logic.js';
// ...
// buyButton.addEventListener('click', () => {
//    openTicketPurchaseModal(localSnapshotTokens, localTicketPriceNativeWei);
// });