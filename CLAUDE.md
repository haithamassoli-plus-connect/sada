# sada — on-device Arabic subtitles for YouTube

Manifest V3 Chromium extension. Renders Arabic subtitles over English YouTube
videos, translating captions 100% on-device. See `docs/prd-local-youtube-arabic-subtitles.md`.

## Skills to use

- **transformers-js** — the translation engine. **WASM/q8 (int8)** inference with
  `Xenova/nllb-200-distilled-600M` (EN→AR, `eng_Latn`→`arb_Arab`), one line at a time.
  Bundled. NLLB does NOT run on ORT-web WebGPU (fp16 OOM, 4-bit broken op, int8 garbage —
  verified in-browser), so it's the CPU/WASM path (~1.4s/line, single-thread).
- **chrome-extensions** — MV3 shell: service worker, content scripts, permissions.

## Module boundaries (keep swappable)

caption-fetch / translate-engine / overlay-render
