import type { Source } from "@prisma/client";

import { fetchFeed } from "@/lib/fetch-feed";
import { prisma } from "@/lib/prisma";
import { mapWithConcurrency } from "@/lib/sources";

/**
 * Polling. Each source is fetched at most once per POLL_INTERVAL, failures
 * are isolated and counted, and a source that fails MAX_FAILS times in a row
 * is switched off (it stays attached, so the topic page can say so).
 */

export const POLL_INTERVAL_MIN = 30;
const MAX_FAILS = 20;
const POLL_CONCURRENCY = 5;
const PRUNE_AFTER_DAYS = 30;

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
    const rows = feed.entries.map((e) => ({
      sourceId: source.id,
      title: e.title,
      link: e.link,
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
      data: { lastPolledAt: now, lastError: message, failCount, enabled: failCount < MAX_FAILS },
    });
    return { ok: false };
  }
}

/** Items older than the retention window, by published date or fetch date when the feed gave none. */
export async function pruneItems(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - PRUNE_AFTER_DAYS * 86_400_000);
  const { count } = await prisma.item.deleteMany({
    where: { OR: [{ publishedAt: { lt: cutoff } }, { publishedAt: null, fetchedAt: { lt: cutoff } }] },
  });
  return count;
}
