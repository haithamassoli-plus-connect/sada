// src/translate-engine.js  (offscreen, ESM) — the SWAPPABLE translation engine.
// Contract: export async translateTexts(texts) -> string[] (Arabic, same order+length),
//           export status() -> { backend, ready }.
// HARD RULE: 100% on-device. No caption text ever leaves the machine. The only runtime
// asset origin is chrome-extension:// (bundled library + model). allowRemoteModels=false.

import { pipeline, env } from '../vendor/transformers/transformers.min.js';

// --- MUST run BEFORE the first pipeline() call (configure-early rule) ---
env.allowRemoteModels = false;                                                    // no HF Hub at runtime
env.allowLocalModels  = true;
env.localModelPath    = chrome.runtime.getURL('models/');                         // -> models/Xenova/nllb-200-distilled-600M/
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('vendor/transformers/'); // else it CDN-fetches ort wasm = offline BLOCKER
// ponytail: numThreads=1 avoids SharedArrayBuffer/COOP+COEP cross-origin isolation in the offscreen doc.
// Ceiling: single-thread WASM. Upgrade path = add COOP/COEP to offscreen.html + a proxy worker wasm to raise threads.
env.backends.onnx.wasm.numThreads = 1;

const MODEL_ID = 'Xenova/nllb-200-distilled-600M';                  // NLLB-200: multilingual, needs lang codes.
const NLLB_LANGS = { src_lang: 'eng_Latn', tgt_lang: 'arb_Arab' }; // English -> Modern Standard Arabic.

let _translator = null;   // lazy singleton (bundled model pipeline)
let _backend = null;      // 'wasm' | 'webgpu' (native Translator) | null
let _ready = false;
let _native = false;      // M3 built-in on-device Translator fast path in use
let _booting = null;      // shared boot promise (dedupe concurrent callers)
let _bootFailed = false;  // WebGPU load failed once — no fallback, so don't re-attempt per chunk

async function boot() {
  if (_translator || _native || _bootFailed) return;
  if (_booting) return _booting;
  _booting = (async () => {
    // M3 FAST PATH: built-in on-device Translator API (still 100% local). Never a network translator.
    try {
      if (globalThis.Translator && (await Translator.availability('en', 'ar')) === 'available') {
        _native = true; _backend = 'webgpu'; _ready = true; return;   // treat native as GPU-class local
      }
    } catch { /* fall through to the bundled model */ }
    // Bundled model runs on WASM/q8. NLLB does NOT load correctly on ORT-web's WebGPU at any
    // dtype (fp16 OOMs the wasm loader, q4f16 hits a broken 4-bit MatMulNBits op, q8 loads but
    // emits garbage) — verified in-browser — so WASM/q8 is the only correct in-browser path.
    // Single-thread today; see the numThreads note above for the multi-thread upgrade path.
    try {
      _translator = await pipeline('translation', MODEL_ID, { device: 'wasm', dtype: 'q8' });
      _backend = 'wasm';
      _ready = true;
    } catch (e) {
      _backend = null;
      _bootFailed = true;   // don't re-attempt a doomed load on every chunk
      console.warn('[sada] translation engine failed to load:', e);
    }
  })();
  try {
    await _booting;
  } finally {
    _booting = null;
  }
}

export async function translateTexts(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  await boot();

  if (_native) {                                     // built-in Translator: one input at a time
    const t = await Translator.create({ sourceLanguage: 'en', targetLanguage: 'ar' });
    const out = [];
    for (const text of texts) out.push((await t.translate(text)) ?? '');
    return out;
  }

  if (!_translator) return texts.map(() => '');      // WebGPU unavailable: no WASM fallback shipped
  // One at a time, NOT as a batch: NLLB mishandles per-sequence stopping in a mixed-length
  // batch (its decoder_start_token == eos_token == 2), so short lines run past EOS into
  // repeated / wrong-language garbage. Per-line output is clean and each subtitle line is short.
  const out = [];
  for (const text of texts) {
    const r = await _translator(text, NLLB_LANGS);
    out.push((Array.isArray(r) ? r[0] : r).translation_text ?? '');
  }
  return out;
}

export function status() {
  return { backend: _backend, ready: _ready };
}
