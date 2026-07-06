#!/usr/bin/env node
// scripts/fetch-assets.mjs — install-time only (Node 18+). Downloads the
// transformers.js library + ONNX Runtime WASM into vendor/transformers/ and the
// Xenova/opus-mt-en-ar model into models/Xenova/opus-mt-en-ar/.
//
// Naming-agnostic on purpose: file names are discovered from the jsDelivr and
// Hugging Face APIs rather than hardcoded, so an ORT/name bump doesn't silently
// break the offline load. Idempotent (skips files already present) and exits
// non-zero on any failure. Nothing here runs at extension runtime — after this
// completes, translation is 100% on-device.

import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_DIR = join(ROOT, 'vendor', 'transformers');
const MODEL_DIR = join(ROOT, 'models', 'Xenova', 'opus-mt-en-ar');

// Pin transformers so the resolved ORT (a dev build that can be yanked) stays
// reproducible. ORT itself is read from transformers' package.json below.
// ponytail: pinned to 3.7.5, NOT latest 4.x. Verified in-browser: 4.x ships a broken
// dev onnxruntime-web (QDQ TransposeDQWeightsForMatMulNBits crash on the tied embedding)
// AND a browser tokenizer-loader regression. 3.7.5 loads webgpu-fp32 + wasm-q8 correctly.
const TF = '3.7.5';
const HF_MODEL = 'Xenova/opus-mt-en-ar';

// Only the 4 ONNX files the engine actually loads: encoder + merged decoder at
// the two dtypes it uses (fp32 for WebGPU, q8 '_quantized' for the WASM path).
const WANT_ONNX = new Set([
  'onnx/encoder_model.onnx',
  'onnx/decoder_model_merged.onnx',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
]);

let downloaded = 0;
let skipped = 0;

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

// Streams url -> destPath. Skips if the file already exists (idempotent).
async function download(url, destPath) {
  if (await exists(destPath)) {
    skipped++;
    console.log(`  skip  ${destPath.slice(ROOT.length + 1)}`);
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  await mkdir(dirname(destPath), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
  downloaded++;
  console.log(`  get   ${destPath.slice(ROOT.length + 1)}`);
}

// A) LIBRARY + ORT WASM -> vendor/transformers/
async function fetchLibrary() {
  console.log('\n[1/2] library + onnxruntime-web -> vendor/transformers/');

  // The ESM entry the extension imports.
  await download(
    `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TF}/dist/transformers.min.js`,
    join(VENDOR_DIR, 'transformers.min.js'),
  );

  // Discover the ORT version transformers pins (do NOT hardcode it).
  const pkg = await fetchJson(
    `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TF}/package.json`,
  );
  const ORT = pkg.dependencies?.['onnxruntime-web'];
  if (!ORT) throw new Error('could not resolve onnxruntime-web version from transformers package.json');
  console.log(`  onnxruntime-web pinned at ${ORT}`);

  // Mirror every ort-wasm-simd-threaded glue+binary flat into vendor/ so
  // env.backends.onnx.wasm.wasmPaths = that dir resolves them. Matching all
  // variants (asyncify/jsep/jspi/plain) survives Safari and future renames.
  const listing = await fetchJson(
    `https://data.jsdelivr.com/v1/packages/npm/onnxruntime-web@${ORT}?structure=flat`,
  );
  const ortRe = /^ort-wasm-simd-threaded(\..*)?\.(wasm|mjs)$/;
  const ortFiles = (listing.files || [])
    .map((f) => f.name)
    .filter((name) => name.startsWith('/dist/') && ortRe.test(name.split('/').pop()));
  if (ortFiles.length === 0) throw new Error('no ort-wasm-simd-threaded files found in onnxruntime-web dist');

  for (const name of ortFiles) {
    const base = name.split('/').pop();
    await download(
      `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT}/dist/${base}`,
      join(VENDOR_DIR, base),
    );
  }
}

// B) MODEL -> models/Xenova/opus-mt-en-ar/
async function fetchModel() {
  console.log(`\n[2/2] model ${HF_MODEL} -> models/${HF_MODEL}/`);

  const info = await fetchJson(`https://huggingface.co/api/models/${HF_MODEL}`);
  const files = (info.siblings || []).map((s) => s.rfilename);
  if (files.length === 0) throw new Error(`no siblings listed for ${HF_MODEL}`);

  const resolve = (rfilename) =>
    `https://huggingface.co/${HF_MODEL}/resolve/main/${rfilename}`;
  const dest = (rfilename) => join(MODEL_DIR, ...rfilename.split('/'));

  // Root config/tokenizer/spm: every root-level file that isn't under onnx/.
  const rootFiles = files.filter((f) => !f.includes('/'));
  for (const f of rootFiles) {
    if (/\.(json|spm|txt)$/.test(f)) await download(resolve(f), dest(f));
  }

  // ONNX subset — assert each wanted file exists so a repo rename fails loudly
  // at install rather than mysteriously at runtime.
  for (const f of WANT_ONNX) {
    if (!files.includes(f)) throw new Error(`expected model file missing from repo: ${f}`);
    await download(resolve(f), dest(f));
  }
}

try {
  console.log('sada fetch-assets — downloading library + model (once).');
  await fetchLibrary();
  await fetchModel();
  console.log(`\nDone. ${downloaded} downloaded, ${skipped} already present.`);
  console.log('Everything is now local; nothing else leaves the device at runtime.');
} catch (err) {
  console.error(`\nfetch-assets failed: ${err.message}`);
  process.exit(1);
}
