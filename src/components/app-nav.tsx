"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The app's navigation: a left rail on wide screens, a bottom tab bar on
 * phones (the cupiro pattern — icon over label, active by pathname). One
 * list drives both so they can never disagree.
 */

const ITEMS = [
  { href: "/app/topics", label: "Topics", icon: TopicsIcon },
  { href: "/app/briefs", label: "Briefs", icon: BriefsIcon },
  { href: "/app/schedule", label: "Schedule", icon: ScheduleIcon },
  { href: "/app/settings", label: "Settings", icon: SettingsIcon },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav() {
  const active = useActive();
  return (
    <nav className="hidden border-r border-rule lg:block lg:min-h-[calc(100dvh-4.4rem)]" aria-label="Sections">
      <ul className="sticky top-0 space-y-1 px-3 py-6">
        {ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${active(href) ? "bg-accent-wash font-semibold text-accent" : "text-ink-2 hover:bg-card hover:text-ink"}`}
            >
              <Icon />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function BottomNav() {
  const active = useActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-card pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Sections">
      <ul className="flex justify-around">
        {ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href} className="flex-1">
            <Link
              href={href}
              className={`flex flex-col items-center gap-1 py-2 text-[11px] ${active(href) ? "text-accent" : "text-ink-3 hover:text-ink"}`}
            >
              <Icon />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function TopicsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M4 7h16M4 12h10M4 17h13" />
    </svg>
  );
}
function BriefsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M6 3h9l4 4v14H6z M15 3v4h4 M9 12h6M9 16h6" />
    </svg>
  );
}
function ScheduleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </svg>
  );
}
