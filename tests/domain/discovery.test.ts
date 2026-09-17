import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { discoverFeedLinks, looksLikeFeed, queryFeedUrls } from "@/lib/domain/discovery";

describe("queryFeedUrls", () => {
  it("builds a Google News and a Bing News search feed for the query, restricted to the past week", () => {
    const urls = queryFeedUrls("lithium chile", "en");
    expect(urls.map((u) => u.kind)).toEqual(["GOOGLE_NEWS", "BING_NEWS"]);
    expect(urls[0].url).toBe(
      "https://news.google.com/rss/search?q=lithium%20chile%20when%3A7d&hl=en-US&gl=US&ceid=US%3Aen",
    );
    expect(urls[1].url).toBe(
      "https://www.bing.com/news/search?q=lithium%20chile&format=rss&qft=interval%3D%228%22",
    );
  });

  it("localises Google News for Spanish", () => {
    expect(queryFeedUrls("litio", "es")[0].url).toContain("hl=es-419&gl=US&ceid=US%3Aes-419");
  });

  it("trims and collapses whitespace so the same topic yields the same URL", () => {
    expect(queryFeedUrls("  lithium   chile ", "en")[0].url).toBe(queryFeedUrls("lithium chile", "en")[0].url);
  });
});

describe("discoverFeedLinks", () => {
  it("finds rel=alternate feed links, resolves relative hrefs, and ignores stylesheets", () => {
    const html = readFileSync(path.join(__dirname, "..", "fixtures", "homepage.html"), "utf8");
    expect(discoverFeedLinks(html, "https://example-times.test/news/")).toEqual([
      "https://example-times.test/feed/",
      "https://example-times.test/atom.xml",
      "https://cdn.example-times.test/comments.rss",
    ]);
  });

  it("returns nothing for a page without feed links", () => {
    expect(discoverFeedLinks("<html><head></head></html>", "https://x.test")).toEqual([]);
  });
});

describe("looksLikeFeed", () => {
  it("accepts xml content types and xml-looking bodies", () => {
    expect(looksLikeFeed("application/rss+xml; charset=utf-8", "")).toBe(true);
    expect(looksLikeFeed("text/html", '<?xml version="1.0"?><rss>')).toBe(true);
    expect(looksLikeFeed("text/html", "<feed xmlns=\"http://www.w3.org/2005/Atom\">")).toBe(true);
  });
  it("rejects html", () => {
    expect(looksLikeFeed("text/html", "<!doctype html><html>")).toBe(false);
  });
});
