// src/content.js — the SADA orchestrator (isolated world, ES module).
// Boots on /watch pages, re-inits on every yt-navigate-finish. Reads cues via
// caption-fetch, translates cache-first + incrementally through the offscreen
// engine (relayed by sw.js), and drives the overlay. Fails gracefully.

import { getEnglishCues } from './caption-fetch.js';
import { SubtitleOverlay } from './overlay.js';
import { getSettings, onSettingsChanged } from './settings.js';
import { toSentences, splitToCues } from './reassemble.js';

const CHUNK_CUES = 24; // translate ~24 cues per round so the active line lands in ~1-2s

let latestPR = null; // freshest playerResponse from the MAIN-world hook
let session = null; // the one active per-video session

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isWatchPage = () => location.pathname === '/watch';
const prVideoId = (pr) => pr?.videoDetails?.videoId || null;

// Keep the latest playerResponse the hook posts across the isolated boundary.
window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  const d = e.data;
  if (d && d.source === 'sada-hook' && d.playerResponse) latestPR = d.playerResponse;
});

function teardown() {
  if (!session) return;
  session.cancelled = true; // cancels any in-flight loop that checks it
  session.overlay?.destroy();
  session = null;
}

// Poll a getter briefly; bail early if the session was cancelled.
async function waitFor(sess, get, timeoutMs, interval = 100) {
  const end = Date.now() + timeoutMs;
  while (!sess.cancelled) {
    const v = get();
    if (v) return v;
    if (Date.now() >= end) return null;
    await sleep(interval);
  }
  return null;
}

async function translate(texts) {
  const res = await chrome.runtime.sendMessage({ type: 'sada-translate', texts });
  return (res && res.translations) || [];
}

async function persist(cacheKey, indices, cues) {
  const stored = (await chrome.storage.local.get(cacheKey))[cacheKey] || {};
  for (const i of indices) if (cues[i]?.ar) stored[i] = cues[i].ar;
  await chrome.storage.local.set({ [cacheKey]: stored });
}

async function loadAndTranslate(sess, cues, settings) {
  const { overlay } = sess;
  const cacheKey = 'sada:cache:' + sess.videoId;

  // CACHE-FIRST: fill known Arabic instantly so replays need no re-translation.
  const stored = (await chrome.storage.local.get(cacheKey))[cacheKey] || {};
  for (let i = 0; i < cues.length; i++) if (stored[i]) cues[i].ar = stored[i];
  if (sess.cancelled) return;
  overlay.setCues(cues);

  // ponytail: M2 always reassembles cue fragments into sentences before
  // translating (better MT quality). The raw cue-by-cue path was the M1 mode;
  // it's gone now that reassembly is the default and there's no toggle for it.
  const sentences = toSentences(cues);
  const pending = sentences.filter((s) => s.cueIdx.some((i) => !cues[i].ar));
  if (pending.length === 0 || !settings.enabled) {
    overlay.showState(null);
    return;
  }

  overlay.showState('translating');
  // Translate in rounds of ~CHUNK_CUES cues (sentences accumulated until the round
  // holds about that many cues) so the active line lands in ~1-2s, not after the
  // whole video finishes.
  for (let i = 0; i < pending.length && !sess.cancelled; ) {
    const chunk = [];
    let cueCount = 0;
    while (i < pending.length && (chunk.length === 0 || cueCount + pending[i].cueIdx.length <= CHUNK_CUES)) {
      cueCount += pending[i].cueIdx.length;
      chunk.push(pending[i++]);
    }
    const translations = await translate(chunk.map((s) => s.text));
    if (sess.cancelled) return;
    splitToCues(cues, chunk, translations);
    overlay.setCues(cues);
    overlay.showState(null); // subtitles now visible; drop the status pill
    await persist(cacheKey, chunk.flatMap((s) => s.cueIdx), cues);
  }
}

async function init() {
  const settings = await getSettings();

  // Not a watch page or turned off -> tear the overlay down (cancels in-flight).
  if (!isWatchPage()) return teardown();
  const videoId = new URLSearchParams(location.search).get('v');
  if (!videoId || !settings.enabled) return teardown();

  // Same video already running: just re-apply presentation, don't re-translate.
  if (session && session.videoId === videoId && session.overlay) {
    session.overlay.setOptions({
      fontSize: settings.fontSize,
      showEnglish: settings.showEnglish,
      visible: true,
    });
    return;
  }

  teardown();
  const sess = (session = { videoId, overlay: null, cancelled: false });

  const video = await waitFor(sess, () => document.querySelector('.html5-video-player video'), 10000);
  if (sess.cancelled || !video) return;

  const overlay = (sess.overlay = new SubtitleOverlay(video));
  overlay.setOptions({ fontSize: settings.fontSize, showEnglish: settings.showEnglish, visible: true });
  overlay.showState('loading');

  try {
    // Ask the MAIN-world hook to (re)post the current playerResponse — covers the
    // case where its initial post fired before this listener was attached. The hook
    // also polls the global on cold load, so one of the two wins the race.
    window.postMessage({ source: 'sada-request-pr' }, '*');
    const pr = await waitFor(sess, () => (prVideoId(latestPR) === videoId ? latestPR : null), 10000);
    if (sess.cancelled) return;
    if (!pr) return; // stay on the loading pill

    const result = await getEnglishCues(pr);
    if (sess.cancelled) return;

    if (!result.cues || result.cues.length === 0) {
      // 'blocked' (pot/exp-gated 200-empty) reads as no-captions to the user;
      // only truly unexpected failures surface as 'error'.
      overlay.showState(result.reason === 'error' ? 'error' : 'no-captions');
      return;
    }

    await loadAndTranslate(sess, result.cues, settings);
  } catch {
    if (!sess.cancelled) overlay.showState('error');
  }
}

// Re-apply settings live; only rebuild when enable-state or watch-context needs it.
onSettingsChanged(async () => {
  const s = await getSettings();
  if (s.enabled && session && session.videoId && session.overlay && isWatchPage()) {
    session.overlay.setOptions({ fontSize: s.fontSize, showEnglish: s.showEnglish, visible: true });
    return;
  }
  init();
});

document.addEventListener('yt-navigate-finish', () => init());
init();
