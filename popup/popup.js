import { getSettings, setSettings, onSettingsChanged, DEFAULTS } from '../src/settings.js';

// Font-size bounds for the stepper (px). Restrained range: readable, never wild.
const FONT_MIN = 16;
const FONT_MAX = 48;
const FONT_STEP = 2;

const el = {
  status: document.getElementById('sada-status'),
  toggle: document.getElementById('sada-toggle'),
  echoLabel: document.getElementById('sada-echo-label'),
  fontDec: document.getElementById('sada-font-dec'),
  fontInc: document.getElementById('sada-font-inc'),
  fontVal: document.getElementById('sada-font-val'),
  english: document.getElementById('sada-english'),
};

let current = { ...DEFAULTS };

function render(s) {
  current = s;

  el.toggle.setAttribute('aria-checked', String(s.enabled));
  el.echoLabel.textContent = s.enabled ? 'On' : 'Off';

  el.fontVal.textContent = s.fontSize + 'px';
  el.fontDec.disabled = s.fontSize <= FONT_MIN;
  el.fontInc.disabled = s.fontSize >= FONT_MAX;

  el.english.setAttribute('aria-checked', String(s.showEnglish));

  updateStatus(s.enabled);
}

// Status line reflects locality + backend. Ask the engine only when enabled;
// backend may be null until the first translation runs, which reads as the
// calm default rather than an error.
async function updateStatus(enabled) {
  if (!enabled) {
    el.status.textContent = 'Off';
    return;
  }
  let backend = null;
  try {
    const reply = await chrome.runtime.sendMessage({ type: 'sada-engine-status' });
    backend = reply?.backend ?? null;
  } catch {
    // ponytail: no offscreen doc yet (no watch tab open) -> fall through to
    // the on-device default; the message resolves once translation begins.
  }
  el.status.textContent = backend === 'webgpu'
    ? 'On · GPU'
    : 'On · translating on your device';
}

const clampFont = (px) => Math.min(FONT_MAX, Math.max(FONT_MIN, px));

el.toggle.addEventListener('click', async () => {
  await setSettings({ enabled: !current.enabled });
});

el.fontDec.addEventListener('click', async () => {
  await setSettings({ fontSize: clampFont(current.fontSize - FONT_STEP) });
});

el.fontInc.addEventListener('click', async () => {
  await setSettings({ fontSize: clampFont(current.fontSize + FONT_STEP) });
});

el.english.addEventListener('click', async () => {
  await setSettings({ showEnglish: !current.showEnglish });
});

// React to changes from anywhere (this popup, other tabs, content script).
// Re-read rather than trust the callback's argument shape.
onSettingsChanged(async () => render(await getSettings()));

getSettings().then(render);
