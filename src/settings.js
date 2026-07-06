// src/settings.js (ESM) — shared settings over chrome.storage.local['sada:settings'].
// Consumed by both the popup (writer) and content.js (reader/reactor).

const KEY = 'sada:settings';

export const DEFAULTS = { enabled: true, fontSize: 28, showEnglish: false };

export async function getSettings() {
  const got = await chrome.storage.local.get(KEY);
  return { ...DEFAULTS, ...(got[KEY] || {}) };
}

export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function onSettingsChanged(cb) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[KEY]) return;
    cb({ ...DEFAULTS, ...(changes[KEY].newValue || {}) });
  });
}
