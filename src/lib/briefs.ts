import type { Channel, Prisma } from "@prisma/client";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { publisherAffinity } from "@/lib/affinity";
import { MODEL, anthropic, anthropicConfigured } from "@/lib/anthropic";
import {
  ComposedSchema,
  SYSTEM_PROMPT,
  briefTitle,
  buildPrompt,
  renderMarkdown,
  renderText,
  type Composed,
  type PromptTopic,
} from "@/lib/domain/brief";
import { PLANS, effectiveDelivery, type ChannelId, type PlanId } from "@/lib/domain/plans";
import { rankItems } from "@/lib/domain/ranking";
import { isRelevant, queryTerms } from "@/lib/domain/relevance";
import { duePeriod, periodLabel } from "@/lib/domain/schedule";
import type { CadenceId } from "@/lib/domain/plans";
import { prisma } from "@/lib/prisma";
import { planOf } from "@/lib/session";
import { siteUrl } from "@/lib/stripe/client";

/**
 * Composing briefs.
 *
 * For every user with a schedule and at least one topic: work out the period
 * that is due, skip if a brief for it already exists, gather items per topic
 * in the window, rank them, make ONE model call for the whole brief, persist
 * the brief with its sections and a pending Delivery per enabled channel.
 *
 * Nothing is written when there is nothing to say (no items) — the period
 * stays open so the next tick tries again once ingest has caught up.
 */

/**
 * How long to wait before composing again for a reader whose last attempt
 * produced nothing. A brief is only attempted when there are items in the
 * window, so "nothing" means the model rejected the pool — usually a pool
 * that was still filling. Retrying is right; retrying every ten minutes
 * would spend a model call each time.
 */
const RETRY_AFTER_MIN = 60;

/**
 * Live updates fire on the hour they cover, so the pool is one hour of
 * publishing. One stray item is not an update worth interrupting anyone
 * for; this is the floor below which the hour is skipped, before any model
 * call.
 */
const LIVE_MIN_CANDIDATES = 3;

/** Candidates handed to the ranker per topic; generous so dedupe has room. */
const CANDIDATES_PER_TOPIC = 120;
/** Channels that produce a Delivery row. WEB is the app itself; TEXT is the stored plain text. */
const SENDABLE: ChannelId[] = ["EMAIL", "AUDIO", "WHATSAPP", "INSTAGRAM"];

export type ComposeSummary = { considered: number; composed: number; skipped: { userId: string; reason: string }[] };

export async function composeDueBriefs(now: Date, { limit = 25, userId }: { limit?: number; userId?: string } = {}): Promise<ComposeSummary> {
  const users = await prisma.user.findMany({
    where: { schedule: { isNot: null }, topics: { some: {} }, ...(userId ? { id: userId } : {}) },
    include: { schedule: true, topics: true, channels: { where: { enabled: true } }, _count: { select: { briefs: true } } },
    take: limit,
  });

  const summary: ComposeSummary = { considered: users.length, composed: 0, skipped: [] };
  for (const user of users) {
    if (!user.schedule) continue;
    const plan = planOf(user);
    const { cadence, channels } = effectiveDelivery(plan, {
      cadence: user.schedule.cadence,
      channels: user.channels.map((c) => c.channel),
    });
    const due = duePeriod({ ...user.schedule, cadence }, now);
    const existing = await prisma.brief.findUnique({ where: { userId_periodKey: { userId: user.id, periodKey: due.periodKey } } });
    if (existing) continue;
    const lastAttempt = user.schedule.lastAttemptAt;
    if (lastAttempt && now.getTime() - lastAttempt.getTime() < RETRY_AFTER_MIN * 60_000) continue;
    await prisma.schedule.update({ where: { userId: user.id }, data: { lastAttemptAt: now } });
    // A first brief may include what was fetched since the window closed —
    // the reader just signed up and is waiting for it.
    const gatherEnd = user._count.briefs === 0 ? now : due.windowEnd;
    const outcome = await composeFor(user, plan, channels, cadence, due, gatherEnd, now);
    if (outcome.ok) summary.composed++;
    else summary.skipped.push({ userId: user.id, reason: outcome.reason });
  }
  return summary;
}

type BriefUser = {
  id: string;
  topics: { id: string; name: string; query: string; lang: string }[];
  channels: { channel: Channel; address: string; verified: boolean }[];
};

type Outcome = { ok: true; briefId: string } | { ok: false; reason: string };

/** Compose one brief for one reader over one period. Shared by the cron and "Brief me now". */
async function composeFor(
  user: BriefUser,
  plan: PlanId,
  channels: ChannelId[],
  cadence: CadenceId,
  period: { periodKey: string; windowStart: Date; windowEnd: Date },
  gatherEnd: Date,
  now: Date,
): Promise<Outcome> {
  try {
    const affinity = await publisherAffinity(user.id, now);
    const topics = await gatherTopics(user.topics, plan, period.windowStart, gatherEnd, affinity);
    const candidates = topics.reduce((n, t) => n + t.items.length, 0);
    if (!candidates) return { ok: false, reason: "no items in window yet" };
    if (cadence === "LIVE" && candidates < LIVE_MIN_CANDIDATES) return { ok: false, reason: "too little new this hour for a live update" };
    if (!anthropicConfigured()) return { ok: false, reason: "ANTHROPIC_API_KEY unset" };

    const lang = user.topics[0]?.lang ?? "en";
    const { composed: written, usage } = await compose({ periodLabel: periodLabel(cadence), lang, topics });
    const composed = { ...written, title: briefTitle(user.topics.map((t) => t.name)) };
    // A brief with no stories is not a brief: persisting one would consume the
    // period and leave the reader with "nothing new" until the next one. This
    // happens when the pool was still filling — a topic added minutes ago —
    // so leave the period open and let a later run try with more to read.
    if (!composed.sections.some((section) => section.stories.length)) {
      return { ok: false, reason: "the model found nothing worth reporting in the pool so far" };
    }
    // Only verified addresses receive anything — see domain/verification.ts.
    const sendTo = user.channels.filter((c) => c.verified && channels.includes(c.channel) && SENDABLE.includes(c.channel));

    const brief = await prisma.brief.create({
      data: {
        userId: user.id,
        periodKey: period.periodKey,
        windowStart: period.windowStart,
        windowEnd: period.windowEnd,
        title: composed.title,
        lang,
        bodyText: renderText(composed, { linkFor: (story) => (story.itemId ? `${siteUrl()}/l/${story.itemId}` : story.link) }),
        bodyMd: renderMarkdown(composed),
        model: MODEL,
        inputTokens: usage.input,
        outputTokens: usage.output,
        sections: {
          create: composed.sections.map((s, position) => ({
            topicId: s.topicId,
            position,
            heading: s.heading,
            stories: s.stories as unknown as Prisma.InputJsonValue,
            itemIds: topics.find((t) => t.topicId === s.topicId)?.items.map((i) => i.id) ?? [],
          })),
        },
        deliveries: { create: sendTo.map((c) => ({ channel: c.channel, address: c.address })) },
      },
    });
    return { ok: true, briefId: brief.id };
  } catch (error) {
    console.error(`[briefs] compose failed for ${user.id}`, error);
    return { ok: false, reason: (error as Error).message };
  }
}

/** Minimum gap between on-demand briefs per reader — each one is a model call. */
const ON_DEMAND_GAP_MIN = 10;
const HOUR_MS = 3_600_000;

/**
 * "Brief me now": a brief over the last 24 hours, keyed by the minute so it
 * never collides with the scheduled one for the period.
 */
export async function composeOnDemand(userId: string, now: Date, { topicId }: { topicId?: string } = {}): Promise<Outcome> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { schedule: true, topics: topicId ? { where: { id: topicId } } : true, channels: { where: { enabled: true } } },
  });
  if (!user) return { ok: false, reason: "no such reader" };
  if (!user.topics.length) return { ok: false, reason: topicId ? "no such topic" : "add a topic first" };

  const recent = await prisma.brief.findFirst({
    where: { userId, periodKey: { endsWith: "/now" }, createdAt: { gte: new Date(now.getTime() - ON_DEMAND_GAP_MIN * 60_000) } },
    select: { id: true },
  });
  if (recent) return { ok: false, reason: `an on-demand brief was made less than ${ON_DEMAND_GAP_MIN} minutes ago` };

  const plan = planOf(user);
  const { channels } = effectiveDelivery(plan, { cadence: "DAILY", channels: user.channels.map((c) => c.channel) });
  const period = {
    periodKey: `${now.toISOString().slice(0, 16)}/now`,
    windowStart: new Date(now.getTime() - 24 * HOUR_MS),
    windowEnd: now,
  };
  return composeFor(user, plan, channels, "DAILY", period, now, now);
}

async function gatherTopics(
  topics: { id: string; name: string; query: string }[],
  plan: PlanId,
  windowStart: Date,
  windowEnd: Date,
  affinity: (publisher: string | null) => number,
): Promise<PromptTopic[]> {
  const out: PromptTopic[] = [];
  for (const topic of topics) {
    const fetched = await prisma.item.findMany({
      where: {
        source: { topics: { some: { topicId: topic.id } } },
        OR: [
          { publishedAt: { gte: windowStart, lte: windowEnd } },
          { publishedAt: null, fetchedAt: { gte: windowStart, lte: windowEnd } },
        ],
      },
      include: { source: { select: { kind: true } } },
      orderBy: { publishedAt: "desc" },
      take: CANDIDATES_PER_TOPIC,
    });
    // A publisher feed carries everything the outlet writes; gate its items
    // on the query. Query feeds were filtered by the engine already.
    const terms = queryTerms(topic.query);
    const items = fetched.filter((i) => i.source.kind !== "RSS" || isRelevant(i, terms));
    const ranked = rankItems(
      items.map((i) => ({ ...i, publishedAt: i.publishedAt ?? i.fetchedAt })),
      PLANS[plan].storiesPerTopic * 2,
      { affinity },
    );
    out.push({
      topicId: topic.id,
      name: topic.name,
      query: topic.query,
      storiesWanted: PLANS[plan].storiesPerTopic,
      items: ranked.map((i) => ({ id: i.id, title: i.title, summary: i.summary, link: i.link, publisher: i.publisher, publishedAt: i.publishedAt })),
    });
  }
  return out;
}

async function compose(input: { periodLabel: string; lang: string; topics: PromptTopic[] }): Promise<{ composed: Composed; usage: { input: number; output: number } }> {
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildPrompt(input) }],
    output_config: { format: zodOutputFormat(ComposedSchema) },
  });
  const parsed = response.parsed_output;
  if (!parsed) throw new Error(`Composer returned no structured output (stop_reason=${response.stop_reason})`);

  return {
    composed: sanitize(parsed, input.topics),
    usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
  };
}

/**
 * Trust the model with prose, not with references: a section must name a
 * topic we asked about, and every story must cite a candidate link. Anything
 * else is dropped. Topics the model forgot come back empty rather than missing.
 */
function sanitize(composed: Composed, topics: PromptTopic[]): Composed {
  const byTopic = new Map(topics.map((t) => [t.topicId, t]));
  const sections = topics.map((topic) => {
    const section = composed.sections.find((s) => s.topicId === topic.topicId);
    const links = new Map(topic.items.map((i) => [i.link, i]));
    const stories = (section?.stories ?? [])
      .filter((s) => links.has(s.link))
      .map((s) => ({ ...s, publisher: s.publisher ?? links.get(s.link)?.publisher ?? null, itemId: links.get(s.link)?.id }))
      .slice(0, topic.storiesWanted);
    return { topicId: topic.topicId, heading: section?.heading || byTopic.get(topic.topicId)!.name, stories };
  });
  return { title: composed.title, intro: composed.intro, sections };
}
