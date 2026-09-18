import Link from "next/link";

import { Field, Notice } from "@/components/ui";
import { PLANS } from "@/lib/domain/plans";
import { prisma } from "@/lib/prisma";
import { planOf, requireUser } from "@/lib/session";

import { updateProfile } from "./actions";

/**
 * The account itself: name, sign-in method, plan. Topics, schedule and
 * channels stay on the dashboard, where the brief is made.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const user = await requireUser();
  const accounts = await prisma.account.findMany({ where: { userId: user.id }, select: { provider: true } });
  const plan = PLANS[planOf(user)];

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <Link href="/app/briefs" className="text-sm text-ink-3 hover:underline">← Briefs</Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Profile settings</h1>
      </div>

      {error === "name" ? <Notice tone="warn">That name is too long (80 characters at most).</Notice> : null}
      {saved ? <Notice>Saved.</Notice> : null}

      <form action={updateProfile} className="card space-y-3">
        <Field label="Name" name="name" defaultValue={user.name ?? ""} placeholder="How the brief should address you" />
        <div>
          <span className="label mb-1">Email</span>
          <p className="text-sm">{user.email}</p>
          <p className="mt-1 text-xs text-ink-3">Your sign-in identity; it can&apos;t be changed here. Delivery addresses live under Channels on the dashboard.</p>
        </div>
        <div>
          <span className="label mb-1">Sign-in</span>
          <p className="text-sm">{accounts.map((a) => a.provider).join(", ") || "email link"}</p>
        </div>
        <button type="submit" className="btn-quiet">Save</button>
      </form>

      <div className="card">
        <span className="label mb-1">Plan</span>
        <p className="text-sm">
          <strong>{plan.name}</strong>{plan.priceUsd ? ` — $${plan.priceUsd}/mo` : ""}{user.isSuperAdmin ? " · staff limits" : ""}
        </p>
        <Link href="/app/billing" className="mt-2 inline-block text-sm text-accent hover:underline">Manage billing →</Link>
      </div>
    </div>
  );
}
