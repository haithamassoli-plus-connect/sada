# Chrome Web Store Listing — Sada — Arabic subtitles for YouTube

> Last Updated: 2026-07-06

## Store Listing

**Extension Name** [REQUIRED]

Sada — Arabic subtitles for YouTube

**Short Description** [REQUIRED]
<!-- Max 132 characters. -->

Watch English YouTube with Arabic subtitles, translated privately on your own device.

**Detailed Description** [REQUIRED]

Sada adds Arabic subtitles to English YouTube videos and translates them right on your device.

Turn any English video with captions into an Arabic-subtitled one. Sada reads the video's own captions, translates them into natural Arabic, and shows them over the player in sync with what you're watching. The Arabic reads right-to-left in a clean, broadcast-style caption with no distracting box.

How to use it:
1. Install Sada and open any English YouTube video that has captions.
2. Arabic subtitles appear automatically over the player.
3. Click the Sada toolbar icon to turn subtitles on or off, make the text bigger or smaller, and optionally show the English line at the same time.

Your privacy comes first. Sada translates everything on your own device — the captions you watch are never sent to Sada, to Google, or to any translation service. There is no account, no sign-in, no tracking, and no analytics. The only thing Sada talks to while you watch is YouTube itself.

Note: Sada works on videos that already have captions available on YouTube. Live streams and videos with no captions are not yet supported.

Questions or feedback: noreply@goldentik.com

**Category** [REQUIRED]

Accessibility

**Single Purpose** [REQUIRED]

Displays on-device Arabic translations of a YouTube video's captions as subtitles over the player.

**Primary Language** [REQUIRED]

English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ⬜ Not created | |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |

### Screenshot Notes

1. A YouTube video playing with a large Arabic subtitle line over the player (RTL, no box).
2. Dual mode: English line above, Arabic below, showing the translation pairing.
3. The toolbar popup: the echo-ring on/off control, font-size stepper, and "Show English too" switch, with the "Translated on your device" footer visible.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| storage | permissions | Saves the user's own settings (subtitles on/off, subtitle font size, whether to also show English) and a per-video cache of already-translated captions so a replayed video doesn't re-translate. All stored locally on the device; nothing is synced to a server by the extension. |
| offscreen | permissions | Runs the bundled on-device translation model in an offscreen document. This is required because the model uses WebAssembly/WebGPU, which must execute under the extension's own security policy rather than YouTube's page context. No data leaves the device. |
| *://*.youtube.com/* | host_permissions | The extension only operates on YouTube. It needs access to youtube.com to read the current video's caption track, fetch the caption cues (same-origin, as the page already does), and draw the Arabic subtitles over the video player. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

The extension does not collect, transmit, or sell any user data. Captions are translated entirely on the device; settings and the translation cache are stored locally only.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | — | No |
| Health info | No | No | — | No |
| Financial info | No | No | — | No |
| Authentication info | No | No | — | No |
| Personal communications | No | No | — | No |
| Location | No | No | — | No |
| Web history | No | No | — | No |
| User activity | No | No | — | No |
| Website content | No | No | — | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]

<!-- Host PRIVACY.md at a public URL (e.g. GitHub Pages) and paste it here before submission. -->
_See `PRIVACY.md` in the repository; publish it to a public URL before submitting._

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]

_[fill in publisher account name]_

**Contact Email** [REQUIRED]

noreply@goldentik.com

**Support URL / Email** [RECOMMENDED]

noreply@goldentik.com

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 0.1.0 | 2026-07-06 | Initial release: on-device Arabic subtitles for English YouTube videos with captions; on/off, font size, and dual-language settings. | Draft |

## Review Notes

### Known Issues / Limitations
- Works only on videos that expose captions on YouTube (manual or auto-generated). Live streams and no-caption videos are not supported in v1 — an on-device speech path is planned (see `docs/whisper-companion.md`).
- A small and growing minority of videos gate their caption endpoint (proof-of-origin token); on those, sada shows a quiet "captions unavailable" state and never contacts any third party to work around it.

### Rejection History
<!-- None yet. -->
