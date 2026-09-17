import { deskFor, slugFor, type Desk } from "@/lib/domain/globe";
import { rankGroups, type RankingGroup } from "@/lib/domain/ranking";
import { isRelevant, queryTerms } from "@/lib/domain/relevance";
import { prisma } from "@/lib/prisma";
import { attachSourcesForTopic } from "@/lib/sources";

/**
 * The showcase: three topics the platform itself follows, so the landing
 * page can show a real, current budget sheet instead of a mockup. They
 * belong to a system user with no schedule — the cron ingests their sources
 * like anyone else's but never composes or delivers a brief for them.
 *
 * `todaysBudget` is the sheet: for each topic, the last 24 hours of items
 * run through the same editor a paying reader gets, with every group's
 * score, the decision, and the desk it came from.
 */

export const SHOWCASE_EMAIL = "showcase@macrobrief.local";

const SHOWCASE_TOPICS: { name: string; query: string; lang: string }[] = [
  { name: "Lithium and copper", query: "lithium OR copper mining Chile", lang: "en" },
  { name: "AI regulation", query: "AI regulation", lang: "en" },
  { name: "Space launches", query: "rocket launch", lang: "en" },
];

const WINDOW_HOURS = 24;
const RUNS = 4;
const CANDIDATES = 120;

/** Idempotent: creates the system user and its topics once; attaches query feeds only (no model call). */
export async function ensureShowcase(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: SHOWCASE_EMAIL },
    update: {},
    create: { email: SHOWCASE_EMAIL, name: "Showcase", plan: "PRO" },
  });
  const existing = await prisma.topic.findMany({ where: { userId: user.id }, select: { name: true } });
  const have = new Set(existing.map((t) => t.name));
  for (const spec of SHOWCASE_TOPICS) {
    if (have.has(spec.name)) continue;
    const topic = await prisma.topic.create({ data: { userId: user.id, ...spec } });
    await attachSourcesForTopic(topic, { suggest: false });
  }
}

export type BudgetRow = {
  slug: string;
  headline: string;
  link: string;
  publisher: string | null;
  desk: Desk | null;
  mentions: number;
  tier: 1 | 2 | 3;
  score: number;
  publishedAt: Date;
  decision: "RUNS" | "HELD";
};

export type BudgetTopic = { name: string; candidates: number; rows: BudgetRow[] };

export type Budget = {
  compiledAt: Date | null;
  windowHours: number;
  topics: BudgetTopic[];
  /** Every desk pinned on today's sheet, deduped by city. */
  desks: Desk[];
};

export async function todaysBudget(now: Date): Promise<Budget> {
  const user = await prisma.user.findUnique({ where: { email: SHOWCASE_EMAIL }, include: { topics: { orderBy: { createdAt: "asc" } } } });
  if (!user) return { compiledAt: null, windowHours: WINDOW_HOURS, topics: [], desks: [] };

  const since = new Date(now.getTime() - WINDOW_HOURS * 3_600_000);
  const desks = new Map<string, Desk>();
  let compiledAt: Date | null = null;
  const topics: BudgetTopic[] = [];

  for (const topic of user.topics) {
    const terms = queryTerms(topic.query);
    const items = (
      await prisma.item.findMany({
        where: { source: { topics: { some: { topicId: topic.id } } }, publishedAt: { gte: since } },
        include: { source: { select: { kind: true } } },
        orderBy: { publishedAt: "desc" },
        take: CANDIDATES,
      })
    ).filter((i) => i.source.kind !== "RSS" || isRelevant(i, terms));
    for (const i of items) if (!compiledAt || i.fetchedAt > compiledAt) compiledAt = i.fetchedAt;

    const groups = rankGroups(items.map((i) => ({ ...i, publishedAt: i.publishedAt ?? i.fetchedAt })));
    const rows = groups.slice(0, RUNS + 3).map((g, index) => toRow(topic.name, g, index < RUNS));
    for (const r of rows) if (r.desk) desks.set(r.desk.city, r.desk);
    topics.push({ name: topic.name, candidates: items.length, rows });
  }

  return { compiledAt, windowHours: WINDOW_HOURS, topics, desks: [...desks.values()] };
}

function toRow(topicName: string, g: RankingGroup<{ title: string; link: string; publisher: string | null; publishedAt: Date }>, runs: boolean): BudgetRow {
  const c = g.canonical;
  return {
    slug: slugFor(topicName, c.title),
    headline: c.title,
    link: c.link,
    publisher: c.publisher,
    desk: deskFor(c.publisher) ?? g.members.map((m) => deskFor(m.publisher)).find(Boolean) ?? null,
    mentions: g.members.length,
    tier: g.bestTier,
    score: Math.round(g.score * 100) / 100,
    publishedAt: c.publishedAt,
    decision: runs ? "RUNS" : "HELD",
  };
}
