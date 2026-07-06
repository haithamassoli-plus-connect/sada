// src/yt-hook.js  (MAIN world, run_at:document_start) — matches the SADA contract.
// Reads window.ytInitialPlayerResponse and posts it to the isolated world.
// YouTube is an SPA: the global is fresh on hard load but goes STALE on in-app
// navigations, so we re-read on the document-level 'yt-navigate-finish' event.
'use strict';

function post() {
  const playerResponse = window.ytInitialPlayerResponse;
  if (!playerResponse) return false;
  window.postMessage({ source: 'sada-hook', playerResponse }, '*');
  return true;
}

// (a) hard load: YouTube installs window.ytInitialPlayerResponse via a later inline
// script, so at document_start it's usually still undefined. Poll (bounded) until it
// appears, then stop — this is the primary entry path (direct load / refresh).
if (!post()) {
  const timer = setInterval(() => { if (post()) clearInterval(timer); }, 100);
  setTimeout(() => clearInterval(timer), 10000);
}

// (b) the isolated world attaches its listener at document_idle, possibly AFTER the
// post above fired. It asks for a re-post once mounted; we answer with the current global.
window.addEventListener('message', (e) => {
  if (e.source === window && e.data && e.data.source === 'sada-request-pr') post();
});

// (c) each in-app navigation installs a new player response.
// ponytail: yt-navigate-finish can fire a tick BEFORE the global is swapped;
// a single deferred 0ms re-read wins that race. The isolated world keys its
// fetch to the videoId, so a stale post is harmlessly ignored.
document.addEventListener('yt-navigate-finish', () => {
  post();
  setTimeout(post, 0);
});
