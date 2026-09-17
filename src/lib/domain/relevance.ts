/**
 * Is this item about the topic? Query feeds (Google/Bing) answer that
 * upstream; a publisher's own feed carries everything the outlet writes, so
 * its items are gated here on the topic's query terms before ranking. Cheap
 * stem matching — "chile" finds "Chilean", "lithium" finds "lithium-ion" —
 * because the goal is to drop the obviously unrelated, not to rank.
 */

const STOPWORDS = new Set(["a", "an", "the", "and", "or", "not", "of", "in", "on", "for", "to", "at", "by", "with", "from", "de", "del", "la", "el", "los", "las", "en", "y", "o", "un", "una", "por", "para", "con", "news", "policy", "politica", "update", "latest"]);
const MIN_TERM = 3;
/** "Chilean" → "chile", "policies" → "polic": enough of the stem to match inflections. */
const STEM_CHARS = 5;

export function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= MIN_TERM && !STOPWORDS.has(w) && !["or", "and", "not"].includes(w));
}

export function isRelevant(item: { title: string; summary: string | null }, terms: string[]): boolean {
  if (!terms.length) return true;
  const hay = `${item.title} ${item.summary ?? ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return terms.some((t) => hay.includes(t.length > STEM_CHARS ? t.slice(0, STEM_CHARS) : t));
}

/** Bing wraps every link in a tracking redirect with the real URL in `url=`. */
export function canonicalLink(link: string): string {
  try {
    const url = new URL(link);
    if (url.hostname.endsWith("bing.com") && url.pathname.includes("apiclick")) {
      const target = url.searchParams.get("url");
      if (target && /^https?:\/\//i.test(target)) return target;
    }
  } catch {
    // Not a URL we can parse; store as-is and let the fetcher fail loudly later.
  }
  return link;
}
