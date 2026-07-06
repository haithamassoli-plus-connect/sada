// src/sw.js (MV3 service worker, module). Owns the single offscreen document and
// relays translation traffic between content scripts and the offscreen engine.

let creating = null; // shared promise guarding concurrent createDocument calls

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument?.()) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: ['BLOBS'],
        justification: 'Run the on-device translation model',
      })
      .finally(() => {
        creating = null;
      });
  }
  await creating;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'sada-translate' && msg?.type !== 'sada-engine-status') return;
  (async () => {
    try {
      // A status query shouldn't boot the engine: if there's no offscreen doc yet,
      // the engine isn't running, so answer directly instead of creating one.
      if (msg.type === 'sada-engine-status' && !(await chrome.offscreen.hasDocument?.())) {
        sendResponse({ backend: null, ready: false });
        return;
      }
      await ensureOffscreen();
      // Relay to the offscreen document and hand its reply back to the caller.
      const reply = await chrome.runtime.sendMessage({ ...msg, target: 'offscreen' });
      sendResponse(reply);
    } catch (e) {
      // Always answer, so the caller never hangs on a closed port.
      sendResponse({ error: String(e), translations: [], backend: null, ready: false });
    }
  })();
  return true; // keep the channel open for the async reply
});

// Local caption companion: fetch English transcript cues from the user's own
// youtube-transcript-api backend, bypassing YouTube's pot-gated in-page timedtext.
// Done here in the SW so host_permissions cover the cross-origin localhost fetch —
// a content-script fetch would hit CORS/mixed-content/private-network friction.
const SADA_BACKEND = 'http://127.0.0.1:8787';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'sada-cues') return;
  (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000); // don't let a wedged backend stall boot
      const res = await fetch(`${SADA_BACKEND}/cues?v=${encodeURIComponent(msg.videoId)}`, {
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      sendResponse(res.ok ? await res.json() : { cues: [], reason: 'error' });
    } catch {
      // backend not running / timed out -> caller falls back to the in-page path
      sendResponse({ cues: [], reason: 'offline' });
    }
  })();
  return true; // async response
});
