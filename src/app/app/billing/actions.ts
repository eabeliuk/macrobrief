"use server";

import { redirect } from "next/navigation";

import { PAID_PLANS, type PaidPlan } from "@/lib/domain/billing";
import { requireUser } from "@/lib/session";
import { checkoutUrl, portalUrl } from "@/lib/stripe/checkout";
import { stripeConfigured } from "@/lib/stripe/client";

export async function startCheckout(formData: FormData): Promise<void> {
  const user = await requireUser();
  const plan = String(formData.get("plan")) as PaidPlan;
  if (!PAID_PLANS.includes(plan)) redirect("/app/billing?error=plan");
  if (!stripeConfigured()) redirect("/app/billing?error=unconfigured");
  let url: string;
  try {
    url = await checkoutUrl(user, plan);
  } catch (error) {
    console.error("[billing] checkout failed", error);
    redirect("/app/billing?error=checkout");
  }
  redirect(url);
}

export async function openPortal(): Promise<void> {
  const user = await requireUser();
  if (!stripeConfigured()) redirect("/app/billing?error=unconfigured");
  let url: string;
  try {
    url = await portalUrl(user);
  } catch (error) {
    console.error("[billing] portal failed", error);
    redirect("/app/billing?error=portal");
  }
  redirect(url);
}
