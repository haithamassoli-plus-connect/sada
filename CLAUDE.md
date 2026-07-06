# sada — on-device Arabic subtitles for YouTube

Manifest V3 Chromium extension. Renders Arabic subtitles over English YouTube
videos, translating captions 100% on-device. See `docs/prd-local-youtube-arabic-subtitles.md`.

## Skills to use

- **transformers-js** — the translation engine. WebGPU/WASM inference with
  `Xenova/opus-mt-en-ar` (EN→AR). Baseline, browser-independent, bundled.
- **chrome-extensions** — MV3 shell: service worker, content scripts, permissions.

## Module boundaries (keep swappable)

caption-fetch / translate-engine / overlay-render
