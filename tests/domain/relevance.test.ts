import { describe, expect, it } from "vitest";

import { canonicalLink, isRelevant, queryTerms } from "@/lib/domain/relevance";

describe("queryTerms", () => {
  it("keeps the significant words of a query, lowercased and de-accented, dropping operators and stopwords", () => {
    expect(queryTerms("lithium OR copper mining Chile")).toEqual(["lithium", "copper", "mining", "chile"]);
    // "política"/"policy" are too generic to gate on — any policy story would pass.
    expect(queryTerms("Política del litio en Chile")).toEqual(["litio", "chile"]);
  });
});

describe("isRelevant", () => {
  const terms = queryTerms("Chilean lithium policy");
  it("accepts an item that mentions a query term in the title or summary", () => {
    expect(isRelevant({ title: "Codelco signs lithium pact", summary: null }, terms)).toBe(true);
    expect(isRelevant({ title: "Mining roundup", summary: "…the Chilean royalty bill…" }, terms)).toBe(true);
  });
  it("rejects an item that mentions none", () => {
    expect(isRelevant({ title: "Lundin Gold tax fight tests Ecuador", summary: "Ecuador's tax authority…" }, terms)).toBe(false);
  });
  it("matches word stems so 'Chile' finds 'Chilean' and 'lithium' finds 'lithium-ion'", () => {
    expect(isRelevant({ title: "Chile's salt flats", summary: null }, queryTerms("Chilean lithium"))).toBe(true);
  });
  it("accepts everything when the query has no usable terms", () => {
    expect(isRelevant({ title: "anything", summary: null }, [])).toBe(true);
  });
});

describe("canonicalLink", () => {
  it("unwraps Bing's apiclick redirect to the publisher URL", () => {
    const wrapped = "http://www.bing.com/news/apiclick.aspx?ref=FexRss&aid=&tid=abc&url=https%3a%2f%2fexample.com%2fstory%2f&c=1&mkt=en-us";
    expect(canonicalLink(wrapped)).toBe("https://example.com/story/");
  });
  it("leaves other links alone, including Google's opaque ones", () => {
    expect(canonicalLink("https://news.google.com/rss/articles/CBMi?oc=5")).toBe("https://news.google.com/rss/articles/CBMi?oc=5");
    expect(canonicalLink("https://example.com/a")).toBe("https://example.com/a");
  });
  it("ignores a bing url param that is not http(s)", () => {
    expect(canonicalLink("https://www.bing.com/news/apiclick.aspx?url=javascript%3Aalert(1)")).toBe("https://www.bing.com/news/apiclick.aspx?url=javascript%3Aalert(1)");
  });
});
