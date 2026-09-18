import { describe, expect, it } from "vitest";

import { audioScript, audioSegments, chunkScript, minutesLabel, mp3Seconds, readingSeconds, ssmlChunks } from "@/lib/domain/audio";

const composed = {
  title: "MacroBrief: Chilean lithium, Rust",
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
  it("signposts each topic and numbers the stories so a listener hears the boundaries", () => {
    expect(script).toContain("2 stories on Chilean lithium.");
    expect(script).toContain("Story 1 of 2. Output hits a record, from Reuters. SQM reported record volumes.");
    expect(script).toContain("Story 2 of 2. Royalty bill advances. The senate voted 30–10.");
    expect(script).toContain("Next topic. Rust. Nothing new this period.");
    expect(script).not.toContain("Next topic. 2 stories"); // never before the first topic
    expect(script.trimEnd().endsWith("That's your brief.")).toBe(true);
  });
  it("reads the title as speech, never a URL or bullet", () => {
    expect(script.startsWith("MacroBrief. Chilean lithium, Rust. Two things moved.")).toBe(true);
    expect(script).not.toMatch(/https?:\/\//);
    expect(script).not.toContain("•");
  });
  it("speaks the signposts in the brief's language", () => {
    const es = audioScript(composed, "es");
    expect(es).toContain("2 noticias sobre Chilean lithium.");
    expect(es).toContain("Noticia 1 de 2.");
    expect(es).toContain("Siguiente tema.");
    expect(es).toContain("de Reuters");
    expect(es.trimEnd().endsWith("Ese fue tu resumen.")).toBe(true);
  });
});

describe("audioSegments (SSML)", () => {
  const segs = audioSegments(composed);
  it("puts silence before every story and longer silence before every topic", () => {
    expect(segs[1].ssml.startsWith('<break time="1400ms"/>')).toBe(true); // topic
    expect(segs[2].ssml.startsWith('<break time="900ms"/>')).toBe(true); // story
    expect(segs[2].ssml).toContain('<break time="450ms"/>'); // headline → summary
  });
  it("escapes markup-significant characters", () => {
    const s = audioSegments({ title: "A & B <c>", sections: [] });
    expect(s[0].ssml).toContain("A &amp; B &lt;c&gt;");
  });
});

describe("ssmlChunks", () => {
  it("wraps everything in one <speak> when it fits and never splits a story", () => {
    const segs = audioSegments(composed);
    const one = ssmlChunks(segs, 5000);
    expect(one).toHaveLength(1);
    expect(one[0].startsWith("<speak>") && one[0].endsWith("</speak>")).toBe(true);
    const many = ssmlChunks(segs, 260);
    expect(many.length).toBeGreaterThan(1);
    for (const c of many) expect(c.startsWith("<speak>") && c.endsWith("</speak>")).toBe(true);
    expect(many.join("")).toContain("Story 2 of 2.");
  });
});

describe("chunkScript", () => {
  it("still splits plain text on paragraph boundaries under the limit", () => {
    const para = "A".repeat(60) + ".";
    expect(chunkScript([para, para, para].join("\n\n"), 130)).toHaveLength(2);
  });
});

describe("length labels", () => {
  it("rounds audio seconds up to whole minutes, never below one", () => {
    expect(minutesLabel(49)).toBe("1 min");
    expect(minutesLabel(61)).toBe("2 min");
    expect(minutesLabel(300)).toBe("5 min");
  });
  it("estimates reading time from the text at ~200 words a minute", () => {
    expect(readingSeconds("word ".repeat(200))).toBe(60);
    expect(readingSeconds("")).toBe(0);
  });
  it("derives audio duration from Google's constant-bitrate MP3", () => {
    expect(mp3Seconds(399360)).toBe(50); // measured: 399,360 bytes ↔ 49.9 s
  });
});
