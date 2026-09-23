import { NextResponse } from "next/server";

import { composeDueBriefs } from "@/lib/briefs";
import { deliverPending } from "@/lib/delivery";
import { backfillBriefLang, backfillGoogleLinks, dropUntitled, pollDueSources, pruneItems, reviveTransientlyDisabled } from "@/lib/ingest";
import { ensureShowcase } from "@/lib/showcase";

/**
 * The scheduled half of the product. Called by Cloud Scheduler every ten
 * minutes with `Authorization: Bearer $CRON_SECRET`.
 *
 * Every step is idempotent — sources are rate-limited by lastPolledAt,
 * briefs are unique per (user, period), deliveries are rows with a status —
 * so running this more often is harmless and a missed tick is recovered by
 * the next one.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const now = new Date();
  await ensureShowcase();
  await dropUntitled();
  await backfillBriefLang();
  const revived = await reviveTransientlyDisabled();
  const ingest = await pollDueSources(now);
  const resolved = await backfillGoogleLinks();
  const compose = await composeDueBriefs(now);
  const deliver = await deliverPending();
  const pruned = await pruneItems(now);

  return NextResponse.json({ at: now.toISOString(), ingest, revived, resolved, compose, deliver, pruned });
}
