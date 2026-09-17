# MacroBrief — Planning

**One line:** you tell MacroBrief what you care about; it finds the sources, reads them so you don't have to, and sends you a brief on your schedule, on the channel you actually read.

Domain: macrobrief.com · Repo: github.com/eabeliuk/macrobrief · GCP project: `macrobrief` (to be created)

## Product

A user creates **topics** ("Chilean lithium policy", "Rust async ecosystem", "NBA trade rumours").
For each topic the platform **discovers sources** — Google News / Bing News query feeds for
coverage of anything, plus publisher RSS/Atom feeds that Claude proposes and we *verify by
fetching* before keeping. Sources are **shared across users** (a feed is polled once no matter
how many people follow it). A cron **ingests** items, a second cron **composes a brief** per
user per period (one brief, one section per topic), and **delivers** it on each channel the user
enabled.

### Plans (proposal — adjust in `src/lib/domain/plans.ts`, it is the single source of truth)

| | Free | Starter $5/mo | Pro $12/mo | Max $29/mo |
|---|---|---|---|---|
| Topics | 1 | 3 | 10 | 30 |
| Cadence | weekly | daily | daily | up to 2×/day |
| Stories per topic | 3 | 5 | 8 | 12 |
| Web + email | ✓ | ✓ | ✓ | ✓ |
| Plain-text (copy / SMS-ready) | – | ✓ | ✓ | ✓ |
| Audio brief | – | – | ✓ | ✓ |
| WhatsApp | – | – | ✓ | ✓ |
| Instagram DM | – | – | – | ✓ |
| Paid/premium sources | – | – | – | ✓ |

Rationale: the marginal cost per user is (feeds polled — shared) + (one Claude call per brief) +
(TTS seconds for audio) + (Twilio per WhatsApp message ≈ $0.005–0.08). Audio and WhatsApp are
the real cost lines, so they start at Pro. Instagram is gated to Max because Meta's messaging
API only lets a business message a user inside a 24-hour window after the user writes first —
it is "DM the bot for your brief", not push, and needs an IG business account we run.

### Model-proof check (CLAUDE.md principle 5)
Summarisation is not the moat — any model does it. What survives a 2× model: the **verified
source graph** (which feeds are alive and good for which topic, learned from every user),
the **delivery integrations** (WhatsApp/IG business accounts, verified sender domains, TTS
pipeline), and **reading behaviour** (which stories people open — a ranking signal no
newcomer has). Build so those accrue: sources are global rows with health stats, deliveries
and opens are logged from day one.

## Architecture

Next.js 16 (App Router) + Prisma + Postgres, one Cloud Run service, Cloud Scheduler hitting
`GET /api/cron` every 10 minutes with a bearer secret. Same shape as `ligarium` /
`macroaccount`; deploy via `./deploy.sh` (see `.claude/skills/gcp-deploy`).

```
src/
  auth.ts                 NextAuth v5 (Google + Resend magic link), DB sessions
  lib/
    domain/               PURE, unit-tested, no I/O
      feed.ts             RSS/Atom XML → normalised entries (port of mktops rss_client.py)
      discovery.ts        topic → candidate feed URLs (Google/Bing query feeds, HTML autodiscovery)
      ranking.ts          dedupe + tier × mentions score + temporal spread (port of roiver news_ranking.py)
      plans.ts            tier limits — the ONLY place plan rules live
      schedule.ts         "is this user's brief due now?" + period key (idempotency)
      brief.ts            render a composed brief to plain text / markdown / email
    prisma.ts, session.ts, anthropic.ts, mailer.ts
    sources.ts            discover → verify (fetch+parse) → persist; Claude proposes publisher feeds
    ingest.ts             poll due sources, upsert items, prune
    briefs.ts             gather window → rank → Claude composes (structured output) → persist → deliver
    delivery/             email.ts (Resend), text.ts (stored, shown in app) … whatsapp/audio/ig later
  app/
    page.tsx              landing
    login/                sign in
    app/                  dashboard: topics, sources, briefs, delivery settings
    api/cron/route.ts     ingest + compose + deliver (all idempotent)
    api/auth/[...nextauth]
prisma/schema.prisma
tests/                    vitest, mirrors src/lib/domain
```

### Data model (why it is shaped this way)
- `Source` is **global** (`url` unique) with `TopicSource` joining topics to it. Polling cost is
  per feed, not per follower, and feed health (`failCount`, `lastError`) is learned once.
- `Item` is unique on `(sourceId, link)`; the same story from two feeds is two items — the
  *ranking* collapses them, not the storage. Items are pruned after 30 days.
- `Brief` is unique on `(userId, periodKey)`. The cron can run every minute and never double-send.
- `Delivery` is one row per (brief, channel) with status — the audit trail and the retry queue.
- `DeliveryChannel` holds the address per channel (email, E.164 phone, IG handle) + verified flag.
- Plan lives on `User.plan`; Stripe ids are on the user so the webhook (M3) only flips `plan`.

### Cron contract (`/api/cron`, every 10 min)
1. **ingest**: sources with `lastPolledAt` older than `POLL_INTERVAL_MIN`, capped per run,
   fetched with a 10 s timeout, each failure isolated, `failCount` incremented (a source with
   ≥ 20 consecutive failures is disabled).
2. **compose**: users whose schedule says a brief is due for `periodKey(now, cadence, tz)` and
   who have no `Brief` for it → gather items in window per topic → rank → one Claude call →
   persist.
3. **deliver**: `Delivery` rows in `pending` → send on channel → `sent`/`failed`.

### Source discovery (M1)
- Always: Google News RSS search feed + Bing News RSS for the topic query. They cover any topic
  for free and return the publisher name per item.
- Claude proposes up to 8 publisher feed URLs for the topic; each is fetched and must parse to
  ≥ 1 entry or it is dropped (models invent plausible feed URLs). If a proposed URL is an HTML
  page, RSS autodiscovery (`<link rel="alternate" type="application/rss+xml">`) is tried.
- Later: Reddit search RSS, YouTube channel feeds, GDELT (free), NewsAPI/Perigon (paid, Max tier).

## Milestones
- **M1 (this pass)** — sign-in, topics, auto sources, ingest, Claude brief, web + email delivery,
  cron, tests, local run. No deploy.
- **M2** — Stripe (4 plans), plan enforcement in UI, audio briefs (TTS → GCS → link in email/app).
- **M3** — WhatsApp via Twilio (reuse superMila's sender), Instagram DM bot (Max), open tracking.
- **M4** — GCP project + deploy, domain, Scheduler, art-direction pass on landing, sitemap.

## Reuse map
| Need | Borrowed from |
|---|---|
| Feed normalisation, image extraction, validate-by-fetch | `mktops/backend/app/services/rss_client.py` |
| Poll/upsert/prune loop | `mktops/backend/app/tasks/content_poller.py` |
| Claude-suggested feeds, validated concurrently | `mktops/backend/app/routers/content_sources.py` (`/suggest`) |
| Editorial ranking (dedupe, tiers, temporal spread) | `roiver/backend/src/compounder/jobs/news_ranking.py` |
| Gather → compose digest with Claude | `roiver/backend/src/compounder/insights/digest.py` |
| Resend mailer, cron auth, deploy shape | `ligarium` |
| WhatsApp (Twilio), TTS | `superMila`, `macroscene` (M2/M3) |
