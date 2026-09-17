import { describe, expect, it } from "vitest";

import { normalizeHeadline, publisherTier, rankGroups, rankItems } from "@/lib/domain/ranking";

type Fake = { id: string; title: string; publisher: string | null; publishedAt: Date };
const at = (iso: string) => new Date(iso);
const item = (id: string, title: string, publisher: string | null, iso: string): Fake => ({
  id,
  title,
  publisher,
  publishedAt: at(iso),
});

describe("publisherTier", () => {
  it("maps wire services and papers of record to tier 1", () => {
    expect(publisherTier("Reuters")).toBe(1);
    expect(publisherTier("The New York Times")).toBe(1);
    expect(publisherTier("BBC News")).toBe(1);
  });
  it("maps solid second-tier outlets to 2 and everything else to 3", () => {
    expect(publisherTier("TechCrunch")).toBe(2);
    expect(publisherTier("Random Aggregator")).toBe(3);
    expect(publisherTier(null)).toBe(3);
  });
});

describe("normalizeHeadline", () => {
  it("lowercases, strips punctuation, collapses whitespace and truncates", () => {
    expect(normalizeHeadline("  Apple Posts RECORD Q4 -- Revenue!  ")).toBe("apple posts record q4 revenue");
    expect(normalizeHeadline("x".repeat(200))).toHaveLength(80);
    expect(normalizeHeadline("")).toBe("");
  });
});

describe("rankGroups", () => {
  it("collapses the same headline from several publishers into one group and picks the best-tier canonical", () => {
    const groups = rankGroups([
      item("a", "Chile lithium output hits record", "Some Blog", "2026-09-17T08:00:00Z"),
      item("b", "Chile lithium output hits record", "Reuters", "2026-09-17T06:00:00Z"),
      item("c", "Chile Lithium Output Hits Record!", "Bloomberg", "2026-09-17T07:00:00Z"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(3);
    // Reuters and Bloomberg are both tier 1; newest of the two wins.
    expect(groups[0].canonical.id).toBe("c");
    expect(groups[0].bestTier).toBe(1);
  });

  it("scores a single tier-1 story above five tier-3 duplicates", () => {
    const dupes = ["p1", "p2", "p3", "p4", "p5"].map((p, i) =>
      item(`d${i}`, "Minor story everyone reprinted", p, "2026-09-17T05:00:00Z"),
    );
    const groups = rankGroups([item("r", "Exclusive scoop", "Reuters", "2026-09-17T04:00:00Z"), ...dupes]);
    expect(groups[0].canonical.id).toBe("r");
  });

  it("does not merge unrelated untitled items", () => {
    const groups = rankGroups([
      item("u1", "", null, "2026-09-17T05:00:00Z"),
      item("u2", "", null, "2026-09-17T06:00:00Z"),
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe("rankItems", () => {
  it("returns at most maxN canonical items, best first", () => {
    const picked = rankItems(
      [
        item("a", "One", "Reuters", "2026-09-17T01:00:00Z"),
        item("b", "Two", "Blog", "2026-09-17T02:00:00Z"),
        item("c", "Three", "TechCrunch", "2026-09-17T03:00:00Z"),
      ],
      2,
    );
    expect(picked.map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("spreads tied picks across the window instead of clustering at one end", () => {
    // Six tier-3 singletons, all tied; two are at the far end of the window.
    const items = [
      item("t1", "s1", null, "2026-09-10T00:00:00Z"),
      item("t2", "s2", null, "2026-09-10T01:00:00Z"),
      item("t3", "s3", null, "2026-09-10T02:00:00Z"),
      item("t4", "s4", null, "2026-09-10T03:00:00Z"),
      item("t5", "s5", null, "2026-09-16T22:00:00Z"),
      item("t6", "s6", null, "2026-09-16T23:00:00Z"),
    ];
    const picked = rankItems(items, 2).map((p) => p.id);
    expect(picked).toContain("t6");
    expect(picked.some((id) => ["t1", "t2", "t3", "t4"].includes(id))).toBe(true);
  });

  it("is a no-op below the cap", () => {
    expect(rankItems([], 5)).toEqual([]);
  });
});

describe("rankGroups — reader affinity", () => {
  it("lifts a publisher the reader keeps opening, but not past a tier above", () => {
    const items = [
      item("blog", "Story A", "Small Blog", "2026-09-17T05:00:00Z"),
      item("cnbc", "Story B", "CNBC", "2026-09-17T05:00:00Z"),
      item("reuters", "Story C", "Reuters", "2026-09-17T05:00:00Z"),
    ];
    const plain = rankGroups(items).map((g) => g.canonical.id);
    expect(plain).toEqual(["reuters", "cnbc", "blog"]);
    // The reader opens Small Blog every time: it overtakes CNBC (tier 2) but not Reuters (tier 1).
    const boosted = rankGroups(items, { affinity: (p) => (p === "Small Blog" ? 1 : 0) }).map((g) => g.canonical.id);
    expect(boosted).toEqual(["reuters", "blog", "cnbc"]);
  });
});
