# TASK

## M1 — core loop (in progress, 2026-09-17)
- [x] Planning + scaffold (Next 16, Prisma, NextAuth, Tailwind, vitest, deploy files)
- [x] Domain: feed parser, discovery, ranking, plans, schedule, brief rendering (tested)
- [x] Prisma schema + initial migration
- [x] Sources: discover + verify + persist; Claude proposes publisher feeds
- [x] Ingest cron
- [x] Compose brief (Claude structured output) + email/web delivery
- [x] UI: landing, login, dashboard (topics, sources, briefs, delivery settings)
- [x] Live-verified: query feeds (23/23 fresh items), RSS autodiscovery, poll/prune, cron auth, build
- [x] Live-verified the model path locally (2 runs): suggestions verified-by-fetch, one-call composition; RSS items now gated on query terms after run 1 padded with off-topic stories
- [x] Private beta: `ALLOWED_EMAILS` allowlist (eabeliuk@gmail.com) — unset to open
- [ ] Sign in with a real provider (Google or Resend) and walk the dashboard

## M2 — money + audio
- [x] Stripe checkout + webhook → `User.plan` (3 paid prices); billing page; `scripts/stripe-setup.ts`; idempotent WebhookEvent
- [ ] Wire Stripe live: run stripe-setup with the key, fill the 5 `macrobrief-stripe-*` secrets, add the webhook endpoint in Stripe, redeploy
- [x] Enforce plan limits in UI (topic count, cadence, channel toggles)
- [x] Audio brief: ElevenLabs (`eleven_multilingual_v2`) → private GCS `macrobrief1-audio` → streamed via `/app/briefs/[id]/audio` (owner-only); player in app + "Listen" link in email
- [ ] Wire audio live: fill `macrobrief-elevenlabs-key` (+ optional `-voice`), redeploy

## M3 — channels
- [x] WhatsApp via Twilio: short digest + link; template (`TWILIO_WA_TEMPLATE_SID`) for outside Meta's 24 h window, free-form otherwise; E.164 enforced (no country-code guessing)
- [ ] Wire WhatsApp live: `macrobrief-twilio-sid/-token/-whatsapp-from` (+ approved template SID), redeploy
- [ ] Instagram DM bot (Max tier; user-initiated 24 h window)
- [x] Click tracking: signed `/r/<deliveryId>?to&sig` redirect (HMAC with AUTH_SECRET, no open redirect) → `Click` rows + `Delivery.openedAt`
- [x] Clicks → ranking: per-reader publisher affinity (90 d, ≥3 clicks) lifts a tier-3 outlet to strong-tier-2 at most; never global

## M4 — ship
- [x] Deployed 2026-09-17 to GCP `macrobrief1`: https://macrobrief-web-7puvvycxta-uc.a.run.app (Cloud SQL macrobrief-db, Scheduler every 10 min)
- [ ] Fill optional secrets: `macrobrief-anthropic-key` (briefs + feed suggestions), `macrobrief-google-id/secret` or `macrobrief-resend-key` (sign-in), then `./deploy.sh`
- [ ] Domain: `gcloud domains verify macrobrief.com` → `./deploy.sh --map-domain` → GoDaddy DNS
- [x] `/art-direction` pass on landing page — news-budget sheet + computed globe (docs/art-direction.md)
- [x] Showcase topics (system user) feed the live sheet; seeded by the cron
- [ ] sitemap + robots; add row to `.claude/skills/gcp-deploy/SKILL.md` table

## Discovered during work
- Bare Google/Bing news queries return relevance-ranked, years-old stories (70/73 >30d); fixed with `when:7d` / `interval="8"`.
- Instagram cannot be a push channel (24 h window rule) — modelled as "DM the bot".
- Google News RSS item links are redirect URLs; publisher comes from `<source>`; treat the
  redirect URL as the item key (stable per story).
