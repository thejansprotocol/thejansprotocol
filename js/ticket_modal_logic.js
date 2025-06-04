// --- ticket_modal_logic.js ---
// Handles the ticket purchase modal: display, predictions, and transaction submission.

import {
    // Ethers Core & Setup from wallet.js
    ethersInstance, 
    connectWalletAndGetSignerInstances,
    getReadOnlyProvider, 

    // Constants from wallet.js
    NATIVE_TARA_DECIMALS,
    JANS_DECIMALS,
    JANS_GAME_CONTRACT_ADDRESS, 
    DEX_ROUTER_ADDRESS,
    TARA_WETH_ADDRESS,
    JANS_TOKEN_ADDRESS,
    fetchJsonFile,
    formatPriceWithZeroCount,

    // Helper Utilities from wallet.js
    shortenAddress,
    showGlobalMessage, 

    // Data Fetching
    getJansPerTaraFromDEX
} from './wallet.js'; // Adjust path if necessary

// --- Constants for this module ---
const MAX_BULK_TICKETS_MODAL = 3;
const POOLS_TO_SELECT_MODAL = 10; 
const DEADLINE_MINUTES_MODAL = 20;
const MIN_SWAP_OUTPUT_FOR_SINGLE_TICKET_TX = 1n; 
const DEFAULT_SLIPPAGE_BPS_TICKET_PURCHASE = 50n; 

const MODAL_ID = "jans-ticket-purchase-modal";
const MODAL_CONTENT_ID = "jans-ticket-modal-content";
const PREDICTION_TABLE_BODY_ID = "modal-prediction-table-body";
const MODAL_STATUS_ID = "modal-ticket-submission-status";
const SINGLE_SUBMIT_BTN_ID = "modal-submit-single-ticket-btn";
const BULK_SUBMIT_BTN_ID = "modal-submit-bulk-ticket-btn";
const BULK_AMOUNT_INPUT_ID = "modal-bulk-amount-input";
const CANCEL_BTN_ID = "modal-cancel-ticket-btn";
const MODAL_STYLES_ID = "jans-ticket-modal-dynamic-styles";

// --- Module State ---
let currentSnapshotTokensInModal = []; 
let currentTicketPriceAtModalOpenNativeWei = 0n;
let isModalOpen = false;

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
    const existingModalStyles = document.getElementById(MODAL_STYLES_ID);
    if (existingModalStyles) existingModalStyles.remove();

    const modalOverlay = document.createElement('div');
    modalOverlay.id = MODAL_ID;
    modalOverlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.7); display: flex; align-items: center;
        justify-content: center; z-index: 1000; padding: 10px; box-sizing: border-box;
        font-family: Arial, sans-serif;
    `;

    modalOverlay.innerHTML = `
    <div id="${MODAL_CONTENT_ID}" style="background-color: #ffed91; color: #000000; padding: 15px 20px; border-radius: 8px; border: 1px solid #000000; width: 95%; max-width: 600px; max-height: 95vh; overflow-y: auto; box-shadow: 0 3px 10px rgba(0,0,0,0.3);">
        <h3 style="text-align: center; margin-top: 0; margin-bottom: 10px; color: #181818;">Make Your Predictions!</h3>
        <p style="text-align: center; margin-bottom: 15px; font-size: 0.85rem; color: #333;">
            Current Ticket Price: <strong>${ethersInstance.formatUnits(currentTicketPriceAtModalOpenNativeWei, NATIVE_TARA_DECIMALS)} TARA</strong>
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 0.8rem;">
            <thead>
                <tr>
                    <th class="col-token" style="padding: 6px 8px 6px 8px; text-align: left; border-bottom: 1px solid #ccc;">Token</th>
                    <th class="col-price" style="padding: 6px 4px; text-align: right; border-bottom: 1px solid #ccc;">Price (USD)</th>
                    <th class="col-prediction" style="padding: 6px 8px 6px 4px; text-align: right; border-bottom: 1px solid #ccc;">Prediction</th>
                </tr>
            </thead>
            <tbody id="${PREDICTION_TABLE_BODY_ID}">
            </tbody>
        </table>
        
        <div style="display: flex; flex-direction: column; gap: 15px;">
            <div style="text-align:center;">
                <button id="${SINGLE_SUBMIT_BTN_ID}" class="buy-button" style="padding: 10px 20px; font-size: 1rem; min-width: 200px;">Submit Predictions</button>
            </div>
            <div style="border-top: 1px dashed #888; padding-top: 15px;">
                <p style="text-align:center; margin-top:0; margin-bottom: 10px; font-size: 0.85rem; color: #333;">Or, buy with random predictions:</p>
                <div style="display: flex; justify-content: center; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <label for="${BULK_AMOUNT_INPUT_ID}" style="font-size:0.85rem;">Amount:</label>
                    <input type="number" id="${BULK_AMOUNT_INPUT_ID}" value="1" min="1" max="${MAX_BULK_TICKETS_MODAL}" style="width: 60px; padding: 8px; border-radius: 4px; border: 1px solid #777; text-align: center; font-size: 0.9rem;">
                    <button id="${BULK_SUBMIT_BTN_ID}" class="buy-button" style="background-color: #e67e22; padding: 10px 15px; font-size: 0.95rem;">Buy Bulk Random</button>
                </div>
            </div>
        </div>

        <div id="${MODAL_STATUS_ID}" style="text-align:center; margin-top: 20px; min-height: 20px; font-weight: bold; font-size: 0.9rem;"></div>
        <button id="${CANCEL_BTN_ID}" class="buy-button" style="background-color:#c0392b; padding: 10px 20px; font-size: 0.95rem; display: block; margin: 25px auto 5px auto; min-width: 150px;">Cancel</button>
    </div>
    `;
    document.body.appendChild(modalOverlay);

    const styles = `
        /* Base styles for prediction row cells */
        #${MODAL_ID} .prediction-row td {
            vertical-align: middle;
            border-bottom: 1px solid #ddd; /* Row separator */
        }
        #${MODAL_ID} .prediction-row:last-child td {
            border-bottom: none; /* No border for the last row */
        }

        /* DESKTOP: Column widths for horizontal layout & button spacing */
        #${MODAL_ID} .token-name-cell {
            width: 45%; /* Adjust as needed, allows space for others */
            text-align: left; font-size: 0.8rem;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            padding: 6px 4px 6px 8px; /* More left padding */
        }
        #${MODAL_ID} .token-price-cell {
            width: 25%; /* Adjust as needed */
            text-align: right; font-size: 0.8rem; padding: 6px 4px;
            white-space: nowrap; /* Prevent price from wrapping */
        }
        #${MODAL_ID} .token-prediction-cell {
            width: 30%; /* Ample space for buttons, aligned right */
            text-align: right; /* Aligns the button container to the right */
            padding: 6px 8px 6px 4px; /* More right padding for visual space */
        }
        #${MODAL_ID} .prediction-btn-container {
            display: inline-flex; /* Allows alignment within the parent td */
            gap: 5px;
        }

        /* MOBILE: Adjustments for smaller screens (e.g., <= 500px) */
        @media (max-width: 500px) {
            #${MODAL_ID} table thead {
                display: none; /* Hide table headers to save space */
            }
            /* Reset widths to allow natural table flow, adjust padding & font */
            #${MODAL_ID} .token-name-cell,
            #${MODAL_ID} .token-price-cell,
            #${MODAL_ID} .token-prediction-cell {
                width: auto; /* Let table auto-size columns */
                padding: 4px 3px; 
                font-size: 0.75rem;
            }
            #${MODAL_ID} .token-name-cell {
                /* max-width can still be useful if names are very long */
                max-width: 100px; /* Or adjust based on testing */
                text-align: left; /* Ensure alignment */
            }
            #${MODAL_ID} .token-price-cell {
                text-align: right; /* Ensure alignment */
            }
            #${MODAL_ID} .token-prediction-cell {
                text-align: center; /* Center buttons if the cell has space */
            }
            #${MODAL_ID} .prediction-btn-container {
                display: flex; /* Use flex for better centering if cell is wide enough */
                justify-content: center; 
                gap: 3px;
            }
            #${MODAL_ID} .prediction-btn {
                padding: 3px 6px !important;
                font-size: 0.75rem !important;
            }
        }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.id = MODAL_STYLES_ID;
    styleSheet.type = "text/css";
    styleSheet.innerText = styles;
    modalOverlay.querySelector(`#${MODAL_CONTENT_ID}`).appendChild(styleSheet);

    isModalOpen = true;
    fillPredictionTableInModal();
    setupModalEventListeners();
}

function fillPredictionTableInModal() {
    const tbody = document.getElementById(PREDICTION_TABLE_BODY_ID);
    if (!tbody) {
        console.error("Modal prediction table body not found.");
        return;
    }
    tbody.innerHTML = ""; 

    if (!currentSnapshotTokensInModal || currentSnapshotTokensInModal.length === 0) {
        console.warn("Modal: No snapshot tokens to display.");
        return;
    }

    currentSnapshotTokensInModal.forEach((token, index) => {
        const row = document.createElement("tr");
        row.className = "prediction-row";

      let baseTokenNameModal = 'N/A';
        if (token && token.pool_name && typeof token.pool_name === 'string') { // Check for token.pool_name
            baseTokenNameModal = token.pool_name;
            if (baseTokenNameModal.includes('/')) {
                baseTokenNameModal = baseTokenNameModal.split('/')[0].trim();
            }
        } else if (token && token.pool_name) { // Fallback for non-string but existing pool_name
             baseTokenNameModal = String(token.pool_name);
             if (baseTokenNameModal.includes('/')) {
                baseTokenNameModal = baseTokenNameModal.split('/')[0].trim();
            }
        }

        const displayModalPrice = formatPriceWithZeroCount(token.base_token_price_usd, {
            zeroCountThreshold: 4, significantDigits: 4, defaultDisplayDecimals: 6, minNormalDecimals: 2
        });

        // Logo cell removed. Cells now use classes for styling.
        row.innerHTML = `
            <td class="token-name-cell" title="${token.name || 'N/A'}">${baseTokenNameModal}</td>
            <td class="token-price-cell">${displayModalPrice}</td>
            <td class="token-prediction-cell">
                <div class="prediction-btn-container">
                    <button type="button" class="prediction-btn up" data-index="${index}" data-value="true" style="background-color: #2ecc71; border: 1px solid #27ae60; color: white; padding: 3px 7px; margin: 2px; border-radius: 3px; cursor:pointer; font-size: 0.8rem; opacity: 0.7;">▲ Up</button>
                    <button type="button" class="prediction-btn down" data-index="${index}" data-value="false" style="background-color: #e74c3c; border: 1px solid #c0392b; color: white; padding: 3px 7px; margin: 2px; border-radius: 3px; cursor:pointer; font-size: 0.8rem; opacity: 0.7;">▼ Down</button>
                </div>
            </td>`;
        tbody.appendChild(row);
    });

    tbody.querySelectorAll(".prediction-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const clickedButton = e.currentTarget;
            const index = parseInt(clickedButton.dataset.index, 10);
            const predictionValue = (clickedButton.dataset.value === "true");

            if (isNaN(index) || index < 0 || index >= currentSnapshotTokensInModal.length) {
                console.error("Invalid index for prediction button:", index);
                return;
            }
            currentSnapshotTokensInModal[index].prediction = predictionValue;

            const buttonContainer = clickedButton.closest('.prediction-btn-container');
            if (buttonContainer) {
                buttonContainer.querySelectorAll('.prediction-btn').forEach(b => {
                    b.style.fontWeight = 'normal';
                    b.style.opacity = '0.7';
                    b.style.boxShadow = 'none';
                });
            }
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
            if (isNaN(amount)) amount = 1; 
            if (amount < 1) amount = 1;
            if (amount > MAX_BULK_TICKETS_MODAL) amount = MAX_BULK_TICKETS_MODAL;
            bulkAmountInput.value = amount; 
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
        statusDiv.className = `message-${type}`; 
        statusDiv.style.color = type === "error" ? "red" : (type === "success" ? "green" : (type === "warning" ? "orange" : "black"));
    }
}

async function calculateDynamicMinSwapOutput(taraAmountForSwap, provider) {
    if (taraAmountForSwap <= 0n) return 0n;
    try {
        const jansPerTaraRateNum = await getJansPerTaraFromDEX(provider); 
        if (jansPerTaraRateNum === null || jansPerTaraRateNum <= 0) {
            console.warn("Modal: JANS/TARA rate is 0 or unavailable. Using fixed minimum.");
            return MIN_SWAP_OUTPUT_FOR_SINGLE_TICKET_TX; 
        }
        const taraAmountFormatted = ethersInstance.formatUnits(taraAmountForSwap, NATIVE_TARA_DECIMALS);
        const expectedJansNum = parseFloat(taraAmountFormatted) * jansPerTaraRateNum;
        const expectedJansWei = ethersInstance.parseUnits(expectedJansNum.toFixed(JANS_DECIMALS), JANS_DECIMALS);
        const minJansOutput = (expectedJansWei * (10000n - DEFAULT_SLIPPAGE_BPS_TICKET_PURCHASE)) / 10000n;
        return minJansOutput > 0n ? minJansOutput : MIN_SWAP_OUTPUT_FOR_SINGLE_TICKET_TX;
    } catch (error) {
        console.error("Modal: Error calculating min swap output:", error);
        return MIN_SWAP_OUTPUT_FOR_SINGLE_TICKET_TX; 
    }
}

async function handleSubmitPurchase(numberOfTickets, isRandomBulk, ticketPriceAtOpenNativeWei) {
    updateModalStatus("Preparing transaction...", "info");

    let predictionsForContract;
    if (isRandomBulk) {
        predictionsForContract = Array.from({ length: numberOfTickets }, () =>
            Array.from({ length: POOLS_TO_SELECT_MODAL }, () => Math.random() < 0.5)
        );
    } else { 
        const singlePredictionsArray = currentSnapshotTokensInModal.map(t => t.prediction);
        if (singlePredictionsArray.some(p => p === undefined) || singlePredictionsArray.length !== POOLS_TO_SELECT_MODAL) {
            updateModalStatus("Please make a prediction (Up/Down) for all tokens.", "error");
            return;
        }
        predictionsForContract = singlePredictionsArray.map(p => !!p); 
    }

    let signer, gameContractWithSigner;
    try {
        updateModalStatus("Connecting wallet...", "info");
        const walletInstances = await connectWalletAndGetSignerInstances(); 
        signer = walletInstances.signer;
        gameContractWithSigner = walletInstances.gameContractWithSigner;

        const totalNativeTaraToSend = ticketPriceAtOpenNativeWei * BigInt(numberOfTickets);
        const taraEffectivelyForSwap = (totalNativeTaraToSend * 7940n) / 10000n;

        let minSwapOutput = 0n;
        if (taraEffectivelyForSwap > 0n) {
            updateModalStatus("Calculating swap parameters...", "info");
            const roProvider = getReadOnlyProvider(); 
            minSwapOutput = await calculateDynamicMinSwapOutput(taraEffectivelyForSwap, roProvider);
        } else {
            minSwapOutput = 0n; 
        }
        if (taraEffectivelyForSwap > 0n && minSwapOutput < MIN_SWAP_OUTPUT_FOR_SINGLE_TICKET_TX) {
            minSwapOutput = MIN_SWAP_OUTPUT_FOR_SINGLE_TICKET_TX;
        }

        const deadline = Math.floor(Date.now() / 1000) + (DEADLINE_MINUTES_MODAL * 60);
        updateModalStatus("Awaiting transaction confirmation in wallet...", "info");
        let tx;
        const txOverrides = {
            value: totalNativeTaraToSend,
            gasLimit: isRandomBulk && numberOfTickets > 1 ? 1500000n + BigInt(numberOfTickets * 300000) : 1500000n // Note: 1.5M base, bulk might need tuning
        };

        if (isRandomBulk && numberOfTickets > 0) { 
            tx = await gameContractWithSigner.buyMultipleTickets(predictionsForContract, minSwapOutput, deadline, txOverrides);
        } else { 
            tx = await gameContractWithSigner.buyTicket(predictionsForContract, minSwapOutput, deadline, txOverrides);
        }

        updateModalStatus(`Transaction sent (${shortenAddress(tx.hash, 6)}). Waiting for confirmation...`, "info");
        const receipt = await tx.wait(1); 

        if (receipt && receipt.status === 1) {
            updateModalStatus(`Success! ${numberOfTickets} Ticket(s) purchased.`, "success");
            showGlobalMessage(`Ticket purchase successful! Tx: ${shortenAddress(tx.hash)}`, "success", 7000, "global-message-main"); 
            if (window.triggerMainPageRefresh) window.triggerMainPageRefresh();
            setTimeout(closeModal, 2500);
        } else {
            throw new Error(`Transaction failed on-chain. Status: ${receipt ? receipt.status : 'unknown'}. Hash: ${tx.hash}`);
        }

    } catch (error) {
        console.error(`Ticket Purchase Error (${isRandomBulk ? 'Bulk' : 'Single'}):`, error);
        let errorMsg = error.message || 'Unknown error during ticket purchase.';
        if (error.reason) errorMsg = error.reason;
        else if (error.data && error.data.message) errorMsg = error.data.message; 
        else if (error.code === 4001) errorMsg = 'Transaction rejected by user.';
        updateModalStatus(`Failed: ${errorMsg.substring(0, 150)}`, "error");
    }
}
