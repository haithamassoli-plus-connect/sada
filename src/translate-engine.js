// src/translate-engine.js  (offscreen, ESM) — the SWAPPABLE translation engine.
// Contract: export async translateTexts(texts) -> string[] (Arabic, same order+length),
//           export status() -> { backend, ready }.
// HARD RULE: 100% on-device. No caption text ever leaves the machine. The only runtime
// asset origin is chrome-extension:// (bundled library + model). allowRemoteModels=false.

import { pipeline, env } from '../vendor/transformers/transformers.min.js';

// --- MUST run BEFORE the first pipeline() call (configure-early rule) ---
env.allowRemoteModels = false;                                                    // no HF Hub at runtime
env.allowLocalModels  = true;
env.localModelPath    = chrome.runtime.getURL('models/');                         // -> models/Xenova/opus-mt-en-ar/
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('vendor/transformers/'); // else it CDN-fetches ort wasm = offline BLOCKER
// ponytail: numThreads=1 avoids SharedArrayBuffer/COOP+COEP cross-origin isolation in the offscreen doc.
// Ceiling: single-thread WASM. Upgrade path = add COOP/COEP to offscreen.html + a proxy worker wasm to raise threads.
env.backends.onnx.wasm.numThreads = 1;

const MODEL_ID = 'Xenova/opus-mt-en-ar';   // Opus-MT (Marian): NO src_lang/tgt_lang needed.

let _translator = null;   // lazy singleton (bundled model pipeline)
let _backend = null;      // 'webgpu' | 'wasm' | null
let _ready = false;
let _native = false;      // M3 built-in on-device Translator fast path in use
let _booting = null;      // shared boot promise (dedupe concurrent callers)

async function boot() {
  if (_translator || _native) return;
  if (_booting) return _booting;
  _booting = (async () => {
    // M3 FAST PATH: built-in on-device Translator API (still 100% local). Never a network translator.
    try {
      if (globalThis.Translator && (await Translator.availability('en', 'ar')) === 'available') {
        _native = true; _backend = 'webgpu'; _ready = true; return;   // treat native as GPU-class local
      }
    } catch { /* fall through to the bundled model */ }
    // Bundled model: try WebGPU/fp32 (Marian's stable webgpu dtype), fall back to WASM/q8.
    try {
      _translator = await pipeline('translation', MODEL_ID, { device: 'webgpu', dtype: 'fp32' });
      _backend = 'webgpu';
    } catch {
      _translator = await pipeline('translation', MODEL_ID, { device: 'wasm', dtype: 'q8' });
      _backend = 'wasm';
    }
    _ready = true;
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

  const res = await _translator(texts);              // batch: array in, array out, same order+length
  return (Array.isArray(res) ? res : [res]).map((r) => r.translation_text ?? '');
}

export function status() {
  return { backend: _backend, ready: _ready };
}
