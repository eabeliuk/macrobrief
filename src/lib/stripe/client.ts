import Stripe from "stripe";

import type { PriceCatalog } from "@/lib/domain/billing";

/**
 * Money is the one integration the app refuses to fake: unconfigured, every
 * call throws with a message that says so, and the billing page says
 * "not configured" instead of showing a button that does nothing.
 */

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured — set STRIPE_SECRET_KEY.");
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

/** Price ids come from the environment; `scripts/stripe-setup.ts` creates them. */
export function priceCatalog(): PriceCatalog {
  return {
    STARTER: process.env.STRIPE_PRICE_STARTER ?? "",
    PRO: process.env.STRIPE_PRICE_PRO ?? "",
    MAX: process.env.STRIPE_PRICE_MAX ?? "",
  };
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.AUTH_URL || "http://localhost:3000";
}
