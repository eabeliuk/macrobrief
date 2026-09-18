import Link from "next/link";

import { Notice } from "@/components/ui";
import { minutesLabel, readingSeconds } from "@/lib/domain/audio";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

import { ERRORS } from "../_shared";

/** Briefs, newest first, clustered by the day they were made in the reader's own timezone. */
export default async function BriefsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const [briefs, topicCount, schedule] = await Promise.all([
    prisma.brief.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 60, include: { deliveries: true } }),
    prisma.topic.count({ where: { userId: user.id } }),
    prisma.schedule.findUnique({ where: { userId: user.id }, select: { timezone: true } }),
  ]);
  const tz = schedule?.timezone ?? "UTC";
  const dayOf = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeOf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });

  const days: { label: string; briefs: typeof briefs }[] = [];
  for (const b of briefs) {
    const label = dayOf.format(b.createdAt);
    const last = days[days.length - 1];
    if (last && last.label === label) last.briefs.push(b);
    else days.push({ label, briefs: [b] });
  }

  return (
    <div className="space-y-6">
      {error ? <Notice tone="warn">{ERRORS[error] ?? error}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      <h1 className="text-2xl font-bold tracking-tight">Briefs</h1>

      {days.map((day) => (
        <section key={day.label}>
          <h2 className="wire mb-2 text-ink-3">{day.label}</h2>
          <ul className="divide-y divide-rule rounded-lg border border-rule bg-card">
            {day.briefs.map((b) => (
              <li key={b.id} className="flex items-baseline gap-4 px-4 py-3">
                <span className="fig w-16 shrink-0 text-xs text-ink-3">{timeOf.format(b.createdAt)}</span>
                <div className="min-w-0 flex-1">
                  {/* The "MacroBrief:" prefix belongs on email subjects and messages, not in the app's own list. */}
                  <Link href={`/app/briefs/${b.id}`} className="font-medium hover:underline">{b.title.replace(/^MacroBrief:\s*/, "")}</Link>
                  <p className="text-xs text-ink-3">
                    {b.periodKey.endsWith("/now") ? "on demand" : "scheduled"}
                    {b.deliveries.length ? ` · ${b.deliveries.map((d) => `${d.channel.toLowerCase()} ${d.status.toLowerCase()}${d.error ? ` — ${d.error}` : ""}`).join(", ")}` : ""}
                  </p>
                </div>
                {/* Listening time when there is audio; reading time otherwise. */}
                <span className="wire shrink-0 text-ink-3" title={b.audioSeconds ? "listening time" : "reading time"}>
                  {b.audioSeconds ? `▶ ${minutesLabel(b.audioSeconds)}` : minutesLabel(readingSeconds(b.bodyText))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {!briefs.length ? (
        <p className="rounded-lg border border-rule bg-card px-4 py-6 text-sm text-ink-3">
          No briefs yet. {topicCount ? "The first one arrives on your schedule." : <>Add a <Link href="/app/topics" className="underline">topic</Link> first.</>}
        </p>
      ) : null}
      <p className="wire text-ink-3">Times in {tz}</p>
    </div>
  );
}
