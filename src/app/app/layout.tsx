import Link from "next/link";

import { signOut } from "@/auth";
import { Wordmark } from "@/components/ui";
import { PLANS } from "@/lib/domain/plans";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  async function out() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <header className="flex items-center justify-between">
        <Wordmark />
        <div className="flex items-center gap-4 text-sm text-ink-2">
          {user.isSuperAdmin ? <Link href="/app/admin" className="wire text-accent hover:underline">Admin</Link> : null}
          <Link href="/app/billing" className="rounded-full bg-accent-wash px-2 py-0.5 text-xs font-medium text-accent hover:underline">{PLANS[user.plan].name}</Link>
          <span>{user.email}</span>
          <form action={out}>
            <button type="submit" className="underline">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mt-8">{children}</main>
    </div>
  );
}
