/**
 * Where to look for a topic.
 *
 * Two kinds of source: query feeds that exist for any string (Google News,
 * Bing News — free, and each item names its publisher), and publisher feeds
 * that have to be found. Finding is done elsewhere with the model; this file
 * holds the pure parts: building query-feed URLs, reading RSS autodiscovery
 * links out of a homepage, and telling a feed body from an HTML page.
 */

export type QueryFeed = { kind: "GOOGLE_NEWS" | "BING_NEWS"; url: string };

/** Google News wants a UI language + edition pair; map our short lang codes. */
const GOOGLE_EDITIONS: Record<string, { hl: string; gl: string; ceid: string }> = {
  en: { hl: "en-US", gl: "US", ceid: "US:en" },
  es: { hl: "es-419", gl: "US", ceid: "US:es-419" },
  pt: { hl: "pt-BR", gl: "BR", ceid: "BR:pt-419" },
  fr: { hl: "fr", gl: "FR", ceid: "FR:fr" },
  de: { hl: "de", gl: "DE", ceid: "DE:de" },
};

export function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

export function queryFeedUrls(query: string, lang: string): QueryFeed[] {
  const q = normalizeQuery(query);
  const edition = GOOGLE_EDITIONS[lang] ?? GOOGLE_EDITIONS.en;
  const google = new URL("https://news.google.com/rss/search");
  google.searchParams.set("q", q);
  google.searchParams.set("hl", edition.hl);
  google.searchParams.set("gl", edition.gl);
  google.searchParams.set("ceid", edition.ceid);
  const bing = new URL("https://www.bing.com/news/search");
  bing.searchParams.set("q", q);
  bing.searchParams.set("format", "rss");
  // URLSearchParams encodes spaces as "+"; keep %20 so the stored URL matches
  // what a browser shows and dedupes with a hand-pasted one.
  return [
    { kind: "GOOGLE_NEWS", url: google.toString().replace(/\+/g, "%20") },
    { kind: "BING_NEWS", url: bing.toString().replace(/\+/g, "%20") },
  ];
}

const FEED_TYPES = ["application/rss+xml", "application/atom+xml", "application/feed+json"];

/** `<link rel="alternate" type="application/rss+xml" href=…>` entries, absolute, in document order. */
export function discoverFeedLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = attrOf(tag, "rel")?.toLowerCase() ?? "";
    const type = attrOf(tag, "type")?.toLowerCase() ?? "";
    const href = attrOf(tag, "href");
    if (!href || !rel.split(/\s+/).includes("alternate") || !FEED_TYPES.includes(type)) continue;
    try {
      const abs = new URL(href, baseUrl).toString();
      if (!out.includes(abs)) out.push(abs);
    } catch {
      // A malformed href is not a feed we can fetch.
    }
  }
  return out;
}

function attrOf(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3]) : null;
}

/** Cheap pre-check before parsing: is this response plausibly a feed? */
export function looksLikeFeed(contentType: string | null, body: string): boolean {
  const type = (contentType ?? "").toLowerCase();
  if (type.includes("xml") || type.includes("rss") || type.includes("atom")) return true;
  const head = body.slice(0, 512).trimStart().toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return false;
  return head.startsWith("<?xml") || head.startsWith("<rss") || head.startsWith("<feed") || head.startsWith("<rdf:rdf");
}
