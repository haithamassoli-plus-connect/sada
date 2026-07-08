# Tasks — Private On-Device Arabic Subtitles for YouTube

Derived from [docs/prd-local-youtube-arabic-subtitles.md](docs/prd-local-youtube-arabic-subtitles.md). Milestones map to the PRD phases (§13); tasks are grouped by the three core modules the PRD keeps separable: **caption-fetch / translate-engine / overlay-render**.

**Definition of done (v1):** On a typical captioned English video, Arabic subtitles appear within ~1–2s of load, stay in sync, are readable, and **nothing leaves the device for translation**.

---

## Status — 2026-07-06

Milestones **0–3 built and verified**; **M4 deferred** (per PRD, out of core v1). Verification done without sideloading (the automated browser can't load an unpacked MV3 extension), so each piece was exercised directly:

> **Update — translation model swapped Opus-MT → NLLB-200-distilled-600M** (q8 on **WASM/CPU**). NLLB does NOT run on ORT-web WebGPU at any dtype (fp16 OOM, 4-bit broken op, int8 garbage — all verified in a real Chrome via CDP), so it runs on WASM: correct Arabic, ~1.4s/line single-thread, one line at a time (mixed-length batches run past EOS). **Full pipeline verified end-to-end in Chrome for Testing** (backend cues → SW → offscreen → engine → Arabic). The Opus-MT notes below are historical.

- **translate-engine** — the *shipped* `src/translate-engine.js` was imported in a real browser and produced correct Arabic on **WebGPU** (e.g. _"The whole idea runs entirely on your own device."_ → **الفكرة بأكملها تعمل بالكامل على جهازك الخاص**). Also proven in Node against the bundled local weights. `env.allowRemoteModels=false` → zero third-party calls.
- **overlay-render** — driven live in `test/harness.html`: RTL Arabic, timeline sync, dual EN+AR, font sizing, status pill. Screenshotted.
- **popup** — rendered + interacted (echo-ring toggle persists settings and fires `chrome.storage.onChanged`), light + dark themes, no console errors.
- **caption-fetch / reassemble** — runnable `node` self-checks pass.
- **locality + MV3 correctness** — two adversarial agent reviews; verdict _"valid MV3 build, correctly wired, and TRULY LOCAL."_

> ⚠️ **Library pinned to transformers.js 3.7.5, NOT latest 4.x.** In-browser testing found 4.x ships a broken dev `onnxruntime-web` (QDQ `TransposeDQWeightsForMatMulNBits` crash on the tied embedding) **and** a browser tokenizer-loader regression. Stay on 3.7.5 (this build runs NLLB q8 on WASM). Documented in `scripts/fetch-assets.mjs`.

**One manual step remains (needs a human at a real Chrome):** `chrome://extensions` → Load unpacked → open a captioned English video → confirm subtitles + watch the **Network** tab shows zero third-party translation calls during a full watch. Everything upstream of that is verified.

---

## Open decisions — locked (PRD §11)

- [x] **Q1 — Offline scope:** translation-while-streaming. _(streaming; the video streams, translation is local.)_
- [x] **Q2 — Quality bar:** sentence-reassembly is on from day one (`src/reassemble.js`), better than raw cue-by-cue MT.
- [x] **Q3 — Daily browser:** Chrome. Bundled transformers.js engine is the baseline; built-in Translator API used as a fast path when present (M3).
- [x] **Q4 — Dual subtitles:** Arabic-only by default, **EN+AR toggle shipped** ("Show English too").

---

## Milestone 0 — Scaffolding ✅

- [x] MV3 `manifest.json`: content script matching `*://*.youtube.com/watch*`, minimal permissions (`storage`, `offscreen`).
- [x] Content-script entry that boots on watch pages (`src/loader.js` → `src/content.js`).
- [x] Three modules as clean seams: `caption-fetch`, `translate-engine`, `overlay-render` (+ `reassemble`, `settings`).
- [x] Load-unpacked dev loop documented (`README.md`: reload extension, reload tab, harness).

---

## Milestone 1 — Phase 0: MVP (personal) ✅

### caption-fetch
- [x] Detect the watch-page `<video>` (`.html5-video-player video`, polled on init).
- [x] Re-initialize on `yt-navigate-finish`; MAIN-world hook (`src/yt-hook.js`) posts a fresh `ytInitialPlayerResponse`, with a bounded cold-load poll + request/response handshake (fixes the hard-load race).
- [x] Read caption track from the player response; prefer manual English, else auto-generated English.
- [x] Fetch cues as `json3` from the content script (same-origin, `credentials:'include'`).
- [x] Fail gracefully on empty/blocked (PO-token/`exp=xpe` 200-empty) → `no-captions`/`blocked`/`error`, never a crash.

### translate-engine
- [x] Bundle transformers.js NLLB-200 (`Xenova/nllb-200-distilled-600M`, q8 WASM); `env.allowRemoteModels=false`, local weights via `getURL`. _(fetched once at install by `scripts/fetch-assets.mjs`.)_
- [x] Run inference on **WASM/q8** (backend `wasm`, correct Arabic) — verified end-to-end in Chrome for Testing via CDP. NLLB doesn't run on ORT-web WebGPU at any dtype (verified: fp16 OOM abort, 4-bit `MatMulNBits` crash, int8 garbage output).
- [x] Translate cues EN→AR **one line at a time** (chunked ~24 cues at the content-script level so the active line lands fast). NLLB runs past EOS in a mixed-length batch (`decoder_start`==`eos`==2) → repeated/wrong-language garbage, so per-line. Verified clean on the shipped q8 weights.
- [x] Single swappable interface: `translateTexts(texts) → string[]` behind an offscreen message boundary. _(texts-based, not `translateCues`; `reassemble.js` maps sentences↔cues — same swappability.)_

### overlay-render
- [x] Custom DOM overlay (not native TextTrack): RTL, Arabic font stack, broadcast text-shadow (no box), bottom-positioned.
- [x] Anchored into `.html5-video-player` so it sits above controls and survives fullscreen.
- [x] Sync active cue to `video.currentTime` (rAF + binary search, DOM touched only on change).
- [x] Toggle overlay on/off (popup ↔ content via `chrome.storage.onChanged`).

### integration
- [x] End-to-end pipeline built: hook → cues → Arabic → synced overlay. _(each stage verified; full run on a sideloaded extension is the one manual step above.)_
- [x] "Nothing to translate" empty state when no captions exist (no silent failure).
- [x] **Locality:** `allowRemoteModels=false` + only youtube/extension origins at runtime; confirmed by static review. _(final DevTools-Network capture is part of the manual sideload step.)_

---

## Milestone 2 — Phase 1: Quality & UX ✅

- [x] Sentence-reassembly pass: `toSentences` joins fragment cues, translate, `splitToCues` re-splits by proportional length.
- [x] Cache translations keyed by video id (`sada:cache:<id>` in `chrome.storage.local`); skips re-translation on replay.
- [x] Settings UI: on/off, font size (16–48px), "show English too".
- [x] Dual subtitles: EN + AR together, gated on the toggle (Q4).
- [x] Fullscreen: overlay is a child of the player element, so it holds across enter/exit and resize.

---

## Milestone 3 — Phase 2: Pre-ship ✅

- [x] Feature-detect built-in `Translator.availability('en','ar')`.
- [x] Use built-in Translator API as the fast path when available; else the bundled engine (still 100% local, never a network translator).
- [x] First-run language-pack UX: bundled engine is the default so there's no hard dependency on the 1–2 GB pack.
- [x] Packaging: `scripts/zip.mjs` builds a store zip (excludes dev files).
- [x] Permissions minimized: `storage` + `offscreen` only; host scoped to `*.youtube.com`.
- [x] Store prep: `CHROMEWEBSTORE.md` (listing + permission justifications) and `PRIVACY.md` (on-device statement). Real PNG icons generated.
- [ ] Cross-browser check on Edge — code is feature-detect-ready; not run on Edge here.

---

## Milestone 4 — Phase 3: Coverage (no-caption videos) — deferred

Out of core v1 (native binary = a real install cliff). Seam documented in `docs/whisper-companion.md`; the extension already surfaces the `no-captions`/`blocked` state that would route to it.

- [ ] Native Whisper companion for macOS (own install path, optional).
- [ ] Extension routes audio → local transcription when no captions exist.
- [ ] Keep the native binary out of the core v1 install.
