// --- view_latest_summary.js ---
// Displays the latest .summary.txt file from /thejansprotocol/data/dailylogs_v8/ with random readable colors.

const LOGS_BASE_URL = '/thejansprotocol/data/dailylogs_v8/';
const LOG_CONTENT_ELEMENT_ID = "log-content";
const LOG_TITLE_ELEMENT_ID = "log-title";

// --- Color logic (unchanged) ---
function getRandomRgbColorParts() {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return { r, g, b };
}
function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
}
function getContrastTextColor(hexBgColor) {
  const hex = hexBgColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}
function applyRandomColors() {
  const { r, g, b } = getRandomRgbColorParts();
  const alpha = 0.80; 
  const randomBgColorRgba = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  const opaqueHexColorForContrast = rgbToHex(r, g, b);
  const contrastTextColor = getContrastTextColor(opaqueHexColorForContrast);

  if (document.body) {
    document.body.style.backgroundColor = randomBgColorRgba;
    document.body.style.color = contrastTextColor;
  }
  const logTitleEl = document.getElementById(LOG_TITLE_ELEMENT_ID);
  if (logTitleEl) {
    logTitleEl.style.color = contrastTextColor;
  }
  const logContentEl = document.getElementById(LOG_CONTENT_ELEMENT_ID);
  if (logContentEl) {
    logContentEl.style.color = contrastTextColor;
    if (contrastTextColor === '#FFFFFF') { 
      logContentEl.style.backgroundColor = "rgba(30, 30, 30, 0.5)";
      logContentEl.style.borderColor = "rgba(255, 255, 255, 0.25)";
    } else { 
      logContentEl.style.backgroundColor = "rgba(240, 240, 240, 0.5)";
      logContentEl.style.borderColor = "rgba(0, 0, 0, 0.2)";
    }
    logContentEl.style.padding = "15px";
    logContentEl.style.border = `1px solid ${contrastTextColor === '#FFFFFF' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`;
    logContentEl.style.borderRadius = "8px";
    logContentEl.style.marginTop = "10px";
  }
}

// --- Helper: Display message ---
function displayMessage(msg) {
  const el = document.getElementById(LOG_CONTENT_ELEMENT_ID);
  if (el) el.innerText = msg;
}

// --- Find latest .summary.txt file in directory listing ---
async function getLatestSummaryTxtFile() {
  try {
    const res = await fetch(LOGS_BASE_URL, { mode: 'cors' });
    if (!res.ok) throw new Error('Cannot list log directory');
    const text = await res.text();
    // Try to parse as HTML directory listing
    const matches = Array.from(text.matchAll(/href="([^"]+\.summary\.txt)"/g));
    if (!matches.length) throw new Error('No summary.txt files found');
    // Extract filenames and sort descending (latest first)
    const files = matches.map(m => m[1]);
    files.sort().reverse();
    return files[0];
  } catch (err) {
    throw new Error('Failed to find latest summary.txt: ' + err.message);
  }
}

// --- Load and display latest summary.txt ---
async function loadAndDisplayLatestSummary() {
  try {
    const latestFile = await getLatestSummaryTxtFile();
    if (!latestFile) throw new Error('No summary.txt file found');
    const res = await fetch(LOGS_BASE_URL + latestFile, { mode: 'cors' });
    if (!res.ok) throw new Error('Cannot fetch latest summary.txt');
    const content = await res.text();
    const titleEl = document.getElementById(LOG_TITLE_ELEMENT_ID);
    if (titleEl) titleEl.innerText = `Latest Log: ${latestFile}`;
    const contentEl = document.getElementById(LOG_CONTENT_ELEMENT_ID);
    if (contentEl) contentEl.innerText = content;
  } catch (err) {
    displayMessage(err.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyRandomColors();
  loadAndDisplayLatestSummary();
});
