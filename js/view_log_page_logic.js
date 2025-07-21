// --- view_log_page_logic.js (CORREGIDO) ---
// Carga el log del archivo pasado por el parámetro ?logFile=...
// y aplica colores de fondo random con contraste.

const LOGS_BASE_URL = 'data/dailylogs_v8/'; // Ruta relativa a la carpeta public
const LOG_CONTENT_ELEMENT_ID = "log-content";
const LOG_TITLE_ELEMENT_ID = "log-title";

// --- Random color logic (sin cambios) ---
function getRandomRgbColorParts() {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return { r, g, b };
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join("");
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

// --- CAMBIO 1: Obtener el nombre del archivo de la URL ---
function getLogFileFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('logFile'); // Buscamos 'logFile' en lugar de 'date'
}

// --- CAMBIO 2: Cargar el log usando el nombre de archivo ---
async function loadAndDisplayLog(logFileName) {
  // Ya no construimos el nombre del archivo, lo usamos directamente
  const logFileURL = LOGS_BASE_URL + logFileName;

  try {
    const res = await fetch(logFileURL, { mode: 'cors' });
    if (!res.ok) throw new Error(`Cannot fetch log file: ${logFileName}`);
    const content = await res.text();

    const titleEl = document.getElementById(LOG_TITLE_ELEMENT_ID);
    if (titleEl) titleEl.innerText = `Log Summary: ${logFileName}`;

    const contentEl = document.getElementById(LOG_CONTENT_ELEMENT_ID);
    if (contentEl) contentEl.innerText = content;

  } catch (err) {
    const contentEl = document.getElementById(LOG_CONTENT_ELEMENT_ID);
    if (contentEl) contentEl.innerText = `Error: ${err.message}`;
  }
}

// --- CAMBIO 3: Lógica de inicialización unificada ---
document.addEventListener('DOMContentLoaded', () => {
  applyRandomColors();
  const logFileName = getLogFileFromURL();

  if (!logFileName) {
    const el = document.getElementById(LOG_CONTENT_ELEMENT_ID);
    if (el) el.innerText = 'No log file specified in URL. Please go back and select a log.';
    const titleEl = document.getElementById(LOG_TITLE_ELEMENT_ID);
    if (titleEl) titleEl.innerText = 'Error';
    return;
  }
  
  loadAndDisplayLog(logFileName);
});
