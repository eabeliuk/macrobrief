# TASK

## M1 — core loop (in progress, 2026-09-17)
- [x] Planning + scaffold (Next 16, Prisma, NextAuth, Tailwind, vitest, deploy files)
- [x] Domain: feed parser, discovery, ranking, plans, schedule, brief rendering (tested)
- [x] Prisma schema + initial migration
- [x] Sources: discover + verify + persist; Claude proposes publisher feeds
- [x] Ingest cron
- [x] Compose brief (Claude structured output) + email/web delivery
- [x] UI: landing, login, dashboard (topics, sources, briefs, delivery settings)
- [ ] Run locally end-to-end against a real topic (needs ANTHROPIC_API_KEY + a sign-in provider)

## M2 — money + audio
- [ ] Stripe checkout + webhook → `User.plan` (4 prices); billing page
- [ ] Enforce plan limits in UI (topic count, channel toggles) — rules already in `plans.ts`
- [ ] Audio brief: TTS (minimax/ElevenLabs as in macroscene) → GCS → signed link; `Brief.audioUrl`

## M3 — channels
- [ ] WhatsApp via Twilio (template message; reuse superMila sender + compliance)
- [ ] Instagram DM bot (Max tier; user-initiated 24 h window)
- [ ] Open/click tracking on email links (ranking signal)

## M4 — ship
- [ ] `./deploy.sh --setup`, Cloud SQL, secrets, Scheduler, domain macrobrief.com
- [ ] `/art-direction` pass on landing page
- [ ] sitemap + robots; add row to `.claude/skills/gcp-deploy/SKILL.md` table

## Discovered during work
- Instagram cannot be a push channel (24 h window rule) — modelled as "DM the bot".
- Google News RSS item links are redirect URLs; publisher comes from `<source>`; treat the
  redirect URL as the item key (stable per story).
