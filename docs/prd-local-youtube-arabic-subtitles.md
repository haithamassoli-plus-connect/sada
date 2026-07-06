# PRD — Private On-Device Arabic Subtitles for YouTube

**Working name:** _(TBD)_
**Owner:** _you_
**Status:** Draft v0.1 — personal MVP, architected to ship later
**Platform:** macOS / Apple Silicon, desktop Chromium browser

---

## 1. Problem

I want to watch English YouTube videos with Arabic subtitles. YouTube already auto-translates English captions into Arabic — but that runs in Google's cloud: the caption text and my viewing behavior leave the device, it only works online, and the output is generic machine translation.

The wedge is **not** "translate YouTube into Arabic" (already solved). It's **doing it entirely on-device** — private, no third-party translation calls, zero marginal cost. If local weren't a requirement, this project shouldn't exist; YouTube's built-in feature would be enough. **Local is the entire point.**

## 2. What it is

A desktop browser extension that renders Arabic subtitles over English YouTube videos, translating the captions **100% on-device**.

## 3. Users

- **v1 (now):** me — one machine, one Chromium browser, macOS/Apple Silicon. Rough edges, flags, and manual install are fine.
- **Later:** Arabic-speaking viewers who want private, low-cost translation. Design so this is *possible*; don't build for it yet.

## 4. Goals

- Arabic subtitles shown in the player, synced to playback, readable.
- No text sent to any translation service — translation happens locally.
- Zero per-use cost.
- Works on standard watch pages that already have English captions.

## 5. Non-goals (v1)

- Dubbing / replacing the audio.
- Videos with **no** captions (needs speech recognition — deferred).
- Live streams, Shorts, embedded players, mobile.
- Any language pair other than EN→AR.
- Store / distribution readiness (load-unpacked for now).

## 6. Assumptions (stated explicitly — correct me)

- **"Offline" means offline _translation_, not offline _viewing_.** The video still streams from YouTube, so this isn't "works with no internet." Nothing leaves the device *for translation*. → If you actually meant translating downloaded videos, that's a different product. **(Open Q1.)**
- **Captions "usually" exist** → captions-first is the MVP. No-caption videos get a clear empty state; speech-to-text is a later phase, not a v1 blocker.
- **Text subtitles overlaid on the player**, not dubbed audio.

## 7. Core flow

1. Open a YouTube video that has English captions.
2. Extension detects the video + English caption track and pulls the timed cues.
3. Translates all cues EN→AR on-device (batched, cached per video).
4. Renders an Arabic overlay synced to `currentTime`; user can toggle it on/off.
5. No captions available → clear "nothing to translate" state (no silent failure).

## 8. Functional requirements

- Detect the watch-page video; re-initialize on in-app navigation (`yt-navigate-finish`) — YouTube doesn't reload between videos.
- Extract the English caption track (prefer manual English; else auto-generated English) as timed cues.
- Translate EN→AR locally.
- Overlay: right-to-left, readable Arabic font, outline/shadow for legibility, bottom-positioned, sits above player controls, survives fullscreen.
- Toggle + minimal settings (on/off, font size; optionally show English too).
- Cache translations per video id to avoid re-translating on replay.

## 9. Technical approach (the decisions that matter)

**Platform:** Manifest V3 Chromium extension, desktop.

**Source text:** Read YouTube's caption track from the player response, fetch cues as `json3`.
⚠️ This endpoint is the fragile part — YouTube changes/protects it periodically and the URL occasionally returns empty. Fetch from the content script (same-origin) and fail gracefully.

**Translation engine — two paths, fallback-first (the key call):**

- **Primary (lightest):** the browser's built-in **on-device Translator API** (Chrome 138+ / Edge 148+). Free, local. Must feature-detect the `en→ar` pair via `Translator.availability()`. Edge guarantees Arabic (145+ languages); Chrome ships ~37 and needs verification. First use downloads a language pack (~1–2 GB).
- **Baseline (portable):** **transformers.js NLLB-200** (`Xenova/nllb-200-distilled-600M`, fp16) via WebGPU, bundled with the extension. Fully on-device, higher Arabic quality than Opus-MT, you control it end-to-end. WebGPU-only build (no WASM fallback); on Apple Silicon + WebGPU it's fast enough for batch cue translation.

> **Recommendation:** build the bundled transformers.js engine as the *baseline* so "local" never depends on a single browser's capability, and use the built-in API as a faster path *when available*. This is what makes the "ship later" story viable.

**Quality:** cue-by-cue MT is mediocre on idioms (cues are sentence fragments). Reassemble cues into full sentences before translating, then re-split by timing. Set expectation: *good enough to follow*, not broadcast quality. A small on-device LLM is a possible later upgrade.

**Overlay:** custom DOM element (full control of RTL + font) rather than injecting a native TextTrack (which styles Arabic poorly).

**Caching:** store cue translations keyed by video id.

## 10. "Ship later" — cheap now vs. expensive later

- The built-in Translator API needs desktop + a recent browser + a large first-run download → fine for me, friction for real users. The **bundled MT engine is the shippable one.**
- A native **Whisper companion** (for no-caption videos) means shipping a native binary — a real install/distribution cliff. Keep it optional and out of v1.
- Cross-browser support, store review, permission minimization, and translating the extension's own UI are all deferred — but keep modules cleanly separated (**caption-fetch / translate-engine / overlay-render**) so each can be swapped or extended cheaply.

## 11. Open questions (the calls I'd want before locking scope)

1. **Offline = ?** Offline *translation while streaming YouTube* (my assumption), or translating *downloaded* videos?
2. **Quality bar:** is generic MT acceptable, or do you want the sentence-reassembly pass from day one (and a small local LLM later)?
3. **Daily browser:** Chrome or Edge? Decides whether the built-in Arabic pair is guaranteed or you rely on the bundled engine from day one.
4. **Dual subtitles:** Arabic only, or English + Arabic together?

## 12. Success criteria

On a typical captioned English video: Arabic subtitles appear within a second or two of load, stay in sync, and are readable — with **nothing sent to any translation server** — and it's good enough that I reach for it instead of YouTube's built-in auto-translate.

## 13. Phases

- **Phase 0 — MVP (personal):** captions → bundled MT → overlay + toggle. One browser, load-unpacked.
- **Phase 1 — quality & UX:** sentence-reassembly pass, settings, dual subtitles, caching, fullscreen edge cases.
- **Phase 2 — pre-ship:** use built-in API when present, packaging, cross-browser, permissions, store prep.
- **Phase 3 — coverage:** local Whisper (native Mac companion) for videos with no captions.
