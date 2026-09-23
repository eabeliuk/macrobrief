import type { Metadata } from "next";
import Link from "next/link";

import { GlobeLive } from "@/components/globe-live";
import { Isotype } from "@/components/marks";
import { Wordmark } from "@/components/ui";
import { currentUser } from "@/lib/session";
import { todaysBudget } from "@/lib/showcase";

/**
 * The live example: the editor's own news budget for three topics the
 * platform follows itself, ranked at the moment the page is served. The
 * landing links here; nothing on this page is a mockup.
 */

export const metadata: Metadata = {
  title: "Live example — MacroBrief",
  description: "The editor's sheet for three topics MacroBrief follows itself, ranked minutes ago.",
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function dateline(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
}

/** Row form: no zone suffix — the header already says UTC. */
function filed(d: Date): string {
  return dateline(d).replace(/ UTC$/, "");
}

export default async function ExamplePage() {
  const now = new Date();
  const [user, budget] = await Promise.all([currentUser(), todaysBudget(now)]);
  const rows = budget.topics.reduce((n, t) => n + t.rows.length, 0);
  const candidates = budget.topics.reduce((n, t) => n + t.candidates, 0);
  const runs = budget.topics.reduce((n, t) => n + t.rows.filter((r) => r.decision === "RUNS").length, 0);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ink py-5">
        <Wordmark height={26} />
        <p className="wire text-ink-2">
          News budget · {dateline(now)}
          {budget.compiledAt ? ` · compiled ${dateline(budget.compiledAt)}` : ""}
        </p>
        <Link href={user ? "/app" : "/login"} className="btn-quiet">
          {user ? "Open the app" : "Sign in"}
        </Link>
      </header>

      <section className="grid gap-10 py-10 lg:grid-cols-7 lg:items-center">
        <div className="lg:col-span-4">
          <h1 className="text-[2.2rem] font-bold leading-[1.1] tracking-tight">The editor&apos;s sheet, live</h1>
          <p className="mt-5 max-w-lg text-lg text-ink-2">
            Three topics MacroBrief follows itself. Everything below was fetched, deduplicated and ranked by the same
            editor a reader gets on their own topics — at the moment this page was served. Nothing here is a mockup.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="btn">Start free</Link>
            <Link href="/" className="btn-quiet">Back to the front</Link>
          </div>
        </div>
        <div className="lg:col-span-3">
          <GlobeLive desks={budget.desks} className="mx-auto w-full max-w-[420px]" />
        </div>
      </section>

      <section id="budget" className="border-t-2 border-ink">
        <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
          <h2 className="wire text-ink">
            Budget · last {budget.windowHours} h · {candidates} candidates → {rows} groups → {runs} run
          </h2>
          <p className="wire text-ink-3">score = ln(1 + desks moving it) × publisher tier · duplicates collapsed by headline</p>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="wire border-b border-ink text-left text-ink-2">
              <th className="py-2 pr-3 font-medium">Slug / story</th>
              <th className="hidden py-2 pr-3 font-medium md:table-cell">Desk</th>
              <th className="py-2 pr-3 text-right font-medium">Moved</th>
              <th className="hidden py-2 pr-3 text-right font-medium sm:table-cell">Tier</th>
              <th className="hidden py-2 pr-3 text-right font-medium sm:table-cell">Score</th>
              <th className="hidden py-2 pr-3 text-right font-medium md:table-cell">Filed (UTC)</th>
              <th className="py-2 text-right font-medium">Decision</th>
            </tr>
          </thead>
          <tbody>
            {rows ? budget.topics.map((topic) => <TopicRows key={topic.name} topic={topic} />) : null}
            {!budget.topics.length || !rows ? (
              <tr>
                <td colSpan={7} className="wire py-8 text-ink-3">
                  No budget — first poll pending. The sheet fills in within ten minutes of the first cron tick.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="mt-2 border-t border-ink pt-[3px]">
          <div className="border-t border-ink" />
        </div>
        <p className="mt-3 max-w-3xl text-sm text-ink-2">
          This is the cut before the writing. A reader on any plan gets exactly this editor on their own topics; the
          stories marked RUNS are then written up — headline, three sentences, one cited link each — by the model, in one
          call, and sent.
        </p>
      </section>

      {/* The rest of the page keeps the 2:5 split: a label column and the content. */}

      <section className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t-2 border-ink pt-8">
        <div className="flex items-center gap-4">
          <Isotype height={28} />
          <p className="max-w-lg text-lg font-semibold leading-snug">
            Your topics, read the same way, on your schedule.
          </p>
        </div>
        <Link href="/login" className="btn shrink-0">Start free</Link>
      </section>
      <p className="wire mt-10 text-ink-3">© {now.getUTCFullYear()} MacroBrief · A Macro brand · a Sakamoto Labs LLC product</p>
    </main>
  );
}

function TopicRows({ topic }: { topic: Awaited<ReturnType<typeof todaysBudget>>["topics"][number] }) {
  return (
    <>
      <tr className="border-b border-rule bg-page">
        <td colSpan={7} className="pt-5 pb-1.5">
          <span className="text-sm font-bold">{topic.name}</span>
          <span className="wire ml-3 text-ink-3">
            {topic.candidates} candidates · {topic.rows.length} groups
          </span>
        </td>
      </tr>
      {topic.rows.map((r) => (
        <tr key={r.link} className={`border-b border-rule align-top ${r.decision === "HELD" ? "text-ink-3" : ""}`}>
          <td className="py-2.5 pr-3">
            <p className="wire">{r.slug}</p>
            <a href={r.link} target="_blank" rel="noreferrer" className={`text-sm leading-snug hover:underline ${r.decision === "HELD" ? "" : "font-semibold"}`}>
              {r.headline}
            </a>
            <p className="wire mt-0.5 text-ink-3 md:hidden">{r.publisher ?? "—"}</p>
          </td>
          <td className="wire hidden py-2.5 pr-3 md:table-cell">
            <span className="block text-ink">{r.desk?.city ?? "—"}</span>
            <span className="block normal-case tracking-normal text-ink-3">{r.publisher ?? ""}</span>
          </td>
          <td className="fig py-2.5 pr-3 text-right text-sm">{r.mentions}</td>
          <td className="fig hidden py-2.5 pr-3 text-right text-sm sm:table-cell">{r.tier}</td>
          <td className="fig hidden py-2.5 pr-3 text-right text-sm sm:table-cell">{r.score.toFixed(2)}</td>
          <td className="wire hidden whitespace-nowrap py-2.5 pr-3 text-right md:table-cell">{filed(r.publishedAt)}</td>
          <td className={`wire py-2.5 text-right ${r.decision === "RUNS" ? "font-medium text-accent" : ""}`}>{r.decision}</td>
        </tr>
      ))}
    </>
  );
}
