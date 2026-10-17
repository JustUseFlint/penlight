# Hosting research (checked October 2026 against official docs and pricing pages)

Penlight's full server needs: a Node server, a writable SQLite file, Python (yt-dlp), and headless Chromium for PDF export.

| Host | Free without a card? | Disk | Idle behavior | RAM / CPU | Runs this app? | Verdict |
|---|---|---|---|---|---|---|
| **Render** free web service (Docker) | **Yes**, no payment method needed | Ephemeral (lost on restart, redeploy and spin-down; persistent disks are paid only) | Spins down after 15 min idle, about 1 min to wake; 750 free hours/month | 512 MB / 0.1 CPU | Yes, with low-memory PDF mode and snapshots to Postgres | **Chosen** |
| Hugging Face Spaces (Docker) | Free account **cannot create** Docker/Gradio Spaces on CPU Basic any more (PRO required); only Static Spaces stay free | Ephemeral (buckets for persistence) | Pauses after 48 h idle | 2 vCPU / 16 GB (paid plan only) | Would be ideal on paper, but no longer free | Not free |
| Koyeb | **No**: free Starter plan closed to new users since Feb 2026; card + $29 hold | 2 GB SSD | Free instance scales to zero after 1 h | 512 MB / 0.1 vCPU | n/a | Not free for new users |
| Fly.io | **No**: new orgs get only a 7-day / 2-hour trial, then a card | Volumes (paid) | n/a | n/a | n/a | Not free |
| Railway | Trial: $5 one-time credit for 30 days, no card; then Free plan with $1/month credit, capped at 1 vCPU / 0.5 GB; trial volumes deleted 30 days after credits end; unverified accounts get restricted outbound network | Volumes | No sleep, but credit runs out | up to 1 GB trial / 0.5 GB free | Technically, but credits run out within days or weeks | Not durable |
| Google Cloud Run | **No**: billing account with a card is required even for the free tier (2M requests, 180k vCPU-seconds/month) | Ephemeral | Scale to zero | configurable | Yes, but needs card and gcloud setup | Needs a card |
| Oracle Cloud Always Free VM | **No**: card required for identity verification; A1 now 2 OCPU / 12 GB total | Persistent | Always on | good | Best specs, but a full VM to administer | Needs a card |
| Vercel / Netlify | Yes | Read-only FS (+/tmp), no persistent SQLite | Serverless, max 300 s per function on Vercel Hobby | n/a | No: SQLite, yt-dlp, Chromium and long jobs do not fit serverless | Unsuitable |
| SnapDeploy, Back4App, Zeabur (small hosts) | Some are no-card | Ephemeral | Sleep / 60-minute run limits / 256 MB | 256 to 512 MB | Not enough memory or runtime for Chromium | Not recommended |

## Decision
**Render free + Docker + Postgres snapshots** is the only option I found that is both genuinely free without a card and able to run the
whole server. The two soft spots are memory (512 MB; mitigated by `PDF_LOW_MEMORY=1`, one PDF at a time, Chromium closed after each export,
and a print-view fallback) and persistence (mitigated by snapshotting SQLite to a free Neon/Supabase Postgres).

## YouTube from a datacenter IP
YouTube commonly shows "Sign in to confirm you're not a bot" to cloud/datacenter IPs. Expect that on Render too. Penlight reports it clearly and
always supports paste/upload of transcripts. Mitigations: `YTDLP_COOKIES_B64` (cookies from a throwaway account), or run Penlight on a
residential network. Datacenter proxies usually stay blocked.

## Hugging Face (if you have PRO)
Create a Docker Space, copy the repo into it, and put this front matter at the top of the Space's README.md:

```yaml
---
title: Penlight
sdk: docker
app_port: 7860
---
```
Set `PORT=7860`, `APP_SECRET` and (optionally) `PERSIST_DATABASE_URL` as Space secrets.

## Sources
Render free tier: render.com/docs/free, render.com/docs/disks · Hugging Face: huggingface.co/docs/hub/spaces-overview and /spaces-sdks-docker ·
Koyeb: koyeb.com/docs/faqs/pricing and the Feb 2026 announcement coverage · Fly.io: docs.fly.io/about/pricing · Railway: docs.railway.com/pricing/free-trial ·
Cloud Run: cloud.google.com/run/pricing, docs.cloud.google.com/free · Oracle: docs.oracle.com Always Free Resources · Neon: neon.com/docs/introduction/plans ·
Vercel: vercel.com/docs/functions.
