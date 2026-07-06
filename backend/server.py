"""sada caption backend — fetch YouTube transcripts locally, bypassing pot-gating.

The sada extension can't fetch captions on some videos: YouTube gates the in-page
timedtext endpoint behind a proof-of-origin (pot) token and answers with an empty
200. This tiny local backend fetches the same captions with youtube-transcript-api
from your own machine/IP — where that gating doesn't apply — and returns them as
timed cues. The extension then translates them 100% on-device. Nothing but the
videoId leaves your machine, and only to this localhost process.

Run:
    pip install -r requirements.txt
    python server.py                # -> http://127.0.0.1:8787  (set SADA_PORT to change)

If you change the port, update SADA_BACKEND in src/sw.js to match.

Endpoints:
    GET /                            liveness probe
    GET /cues?v=VIDEOID[&lang=en]    -> {"cues":[{"start","dur","text"}], "reason":"ok"}
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from youtube_transcript_api import (
    YouTubeTranscriptApi,
    TranscriptsDisabled,
    NoTranscriptFound,
)

app = FastAPI(title="sada caption backend")
# Permissive CORS so a curl/browser check works too. The extension actually calls
# through its service worker (host_permissions grant it), which needs no CORS.
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

ytt = YouTubeTranscriptApi()

# ponytail: unbounded in-process cache of successful fetches only. YouTube rate-limits
# repeat hits (even residential IPs), and the extension re-inits on every SPA nav /
# replay — so cache per (video, lang). Fine for a single-user local backend; make it
# an LRU if it ever grows unbounded in practice.
_cache = {}


@app.get("/")
def root():
    return {"ok": True, "service": "sada caption backend", "cached_videos": len(_cache)}


@app.get("/cues")
def cues(v: str, lang: str = "en"):
    key = (v, lang)
    if key in _cache:
        return {"cues": _cache[key], "reason": "ok", "cached": True}

    try:
        # fetch() = list -> find_transcript (manual preferred over auto) -> fetch.
        fetched = ytt.fetch(v, languages=[lang])
    except (TranscriptsDisabled, NoTranscriptFound):
        return {"cues": [], "reason": "no-captions"}
    except Exception as e:
        # RequestBlocked / IpBlocked / PoTokenRequired / VideoUnavailable / network...
        # Surface the class name so you can tell rate-limiting/gating apart from a
        # genuinely missing transcript; the extension shows the same quiet pill either way.
        return {"cues": [], "reason": "error", "detail": type(e).__name__}

    out = [
        {"start": s.start, "dur": s.duration, "text": " ".join(s.text.split())}
        for s in fetched
        if s.text.strip()
    ]
    _cache[key] = out
    return {"cues": out, "reason": "ok" if out else "no-captions"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("SADA_PORT", "8787")))
