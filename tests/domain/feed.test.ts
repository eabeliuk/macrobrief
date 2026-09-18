import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { FeedParseError, parseFeed, stripHtml } from "@/lib/domain/feed";

const fixture = (name: string) => readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8");

describe("parseFeed — RSS 2.0", () => {
  const feed = parseFeed(fixture("rss2.xml"));

  it("reads the channel title", () => {
    expect(feed.title).toBe("Example Times");
  });

  it("drops entries without a link and keeps a placeholder title for untitled ones", () => {
    expect(feed.entries.map((e) => e.link)).toEqual([
      "https://example-times.test/lithium-rebound",
      "https://example-times.test/second",
      "https://example-times.test/untitled",
    ]);
    expect(feed.entries[2].title).toBe("(untitled)");
  });

  it("strips HTML and decodes entities in summaries", () => {
    expect(feed.entries[0].summary).toBe("Prices rose 12% this week. Analysts cite…");
    expect(feed.entries[1].summary).toBe("Long form body here.");
  });

  it("parses pubDate and dc:date into UTC instants", () => {
    expect(feed.entries[0].publishedAt?.toISOString()).toBe("2026-09-16T14:03:00.000Z");
    expect(feed.entries[1].publishedAt?.toISOString()).toBe("2026-09-15T09:00:00.000Z");
    expect(feed.entries[2].publishedAt).toBeNull();
  });

  it("prefers media:thumbnail, then enclosure, then an inline <img>", () => {
    expect(feed.entries[0].imageUrl).toBe("https://example-times.test/thumb/lithium.jpg");
    expect(feed.entries[1].imageUrl).toBe("https://example-times.test/enc.png");
  });

  it("has no per-item publisher when the feed does not say", () => {
    expect(feed.entries[0].publisher).toBeNull();
  });
});

describe("parseFeed — Atom", () => {
  const feed = parseFeed(fixture("atom.xml"));

  it("uses the alternate link, not self or enclosure", () => {
    expect(feed.title).toBe("Rust Blog");
    expect(feed.entries[0].link).toBe("https://blog.rust-lang.test/2026/09/16/Rust-1.99.html");
    expect(feed.entries[0].imageUrl).toBe("https://blog.rust-lang.test/hero.png");
  });

  it("falls back to a bare <link href> and <content>", () => {
    expect(feed.entries[1].link).toBe("https://blog.rust-lang.test/2026/08/01/older.html");
    expect(feed.entries[1].summary).toBe("Body via content.");
    expect(feed.entries[1].publishedAt?.toISOString()).toBe("2026-08-01T10:00:00.000Z");
  });

  it("reads updated when published is absent and unescapes html summaries", () => {
    expect(feed.entries[0].publishedAt?.toISOString()).toBe("2026-09-16T10:00:00.000Z");
    expect(feed.entries[0].summary).toBe("The Rust team is happy to announce");
  });
});

describe("parseFeed — Google News query feed", () => {
  it("takes the publisher from <source> and strips the ' - Publisher' headline suffix", () => {
    const feed = parseFeed(fixture("google-news.xml"));
    expect(feed.entries[0].publisher).toBe("Reuters");
    expect(feed.entries[0].title).toBe("Chile lithium output hits record");
    expect(feed.entries[0].link).toBe("https://news.google.com/rss/articles/CBMiabc?oc=5");
  });
});

describe("parseFeed — rejects non-feeds", () => {
  it("throws on HTML", () => {
    expect(() => parseFeed("<!doctype html><html><body>nope</body></html>")).toThrow(FeedParseError);
  });
  it("throws on empty input", () => {
    expect(() => parseFeed("")).toThrow(FeedParseError);
  });
  it("returns an empty feed for a valid channel with no items", () => {
    const feed = parseFeed('<rss version="2.0"><channel><title>Quiet</title></channel></rss>');
    expect(feed.entries).toEqual([]);
  });
});

describe("stripHtml", () => {
  it("removes tags, decodes entities and collapses whitespace", () => {
    expect(stripHtml("<p>a &amp; b</p>\n\n  <br/>c&#39;s")).toBe("a & b c's");
  });
});

describe("parseFeed — sloppy real-world XML", () => {
  const feed = parseFeed(fixture("sloppy.xml"));

  it("reads a title that wraps its text in an unescaped <a> element", () => {
    expect(feed.entries[0].title).toBe("Artelo’s ex-AstraZeneca cannabinoid agonist holds its own");
    expect(feed.entries[1].title).toBe("Plain title with emphasis inside");
  });

  it("parses a 'Sep 18, 2026 2:24pm' style date and a day-first RFC one", () => {
    expect(feed.entries[0].publishedAt?.toISOString()).toBe("2026-09-18T14:24:00.000Z");
    expect(feed.entries[1].publishedAt?.toISOString()).toBe("2026-09-18T09:05:00.000Z");
  });

  it("flattens nested markup in descriptions to text", () => {
    expect(feed.entries[1].summary).toBe("Nested markup in the body");
  });
});
