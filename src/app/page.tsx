import Link from "next/link";

import { GlobeLive } from "@/components/globe-live";
import { Isotype } from "@/components/marks";
import { Wordmark } from "@/components/ui";
import { PLANS, PLAN_ORDER } from "@/lib/domain/plans";
import { currentUser } from "@/lib/session";
import { todaysBudget } from "@/lib/showcase";

/**
 * The landing page is a news budget: the wire desk's lineup sheet, filled
 * in live from three topics the platform follows itself. See
 * docs/art-direction.md — the hero is the artifact, and the artifact is real.
 */

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Row form: no zone suffix — the header already says UTC. */
function filed(d: Date): string {
  return dateline(d).replace(/ UTC$/, "");
}

function dateline(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
}

export default async function LandingPage() {
  const now = new Date();
  const [user, budget] = await Promise.all([currentUser(), todaysBudget(now)]);
  const rows = budget.topics.reduce((n, t) => n + t.rows.length, 0);
  const candidates = budget.topics.reduce((n, t) => n + t.candidates, 0);
  const runs = budget.topics.reduce((n, t) => n + t.rows.filter((r) => r.decision === "RUNS").length, 0);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ink py-5">
        <Wordmark height={26} />
        <Link href={user ? "/app" : "/login"} className="btn-quiet">
          {user ? "Open the app" : "Sign in"}
        </Link>
      </header>

      {/* Statement + globe: 4:3 here so each line of the statement holds; the rows below keep 2:5. */}
      <section className="grid gap-10 py-12 lg:grid-cols-7 lg:items-center">
        <div className="lg:col-span-4">
          <h1 className="text-[2.4rem] font-bold leading-[1.08] tracking-tight lg:whitespace-nowrap">
            Tell it what you follow.
            <br />
            It scans the world.
            <br />
            Receive live updates.
          </h1>
          <p className="mt-6 max-w-lg text-lg text-ink-2">
            Name a few topics. MacroBrief finds the sources, reads everything they publish, decides what matters, and
            sends you one brief on your schedule — by email now, as audio and on WhatsApp soon.
          </p>
          <div className="mt-8">
            <Link href="/login" className="btn">Start free</Link>
          </div>
          <p className="wire mt-10 text-ink-3">
            Below: the editor&apos;s sheet for three topics we follow ourselves, ranked {budget.compiledAt ? "minutes" : "moments"} ago. Not a mockup.
          </p>
        </div>
        <div className="lg:col-span-3">
          <GlobeLive desks={budget.desks} className="mx-auto w-full max-w-[460px]" />
        </div>
      </section>

      {/* The sheet. */}
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
            {budget.topics.map((topic) => (
              <TopicRows key={topic.name} topic={topic} />
            ))}
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
      <Row label="Sources">
        <p>
          Two query feeds exist for any string — Google News and Bing News, both free, both naming the publisher per
          item. On top of those, the model proposes up to eight publisher feeds for the topic, and each one is fetched
          and parsed before it is kept: a model will happily invent a plausible <span className="fig">/feed.xml</span>{" "}
          that 404s. A feed is polled once no matter how many readers follow it, and one that fails twenty times in a
          row is switched off and says so on your topic page.
        </p>
      </Row>
      <Row label="The editor">
        <p>
          Every headline is reduced to a signature and grouped with its rewrites. A group scores{" "}
          <span className="fig">ln(1 + desks) × tier</span>, where tier is the most authoritative publisher that moved
          it — so one Reuters exclusive beats five reprints of a press release, and a story every desk carried beats a
          story one blog carried. Ties are broken by spreading picks across the window, so a weekly brief covers the
          week rather than Friday afternoon.
        </p>
      </Row>
      <Row label="Channels">
        <ul className="divide-y divide-rule">
          {[
            ["Email", "Live", "Plain text and HTML, one message per brief."],
            ["Plain text", "Live", "Every brief is stored as text you can copy or forward."],
            ["Audio", "Pro", "The brief read aloud — a player in the app and a Listen link in the email."],
            ["WhatsApp", "Pro", "A short digest on the schedule, with a link to the full brief."],
            ["Instagram", "Max · soon", "You DM the bot; it replies with your brief. Meta's rules, not ours."],
          ].map(([name, status, note]) => (
            <li key={name} className="grid grid-cols-[7rem_6rem_1fr] gap-3 py-2.5 text-sm">
              <span className="font-semibold">{name}</span>
              <span className={`wire self-center ${status.includes("soon") ? "text-ink-3" : "text-accent"}`}>{status}</span>
              <span className="text-ink-2">{note}</span>
            </li>
          ))}
        </ul>
      </Row>
      <Row label="Rate card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="wire border-b border-ink text-left text-ink-2">
              <th className="py-2 pr-3 font-medium">Plan</th>
              <th className="py-2 pr-3 text-right font-medium">Topics</th>
              <th className="py-2 pr-3 font-medium">Cadence</th>
              <th className="hidden py-2 pr-3 font-medium sm:table-cell">Channels</th>
              <th className="py-2 text-right font-medium">USD / mo</th>
            </tr>
          </thead>
          <tbody>
            {PLAN_ORDER.map((id) => {
              const plan = PLANS[id];
              return (
                <tr key={id} className="border-b border-rule">
                  <td className="py-2.5 pr-3 font-semibold">{plan.name}</td>
                  <td className="fig py-2.5 pr-3 text-right">{plan.maxTopics}</td>
                  <td className="py-2.5 pr-3 text-ink-2">{plan.cadences.map((c) => c.toLowerCase().replace("_", " ")).join(" · ")}</td>
                  <td className="hidden py-2.5 pr-3 text-ink-2 sm:table-cell">{plan.channels.filter((c) => c !== "WEB").map((c) => c.toLowerCase()).join(" · ")}</td>
                  <td className="fig py-2.5 text-right">{plan.priceUsd.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-ink-2">
          Free is one topic, weekly, by email. Paid plans are billed monthly; change or cancel any time.
        </p>
      </Row>

      <section className="mt-16 grid gap-6 border-t-2 border-ink pt-8 lg:grid-cols-7">
        <div className="lg:col-span-2">
          <Isotype height={40} />
        </div>
        <div className="lg:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <p className="max-w-lg text-2xl font-bold leading-snug tracking-tight">
              The whole world behind. One thing in front of it, choosing what reaches you.
            </p>
            <Link href="/login" className="btn shrink-0">Start free</Link>
          </div>
          <p className="wire mt-10 text-ink-3">© {now.getUTCFullYear()} MacroBrief · A Macro brand · a Sakamoto Labs LLC product</p>
        </div>
      </section>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-rule py-8 lg:grid-cols-7 lg:gap-10">
      <h2 className="wire text-ink-2 lg:col-span-2">{label}</h2>
      <div className="max-w-3xl text-[15px] leading-relaxed text-ink lg:col-span-5">{children}</div>
    </section>
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
