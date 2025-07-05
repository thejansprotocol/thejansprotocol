// --- view_log_page_logic.js ---
// Visualiza un log .txt con colores random y título dinámico.

const LOGS_BASE_URL = '/thejansprotocol/data/dailylogs_v8/';
const LOG_CONTENT_ELEMENT_ID = "log-content";
const LOG_TITLE_ELEMENT_ID = "log-title";

// Funciones para colores random:
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
    logContentEl.style.padding = "15px";
    logContentEl.style.borderRadius = "8px";
    logContentEl.style.marginTop = "10px";

    if (contrastTextColor === '#FFFFFF') {
      logContentEl.style.backgroundColor = "rgba(30, 30, 30, 0.5)";
      logContentEl.style.border = "1px solid rgba(255, 255, 255, 0.2)";
    } else {
      logContentEl.style.backgroundColor = "rgba(240, 240, 240, 0.5)";
      logContentEl.style.border = "1px solid rgba(0, 0, 0, 0.2)";
    }
  }
}

// Obtiene el parámetro "logFile" de la URL
function getLogFileFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('logFile');
}

// Carga y muestra el contenido del archivo
async function loadAndDisplayLog(logFileName) {
  if (!logFileName) {
    const el = document.getElementById(LOG_CONTENT_ELEMENT_ID);
    if (el) el.innerText = 'No logFile specified in URL.';
    return;
  }
  const logFileURL = LOGS_BASE_URL + logFileName;

  try {
    const res = await fetch(logFileURL, { mode: 'cors' });
    if (!res.ok) throw new Error(`Cannot fetch log file: ${logFileName}`);
    const content = await res.text();

    const titleEl = document.getElementById(LOG_TITLE_ELEMENT_ID);
    if (titleEl) titleEl.innerText = `Log: ${logFileName}`;

    const contentEl = document.getElementById(LOG_CONTENT_ELEMENT_ID);
    if (contentEl) contentEl.innerText = content;
  } catch (err) {
    const contentEl = document.getElementById(LOG_CONTENT_ELEMENT_ID);
    if (contentEl) contentEl.innerText = `Error: ${err.message}`;
  }
}

// Al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  applyRandomColors();
  const logFileName = getLogFileFromURL();
  loadAndDisplayLog(logFileName);
});
