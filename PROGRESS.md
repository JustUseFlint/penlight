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
