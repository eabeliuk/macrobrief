import { describe, expect, it } from "vitest";

import { briefTitle, buildPrompt, renderHtml, renderMarkdown, renderText, type Composed } from "@/lib/domain/brief";

const composed: Composed = {
  title: "Your brief — Thursday 17 Sep",
  intro: "Two things moved this week.",
  sections: [
    {
      topicId: "t1",
      heading: "Chilean lithium",
      stories: [
        {
          headline: "Output hits a record",
          summary: "SQM and Albemarle both reported record Q3 volumes as spot prices firmed.",
          link: "https://reuters.test/a",
          publisher: "Reuters",
        },
      ],
    },
    { topicId: "t2", heading: "Rust", stories: [] },
  ],
};

describe("renderText", () => {
  it("writes a plain-text brief readable in any client, with links on their own line", () => {
    const text = renderText(composed);
    expect(text).toContain("YOUR BRIEF — THURSDAY 17 SEP");
    expect(text).toContain("Two things moved this week.");
    expect(text).toContain("CHILEAN LITHIUM");
    expect(text).toContain("• Output hits a record (Reuters)");
    expect(text).toContain("  SQM and Albemarle");
    expect(text).toContain("  https://reuters.test/a");
    expect(text).toContain("RUST\n  Nothing new this period.");
    expect(text).not.toMatch(/<[a-z]+>/);
  });
});

describe("renderMarkdown", () => {
  it("links headlines and keeps the section order", () => {
    const md = renderMarkdown(composed);
    expect(md).toContain("## Chilean lithium");
    expect(md).toContain("**[Output hits a record](https://reuters.test/a)** — Reuters");
    expect(md.indexOf("## Chilean lithium")).toBeLessThan(md.indexOf("## Rust"));
  });
});

describe("buildPrompt", () => {
  const input = {
    periodLabel: "the last 24 hours",
    lang: "en",
    topics: [
      {
        topicId: "t1",
        name: "Chilean lithium",
        query: "lithium chile",
        storiesWanted: 3,
        items: [
          {
            id: "i1",
            title: "Output hits a record",
            summary: "Record Q3.",
            link: "https://reuters.test/a",
            publisher: "Reuters",
            publishedAt: new Date("2026-09-17T06:00:00Z"),
          },
        ],
      },
    ],
  };

  it("is deterministic for the same input (prompt caching depends on it)", () => {
    expect(buildPrompt(input)).toBe(buildPrompt(input));
  });

  it("numbers items per topic and tells the model how many stories to pick", () => {
    const prompt = buildPrompt(input);
    expect(prompt).toContain("# Topic t1: Chilean lithium");
    expect(prompt).toContain("Pick up to 3 stories");
    expect(prompt).toContain("[i1] Output hits a record — Reuters (2026-09-17)");
    expect(prompt).toContain("https://reuters.test/a");
  });

  it("truncates long item summaries so one verbose feed cannot flood the context", () => {
    const long = { ...input, topics: [{ ...input.topics[0], items: [{ ...input.topics[0].items[0], summary: "x".repeat(5000) }] }] };
    expect(buildPrompt(long).length).toBeLessThan(2000);
  });
});

describe("renderHtml", () => {
  it("escapes model output so a headline cannot inject markup into the email", () => {
    const html = renderHtml({
      title: "T <script>",
      sections: [
        {
          topicId: "t",
          heading: "H & co",
          stories: [{ headline: "<b>x</b>", summary: "a < b", link: "https://x.test/?a=1&b=2", publisher: null }],
        },
      ],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("T &lt;script&gt;");
    expect(html).toContain("H &amp; co");
    expect(html).toContain('href="https://x.test/?a=1&amp;b=2"');
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("refuses non-http links rather than rendering them", () => {
    const html = renderHtml({
      title: "T",
      sections: [{ topicId: "t", heading: "H", stories: [{ headline: "x", summary: "y", link: "javascript:alert(1)", publisher: null }] }],
    });
    expect(html).not.toContain("javascript:");
  });
});

describe("renderHtml — link mapping", () => {
  it("routes story links through the mapper but never maps an unsafe link into existence", () => {
    const html = renderHtml(
      {
        title: "T",
        sections: [{ topicId: "t", heading: "H", stories: [
          { headline: "ok", summary: "s", link: "https://x.test/a", publisher: null },
          { headline: "bad", summary: "s", link: "javascript:alert(1)", publisher: null },
        ] }],
      },
      { linkFor: (u) => `https://t.test/r?to=${encodeURIComponent(u)}` },
    );
    expect(html).toContain('href="https://t.test/r?to=https%3A%2F%2Fx.test%2Fa"');
    expect(html).not.toContain("javascript");
    expect(html).not.toContain("to=javascript");
  });
});

describe("renderText — link mapping", () => {
  it("substitutes the caller's link per story", () => {
    const text = renderText(composed, { linkFor: (s) => `https://macrobrief.com/l/${s.itemId ?? "x"}` });
    expect(text).toContain("  https://macrobrief.com/l/x");
    expect(text).not.toContain("reuters.test");
  });
});

describe("briefTitle", () => {
  it("names the brief after its topics, 'MacroBrief: Topic'", () => {
    expect(briefTitle(["Chilean lithium"])).toBe("MacroBrief: Chilean lithium");
    expect(briefTitle(["Chilean lithium", "Rust"])).toBe("MacroBrief: Chilean lithium, Rust");
  });
  it("keeps a long list readable", () => {
    const names = ["Alpha topic", "Beta topic", "Gamma topic", "Delta topic", "Epsilon topic", "Zeta topic", "Eta topic", "Theta topic"];
    const t = briefTitle(names);
    expect(t.length).toBeLessThanOrEqual(90);
    expect(t.endsWith("…")).toBe(true);
  });
});
