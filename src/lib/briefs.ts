import type { Channel, Plan, Prisma } from "@prisma/client";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { publisherAffinity } from "@/lib/affinity";
import { MODEL, anthropic, anthropicConfigured } from "@/lib/anthropic";
import {
  ComposedSchema,
  SYSTEM_PROMPT,
  buildPrompt,
  renderMarkdown,
  renderText,
  type Composed,
  type PromptTopic,
} from "@/lib/domain/brief";
import { PLANS, effectiveDelivery, type ChannelId } from "@/lib/domain/plans";
import { rankItems } from "@/lib/domain/ranking";
import { isRelevant, queryTerms } from "@/lib/domain/relevance";
import { duePeriod, periodLabel } from "@/lib/domain/schedule";
import { prisma } from "@/lib/prisma";

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
    const { cadence, channels } = effectiveDelivery(user.plan, {
      cadence: user.schedule.cadence,
      channels: user.channels.map((c) => c.channel),
    });
    const due = duePeriod({ ...user.schedule, cadence }, now);
    const existing = await prisma.brief.findUnique({ where: { userId_periodKey: { userId: user.id, periodKey: due.periodKey } } });
    if (existing) continue;

    try {
      // A first brief may include what was fetched since the window closed —
      // the reader just signed up and is waiting for it.
      const gatherEnd = user._count.briefs === 0 ? now : due.windowEnd;
      const affinity = await publisherAffinity(user.id, now);
      const topics = await gatherTopics(user.topics, user.plan, due.windowStart, gatherEnd, affinity);
      if (!topics.some((t) => t.items.length)) {
        summary.skipped.push({ userId: user.id, reason: "no items in window yet" });
        continue;
      }
      if (!anthropicConfigured()) {
        summary.skipped.push({ userId: user.id, reason: "ANTHROPIC_API_KEY unset" });
        continue;
      }

      const lang = user.topics[0]?.lang ?? "en";
      const { composed, usage } = await compose({ periodLabel: periodLabel(cadence), lang, topics });
      // Only verified addresses receive anything — see domain/verification.ts.
      const sendTo = user.channels.filter((c) => c.verified && channels.includes(c.channel) && SENDABLE.includes(c.channel));

      await prisma.brief.create({
        data: {
          userId: user.id,
          periodKey: due.periodKey,
          windowStart: due.windowStart,
          windowEnd: due.windowEnd,
          title: composed.title,
          bodyText: renderText(composed),
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
          deliveries: { create: sendTo.map((c) => ({ channel: c.channel as Channel, address: c.address })) },
        },
      });
      summary.composed++;
    } catch (error) {
      console.error(`[briefs] compose failed for ${user.id}`, error);
      summary.skipped.push({ userId: user.id, reason: (error as Error).message });
    }
  }
  return summary;
}

async function gatherTopics(
  topics: { id: string; name: string; query: string }[],
  plan: Plan,
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
      .map((s) => ({ ...s, publisher: s.publisher ?? links.get(s.link)?.publisher ?? null }))
      .slice(0, topic.storiesWanted);
    return { topicId: topic.topicId, heading: section?.heading || byTopic.get(topic.topicId)!.name, stories };
  });
  return { title: composed.title, intro: composed.intro, sections };
}
