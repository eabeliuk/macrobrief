import type { PlanId } from "./plans";

/**
 * Plan ⇄ Stripe price, and what a subscription status means for the plan.
 * Pure so the webhook's decisions are testable without Stripe.
 */

export type PaidPlan = Exclude<PlanId, "FREE">;
export type PriceCatalog = Record<PaidPlan, string>;

export const PAID_PLANS: PaidPlan[] = ["STARTER", "PRO", "MAX"];

export function planForPriceId(priceId: string | null | undefined, catalog: PriceCatalog): PaidPlan | null {
  if (!priceId) return null;
  for (const plan of PAID_PLANS) if (catalog[plan] && catalog[plan] === priceId) return plan;
  return null;
}

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

/**
 * `past_due` keeps the plan: Stripe is retrying the card and the reader has
 * not decided anything. Everything terminal drops to free. An unknown price
 * (a product edited in the dashboard) changes nothing rather than guessing.
 */
export function planFromSubscription(
  sub: { status: SubscriptionStatus | string; priceId: string | null },
  catalog: PriceCatalog,
  current: PlanId,
): PlanId {
  switch (sub.status) {
    case "active":
    case "trialing":
      return planForPriceId(sub.priceId, catalog) ?? current;
    case "past_due":
    case "incomplete":
      return current;
    default:
      return "FREE";
  }
}
