import type { Topic } from "@prisma/client";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { MODEL, anthropic, anthropicConfigured } from "@/lib/anthropic";
import { queryFeedUrls } from "@/lib/domain/discovery";
import { FeedFetchError, fetchFeed } from "@/lib/fetch-feed";
import { prisma } from "@/lib/prisma";

/**
 * Attaching sources to a topic.
 *
 * Query feeds (Google News, Bing News) are attached unconditionally: they
 * exist for any string. Publisher feeds are proposed by the model and then
 * *fetched* — a model will happily invent a plausible `/feed.xml` that 404s,
 * so nothing is stored that did not just parse to at least one entry.
 * Sources are global rows; attaching one that exists is a join-row insert.
 */

const MAX_SUGGESTIONS = 8;
const VERIFY_CONCURRENCY = 4;

export type AttachResult = { query: number; suggested: number; rejected: string[] };

export async function attachSourcesForTopic(topic: Topic): Promise<AttachResult> {
  const result: AttachResult = { query: 0, suggested: 0, rejected: [] };

  for (const q of queryFeedUrls(topic.query, topic.lang)) {
    await attach(topic.id, { kind: q.kind, url: q.url, title: null, publisher: null }, "query");
    result.query++;
  }

  if (!anthropicConfigured()) {
    console.info("[sources] ANTHROPIC_API_KEY unset — skipping publisher suggestions");
    return result;
  }

  let proposals: Proposal[] = [];
  try {
    proposals = await proposePublisherFeeds(topic);
  } catch (error) {
    console.error("[sources] suggestion failed", error);
    return result;
  }

  const verified = await mapWithConcurrency(proposals, VERIFY_CONCURRENCY, async (p) => {
    try {
      const fetched = await fetchFeed(p.url);
      if (!fetched.feed.entries.length) throw new FeedFetchError(`Empty feed: ${p.url}`);
      return { ...p, url: fetched.url, title: fetched.feed.title };
    } catch (error) {
      result.rejected.push(`${p.publisher}: ${(error as Error).message}`);
      return null;
    }
  });

  for (const v of verified) {
    if (!v) continue;
    await attach(topic.id, { kind: "RSS", url: v.url, title: v.title, publisher: v.publisher }, "suggested");
    result.suggested++;
  }
  return result;
}

/** A user-pasted URL: verify, then attach. Throws a FeedFetchError with a readable reason. */
export async function attachManualSource(topic: Topic, url: string): Promise<void> {
  const fetched = await fetchFeed(url.trim());
  if (!fetched.feed.entries.length) throw new FeedFetchError("That feed has no entries.");
  const publisher = fetched.feed.title ?? new URL(fetched.url).hostname;
  await attach(topic.id, { kind: "RSS", url: fetched.url, title: fetched.feed.title, publisher }, "manual");
}

type SourceInput = { kind: "RSS" | "GOOGLE_NEWS" | "BING_NEWS"; url: string; title: string | null; publisher: string | null };

async function attach(topicId: string, input: SourceInput, origin: string): Promise<void> {
  const source = await prisma.source.upsert({
    where: { url: input.url },
    update: {},
    create: { kind: input.kind, url: input.url, title: input.title, publisher: input.publisher },
  });
  await prisma.topicSource.upsert({
    where: { topicId_sourceId: { topicId, sourceId: source.id } },
    update: {},
    create: { topicId, sourceId: source.id, origin },
  });
}

const ProposalSchema = z.object({
  feeds: z.array(
    z.object({
      publisher: z.string(),
      /** The feed URL, or the homepage if the feed URL is not known — autodiscovery handles the rest. */
      url: z.string(),
      why: z.string(),
    }),
  ),
});
type Proposal = z.infer<typeof ProposalSchema>["feeds"][number];

const SUGGEST_SYSTEM = `You recommend RSS or Atom feeds for a reader who wants to follow a topic. Prefer primary publishers over aggregators: the outlets, blogs, institutions and newsletters that actually report on the topic. Give the feed URL when you know it; otherwise give the publisher's homepage and it will be autodiscovered. Do not guess feed paths you are not confident about. Match the reader's language where good sources exist in it, and include the best English sources regardless.`;

async function proposePublisherFeeds(topic: Topic): Promise<Proposal[]> {
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: [{ type: "text", text: SUGGEST_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Topic: ${topic.name}\nSearch query: ${topic.query}\nReader language: ${topic.lang}\n\nPropose up to ${MAX_SUGGESTIONS} feeds.`,
      },
    ],
    output_config: { format: zodOutputFormat(ProposalSchema) },
  });
  return (response.parsed_output?.feeds ?? []).slice(0, MAX_SUGGESTIONS);
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
