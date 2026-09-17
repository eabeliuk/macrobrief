import { describe, expect, it } from "vitest";

import { planForPriceId, planFromSubscription, type PriceCatalog } from "@/lib/domain/billing";

const catalog: PriceCatalog = { STARTER: "price_s", PRO: "price_p", MAX: "price_m" };

describe("planForPriceId", () => {
  it("maps a known price to its plan and anything else to null", () => {
    expect(planForPriceId("price_p", catalog)).toBe("PRO");
    expect(planForPriceId("price_nope", catalog)).toBeNull();
    expect(planForPriceId(null, catalog)).toBeNull();
  });
  it("ignores unset catalog entries so an empty env var never matches an empty price", () => {
    expect(planForPriceId("", { STARTER: "", PRO: "price_p", MAX: "" })).toBeNull();
  });
});

describe("planFromSubscription", () => {
  it("grants the plan while the subscription is active or trialing", () => {
    expect(planFromSubscription({ status: "active", priceId: "price_m" }, catalog, "FREE")).toBe("MAX");
    expect(planFromSubscription({ status: "trialing", priceId: "price_s" }, catalog, "FREE")).toBe("STARTER");
  });
  it("keeps the current plan through past_due (Stripe is still retrying the card)", () => {
    expect(planFromSubscription({ status: "past_due", priceId: "price_p" }, catalog, "PRO")).toBe("PRO");
  });
  it("drops to free when the subscription ends", () => {
    for (const status of ["canceled", "unpaid", "incomplete_expired"] as const) {
      expect(planFromSubscription({ status, priceId: "price_p" }, catalog, "PRO")).toBe("FREE");
    }
  });
  it("does not change the plan for a price it does not recognise", () => {
    expect(planFromSubscription({ status: "active", priceId: "price_other" }, catalog, "STARTER")).toBe("STARTER");
  });
});
