import { describe, expect, it } from "vitest";

import { audioScript, chunkScript } from "@/lib/domain/audio";

const composed = {
  title: "MacroBrief — Thursday 17 September",
  intro: "Two things moved.",
  sections: [
    {
      topicId: "t1",
      heading: "Chilean lithium",
      stories: [
        { headline: "Output hits a record", summary: "SQM reported record volumes.", link: "https://x.test/a", publisher: "Reuters" },
        { headline: "Royalty bill advances", summary: "The senate voted 30–10.", link: "https://x.test/b", publisher: null },
      ],
    },
    { topicId: "t2", heading: "Rust", stories: [] },
  ],
};

describe("audioScript", () => {
  const script = audioScript(composed);
  it("reads the title, intro, each topic and its stories, and never a URL or bullet", () => {
    expect(script).toContain("MacroBrief — Thursday 17 September.");
    expect(script).toContain("Two things moved.");
    expect(script).toContain("Chilean lithium.");
    expect(script).toContain("Output hits a record, from Reuters. SQM reported record volumes.");
    expect(script).toContain("Royalty bill advances. The senate voted 30–10.");
    expect(script).not.toMatch(/https?:\/\//);
    expect(script).not.toContain("•");
  });
  it("says so when a topic has nothing", () => {
    expect(script).toContain("Rust. Nothing new this period.");
  });
  it("closes with a sign-off", () => {
    expect(script.trimEnd().endsWith("That's your brief.")).toBe(true);
  });
});

describe("chunkScript", () => {
  it("returns one chunk for a short script", () => {
    expect(chunkScript("Hello.", 100)).toEqual(["Hello."]);
  });
  it("splits on paragraph boundaries under the limit and never cuts a paragraph", () => {
    const para = "A".repeat(60) + ".";
    const chunks = chunkScript([para, para, para].join("\n\n"), 130);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(`${para}\n\n${para}`);
    expect(chunks[1]).toBe(para);
  });
  it("hard-splits a single paragraph longer than the limit at a sentence end", () => {
    const long = "One sentence here. ".repeat(20).trim();
    for (const c of chunkScript(long, 100)) expect(c.length).toBeLessThanOrEqual(100);
  });
});
