#!/usr/bin/env python3
"""
Penlight ingestion worker.

  ingest.py info        <url>                 -> video metadata (title, channel, thumbnail, duration)
  ingest.py transcript  <url>                 -> captions (manual first, then auto-generated)
  ingest.py transcribe  <url> [--model base]  -> download audio + local speech-to-text (faster-whisper)

stdout: one JSON document.  stderr: lines starting with "PROGRESS:" carry {"stage","pct","message"}.
On failure stdout is {"ok": false, "error_code": "...", "message": "..."} and exit code is 0
(callers should look at "ok"), so the Node side can show a friendly message.
"""
import json
import os
import re
import sys
import tempfile
import glob
import shutil
import subprocess

# yt-dlp and friends print progress to stdout. Keep the real stdout for our single JSON document only.
_REAL_STDOUT = sys.stdout
sys.stdout = sys.stderr

def progress(stage, pct, message=""):
    sys.stderr.write("PROGRESS:" + json.dumps({"stage": stage, "pct": pct, "message": message}) + "\n")
    sys.stderr.flush()

def out(obj):
    _REAL_STDOUT.write("\n" + json.dumps(obj) + "\n")
    _REAL_STDOUT.flush()

def fail(code, message):
    out({"ok": False, "error_code": code, "message": message})
    sys.exit(0)

YT_ID = re.compile(r"(?:v=|youtu\.be/|shorts/|embed/|live/|/v/)([A-Za-z0-9_-]{11})")

def youtube_id(url):
    m = YT_ID.search(url)
    if m:
        return m.group(1)
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", url.strip()):
        return url.strip()
    return None

def classify_error(msg):
    m = msg.lower()
    if "private video" in m or "sign in to confirm your age" in m or "age-restricted" in m or "age restricted" in m:
        return "restricted", "That video is private or age-restricted, so I can't read it. Try a public video, or paste the transcript."
    if "sign in to confirm you" in m or "not a bot" in m or "429" in m or "too many requests" in m or "blocking requests" in m or "ip" in m and "block" in m:
        return "blocked", "YouTube is blocking automated requests from this server's network. Paste the transcript instead, or upload a .txt/.srt/.vtt file."
    if "video unavailable" in m or "has been removed" in m or "is not available" in m or "does not exist" in m:
        return "unavailable", "That video is unavailable (removed, private, or region-locked)."
    if "unsupported url" in m:
        return "unsupported", "That link isn't a video page I can read. Try a YouTube, Vimeo, or direct video link."
    if "name or service not known" in m or "temporary failure" in m or "network is unreachable" in m or "timed out" in m or "connection" in m:
        return "network", "I couldn't reach that site from this server (network error)."
    return "failed", msg.strip().splitlines()[-1][:300] if msg.strip() else "Unknown error."

def ydl_opts(extra=None):
    o = {"quiet": True, "no_warnings": True, "noplaylist": True, "skip_download": True, "noprogress": True,
         "ignore_no_formats_error": True, "socket_timeout": 15, "retries": 1, "extractor_retries": 1, "playlist_items": "1"}
    if os.environ.get("YTDLP_PROXY"):
        o["proxy"] = os.environ["YTDLP_PROXY"]
    if os.environ.get("YTDLP_COOKIES"):
        o["cookiefile"] = os.environ["YTDLP_COOKIES"]
    if extra:
        o.update(extra)
    return o

# YouTube serves different "player clients" different bot-check rules. A datacenter IP is often refused by the default
# web client but still accepted by one of these, so we walk the list until one answers.
CLIENT_CHAIN = [None, "android_vr", "tv_embedded", "android", "ios", "mweb"]

def client_args(client):
    return {"extractor_args": {"youtube": {"player_client": [client]}}} if client else {}

def is_youtube(url):
    return bool(youtube_id(url)) or "youtube.com" in url or "youtu.be" in url

def get_info(url):
    import yt_dlp
    chain = CLIENT_CHAIN if is_youtube(url) else [None]
    last = None
    for client in chain:
        try:
            with yt_dlp.YoutubeDL(ydl_opts(client_args(client))) as ydl:
                info = ydl.extract_info(url, download=False)
            if info and info.get("_type") == "playlist" and info.get("entries"):
                info = next(e for e in info["entries"] if e)
            if info and info.get("title"):
                return info
        except Exception as e:  # noqa
            last = e
            if "private video" in str(e).lower() or "has been removed" in str(e).lower():
                break
    raise last or RuntimeError("Could not read that video")

def http_get(url, timeout=10, headers=None):
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")

def oembed_meta(vid):
    """Title/channel/thumbnail without touching the player (YouTube does not bot-check oEmbed)."""
    try:
        d = json.loads(http_get("https://www.youtube.com/oembed?format=json&url=" + "https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D" + vid, 8))
        return {"title": d.get("title") or "Untitled lecture", "channel": d.get("author_name"), "thumbnail": d.get("thumbnail_url"), "duration": None, "id": vid, "webpage_url": "https://www.youtube.com/watch?v=" + vid, "language": None}
    except Exception:
        return None

def meta_from_info(info):
    thumb = info.get("thumbnail")
    if not thumb and info.get("thumbnails"):
        thumb = info["thumbnails"][-1].get("url")
    return {
        "title": info.get("title") or "Untitled lecture",
        "channel": info.get("channel") or info.get("uploader") or info.get("uploader_id"),
        "thumbnail": thumb,
        "duration": info.get("duration"),
        "id": info.get("id"),
        "webpage_url": info.get("webpage_url") or info.get("original_url"),
        "language": info.get("language"),
    }

def clean_caption_text(t):
    t = re.sub(r"<[^>]+>", "", t)
    t = t.replace("&amp;", "&").replace("&gt;", ">").replace("&lt;", "<").replace("&#39;", "'").replace("&quot;", '"')
    return re.sub(r"\s+", " ", t).strip()

def parse_vtt(path):
    with open(path, encoding="utf-8", errors="ignore") as f:
        return parse_vtt_text(f.read())

def parse_vtt_text(content):
    segs = []
    ts = re.compile(r"(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*")
    blocks = re.split(r"\n\s*\n", content)
    last = ""
    for b in blocks:
        lines = b.strip().splitlines()
        for i, ln in enumerate(lines):
            m = ts.match(ln)
            if m:
                h = int(m.group(1) or 0)
                start = h * 3600 + int(m.group(2)) * 60 + int(m.group(3)) + int(m.group(4)) / 1000
                text = clean_caption_text(" ".join(lines[i + 1:]))
                if text and text != last:
                    segs.append({"start": round(start, 2), "text": text})
                    last = text
                break
    return segs

def dedupe_rolling(segs):
    """Auto-captions repeat the previous line as a rolling window; collapse that."""
    outp = []
    for s in segs:
        t = s["text"]
        if outp:
            prev = outp[-1]["text"]
            if t == prev or prev.endswith(t):
                continue
            if t.startswith(prev):
                outp[-1] = {"start": outp[-1]["start"], "text": t}
                continue
        outp.append(s)
    return outp

def captions_via_api(vid):
    from youtube_transcript_api import YouTubeTranscriptApi
    api = YouTubeTranscriptApi()
    tl = api.list(vid)
    chosen, kind = None, None
    langs = ["en", "en-US", "en-GB"]
    try:
        chosen, kind = tl.find_manually_created_transcript(langs), "captions-manual"
    except Exception:
        try:
            chosen, kind = tl.find_generated_transcript(langs), "captions-auto"
        except Exception:
            # any language as a last resort: translate to English if possible
            for t in tl:
                try:
                    chosen = t.translate("en") if t.is_translatable and t.language_code[:2] != "en" else t
                    kind = "captions-manual" if not t.is_generated else "captions-auto"
                    break
                except Exception:
                    continue
    if not chosen:
        return None
    fetched = chosen.fetch()
    segs = [{"start": round(s.start, 2), "text": clean_caption_text(s.text)} for s in fetched.snippets if clean_caption_text(s.text)]
    return {"segments": segs, "source": kind, "language": chosen.language_code}

def captions_via_ytdlp(url):
    import yt_dlp
    tmp = tempfile.mkdtemp(prefix="pl_subs_")
    chain = CLIENT_CHAIN if is_youtube(url) else [None]
    try:
        for client in chain:
            for manual in (True, False):
                for f in glob.glob(os.path.join(tmp, "*")):
                    os.remove(f)
                opts = ydl_opts({
                    "writesubtitles": manual, "writeautomaticsub": not manual,
                    "subtitleslangs": ["en.*", "en"], "subtitlesformat": "vtt",
                    "outtmpl": os.path.join(tmp, "s.%(ext)s"),
                    **client_args(client),
                })
                try:
                    with yt_dlp.YoutubeDL(opts) as ydl:
                        ydl.extract_info(url, download=True)
                except Exception:
                    break  # this client is refused: go to the next one
                files = glob.glob(os.path.join(tmp, "*.vtt"))
                if files:
                    segs = parse_vtt(files[0])
                    if not manual:
                        segs = dedupe_rolling(segs)
                    if segs:
                        return {"segments": segs, "source": "captions-manual" if manual else "captions-auto", "language": "en", "via": "yt-dlp:" + (client or "default")}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return None

# Public Invidious / Piped mirrors fetch captions from their own IPs. Free but flaky, so this is a last server-side resort.
STATIC_INVIDIOUS = ["https://invidious.f5.si", "https://inv.nadeko.net", "https://yewtu.be", "https://invidious.nerdvpn.de"]
STATIC_PIPED = ["https://api.piped.private.coffee", "https://pipedapi.kavin.rocks", "https://pipedapi.adminforge.de", "https://pipedapi.leptons.xyz"]

def invidious_hosts():
    hosts = []
    try:
        for _, i in json.loads(http_get("https://api.invidious.io/instances.json?sort_by=health", 6)):
            if i.get("type") == "https" and i.get("api"):
                hosts.append(i["uri"].rstrip("/"))
    except Exception:
        pass
    return (hosts + [h for h in STATIC_INVIDIOUS if h not in hosts])[:6]

def captions_via_mirrors(vid):
    import time
    deadline = time.time() + 22  # flaky by nature: never let the fallbacks stall the job
    for host in STATIC_PIPED:
        if time.time() > deadline:
            return None
        try:
            d = json.loads(http_get(host + "/streams/" + vid, 6))
            subs = [x for x in (d.get("subtitles") or []) if (x.get("code") or "")[:2] == "en"]
            subs.sort(key=lambda x: bool(x.get("autoGenerated")))
            for sub in subs[:1]:
                segs = parse_vtt_text(http_get(sub["url"], 8))
                if sub.get("autoGenerated"):
                    segs = dedupe_rolling(segs)
                if len(segs) > 5:
                    return {"segments": segs, "source": "captions-auto" if sub.get("autoGenerated") else "captions-manual", "language": "en", "via": "piped", "title": d.get("title"), "channel": d.get("uploader"), "duration": d.get("duration")}
        except Exception:
            continue
    for host in invidious_hosts():
        if time.time() > deadline:
            return None
        try:
            d = json.loads(http_get(host + "/api/v1/captions/" + vid, 6))
            caps = [c for c in d.get("captions", []) if c.get("languageCode", "")[:2] == "en"]
            caps.sort(key=lambda c: "auto" in c.get("label", "").lower())
            for c in caps[:1]:
                segs = parse_vtt_text(http_get(host + c["url"], 8))
                if "auto" in c.get("label", "").lower():
                    segs = dedupe_rolling(segs)
                if len(segs) > 5:
                    return {"segments": segs, "source": "captions-auto" if "auto" in c.get("label", "").lower() else "captions-manual", "language": "en", "via": "invidious"}
        except Exception:
            continue
    return None

def cmd_info(url):
    try:
        info = get_info(url)
    except Exception as e:  # noqa
        code, msg = classify_error(str(e))
        fail(code, msg)
    out({"ok": True, "meta": meta_from_info(info)})

def cmd_transcript(url):
    if os.environ.get("PENLIGHT_SIMULATE_YT_BLOCK") == "1":  # test hook: behave like a host YouTube has blocked
        fail("blocked", "YouTube is blocking this server's network, so I couldn't read the captions automatically. Use the 30-second workaround below: it uses your own browser, which YouTube trusts.")
    progress("fetching", 0.1, "Reading video details")
    meta, meta_err = None, None
    vid = youtube_id(url)
    try:
        meta = meta_from_info(get_info(url))
    except Exception as e:  # noqa
        meta_err = classify_error(str(e))
        if vid:
            meta = oembed_meta(vid)  # still lets the captions fallbacks run
    result, last_err = None, (meta_err[1] if meta_err else None)
    tried = []
    progress("fetching", 0.4, "Looking for captions")
    if vid:
        try:
            result = captions_via_api(vid); tried.append("transcript-api")
            if result: result["via"] = "transcript-api"
        except Exception as e:  # noqa
            last_err = str(e)
    if not result and (meta is not None or not vid):
        try:
            result = captions_via_ytdlp(url); tried.append("yt-dlp")
        except Exception as e:  # noqa
            last_err = last_err or str(e)
    if not result and vid:
        progress("fetching", 0.6, "Trying backup caption sources")
        try:
            result = captions_via_mirrors(vid); tried.append("mirrors")
        except Exception as e:  # noqa
            last_err = last_err or str(e)
        if result:
            meta = meta or {"title": result.get("title") or "Untitled lecture", "channel": result.get("channel"), "thumbnail": "https://i.ytimg.com/vi/%s/hqdefault.jpg" % vid, "duration": result.get("duration"), "id": vid, "webpage_url": "https://www.youtube.com/watch?v=" + vid, "language": None}
    if not result:
        if vid and (meta_err and meta_err[0] in ("blocked", "failed", "network") or (last_err and classify_error(last_err)[0] == "blocked")):
            fail("blocked", "YouTube is blocking this server's network, so I couldn't read the captions automatically. Use the 30-second workaround below: it uses your own browser, which YouTube trusts.")
        if meta_err and meta is None:
            fail(meta_err[0], meta_err[1])
        if last_err:
            code, msg = classify_error(last_err)
            if code in ("blocked", "restricted", "unavailable"):
                fail(code, msg)
        fail("no_captions", "This video doesn't have captions I can read.")
    progress("fetching", 0.95, "Got captions via " + result.get("via", "?"))
    result.pop("title", None); result.pop("channel", None)
    out({"ok": True, "meta": meta, **result})

def cmd_transcribe(url, model_name):
    try:
        import yt_dlp
    except Exception:
        fail("no_ytdlp", "yt-dlp isn't installed. Run `npm run setup:python`.")
    try:
        from faster_whisper import WhisperModel
    except Exception:
        fail("whisper_unavailable", "Local speech-to-text (faster-whisper) isn't installed. Paste the transcript instead, or run `npm run setup:python`.")
    tmp = tempfile.mkdtemp(prefix="pl_audio_")
    try:
        progress("transcribing", 0.05, "Downloading audio")
        opts = ydl_opts({
            "skip_download": False, "format": "bestaudio/best", "noprogress": True,
            "outtmpl": os.path.join(tmp, "audio.%(ext)s"),
            "match_filter": yt_dlp.utils.match_filter_func("duration < 5400"),
        })
        try:
            import contextlib
            with contextlib.redirect_stdout(sys.stderr), yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
        except Exception as e:  # noqa
            code, msg = classify_error(str(e))
            fail(code, msg)
        if info.get("_type") == "playlist":
            info = next(e for e in info["entries"] if e)
        files = [f for f in glob.glob(os.path.join(tmp, "audio.*")) if not f.endswith(".part")]
        if not files:
            fail("too_long", "That video is longer than 90 minutes, so I skipped audio transcription. Paste a transcript instead.")
        wav = os.path.join(tmp, "audio16k.wav")
        progress("transcribing", 0.15, "Preparing audio")
        subprocess.run(["ffmpeg", "-y", "-i", files[0], "-ac", "1", "-ar", "16000", wav], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        progress("transcribing", 0.2, f"Loading speech model ({model_name})")
        try:
            model = WhisperModel(model_name, device="cpu", compute_type="int8")
        except Exception as e:  # noqa
            fail("whisper_unavailable", f"Couldn't load the speech model ({model_name}): {str(e)[:160]}. Paste the transcript instead.")
        import wave
        import numpy as np
        with wave.open(wav, 'rb') as wf:
            audio = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
        segments, tinfo = model.transcribe(audio, vad_filter=True, beam_size=1, language="en" if os.environ.get("WHISPER_LANG", "en") == "en" else None)
        dur = max(float(info.get("duration") or tinfo.duration or 1), 1)
        segs = []
        for s in segments:
            t = s.text.strip()
            if t:
                segs.append({"start": round(s.start, 2), "text": t})
            progress("transcribing", min(0.95, 0.25 + 0.7 * (s.end / dur)), "Transcribing audio")
        out({"ok": True, "meta": meta_from_info(info), "segments": segs, "source": "whisper", "language": tinfo.language})
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

def main():
    if len(sys.argv) < 3 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        return
    cmd, url = sys.argv[1], sys.argv[2]
    model = "base"
    if "--model" in sys.argv:
        model = sys.argv[sys.argv.index("--model") + 1]
    try:
        if cmd == "info":
            cmd_info(url)
        elif cmd == "transcript":
            cmd_transcript(url)
        elif cmd == "transcribe":
            cmd_transcribe(url, model)
        else:
            fail("bad_command", "Unknown command")
    except SystemExit:
        raise
    except Exception as e:  # noqa
        code, msg = classify_error(str(e))
        fail(code, msg)

if __name__ == "__main__":
    main()
