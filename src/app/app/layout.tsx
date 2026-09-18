import Link from "next/link";

import { signOut } from "@/auth";
import { Logotype } from "@/components/marks";
import { PLANS } from "@/lib/domain/plans";
import { planOf, requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  async function out() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  const plan = PLANS[planOf(user)];
  const initial = (user.name ?? user.email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <header className="flex items-center justify-between">
        <Link href="/app" aria-label="Dashboard">
          <Logotype height={26} />
        </Link>

        {/* Profile menu: a native disclosure, so it works without any script. */}
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-rule bg-card py-1 pr-3 pl-1 text-sm text-ink-2 hover:bg-page [&::-webkit-details-marker]:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">{initial}</span>
            <span className="hidden sm:inline">{user.email}</span>
            <span className="rounded-full bg-accent-wash px-2 py-0.5 text-xs font-medium text-accent">{plan.name}{user.isSuperAdmin ? " · staff" : ""}</span>
          </summary>
          <div className="absolute right-0 z-10 mt-2 w-64 rounded-lg border border-rule bg-card p-2 text-sm shadow-lg">
            <p className="px-3 py-2 text-xs text-ink-3">{user.email}</p>
            <Link href="/app/settings" className="block rounded-md px-3 py-2 hover:bg-page">Profile settings</Link>
            <Link href="/app/billing" className="block rounded-md px-3 py-2 hover:bg-page">
              Billing <span className="text-ink-3">· {plan.name}</span>
            </Link>
            {user.isSuperAdmin ? <Link href="/app/admin" className="block rounded-md px-3 py-2 text-accent hover:bg-page">Admin</Link> : null}
            <form action={out} className="mt-1 border-t border-rule pt-1">
              <button type="submit" className="block w-full rounded-md px-3 py-2 text-left hover:bg-page">Sign out</button>
            </form>
          </div>
        </details>
      </header>
      <main className="mt-8">{children}</main>
    </div>
  );
}
