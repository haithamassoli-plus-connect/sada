# Privacy Policy — sada

_Last updated: 2026-07-06_

**sada translates YouTube captions into Arabic entirely on your own device.**

## What sada does

When you watch an English video on YouTube, sada reads the captions that YouTube
already provides for that video, translates them into Arabic locally, and shows
them as subtitles over the player.

## What is sent off your device: nothing

- **No caption text is transmitted.** Translation runs on your device using a
  model that ships with the extension. Your captions are never uploaded to sada,
  to Google, or to any third-party translation service.
- **No viewing data is collected or transmitted.** sada does not record, store
  off-device, or send which videos you watch, what you translate, or any other
  browsing or usage data. There is no analytics, no telemetry, and no tracking.
- **No accounts, no sign-in.**

## The only network activity

- **At install time**, a one-time setup step (`scripts/fetch-assets.mjs`)
  downloads the translation model and runtime from Hugging Face and jsDelivr.
  This happens once, before first use, and downloads only public model files.
- **At runtime**, the only network requests are to **YouTube itself** — the
  video and its caption cues, requested from the YouTube page you are already on —
  and to the extension's own bundled files. No other servers are contacted.

## Data storage

Your settings (on/off, subtitle size, whether to also show English) and a
per-video cache of already-translated text are stored **locally** in the
browser's extension storage on your device. They are never synced to a server by
sada. You can clear them at any time by removing the extension.

## Permissions

sada requests only `storage` (to save your settings and the local translation
cache) and `offscreen` (to run the on-device translation model), plus access to
`youtube.com` (to read captions and draw subtitles over the player). See
`CHROMEWEBSTORE.md` for the full plain-language justification of each.

## Contact

Questions about privacy: noreply@goldentik.com
