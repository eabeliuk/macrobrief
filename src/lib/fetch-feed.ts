import { discoverFeedLinks, looksLikeFeed } from "@/lib/domain/discovery";
import { FeedParseError, parseFeed, type ParsedFeed } from "@/lib/domain/feed";

/**
 * Fetch a URL and come back with a parsed feed — following one hop of RSS
 * autodiscovery if the URL turned out to be a homepage. The one place the
 * network is touched for feeds; the ingester and the source verifier both
 * use it.
 */

const USER_AGENT = "MacroBrief/1.0 (+https://macrobrief.com)";
const TIMEOUT_MS = 10_000;
/** A feed larger than this is not a feed we want. */
const MAX_BYTES = 2_000_000;

export class FeedFetchError extends Error {}

export type FetchedFeed = { url: string; feed: ParsedFeed };

export async function fetchFeed(url: string, { allowDiscovery = true } = {}): Promise<FetchedFeed> {
  const { contentType, body } = await get(url);
  if (looksLikeFeed(contentType, body)) {
    return { url, feed: parse(body, url) };
  }
  if (!allowDiscovery) throw new FeedFetchError(`Not a feed: ${url}`);
  const candidates = discoverFeedLinks(body, url);
  if (!candidates.length) throw new FeedFetchError(`No feed found at ${url}`);
  // Try each advertised feed until one parses.
  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      return await fetchFeed(candidate, { allowDiscovery: false });
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError ?? new FeedFetchError(`No usable feed at ${url}`);
}

function parse(body: string, url: string): ParsedFeed {
  try {
    return parseFeed(body);
  } catch (error) {
    if (error instanceof FeedParseError) throw new FeedFetchError(`${url}: ${error.message}`);
    throw error;
  }
}

async function get(url: string): Promise<{ contentType: string | null; body: string }> {
  if (!/^https?:\/\//i.test(url)) throw new FeedFetchError(`Unsupported URL: ${url}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.5, */*;q=0.1" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new FeedFetchError(`HTTP ${response.status} from ${url}`);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) throw new FeedFetchError(`Too large: ${url}`);
    const body = await response.text();
    if (body.length > MAX_BYTES) throw new FeedFetchError(`Too large: ${url}`);
    return { contentType: response.headers.get("content-type"), body };
  } catch (error) {
    if (error instanceof FeedFetchError) throw error;
    const reason = (error as Error).name === "AbortError" ? "timed out" : (error as Error).message;
    throw new FeedFetchError(`${url}: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}
