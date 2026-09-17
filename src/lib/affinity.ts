import { prisma } from "@/lib/prisma";

/**
 * What this reader actually opens. Clicks from the last AFFINITY_DAYS are
 * joined back to the items they pointed at and counted per publisher; the
 * ranker turns the share into a small lift. Only the reader's own clicks
 * shape the reader's brief — there is no global popularity here.
 */

const AFFINITY_DAYS = 90;
/** Below this many clicks, affinity is noise and stays at zero. */
const MIN_CLICKS = 3;

export async function publisherAffinity(userId: string, now: Date): Promise<(publisher: string | null) => number> {
  const since = new Date(now.getTime() - AFFINITY_DAYS * 86_400_000);
  const clicks = await prisma.click.findMany({
    where: { at: { gte: since }, delivery: { brief: { userId } } },
    select: { link: true },
  });
  if (clicks.length < MIN_CLICKS) return () => 0;

  const items = await prisma.item.findMany({
    where: { link: { in: [...new Set(clicks.map((c) => c.link))] } },
    select: { link: true, publisher: true },
  });
  const publisherOf = new Map(items.map((i) => [i.link, i.publisher]));
  const counts = new Map<string, number>();
  for (const c of clicks) {
    const p = publisherOf.get(c.link)?.toLowerCase();
    if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const max = Math.max(0, ...counts.values());
  if (!max) return () => 0;
  return (publisher) => (publisher ? (counts.get(publisher.toLowerCase()) ?? 0) / max : 0);
}
