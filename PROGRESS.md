# Penlight build progress
- [x] Content: 319 questions, 361 cards, 90 lessons, 8 programs, 3 samples (all 1,500+ words)
- [x] Libs, API routes, UI pages; production build green
- [x] Server on :3100
- [x] Sample ingest; YouTube real URLs tested (this box IP is bot-blocked; YTDLP_COOKIES supported); whisper fallback tested (archive.org)
- [x] vitest (58) + mock LLM; API e2e 70/70 (docs/e2e-api-results.txt)
- [x] Playwright UI e2e 60/60 incl. axe contrast, all 4 games, accounts, SRS, programs (docs/e2e-ui-results.txt)
- [x] Medical accuracy review pass (docs/medical-review.md)
- [x] Screenshots desktop + mobile -> docs/screenshots (scripts/capture-all.mjs, capture-extra.mjs)
- [x] README + Dockerfile (Dockerfile not built: no docker on this box)
- [x] Self-critique (docs/SELF-CRITIQUE.md)
- [x] Final report (server left running on :3100, clean DB)

## Hosting (full server edition)
- [x] Static/GitHub-Pages edition dropped (not published)
- [x] Host research (Oct 2026) -> docs/DEPLOY.md; chosen: Render free (Docker), no card
- [x] /api/health, APP_SECRET env, scripts/start.mjs (Postgres snapshot persistence), low-memory PDF + print fallback
- [x] Dockerfile steps simulated on a clean clone (npm ci, playwright shell, worker setup, build, prune, start on :10000): health, ingest, 9-page PDF, YouTube-blocked message, snapshot restore all OK
- [x] Public GitHub repo: https://github.com/JustUseFlint/penlight
- [ ] Brian: click Deploy to Render, paste a free Neon/Supabase postgres:// URL as PERSIST_DATABASE_URL

## Session notes (practice fix + YouTube)
- Pushed 56cb019: practice fix (phone quick-start bar, overflow fix, retry on wake-up, e2e-practice.mjs). Local: api 70/70, ui 60/60.
- Root cause found: on phones the Start button sat below ~22 topic tiles (tap did nothing visible) and /practice grew sideways after finished tests (long titles). API/desktop worked on live.
- YouTube (uncommitted until verified): worker/ingest.py stdout isolation (yt-dlp progress broke JSON => "failed unexpectedly"), client chain, oEmbed, mirrors; bookmarklet src/lib/ytlet.ts, /import, /new-from-youtube, YouTubeHelper; scripts/e2e-youtube.mjs 12/12 local.
- TODO: verify live practice after deploy; commit+push YouTube; verify live YouTube ingest.
