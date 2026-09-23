import Link from "next/link";

import { Notice } from "@/components/ui";
import { PAID_PLANS } from "@/lib/domain/billing";
import { PLANS, PLAN_ORDER } from "@/lib/domain/plans";
import { planOf, requireUser } from "@/lib/session";
import { priceCatalog, stripeConfigured } from "@/lib/stripe/client";

import { openPortal, startCheckout } from "./actions";

const ERRORS: Record<string, string> = {
  plan: "That plan doesn't exist.",
  unconfigured: "Billing isn't configured on this deployment yet.",
  checkout: "Stripe couldn't start the checkout. Try again in a moment.",
  portal: "Stripe couldn't open the billing portal. Try again in a moment.",
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ error?: string; checkout?: string }> }) {
  const { error, checkout } = await searchParams;
  const user = await requireUser();
  const catalog = priceCatalog();
  const configured = stripeConfigured();
  const current = PLANS[planOf(user)];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/app/briefs" className="text-sm text-ink-3 hover:underline">← Briefs</Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-ink-2">
          You are on <strong>{current.name}</strong>
          {current.priceUsd ? ` — $${current.priceUsd}/mo` : ""}.{user.isSuperAdmin ? " Staff accounts run on Max limits regardless of plan." : ""}
        </p>
      </div>

      {error ? <Notice tone="warn">{ERRORS[error] ?? error}</Notice> : null}
      {checkout === "success" ? <Notice>Thanks — your plan updates as soon as Stripe confirms the payment (usually seconds).</Notice> : null}
      {checkout === "cancelled" ? <Notice>Checkout cancelled. Nothing was charged.</Notice> : null}
      {!configured ? <Notice tone="warn">Billing isn&apos;t configured on this deployment; plans can&apos;t be purchased yet.</Notice> : null}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="wire border-b border-ink text-left text-ink-2">
            <th className="py-2 pr-3 font-medium">Plan</th>
            <th className="py-2 pr-3 text-right font-medium">Topics</th>
            <th className="py-2 pr-3 font-medium">Cadence</th>
            <th className="hidden py-2 pr-3 font-medium sm:table-cell">Channels</th>
            <th className="py-2 pr-3 text-right font-medium">USD / mo</th>
            <th className="py-2 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            const isCurrent = id === planOf(user);
            const purchasable = configured && PAID_PLANS.includes(id as (typeof PAID_PLANS)[number]) && Boolean(catalog[id as (typeof PAID_PLANS)[number]]);
            return (
              <tr key={id} className={`border-b border-rule ${isCurrent ? "bg-accent-wash" : ""}`}>
                <td className="py-3 pr-3 font-semibold">{plan.name}</td>
                <td className="fig py-3 pr-3 text-right">{plan.maxTopics}</td>
                <td className="py-3 pr-3 text-ink-2">{plan.cadences.map((c) => (c === "LIVE" ? "live" : c.toLowerCase().replace("_", " "))).join(" · ")}</td>
                <td className="hidden py-3 pr-3 text-ink-2 sm:table-cell">{plan.channels.filter((c) => c !== "WEB").map((c) => c.toLowerCase()).join(" · ")}</td>
                <td className="fig py-3 pr-3 text-right">{plan.priceUsd.toFixed(2)}</td>
                <td className="py-3 text-right">
                  {isCurrent ? (
                    <span className="wire text-accent">Current</span>
                  ) : purchasable ? (
                    <form action={startCheckout}>
                      <input type="hidden" name="plan" value={id} />
                      <button type="submit" className="btn-quiet">Choose</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {user.stripeCustomerId && configured ? (
        <form action={openPortal}>
          <button type="submit" className="btn-quiet">Manage subscription, card and invoices</button>
          <p className="mt-2 text-xs text-ink-3">Opens Stripe&apos;s portal. Downgrades and cancellations take effect at the end of the period.</p>
        </form>
      ) : null}
    </div>
  );
}
