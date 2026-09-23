import type { Source } from "@prisma/client";

import { canonicalLink } from "@/lib/domain/relevance";
import { fetchFeed } from "@/lib/fetch-feed";
import { GoogleRateLimited, isGoogleNewsLink, lastResolveError, resolveGoogleNewsLink } from "@/lib/google-news";
import { prisma } from "@/lib/prisma";
import { mapWithConcurrency } from "@/lib/sources";

/**
 * Polling. Each source is fetched at most once per POLL_INTERVAL, failures
 * are isolated and counted, and a source that fails MAX_FAILS times in a row
 * is switched off (it stays attached, so the topic page can say so).
 */

export const POLL_INTERVAL_MIN = 30;
const MAX_FAILS = 20;
/**
 * A source is retired only for failures that will not fix themselves. A
 * 5xx, a 429 or a timeout is the other end having a bad day — Google News
 * answers 503 to cloud IPs for hours at a time — and retiring a feed for
 * that loses the topic its best source permanently.
 */
function isTransient(message: string): boolean {
  return /HTTP (429|5\d\d)|timed out|fetch failed|ECONN|ETIMEDOUT|socket hang up/i.test(message);
}
const POLL_CONCURRENCY = 5;
const PRUNE_AFTER_DAYS = 30;
/** Google links already stored, resolved per cron tick — small and sequential; Google throttles cloud IPs hard. */
const BACKFILL_PER_RUN = 12;

export type IngestSummary = { polled: number; ok: number; failed: number; inserted: number };

export async function pollDueSources(now: Date, { limit = 40, sourceIds }: { limit?: number; sourceIds?: string[] } = {}): Promise<IngestSummary> {
  const cutoff = new Date(now.getTime() - POLL_INTERVAL_MIN * 60_000);
  const sources = await prisma.source.findMany({
    where: sourceIds
      ? { id: { in: sourceIds }, enabled: true }
      : { enabled: true, OR: [{ lastPolledAt: null }, { lastPolledAt: { lt: cutoff } }] },
    orderBy: [{ lastPolledAt: { sort: "asc", nulls: "first" } }],
    take: limit,
  });

  const summary: IngestSummary = { polled: sources.length, ok: 0, failed: 0, inserted: 0 };
  await mapWithConcurrency(sources, POLL_CONCURRENCY, async (source) => {
    const outcome = await pollOne(source, now);
    if (outcome.ok) {
      summary.ok++;
      summary.inserted += outcome.inserted;
    } else {
      summary.failed++;
    }
  });
  return summary;
}

async function pollOne(source: Source, now: Date): Promise<{ ok: true; inserted: number } | { ok: false }> {
  try {
    const { feed } = await fetchFeed(source.url, { allowDiscovery: false });
    const links = await resolveNewGoogleLinks(source.id, feed.entries.map((e) => e.link));
    const rows = feed.entries.map((e) => ({
      sourceId: source.id,
      title: e.title,
      link: links.get(e.link) ?? canonicalLink(e.link),
      summary: e.summary,
      publisher: e.publisher ?? source.publisher,
      imageUrl: e.imageUrl,
      publishedAt: e.publishedAt,
    }));
    const { count } = rows.length ? await prisma.item.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
    await prisma.source.update({
      where: { id: source.id },
      data: { lastPolledAt: now, lastError: null, failCount: 0, title: source.title ?? feed.title },
    });
    return { ok: true, inserted: count };
  } catch (error) {
    const failCount = source.failCount + 1;
    const message = (error as Error).message.slice(0, 1000);
    console.warn(`[ingest] ${source.url}: ${message}`);
    await prisma.source.update({
      where: { id: source.id },
      data: { lastPolledAt: now, lastError: message, failCount, enabled: isTransient(message) || failCount < MAX_FAILS },
    });
    return { ok: false };
  }
}

/**
 * Google News links are opaque redirects; resolve the ones we have not seen
 * before to the publisher URL so briefs cite the real page and the same
 * story from Google, Bing and a publisher feed dedupes on one URL. Seen
 * links are skipped — two requests per story, once.
 */
async function resolveNewGoogleLinks(sourceId: string, links: string[]): Promise<Map<string, string>> {
  const google = links.filter(isGoogleNewsLink);
  const out = new Map<string, string>();
  if (!google.length) return out;
  const seen = new Set((await prisma.item.findMany({ where: { sourceId, link: { in: google } }, select: { link: true } })).map((i) => i.link));
  const fresh = google.filter((l) => !seen.has(l));
  for (const link of fresh) {
    try {
      const resolved = await resolveGoogleNewsLink(link);
      if (resolved) out.set(link, resolved);
    } catch (error) {
      if (error instanceof GoogleRateLimited) break; // the rest stay opaque; the backfill gets them later
      throw error;
    }
  }
  return out;
}

/** Resolve Google links stored before resolution existed. Returns how many changed. */
export async function backfillGoogleLinks(): Promise<number> {
  const items = await prisma.item.findMany({
    where: { OR: [{ link: { startsWith: "https://news.google.com/" } }, { link: { contains: "bing.com/news/apiclick" } }] },
    select: { id: true, sourceId: true, link: true },
    orderBy: { fetchedAt: "desc" },
    take: BACKFILL_PER_RUN,
  });
  let changed = 0;
  for (const item of items) {
    // Bing wraps are decoded locally; Google links need the resolver.
    let resolved: string | null;
    try {
      resolved = isGoogleNewsLink(item.link) ? await resolveGoogleNewsLink(item.link) : canonicalLink(item.link);
    } catch (error) {
      if (error instanceof GoogleRateLimited) break;
      throw error;
    }
    if (!resolved || resolved === item.link) continue;
    // The resolved URL may already be stored for this source (a later poll
    // resolved it at ingest): keep that row, drop the opaque one.
    const clash = await prisma.item.findUnique({ where: { sourceId_link: { sourceId: item.sourceId, link: resolved } } });
    if (clash) await prisma.item.delete({ where: { id: item.id } });
    else await prisma.item.update({ where: { id: item.id }, data: { link: resolved } });
    changed++;
  }
  if (items.length && !changed && lastResolveError) console.warn(`[resolve] 0/${items.length} resolved — last error: ${lastResolveError}`);
  return changed;
}

/** Sources retired by a run of transient failures, given another chance. */
export async function reviveTransientlyDisabled(): Promise<number> {
  const { count } = await prisma.source.updateMany({
    where: { enabled: false, OR: [{ lastError: { contains: "HTTP 5" } }, { lastError: { contains: "HTTP 429" } }, { lastError: { contains: "timed out" } }] },
    data: { enabled: true, failCount: 0 },
  });
  return count;
}

/** Rows stored as "(untitled)" by the old parser: drop them so the next poll re-inserts them with their real titles. */
export async function dropUntitled(): Promise<number> {
  const { count } = await prisma.item.deleteMany({ where: { title: "(untitled)" } });
  return count;
}

/**
 * Briefs written before `lang` was recorded carry the column default. Give
 * each one its first section's topic language; a no-op once every brief
 * has been composed with the column present.
 */
export async function backfillBriefLang(): Promise<number> {
  const rows = await prisma.$executeRawUnsafe(`
    UPDATE "Brief" b SET lang = t.lang
    FROM "BriefSection" s JOIN "Topic" t ON t.id = s."topicId"
    WHERE s."briefId" = b.id AND s.position = 0 AND b.lang <> t.lang
  `);
  return rows;
}

/** Items older than the retention window, by published date or fetch date when the feed gave none. */
export async function pruneItems(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - PRUNE_AFTER_DAYS * 86_400_000);
  const { count } = await prisma.item.deleteMany({
    where: { OR: [{ publishedAt: { lt: cutoff } }, { publishedAt: null, fetchedAt: { lt: cutoff } }] },
  });
  return count;
}
