import { describe, expect, it } from "vitest";

import { isAudioSpeed, voiceFor } from "@/lib/domain/voices";

describe("voiceFor", () => {
  it("picks the Neural2 voice for the language and gender, male by default", () => {
    expect(voiceFor("en", "MALE")).toEqual({ languageCode: "en-US", name: "en-US-Neural2-J" });
    expect(voiceFor("en", "FEMALE")).toEqual({ languageCode: "en-US", name: "en-US-Neural2-F" });
    expect(voiceFor("es", "MALE")).toEqual({ languageCode: "es-US", name: "es-US-Neural2-B" });
    expect(voiceFor("pt", "FEMALE")).toEqual({ languageCode: "pt-BR", name: "pt-BR-Neural2-A" });
    expect(voiceFor("fr", "MALE").name).toBe("fr-FR-Neural2-G");
    expect(voiceFor("de", "FEMALE").name).toBe("de-DE-Neural2-G");
  });
  it("falls back to English for a language without a voice", () => {
    expect(voiceFor("xx", "MALE").name).toBe("en-US-Neural2-J");
  });
});

describe("isAudioSpeed", () => {
  it("accepts only the offered rates", () => {
    expect([1, 1.2, 1.5, 2].every(isAudioSpeed)).toBe(true);
    expect([0.5, 1.1, 3, NaN].some(isAudioSpeed)).toBe(false);
  });
});
