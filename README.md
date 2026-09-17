# MacroBrief

Tell it what you follow; it finds the sources, reads them, and sends you a brief on your schedule. A Macro brand.

- Product + architecture: [PLANNING.md](PLANNING.md) · Work log: [TASK.md](TASK.md)
- Stack: Next.js 16 (App Router) · Prisma · Postgres · NextAuth v5 · Claude (`claude-opus-5`) · Resend
- Deploy: Cloud Run via `./deploy.sh` (see `.claude/skills/gcp-deploy` in the workspace). LIVE on GCP `macrobrief1`: https://macrobrief-web-7puvvycxta-uc.a.run.app
- Brand: `brandbook/` — the mark, lockups, favicon and palette. `python3 brandbook/build.py` regenerates every SVG from constants; see `brandbook/BRANDBOOK.md`.

## Run locally

```bash
cp .env.example .env            # fill DATABASE_URL, AUTH_SECRET, CRON_SECRET; optionally ANTHROPIC_API_KEY + a sign-in provider
createdb macrobrief             # or point DATABASE_URL at any Postgres
npm install
npm run db:migrate              # prisma migrate dev
npm run dev                     # http://localhost:3000
npm run cron                    # what Cloud Scheduler does: ingest → compose → deliver → prune
```

Without a sign-in provider you can still exercise the whole pipeline for one topic:

```bash
npx tsx --env-file=.env scripts/pipeline.ts "Chilean lithium policy" en
```

It creates a smoke user (`smoke@macrobrief.local`, plan PRO), attaches sources, polls them, composes the due
brief (needs `ANTHROPIC_API_KEY`) and prints it. Email delivery reports `FAILED (email not configured)` until
`AUTH_RESEND_KEY` is set — by design, nothing pretends to be sent.

## Verify

```bash
npm test          # vitest — pure domain modules (feed parsing, discovery, ranking, plans, schedule, rendering)
npm run typecheck
npm run build
```

## How it works

1. **Topic** → two query feeds (Google News `when:7d`, Bing News past-week) attached at once, plus up to 8
   publisher feeds proposed by Claude and kept only if they fetch and parse (`src/lib/sources.ts`).
2. **Ingest** every 10 min: sources due (30 min interval) are fetched with a timeout; items upserted on
   `(sourceId, link)`; 20 consecutive failures disable a source (`src/lib/ingest.ts`).
3. **Compose**: per user, the due period (`src/lib/domain/schedule.ts`) → items per topic in the window →
   editorial ranking (`src/lib/domain/ranking.ts`) → one structured-output Claude call → `Brief` +
   `BriefSection` rows + a pending `Delivery` per enabled channel (`src/lib/briefs.ts`).
4. **Deliver**: audio first (ElevenLabs → private GCS, streamed by `/app/briefs/[id]/audio`), then email via
   Resend with a Listen link and signed click-tracking links (`/r/…`); WhatsApp / Instagram are recorded as
   `SKIPPED` until M3 (`src/lib/delivery/`).

5. **Billing**: Stripe subscriptions (`src/lib/stripe/`), plan derived from the subscription on every webhook,
   applied once via `WebhookEvent`. `npx tsx scripts/stripe-setup.ts` creates the products/prices.
6. **Landing**: a live news-budget sheet for three showcase topics the platform follows itself, plus a computed
   orthographic globe (`docs/art-direction.md`).

Plan rules live in exactly one place: `src/lib/domain/plans.ts`.
