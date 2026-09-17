import type { User } from "@prisma/client";

import type { PaidPlan } from "@/lib/domain/billing";
import { prisma } from "@/lib/prisma";
import { priceCatalog, siteUrl, stripe } from "@/lib/stripe/client";

/**
 * One Stripe customer per user, created on first checkout and remembered, so
 * the portal and every later subscription hang off the same record.
 */
async function customerFor(user: User): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe().customers.create({
    email: user.email ?? undefined,
    name: user.name ?? undefined,
    metadata: { macrobriefUserId: user.id },
  });
  await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/** A Checkout URL for `plan`, or a reason it cannot be offered. */
export async function checkoutUrl(user: User, plan: PaidPlan): Promise<string> {
  const price = priceCatalog()[plan];
  if (!price) throw new Error(`No Stripe price configured for ${plan}.`);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: await customerFor(user),
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${siteUrl()}/app/billing?checkout=success`,
    cancel_url: `${siteUrl()}/app/billing?checkout=cancelled`,
    client_reference_id: user.id,
    metadata: { macrobriefUserId: user.id, plan },
    subscription_data: { metadata: { macrobriefUserId: user.id, plan } },
  });
  if (!session.url) throw new Error("Stripe returned no checkout URL.");
  return session.url;
}

/** The customer portal: change plan, update card, cancel. */
export async function portalUrl(user: User): Promise<string> {
  const session = await stripe().billingPortal.sessions.create({
    customer: await customerFor(user),
    return_url: `${siteUrl()}/app/billing`,
  });
  return session.url;
}
