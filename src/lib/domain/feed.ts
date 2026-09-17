import { XMLParser } from "fast-xml-parser";

/**
 * RSS / Atom → one stable entry shape.
 *
 * Feeds mix conventions: the summary is `description`, `summary`,
 * `content:encoded` or `content`; the date is `pubDate`, `dc:date`,
 * `published` or `updated`; the link is a string, an attribute, or a list of
 * `<link rel=…>` where only `alternate` is the article. This module absorbs
 * all of that so the ingester never has to know which dialect it got.
 *
 * Ported from mktops' `rss_client.py` (feedparser wrapper), plus the Google
 * News `<source>` element roiver's crypto ingester needed.
 */

export type FeedEntry = {
  title: string;
  link: string;
  summary: string | null;
  publishedAt: Date | null;
  imageUrl: string | null;
  /** Per-item publisher — Google/Bing query feeds carry one; most feeds don't. */
  publisher: string | null;
};

export type ParsedFeed = {
  title: string | null;
  entries: FeedEntry[];
};

export class FeedParseError extends Error {}

/** Real feeds rarely exceed 100; abusive ones would balloon storage and prompts. */
export const MAX_ENTRIES_PER_FEED = 100;
/** Storage cap. The prompt builder truncates further. */
export const SUMMARY_MAX_CHARS = 4000;
const TITLE_MAX_CHARS = 500;
const LINK_MAX_CHARS = 2000;

const LIST_TAGS = new Set(["item", "entry", "link", "media:thumbnail", "media:content", "enclosure", "category"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  isArray: (tagName) => LIST_TAGS.has(tagName),
});

type Node = Record<string, unknown>;

export function parseFeed(xml: string): ParsedFeed {
  if (!xml || !xml.trim()) throw new FeedParseError("Empty response");
  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch (error) {
    throw new FeedParseError(`Not XML: ${(error as Error).message}`);
  }

  const rss = doc.rss as Node | undefined;
  const channel = rss?.channel as Node | undefined;
  const atom = doc.feed as Node | undefined;
  const rdf = doc["rdf:RDF"] as Node | undefined;

  let title: string | null = null;
  let rawItems: Node[] = [];
  if (channel) {
    title = text(channel.title);
    rawItems = (channel.item as Node[] | undefined) ?? [];
  } else if (atom) {
    title = text(atom.title);
    rawItems = (atom.entry as Node[] | undefined) ?? [];
  } else if (rdf) {
    title = text((rdf.channel as Node | undefined)?.title);
    rawItems = (rdf.item as Node[] | undefined) ?? [];
  } else {
    throw new FeedParseError("Not an RSS or Atom document");
  }

  const entries: FeedEntry[] = [];
  for (const raw of rawItems.slice(0, MAX_ENTRIES_PER_FEED)) {
    const link = extractLink(raw);
    // The brief has to cite something; an entry without a link is unusable.
    if (!link) continue;
    const publisher = text(raw.source) || null;
    entries.push({
      title: cleanTitle(text(raw.title), publisher).slice(0, TITLE_MAX_CHARS),
      link: link.slice(0, LINK_MAX_CHARS),
      summary: extractSummary(raw),
      publishedAt: extractDate(raw),
      imageUrl: extractImage(raw),
      publisher,
    });
  }
  return { title, entries };
}

/** Text content of a node that may be a string, `{ "#text": … }`, or missing. */
function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === "object") return text((value as Node)["#text"]);
  return String(value).trim();
}

function attr(value: unknown, name: string): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return text((value as Node)[`@_${name}`]);
  }
  return "";
}

function extractLink(raw: Node): string {
  const links = (raw.link as unknown[] | undefined) ?? [];
  let bare = "";
  for (const link of links) {
    if (typeof link === "string") {
      if (link.trim()) return link.trim();
      continue;
    }
    const href = attr(link, "href");
    if (!href) continue;
    const rel = attr(link, "rel") || "alternate";
    if (rel === "alternate") return href;
    if (!bare && rel !== "self" && rel !== "enclosure") bare = href;
  }
  if (bare) return bare;
  // RSS 1.0 and some Atom feeds only give a permalink guid.
  const guid = raw.guid;
  if (guid && attr(guid, "isPermaLink") !== "false") {
    const g = text(guid);
    if (g.startsWith("http")) return g;
  }
  return "";
}

/** Google News appends " - Publisher" to titles; the brief already names the publisher. */
function cleanTitle(title: string, publisher: string | null): string {
  if (publisher && title.endsWith(` - ${publisher}`)) {
    title = title.slice(0, -(publisher.length + 3)).trim();
  }
  return title || "(untitled)";
}

function extractSummary(raw: Node): string | null {
  for (const key of ["content:encoded", "description", "summary", "content"]) {
    const value = text(raw[key]);
    if (value) return truncate(stripHtml(value), SUMMARY_MAX_CHARS);
  }
  return null;
}

function extractDate(raw: Node): Date | null {
  for (const key of ["pubDate", "published", "dc:date", "updated", "issued", "lastBuildDate"]) {
    const value = text(raw[key]);
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

/**
 * One image, best source first: Media RSS thumbnail, media:content of image
 * type, an image enclosure (RSS or Atom `rel=enclosure`), then the first
 * `<img>` in the HTML body as a last resort.
 */
function extractImage(raw: Node): string | null {
  const ok = (url: string) => (url.startsWith("http://") || url.startsWith("https://") ? url.slice(0, LINK_MAX_CHARS) : null);

  for (const node of (raw["media:thumbnail"] as unknown[] | undefined) ?? []) {
    const got = ok(attr(node, "url"));
    if (got) return got;
  }
  for (const node of (raw["media:content"] as unknown[] | undefined) ?? []) {
    const medium = attr(node, "medium").toLowerCase();
    const type = attr(node, "type").toLowerCase();
    if (medium === "image" || type.startsWith("image/")) {
      const got = ok(attr(node, "url"));
      if (got) return got;
    }
  }
  for (const node of (raw.enclosure as unknown[] | undefined) ?? []) {
    if (attr(node, "type").toLowerCase().startsWith("image/")) {
      const got = ok(attr(node, "url"));
      if (got) return got;
    }
  }
  for (const node of (raw.link as unknown[] | undefined) ?? []) {
    if (attr(node, "rel") === "enclosure" && attr(node, "type").toLowerCase().startsWith("image/")) {
      const got = ok(attr(node, "href"));
      if (got) return got;
    }
  }
  for (const key of ["description", "content:encoded", "content", "summary"]) {
    const html = text(raw[key]);
    const match = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
    if (match) {
      const got = ok(match[1]);
      if (got) return got;
    }
  }
  return null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
};

/**
 * Cheap tag strip + entity decode for feed HTML. Not a sanitizer — the result
 * is only ever rendered as text or fed to the model.
 */
export function stripHtml(html: string): string {
  const decoded = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);
  return decoded.replace(/\s+/g, " ").trim();
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
