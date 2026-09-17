import type Stripe from "stripe";

import { planFromSubscription } from "@/lib/domain/billing";
import { prisma } from "@/lib/prisma";
import { priceCatalog, stripe } from "@/lib/stripe/client";

/**
 * Everything Stripe tells us, applied exactly once. Stripe redelivers, so
 * each event is claimed in `WebhookEvent` before it is applied.
 *
 * The plan is derived from the subscription object every time — never from
 * what we think we sold. If someone changes plan in the portal, the next
 * `customer.subscription.updated` carries the new price and this reads it.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<{ applied: boolean; note?: string }> {
  // skipDuplicates: a redelivery claims nothing and logs nothing.
  const claimed = await prisma.webhookEvent.createMany({
    data: [{ id: event.id, provider: "stripe", type: event.type }],
    skipDuplicates: true,
  });
  if (!claimed.count) return { applied: false, note: "already processed" };
  try {
    await apply(event);
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
    return { applied: true };
  } catch (error) {
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { error: (error as Error).message.slice(0, 1000) } });
    throw error;
  }
}

async function apply(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription" || !session.subscription) return;
      const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      await applySubscription(await stripe().subscriptions.retrieve(id));
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySubscription(event.data.object as Stripe.Subscription);
      return;
    default:
      return;
  }
}

export async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const user =
    (await prisma.user.findUnique({ where: { stripeCustomerId: customerId } })) ??
    (sub.metadata?.macrobriefUserId ? await prisma.user.findUnique({ where: { id: sub.metadata.macrobriefUserId } }) : null);
  if (!user) {
    console.warn(`[stripe] subscription ${sub.id} for unknown customer ${customerId}`);
    return;
  }
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const plan = planFromSubscription({ status: sub.status, priceId }, priceCatalog(), user.plan);
  const ended = sub.status === "canceled" || sub.status === "incomplete_expired";
  await prisma.user.update({
    where: { id: user.id },
    data: { plan, stripeCustomerId: customerId, stripeSubId: ended ? null : sub.id },
  });
  console.info(`[stripe] ${user.id} → ${plan} (${sub.status})`);
}
