import { describe, expect, it } from "vitest";

import { PLANS, cadenceAllowed, canAddTopic, channelAllowed, effectiveDelivery } from "@/lib/domain/plans";

describe("plans", () => {
  it("prices the four tiers as designed", () => {
    expect(Object.values(PLANS).map((p) => p.priceUsd)).toEqual([0, 5, 12, 29]);
  });

  it("caps topics per plan", () => {
    expect(canAddTopic("FREE", 0)).toBe(true);
    expect(canAddTopic("FREE", 1)).toBe(false);
    expect(canAddTopic("STARTER", 2)).toBe(true);
    expect(canAddTopic("STARTER", 3)).toBe(false);
    expect(canAddTopic("MAX", 29)).toBe(true);
  });

  it("gates cadence: free is weekly only, twice-daily is Max only", () => {
    expect(cadenceAllowed("FREE", "DAILY")).toBe(false);
    expect(cadenceAllowed("STARTER", "DAILY")).toBe(true);
    expect(cadenceAllowed("PRO", "TWICE_DAILY")).toBe(false);
    expect(cadenceAllowed("MAX", "TWICE_DAILY")).toBe(true);
  });

  it("gates channels: audio and WhatsApp from Pro, Instagram at Max", () => {
    expect(channelAllowed("FREE", "EMAIL")).toBe(true);
    expect(channelAllowed("FREE", "TEXT")).toBe(false);
    expect(channelAllowed("STARTER", "AUDIO")).toBe(false);
    expect(channelAllowed("PRO", "WHATSAPP")).toBe(true);
    expect(channelAllowed("PRO", "INSTAGRAM")).toBe(false);
    expect(channelAllowed("MAX", "INSTAGRAM")).toBe(true);
  });

  it("clamps a downgraded user's settings to what the plan allows instead of failing", () => {
    expect(effectiveDelivery("FREE", { cadence: "DAILY", channels: ["EMAIL", "WHATSAPP"] })).toEqual({
      cadence: "WEEKLY",
      channels: ["EMAIL"],
    });
    expect(effectiveDelivery("PRO", { cadence: "TWICE_DAILY", channels: ["WHATSAPP"] })).toEqual({
      cadence: "DAILY",
      channels: ["WHATSAPP"],
    });
  });
});
