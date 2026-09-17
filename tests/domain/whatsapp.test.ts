import { describe, expect, it } from "vitest";

import { normalizeE164, whatsappText } from "@/lib/domain/whatsapp";

const composed = {
  title: "MacroBrief — Thu 17 Sep",
  intro: "Two things moved.",
  sections: [
    {
      topicId: "t1",
      heading: "Chilean lithium",
      stories: [
        { headline: "Output hits a record", summary: "long…", link: "https://x.test/a", publisher: "Reuters" },
        { headline: "Royalty bill advances", summary: "long…", link: "https://x.test/b", publisher: null },
      ],
    },
    { topicId: "t2", heading: "Rust", stories: [] },
  ],
};

describe("whatsappText", () => {
  it("is a short digest: title, intro, topic headings with headlines, and one link to the full brief", () => {
    const text = whatsappText(composed, "https://macrobrief.com/app/briefs/1", 1600);
    expect(text.startsWith("*MacroBrief — Thu 17 Sep*")).toBe(true);
    expect(text).toContain("Two things moved.");
    expect(text).toContain("*Chilean lithium*");
    expect(text).toContain("• Output hits a record (Reuters)");
    expect(text).toContain("• Royalty bill advances");
    expect(text).toContain("*Rust* — nothing new");
    expect(text.trimEnd().endsWith("https://macrobrief.com/app/briefs/1")).toBe(true);
    expect(text).not.toContain("https://x.test");
  });
  it("stays under the limit by dropping headlines before the link", () => {
    const many = { ...composed, sections: [{ ...composed.sections[0], stories: Array.from({ length: 40 }, (_, i) => ({ headline: `Story ${i} ${"x".repeat(60)}`, summary: "", link: `https://x.test/${i}`, publisher: null })) }] };
    const text = whatsappText(many, "https://macrobrief.com/app/briefs/1", 600);
    expect(text.length).toBeLessThanOrEqual(600);
    expect(text.trimEnd().endsWith("https://macrobrief.com/app/briefs/1")).toBe(true);
  });
});

describe("normalizeE164", () => {
  it("keeps digits and a leading plus, adding the plus when missing", () => {
    expect(normalizeE164("+56 9 1234 5678")).toBe("+56912345678");
    expect(normalizeE164("(415) 555-0100")).toBeNull(); // no country code
    expect(normalizeE164("1 415 555 0100")).toBe("+14155550100");
    expect(normalizeE164("whatsapp:+14155550100")).toBe("+14155550100");
  });
  it("rejects garbage and impossible lengths", () => {
    expect(normalizeE164("hello")).toBeNull();
    expect(normalizeE164("+12")).toBeNull();
    expect(normalizeE164("+1234567890123456")).toBeNull();
  });
});
