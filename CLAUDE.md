# sada — on-device Arabic subtitles for YouTube

Manifest V3 Chromium extension. Renders Arabic subtitles over English YouTube
videos, translating captions 100% on-device. See `docs/prd-local-youtube-arabic-subtitles.md`.

## Skills to use

- **transformers-js** — the translation engine. WebGPU (fp16) inference with
  `Xenova/nllb-200-distilled-600M` (EN→AR, `eng_Latn`→`arb_Arab`). Bundled; WebGPU-only build.
- **chrome-extensions** — MV3 shell: service worker, content scripts, permissions.

## Module boundaries (keep swappable)

caption-fetch / translate-engine / overlay-render
