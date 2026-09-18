/**
 * Resolve a Google News RSS article link to the publisher's URL.
 *
 * `news.google.com/rss/articles/<id>` is not an HTTP redirect: the page
 * redirects with a script, and the destination is only returned by Google's
 * internal `batchexecute` endpoint when asked with the signature and
 * timestamp the article page embeds (`data-n-a-sg`, `data-n-a-ts`). Two
 * requests per link, done once per new item at ingest, never on a read path.
 * Any failure leaves the Google link in place — an ugly link beats no link.
 */

const ARTICLE_PATH = /\/(?:rss\/)?articles\/([^/?#]+)/;
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const TIMEOUT_MS = 10_000;

export function isGoogleNewsLink(link: string): boolean {
  try {
    const u = new URL(link);
    return u.hostname === "news.google.com" && ARTICLE_PATH.test(u.pathname);
  } catch {
    return false;
  }
}

export async function resolveGoogleNewsLink(link: string): Promise<string | null> {
  const id = ARTICLE_PATH.exec(new URL(link).pathname)?.[1];
  if (!id) return null;
  try {
    const page = await text(`https://news.google.com/articles/${id}`);
    const sig = /data-n-a-sg="([^"]+)"/.exec(page)?.[1];
    const ts = /data-n-a-ts="([^"]+)"/.exec(page)?.[1];
    if (!sig || !ts) return null;

    const req = [
      "garturlreq",
      [["en-US", "US", ["FINANCE_TOP_INDICES", "WEB_TEST_1_0_0"], null, null, 1, 1, "US:en", null, 180, null, null, null, null, null, 0, null, null, [1608992183, 723341000]], "en-US", "US", 1, [2, 3, 4, 8], 1, 0, "655000234", 0, 0, null, 0],
      id,
      Number(ts),
      sig,
    ];
    const body = new URLSearchParams({ "f.req": JSON.stringify([[["Fbv4je", JSON.stringify(req), null, "generic"]]]) });
    const raw = await text("https://news.google.com/_/DotsSplashUi/data/batchexecute", { method: "POST", body });

    // Response is ")]}'" then length-prefixed JSON chunks; find the one with our answer.
    const chunk = raw.split("\n").find((line) => line.includes("garturlres"));
    if (!chunk) return null;
    const outer = JSON.parse(chunk) as unknown[][];
    const payload = outer.find((row) => typeof row?.[2] === "string" && (row[2] as string).includes("garturlres"))?.[2] as string | undefined;
    if (!payload) return null;
    const inner = JSON.parse(payload) as unknown[];
    const url = inner[1];
    return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

async function text(url: string, init: { method?: string; body?: URLSearchParams } = {}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: init.method ?? "GET",
      body: init.body,
      headers: {
        "User-Agent": BROWSER_UA,
        ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" } : {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}
