// src/reassemble.js  (ESM) — turn fragment caption cues into whole sentences for the
// translator, then redistribute each sentence's Arabic back across its source cues so the
// overlay stays time-synced. Deterministic (no randomness, no clock) — same input, same output.
//
// Cue = { start:number(s), dur:number(s), text:string, ar?:string }

// Sentence-ending marks: Latin . ! ? plus Arabic question mark ؟ and the ellipsis …
const SENTENCE_END = /[.!?؟…]["'”’)\]]*$/;

// Join fragment cues into sentences, recording which cue indices compose each sentence.
// Every cue is assigned to exactly one sentence (trailing text with no terminator flushes
// as its own sentence), so splitToCues can cover every cue.
export function toSentences(cues) {
  const sentences = [];
  let buf = [];        // pending cue texts
  let idx = [];        // pending cue indices

  const flush = () => {
    if (idx.length === 0) return;
    sentences.push({ text: buf.join(' ').replace(/\s+/g, ' ').trim(), cueIdx: idx });
    buf = [];
    idx = [];
  };

  for (let i = 0; i < cues.length; i++) {
    const t = (cues[i].text || '').trim();
    buf.push(t);
    idx.push(i);
    if (SENTENCE_END.test(t)) flush();
  }
  flush(); // trailing fragment without a terminator

  return sentences;
}

// Split a translation string into `weights.length` pieces at word boundaries, each piece
// sized proportional to its weight. Deterministic; every word is used exactly once and the
// cut points are monotonic (sane boundaries).
function distribute(translation, weights) {
  const n = weights.length;
  const words = (translation || '').split(/\s+/).filter(Boolean);
  if (n === 1) return [words.join(' ')];

  const total = weights.reduce((a, b) => a + b, 0) || n;
  const parts = [];
  let used = 0;
  let cum = 0;
  for (let i = 0; i < n; i++) {
    cum += weights[i];
    let end = i === n - 1 ? words.length : Math.round((cum / total) * words.length);
    if (end < used) end = used;          // never go backwards
    if (end > words.length) end = words.length;
    parts.push(words.slice(used, end).join(' '));
    used = end;
  }
  return parts;
}

// Write cue.ar for every cue by distributing each sentence's Arabic across its cues,
// proportional to each cue's source-text length. Mutates cues in place. Deterministic.
export function splitToCues(cues, sentences, translations) {
  // Default every cue to '' so cue.ar is always a string, even if a sentence is missing.
  for (const c of cues) if (typeof c.ar !== 'string') c.ar = '';

  for (let s = 0; s < sentences.length; s++) {
    const { cueIdx } = sentences[s];
    const tr = translations[s] ?? '';
    const weights = cueIdx.map((ci) => Math.max(1, (cues[ci].text || '').length));
    const parts = distribute(tr, weights);
    cueIdx.forEach((ci, k) => {
      cues[ci].ar = parts[k] ?? '';
    });
  }
}

// --- runnable assert self-check: `node src/reassemble.js` -------------------------------
// Proves cue.ar is populated for every cue and that boundaries are sane. Guarded so it
// NEVER runs when the extension imports this module (no node builtins imported at top level).
function selfCheck() {
  const assert = (cond, msg) => { if (!cond) throw new Error('reassemble selfCheck FAILED: ' + msg); };

  const cues = [
    { start: 0.0, dur: 1.0, text: 'The quick brown fox' },
    { start: 1.0, dur: 1.0, text: 'jumps over the lazy dog.' },
    { start: 2.0, dur: 1.0, text: 'How are you' },
    { start: 3.0, dur: 1.0, text: 'doing today?' },
    { start: 4.0, dur: 1.0, text: 'Trailing fragment with no period' },
  ];

  const sentences = toSentences(cues);
  // 3 sentences: [0,1] ., [2,3] ?, [4] trailing flush.
  assert(sentences.length === 3, 'expected 3 sentences, got ' + sentences.length);
  const covered = sentences.flatMap((s) => s.cueIdx).sort((a, b) => a - b);
  assert(JSON.stringify(covered) === JSON.stringify([0, 1, 2, 3, 4]), 'every cue must belong to exactly one sentence');

  // Fake Arabic translations (word counts chosen to exercise proportional split).
  const translations = [
    'الثعلب البني السريع يقفز فوق الكلب الكسول',   // 8 words across cues 0,1
    'كيف حالك اليوم',                             // 3 words across cues 2,3
    'جزء متبقٍ بدون نقطة',                         // 4 words in cue 4
  ];

  splitToCues(cues, sentences, translations);

  // 1) cue.ar populated (a string) for EVERY cue.
  for (let i = 0; i < cues.length; i++) {
    assert(typeof cues[i].ar === 'string', `cue ${i}.ar must be a string`);
  }
  // 2) No words lost: rejoining each sentence's cue pieces reproduces the translation.
  for (let s = 0; s < sentences.length; s++) {
    const rejoined = sentences[s].cueIdx.map((ci) => cues[ci].ar).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const expected = translations[s].replace(/\s+/g, ' ').trim();
    assert(rejoined === expected, `sentence ${s} boundaries lost/duplicated words:\n  got:  ${rejoined}\n  want: ${expected}`);
  }
  // 3) Cue start times are non-decreasing (time-sync sanity).
  for (let i = 1; i < cues.length; i++) {
    assert(cues[i].start >= cues[i - 1].start, `cue ${i} start out of order`);
  }
  // 4) Single-cue sentence keeps its whole translation.
  assert(cues[4].ar === translations[2], 'single-cue sentence must keep the full translation');

  return true;
}

// Run the self-check only when executed directly under Node (never inside the extension).
if (typeof process !== 'undefined' && process.versions?.node && import.meta.url === 'file://' + process.argv[1]) {
  selfCheck();
  console.log('reassemble selfCheck OK — cue.ar populated for every cue; boundaries sane.');
}
