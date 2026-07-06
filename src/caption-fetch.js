// src/caption-fetch.js  (isolated world, ESM) — matches the SADA contract exactly.
// Cue = { start:number(s), dur:number(s), text:string, ar?:string }

export function pickEnglishTrack(playerResponse) {
  const tracks =
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) return null;

  const isEn = (t) => (t.languageCode || '').toLowerCase().startsWith('en');
  // Prefer a human/manual English track; fall back to English ASR (auto).
  const manual = tracks.find((t) => isEn(t) && t.kind !== 'asr');
  const asr = tracks.find((t) => isEn(t) && t.kind === 'asr');
  const track = manual || asr;
  if (!track || !track.baseUrl) return null;

  const name =
    track.name?.simpleText ??
    track.name?.runs?.map((r) => r.text).join('') ??
    track.languageCode ??
    'English';

  return { baseUrl: track.baseUrl, vssId: track.vssId || '', name, kind: track.kind || '' };
}

// Pure json3 -> Cue[] parser. Exported so the timing self-check can exercise it
// without a network fetch. An empty/{}/no-events body yields [] (a pot-gated
// track answers 200 with an empty body — the caller maps [] to 'blocked').
export function parseJson3(body) {
  if (!body) return [];
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  const events = Array.isArray(data.events) ? data.events : [];
  const cues = [];
  for (const ev of events) {
    if (!Array.isArray(ev.segs)) continue; // window/append/clear control events
    const text = ev.segs.map((s) => s.utf8 || '').join('').trim();
    if (!text) continue; // blank / newline-only ASR events
    cues.push({
      start: (ev.tStartMs || 0) / 1000,
      dur: (ev.dDurationMs || 0) / 1000,
      text,
    });
  }
  return cues;
}

export async function fetchCuesFromTrack(track) {
  // baseUrl is already signed and already carries a query string, so append
  // with '&' (never '?') and never decode/re-encode it or the signature breaks.
  const url = track.baseUrl + '&fmt=json3';
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('timedtext ' + res.status);
  return parseJson3(await res.text());
}

export async function getEnglishCues(playerResponse) {
  const track = pickEnglishTrack(playerResponse);
  if (!track) return { cues: [], reason: 'no-captions' };
  try {
    const cues = await fetchCuesFromTrack(track);
    // ponytail: empty here means the track is pot/&exp=xpe-gated (200 empty body).
    // Ceiling: we can't mint a WebPO pot in an extension. Upgrade path = M4
    // on-device Whisper companion, never a third-party transcript service.
    if (cues.length === 0) return { cues: [], reason: 'blocked' };
    return { cues, trackName: track.name };
  } catch {
    return { cues: [], reason: 'error' };
  }
}

// --- Self-check (Node only) --------------------------------------------------
// Run: `node src/caption-fetch.js`. Proves json3 parsing yields correct Cue
// timings and drops control/blank events. Never executes in the browser
// (process is undefined there), so it costs the extension nothing.
if (typeof process !== 'undefined' && process.argv?.[1] &&
    import.meta.url === `file://${process.argv[1]}`) {
  const assert = (await import('node:assert/strict')).default;

  const sample = JSON.stringify({
    events: [
      { tStartMs: 0, dDurationMs: 0, aAppend: 1 },                    // window control (no segs) -> skip
      { tStartMs: 500, dDurationMs: 1500, segs: [{ utf8: 'Hello ' }, { utf8: 'world' }] },
      { tStartMs: 2000, segs: [{ utf8: '\n' }] },                     // blank/newline-only -> skip
      { tStartMs: 3200, dDurationMs: 800, segs: [{ utf8: 'Bye' }] },  // dDurationMs present
      { tStartMs: 4000, segs: [{ utf8: 'No dur' }] },                 // dDurationMs absent -> 0
    ],
  });

  const cues = parseJson3(sample);
  assert.equal(cues.length, 3, 'control and blank events must be skipped');
  assert.deepEqual(cues[0], { start: 0.5, dur: 1.5, text: 'Hello world' });
  assert.deepEqual(cues[1], { start: 3.2, dur: 0.8, text: 'Bye' });
  assert.deepEqual(cues[2], { start: 4, dur: 0, text: 'No dur' });

  // Empty / non-JSON / no-events bodies -> [] (mapped to 'blocked' upstream).
  assert.deepEqual(parseJson3(''), []);
  assert.deepEqual(parseJson3('not json'), []);
  assert.deepEqual(parseJson3('{}'), []);

  // Track selection: manual English beats ASR; en-US counts as English.
  const pr = {
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          { baseUrl: 'https://x/asr', languageCode: 'a.en', kind: 'asr', name: { simpleText: 'English (auto)' } },
          { baseUrl: 'https://x/man', languageCode: 'en-US', name: { simpleText: 'English' } },
        ],
      },
    },
  };
  assert.equal(pickEnglishTrack(pr).baseUrl, 'https://x/man', 'prefer manual over ASR');
  assert.equal(pickEnglishTrack({}), null, 'no captions node -> null');

  console.log('caption-fetch self-check: OK');
}
