# Whisper companion (M4 — deferred, no-caption videos)

**Status: not in core v1.** This document describes the seam only. No code in
this milestone depends on it.

## The gap it fills

sada v1 translates the captions a YouTube video already provides. When a video
has **no caption track** — or its caption endpoint is proof-of-origin gated and
answers with an empty body — `caption-fetch` returns `{ cues: [], reason:
'no-captions' | 'blocked' }` and the overlay shows a quiet status pill. There is
nothing to translate because there is no source text.

The only way to subtitle those videos **without breaking the on-device
promise** is to generate the English transcript ourselves, on the device, from
the audio — i.e. on-device speech-to-text (Whisper). We explicitly do **not**
reach for a third-party transcript service or a network ASR API; that would send
what the user is watching off-device and violate the whole product thesis.

## Why it is deferred

- **Weight.** A usable Whisper model is far larger and heavier than the Opus-MT
  translator, and real-time transcription competes with playback for CPU/GPU.
- **Audio capture.** Reading the tab's audio for transcription needs capture
  machinery (`tabCapture` / an offscreen `MediaRecorder` pipeline) and new
  permissions that most users don't need, since most watched videos already have
  captions. Adding that to core v1 would tax every user for a minority case.
- **The common path already works.** The large majority of English watch pages
  still return real caption cues, so the captions → translate → overlay pipeline
  covers v1's goal today.

## The seam (where it plugs in)

The insertion point is a **new caption source behind the existing
`getEnglishCues` contract** — no other module changes.

- `src/caption-fetch.js` already returns the typed result
  `{ cues: Cue[], trackName } | { cues: [], reason }`, where
  `Cue = { start, dur, text, ar? }`.
- The companion would be a sibling module, e.g. `src/whisper-source.js`, that
  exposes the same shape:

  ```
  export async function transcribeCurrentVideo(video) -> Cue[]   // English, timed
  ```

- `src/content.js` orchestration gains one branch: when
  `getEnglishCues()` yields `reason: 'no-captions'` (or `'blocked'`), and the
  companion is available and enabled, fall through to
  `transcribeCurrentVideo()` to produce `text` cues, then feed them into the
  **exact same** translate-engine → reassemble → overlay path. Everything
  downstream of the cues is unchanged.
- The engine seam (`src/translate-engine.js`) and the overlay seam
  (`src/overlay.js`) need **no** changes: they already consume `Cue[]`.

## What a real implementation would add (out of scope here)

- An on-device Whisper (or equivalent) model, fetched once at install time by
  `scripts/fetch-assets.mjs`, loaded with `env.allowRemoteModels = false` — same
  offline discipline as the translator.
- Tab-audio capture into the offscreen document (a `MediaRecorder` /
  `AudioContext` pipeline), gated behind a new, clearly-justified capture
  permission and an explicit user opt-in.
- Chunked, streaming transcription that stays ahead of playback, with
  backpressure so it never blocks the render loop.

Until then, no-caption and gated videos remain a graceful, quiet "captions
unavailable" state — never a network call to a transcript service.
