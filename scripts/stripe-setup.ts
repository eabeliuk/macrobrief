/**
 * One-time: create the three paid plans as Stripe products + monthly prices
 * and print the ids to put in STRIPE_PRICE_STARTER / PRO / MAX.
 *
 *   STRIPE_SECRET_KEY=sk_… npx tsx scripts/stripe-setup.ts
 *
 * Idempotent by lookup_key: re-running finds the existing prices.
 */
import Stripe from "stripe";

import { PAID_PLANS } from "../src/lib/domain/billing";
import { PLANS } from "../src/lib/domain/plans";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  const stripe = new Stripe(key);

  for (const id of PAID_PLANS) {
    const plan = PLANS[id];
    const lookupKey = `macrobrief_${id.toLowerCase()}_monthly`;
    const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    if (existing.data[0]) {
      console.log(`STRIPE_PRICE_${id}=${existing.data[0].id}  (existing)`);
      continue;
    }
    const product = await stripe.products.create({
      name: `MacroBrief ${plan.name}`,
      description: plan.blurb,
      metadata: { plan: id },
    });
    const price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: plan.priceUsd * 100,
      recurring: { interval: "month" },
      lookup_key: lookupKey,
      metadata: { plan: id },
    });
    console.log(`STRIPE_PRICE_${id}=${price.id}`);
  }
  console.log("\nWebhook endpoint: <site>/api/stripe/webhook — events: checkout.session.completed, customer.subscription.created/updated/deleted");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
