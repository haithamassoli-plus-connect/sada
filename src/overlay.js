// src/overlay.js  (isolated world, ESM) — SADA subtitle overlay.
// Renders synced Arabic (optionally dual EN+AR) subtitles over the YouTube
// player, plus a small status pill. Styles live in overlay.css (.sada- prefix).
//
// Cue = { start:number(s), dur:number(s), text:string, ar?:string }

const STATE_LABELS = {
  loading: 'Loading…',
  translating: 'Translating on your device…',
  'no-captions': 'No captions for this video',
  error: 'Couldn’t load captions',
};

export class SubtitleOverlay {
  constructor(video) {
    this.video = video;
    // Anchor inside the player element so we survive fullscreen (the player is
    // the element that goes fullscreen, not the <video>). Fallback: the video's
    // own parent so we still render if YouTube's class ever changes.
    this.host = video.closest('.html5-video-player') || video.parentElement;

    this.root = document.createElement('div');
    this.root.className = 'sada-overlay';

    this.pill = document.createElement('div');
    this.pill.className = 'sada-pill';
    this.pill.hidden = true;

    this.cueBox = document.createElement('div');
    this.cueBox.className = 'sada-cuebox';

    this.enLine = document.createElement('div');
    this.enLine.className = 'sada-line sada-en';

    this.arLine = document.createElement('div');
    this.arLine.className = 'sada-line sada-ar';
    this.arLine.setAttribute('dir', 'rtl');
    this.arLine.lang = 'ar';

    this.cueBox.append(this.enLine, this.arLine);
    this.root.append(this.pill, this.cueBox);
    this.host.appendChild(this.root);

    this.cues = [];
    this._starts = [];        // parallel array of cue start times for binary search
    this._activeIdx = -1;     // index of the cue currently painted (-1 = none)
    this.showEnglish = false;
    this.visible = true;

    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
  }

  setCues(cues) {
    this.cues = Array.isArray(cues) ? cues : [];
    this._starts = this.cues.map((c) => c.start);
    this._activeIdx = -1;     // force a repaint on the next tick
    this.showState(null);     // real cues arrived: drop any status pill
  }

  setOptions({ fontSize, showEnglish, visible } = {}) {
    if (typeof fontSize === 'number') {
      this.root.style.setProperty('--sada-size', fontSize + 'px');
    }
    if (typeof showEnglish === 'boolean') {
      this.showEnglish = showEnglish;
      this.root.classList.toggle('sada-dual', showEnglish);
    }
    if (typeof visible === 'boolean') {
      this.visible = visible;
      this.root.classList.toggle('sada-hidden', !visible);
    }
    this._activeIdx = -1;     // re-render current cue with the new options
  }

  clear() {
    this.enLine.textContent = '';
    this.arLine.textContent = '';
    this.cueBox.classList.remove('sada-on');
    this._activeIdx = -1;
  }

  // 'loading' | 'translating' | 'no-captions' | 'error' — falsy hides the pill.
  showState(state, detail) {
    if (!state) {
      this.pill.hidden = true;
      this.pill.textContent = '';
      return;
    }
    this.pill.textContent = detail || STATE_LABELS[state] || state;
    this.pill.dataset.state = state;
    this.pill.hidden = false;
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this.root.remove();
    this.cues = [];
    this._starts = [];
  }

  // rightmost cue whose start <= t; -1 if none.
  _search(t) {
    const s = this._starts;
    let lo = 0, hi = s.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid] <= t) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return ans;
  }

  _tick() {
    this._raf = requestAnimationFrame(this._tick);
    if (!this.visible || this.cues.length === 0) return;

    const t = this.video.currentTime;
    let idx = this._search(t);
    // A cue is only active while t is within [start, start+dur).
    if (idx !== -1) {
      const c = this.cues[idx];
      if (t >= c.start + c.dur) idx = -1;
    }
    if (idx === this._activeIdx) return;   // touch the DOM only on cue change
    this._activeIdx = idx;

    if (idx === -1) {
      this.enLine.textContent = '';
      this.arLine.textContent = '';
      this.cueBox.classList.remove('sada-on');
      return;
    }
    const cue = this.cues[idx];
    this.arLine.textContent = cue.ar || '';
    this.enLine.textContent = this.showEnglish ? (cue.text || '') : '';
    this.cueBox.classList.add('sada-on');
  }
}
