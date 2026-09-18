/**
 * A brief, before and after the model.
 *
 * `buildPrompt` turns ranked items into the deterministic user message the
 * composer sends (deterministic so the cache prefix holds). `Composed` is
 * what comes back; `renderText` / `renderMarkdown` turn it into the two
 * canonical bodies stored on the Brief row — plain text is what email, TEXT
 * and (read aloud) audio send, markdown is the web view.
 */

import { z } from "zod";

import { truncate } from "./feed";

export type Story = { headline: string; summary: string; link: string; publisher: string | null; itemId?: string };
export type ComposedSection = { topicId: string; heading: string; stories: Story[] };
export type Composed = { title: string; intro?: string; sections: ComposedSection[] };

export type PromptItem = {
  id: string;
  title: string;
  summary: string | null;
  link: string;
  publisher: string | null;
  publishedAt: Date | null;
};

export type PromptTopic = {
  topicId: string;
  name: string;
  query: string;
  storiesWanted: number;
  items: PromptItem[];
};

export type PromptInput = {
  periodLabel: string;
  lang: string;
  topics: PromptTopic[];
};

/** Per-item cap inside the prompt; the model needs the gist, not the article. */
const PROMPT_SUMMARY_CHARS = 600;

export const SYSTEM_PROMPT = `You write MacroBrief: a short, factual news brief for one reader who follows a few topics and does not have time to read the sources.

For each topic you receive candidate items (headline, publisher, date, link, snippet). Choose the stories that matter most for someone following that topic, merge duplicates that report the same event, and write each as a headline plus a two-to-three sentence summary that says what happened and why it matters. Cite exactly one link per story, chosen from the candidates — never invent a link or a fact that is not in the candidates. Prefer the most authoritative publisher when several report the same event. Only include a story if it is genuinely about the topic; never pad a section to reach the requested count — fewer good stories beat a full section, and a topic with nothing worth reporting gets an empty story list. Write in the reader's language. No preamble, no sign-off.`;

export const ComposedSchema = z.object({
  title: z.string(),
  intro: z.string().optional(),
  sections: z.array(
    z.object({
      topicId: z.string(),
      heading: z.string(),
      stories: z.array(
        z.object({
          headline: z.string(),
          summary: z.string(),
          link: z.string(),
          publisher: z.string().nullable(),
        }),
      ),
    }),
  ),
});

export function buildPrompt(input: PromptInput): string {
  const lines: string[] = [
    `Reader language: ${input.lang}. Period covered: ${input.periodLabel}.`,
    "Return one section per topic, in the order given, using the topic ids exactly.",
    "",
  ];
  for (const topic of input.topics) {
    lines.push(`# Topic ${topic.topicId}: ${topic.name}`);
    lines.push(`Search query: ${topic.query}. Pick up to ${topic.storiesWanted} stories.`);
    if (!topic.items.length) lines.push("(no candidates)");
    for (const item of topic.items) {
      const date = item.publishedAt ? item.publishedAt.toISOString().slice(0, 10) : "undated";
      lines.push(`[${item.id}] ${item.title} — ${item.publisher ?? "unknown publisher"} (${date})`);
      lines.push(`  ${item.link}`);
      if (item.summary) lines.push(`  ${truncate(item.summary, PROMPT_SUMMARY_CHARS)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

const NOTHING_NEW = "Nothing new this period.";
const TITLE_MAX = 90;

/** "MacroBrief: Topic" — the title is ours, not the model's, so every brief reads the same. */
export function briefTitle(topicNames: string[]): string {
  const prefix = "MacroBrief: ";
  const joined = topicNames.join(", ");
  if (prefix.length + joined.length <= TITLE_MAX) return prefix + joined;
  return prefix + joined.slice(0, TITLE_MAX - prefix.length - 1).trimEnd() + "…";
}

/**
 * Plain text. `linkFor` lets the caller substitute a short link — a
 * Google News redirect runs to 300 characters and wrecks a text column;
 * the app's `/l/<item>` is 45 and records the open.
 */
export function renderText(c: Composed, { linkFor = (story: Story) => story.link }: { linkFor?: (story: Story) => string } = {}): string {
  const out: string[] = [c.title.toUpperCase(), ""];
  if (c.intro) out.push(c.intro, "");
  for (const section of c.sections) {
    out.push(section.heading.toUpperCase());
    if (!section.stories.length) out.push(`  ${NOTHING_NEW}`);
    for (const story of section.stories) {
      out.push(`• ${story.headline}${story.publisher ? ` (${story.publisher})` : ""}`);
      out.push(`  ${story.summary}`);
      out.push(`  ${linkFor(story)}`);
    }
    out.push("");
  }
  return out.join("\n").trimEnd() + "\n";
}

export function renderMarkdown(c: Composed): string {
  const out: string[] = [`# ${c.title}`, ""];
  if (c.intro) out.push(c.intro, "");
  for (const section of c.sections) {
    out.push(`## ${section.heading}`, "");
    if (!section.stories.length) out.push(`_${NOTHING_NEW}_`, "");
    for (const story of section.stories) {
      out.push(`**[${story.headline}](${story.link})**${story.publisher ? ` — ${story.publisher}` : ""}  `);
      out.push(story.summary, "");
    }
  }
  return out.join("\n").trimEnd() + "\n";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeHref(link: string): string | null {
  return /^https?:\/\//i.test(link) ? escapeHtml(link) : null;
}

/** Minimal email HTML. Everything from the model is escaped; only http(s) links are linked. */
export function renderHtml(
  c: Composed,
  { listenUrl = null, linkFor = (url: string) => url }: { listenUrl?: string | null; linkFor?: (url: string) => string } = {},
): string {
  const out: string[] = [
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#14161f;line-height:1.5">`,
    `<p style="font-size:14px;font-weight:700;margin:0 0 16px">Macro<span style="color:#1d4ed8">Brief</span></p>`,
    `<h1 style="font-size:20px">${escapeHtml(c.title)}</h1>`,
  ];
  const listen = listenUrl ? safeHref(listenUrl) : null;
  if (listen) out.push(`<p><a href="${listen}" style="color:#1d4ed8;font-weight:600">▶ Listen to this brief</a></p>`);
  if (c.intro) out.push(`<p>${escapeHtml(c.intro)}</p>`);
  for (const section of c.sections) {
    out.push(`<h2 style="font-size:16px;margin-top:24px">${escapeHtml(section.heading)}</h2>`);
    if (!section.stories.length) out.push(`<p style="color:#666"><em>${NOTHING_NEW}</em></p>`);
    for (const story of section.stories) {
      const href = safeHref(story.link) ? safeHref(linkFor(story.link)) : null;
      const headline = escapeHtml(story.headline);
      const title = href ? `<a href="${href}" style="color:#1d4ed8">${headline}</a>` : headline;
      const publisher = story.publisher ? ` <span style="color:#666">— ${escapeHtml(story.publisher)}</span>` : "";
      out.push(`<p><strong>${title}</strong>${publisher}<br>${escapeHtml(story.summary)}</p>`);
    }
  }
  out.push(`<p style="color:#888;font-size:12px;margin-top:32px">You get this because you follow these topics on MacroBrief. Change topics, schedule or channels in the app.</p></div>`);
  return out.join("\n");
}
