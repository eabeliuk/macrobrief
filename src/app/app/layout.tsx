import Link from "next/link";

import { signOut } from "@/auth";
import { BottomNav, SideNav } from "@/components/app-nav";
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
    <div className="min-h-dvh pb-24 lg:pb-0">
      {/* Full-bleed header: the mark at the window's left edge, the profile at its right. */}
      <header className="flex items-center justify-between border-b border-rule bg-card px-5 py-4">
        <Link href="/app/briefs" aria-label="Briefs">
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
            <Link href="/app/profile" className="block rounded-md px-3 py-2 hover:bg-page">Profile</Link>
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
      {/* The rail hugs the window's left edge; the content column sits beside it, not centred. */}
      <div className="lg:grid lg:grid-cols-[220px_1fr]">
        <SideNav />
        <main className="min-w-0 max-w-5xl px-5 py-8">{children}</main>
      </div>
      <footer className="px-5 py-6">
        <p className="wire text-ink-3">© {new Date().getUTCFullYear()} MacroBrief · a Sakamoto Labs LLC product</p>
      </footer>
      <BottomNav />
    </div>
  );
}
