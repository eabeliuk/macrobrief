import { describe, expect, it } from "vitest";

import { isGoogleNewsLink } from "@/lib/google-news";

describe("isGoogleNewsLink", () => {
  it("recognises RSS and non-RSS article links and nothing else", () => {
    expect(isGoogleNewsLink("https://news.google.com/rss/articles/CBMiabc?oc=5")).toBe(true);
    expect(isGoogleNewsLink("https://news.google.com/articles/CBMiabc")).toBe(true);
    expect(isGoogleNewsLink("https://news.google.com/rss/search?q=x")).toBe(false);
    expect(isGoogleNewsLink("https://example.com/articles/1")).toBe(false);
    expect(isGoogleNewsLink("not a url")).toBe(false);
  });
});
