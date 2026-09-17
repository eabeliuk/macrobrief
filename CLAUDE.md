# MacroBrief — agent notes

Read `PLANNING.md` first, then `TASK.md`. Workspace rules in `../../.claude/CLAUDE.md` apply.

## Invariants (do not break)
- `Source.url` is global and unique; attaching = a `TopicSource` join row. Never store per-user copies of a feed.
- `Brief` is unique on `(userId, periodKey)`; `periodKey` comes from `duePeriod()` only.
- Nothing is stored as a source unless it was fetched and parsed to ≥ 1 entry (`fetchFeed`).
- Every story in a brief cites a candidate link (`sanitize()` in `briefs.ts`); the model never invents references.
- Plan rules live only in `src/lib/domain/plans.ts`. UI, cron and (future) Stripe webhook read from there.
- Every topic-scoped action resolves the topic through `ownedTopic(user, id)`; audio objects are private and only
  served by the owner-checked route.
- Publisher-feed (RSS) items are gated on the topic's query terms before ranking (`domain/relevance.ts`).
- Email story links go through the signed tracker; the signature binds destination to delivery (no open redirect).

## Layout
- `src/lib/domain/` — pure, no I/O, fully unit-tested in `tests/domain/`. Put logic here first.
- `src/lib/*.ts` — I/O: prisma, fetch, model, mail.
- `src/app/api/cron/route.ts` — the scheduled loop; every step idempotent.
- `scripts/pipeline.ts` — run the loop for one topic locally.

## Gotchas
- Google/Bing query feeds need their recency operators (`when:7d`, `interval="8"`) — bare queries return years-old stories.
- Google News item links are redirect URLs; the publisher comes from `<source>`; the redirect URL is the dedupe key.
- Instagram cannot be a push channel (Meta 24 h reply window) — it is "DM the bot for your brief", Max tier.
- Chile switches to summer time (UTC-3) the first Sunday of September; the schedule tests encode that.
