// --- view_log_page_logic.js ---
// Handles fetching, displaying a specific daily log, and applying random readable colors.

// --- Constants for this page ---
const LOG_FILES_BASE_URL = data/dailylogs_v8/';
const LOG_CONTENT_ELEMENT_ID = "log-content";
const LOG_TITLE_ELEMENT_ID = "log-title";
const GLOBAL_MESSAGE_DISPLAY_ID_LOG_VIEW = "global-message-log-view";

/**
 * Generates random R, G, B color parts.
 * @returns {{r: number, g: number, b: number}}
 */
function getRandomRgbColorParts() {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return { r, g, b };
}

/**
 * Converts RGB color parts to a hex string.
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255)
 * @param {number} b - Blue component (0-255)
 * @returns {string} Hex color string (e.g., "#RRGGBB")
 */
function rgbToHex(r, g, b) {
    const toHex = (c) => {
        const hex = c.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Determines a contrasting text color (black or white) for a given hex background color.
 * @param {string} hexBgColor - The background color in hex format (e.g., "#RRGGBB").
 * @returns {string} "#000000" (black) or "#FFFFFF" (white).
 */
function getContrastTextColor(hexBgColor) {
    const hex = hexBgColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

/**
 * Displays a message on this page.
 * @param {string} message The message.
 * @param {'error'|'info'|'success'|'warning'} type The type of message.
 */
function showLogPageViewMessage(message, type = 'info') {
    const messageDiv = document.getElementById(GLOBAL_MESSAGE_DISPLAY_ID_LOG_VIEW);
    if (messageDiv) {
        messageDiv.textContent = message;
        messageDiv.className = `message-container message-${type}`;
        messageDiv.style.display = 'block';
    } else {
        alert(`[${type.toUpperCase()}] ${message}`); // Fallback
    }
}

/**
 * Applies random background (with transparency) and contrasting text colors to the page.
 */
function applyRandomColors() {
    const { r, g, b } = getRandomRgbColorParts();
    const alpha = 0.80; // Set your desired transparency
    
    const randomBgColorRgba = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    const opaqueHexColorForContrast = rgbToHex(r, g, b);
    
    const contrastTextColor = getContrastTextColor(opaqueHexColorForContrast);

    document.body.style.backgroundColor = randomBgColorRgba;
    document.body.style.color = contrastTextColor;

    const logTitleEl = document.getElementById(LOG_TITLE_ELEMENT_ID);
    if (logTitleEl) {
        logTitleEl.style.color = contrastTextColor;
    }

    const logContentPre = document.getElementById(LOG_CONTENT_ELEMENT_ID);
    if (logContentPre) {
        logContentPre.style.color = contrastTextColor;
        if (contrastTextColor === '#FFFFFF') { 
            logContentPre.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
            logContentPre.style.borderColor = "rgba(255, 255, 255, 0.25)";
        } else { 
            logContentPre.style.backgroundColor = "rgba(0, 0, 0, 0.07)";
            logContentPre.style.borderColor = "rgba(0, 0, 0, 0.15)";
        }
    }
}

async function displayLogContent() {
    const logContentPre = document.getElementById(LOG_CONTENT_ELEMENT_ID);
    const logTitleEl = document.getElementById(LOG_TITLE_ELEMENT_ID);

    if (!logContentPre || !logTitleEl) {
        console.error("ViewLogPage: Essential HTML elements (log-title or log-content) are missing.");
        // showLogPageViewMessage needs to be defined at this scope to be callable here
        showLogPageViewMessage("Error: Page structure is incomplete.", "error");
        return;
    }

    applyRandomColors(); // Apply random colors on load

    logTitleEl.textContent = "Loading Log...";
    logContentPre.textContent = "Fetching log data...";

    try {
        const queryParams = new URLSearchParams(window.location.search);
        const logFileName = queryParams.get('logFile');

        if (!logFileName) {
            throw new Error("No log file specified in the URL (e.g., ?logFile=filename.json).");
        }

        logTitleEl.textContent = `Log Details: ${decodeURIComponent(logFileName)}`;
        const logUrl = `${LOG_FILES_BASE_URL}${logFileName}`;
        
        const response = await fetch(logUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch log file '${decodeURIComponent(logFileName)}'. Status: ${response.status} ${response.statusText}`);
        }
        const logData = await response.json();

        logContentPre.textContent = JSON.stringify(logData, null, 2);

    } catch (error) {
        console.error("ViewLogPage: Error loading or displaying log content:", error);
        logTitleEl.textContent = "Error Loading Log";
        const errorMessage = `Could not load log details. ${error.message}`;
        logContentPre.textContent = errorMessage;
        // The color for logContentPre should have already been set by applyRandomColors().
        // No need to set logContentPre.style.color here again unless applyRandomColors failed.
        showLogPageViewMessage(errorMessage, "error");
    }
}

// --- Page Load Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded for View Log Page. Initializing displayLogContent...");
    displayLogContent();
});
