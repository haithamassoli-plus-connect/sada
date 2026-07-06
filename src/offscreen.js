// src/offscreen.js (ESM) — thin bridge from runtime messages to the swappable
// engine. Runs under the extension CSP so WASM/WebGPU are allowed here.
import { translateTexts, status } from './translate-engine.js';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only handle messages the service worker relayed to us.
  if (msg?.target !== 'offscreen') return;
  (async () => {
    if (msg.type === 'sada-translate') {
      const translations = await translateTexts(msg.texts || []);
      sendResponse({ translations });
    } else if (msg.type === 'sada-engine-status') {
      sendResponse(status());
    }
  })();
  return true; // async response
});
