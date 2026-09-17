import { describe, expect, it } from "vitest";

import { codeMatches, newCode, needsVerification } from "@/lib/domain/verification";

describe("needsVerification", () => {
  it("does not challenge the account's own email or the in-app audio channel", () => {
    expect(needsVerification("EMAIL", "Me@Example.com", "me@example.com")).toBe(false);
    expect(needsVerification("AUDIO", "app", "me@example.com")).toBe(false);
  });
  it("challenges any other email and every phone or handle", () => {
    expect(needsVerification("EMAIL", "boss@example.com", "me@example.com")).toBe(true);
    expect(needsVerification("WHATSAPP", "+56912345678", "me@example.com")).toBe(true);
    expect(needsVerification("INSTAGRAM", "@me", "me@example.com")).toBe(true);
  });
});

describe("codes", () => {
  it("issues six digits", () => {
    expect(newCode()).toMatch(/^\d{6}$/);
  });
  it("matches only the exact code before expiry, ignoring spaces", () => {
    const now = new Date("2026-09-17T10:00:00Z");
    const later = new Date("2026-09-17T10:15:00Z");
    expect(codeMatches("123 456", "123456", later, now)).toBe(true);
    expect(codeMatches("123457", "123456", later, now)).toBe(false);
    expect(codeMatches("123456", "123456", now, later)).toBe(false); // expired
    expect(codeMatches("123456", null, later, now)).toBe(false);
  });
});
