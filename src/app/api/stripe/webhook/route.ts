import { NextResponse } from "next/server";

import { stripe, stripeConfigured } from "@/lib/stripe/client";
import { handleStripeEvent } from "@/lib/stripe/webhook";

/** The signature is verified against the raw body — parsing first would make the check meaningless. */
export async function POST(request: Request) {
  if (!stripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "No signature." }, { status: 400 });

  const body = await request.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("[stripe] signature check failed", error);
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }

  try {
    return NextResponse.json(await handleStripeEvent(event));
  } catch (error) {
    // 500 asks Stripe to redeliver; the WebhookEvent row makes the retry safe.
    console.error(`[stripe] ${event.type} failed`, error);
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }
}
