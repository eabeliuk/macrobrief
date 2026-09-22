import Link from "next/link";

import { Field, Notice } from "@/components/ui";
import { PLANS, PLAN_ORDER } from "@/lib/domain/plans";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/session";
import { SHOWCASE_EMAIL } from "@/lib/showcase";

import { AutoSelect } from "@/components/auto-submit";
import { SubmitButton } from "@/components/submit-button";

import { inviteUser, pollSource, setUserPlan, toggleSource } from "./actions";

/**
 * The staff view: who signed up and on what tier, what each of them
 * follows and which feeds that attached, and the global source catalogue
 * with its health. Read-mostly; the three writes are invite, plan, and
 * enabling/disabling a source.
 */

const ERRORS: Record<string, string> = {
  email: "That isn't an email address.",
  plan: "Unknown plan.",
  user: "Unknown user (or the showcase account, which has no plan).",
  source: "Unknown source.",
};

/**
 * Has this person ever used the account? The email-link provider leaves no
 * Account row, so OAuth rows alone under-report it; a live session or any
 * work they have done counts too, which keeps readers who signed in before
 * lastSignInAt existed from showing as invitations.
 */
function signedIn(u: { lastSignInAt: Date | null; accounts: unknown[]; sessions: unknown[]; topics: unknown[]; _count: { briefs: number } }): boolean {
  return Boolean(u.lastSignInAt) || u.accounts.length > 0 || u.sessions.length > 0 || u.topics.length > 0 || u._count.briefs > 0;
}

function when(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 16).replace("T", " ") : "—";
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  await requireSuperAdmin();

  const [users, sources] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        accounts: { select: { provider: true } },
        sessions: { select: { expires: true }, take: 1 },
        channels: true,
        topics: { orderBy: { createdAt: "asc" }, include: { sources: { include: { source: { include: { _count: { select: { items: true } } } } } } } },
        _count: { select: { briefs: true } },
        briefs: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    }),
    prisma.source.findMany({
      orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
      include: { _count: { select: { items: true, topics: true } } },
    }),
  ]);

  const readers = users.filter((u) => u.email !== SHOWCASE_EMAIL);
  const showcase = users.find((u) => u.email === SHOWCASE_EMAIL);

  return (
    <div className="space-y-12">
      <div>
        <Link href="/app/briefs" className="text-sm text-ink-3 hover:underline">← Briefs</Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Admin</h1>
        <p className="wire mt-1 text-ink-3">
          {readers.length} readers · {sources.length} sources · {sources.filter((s) => s.enabled).length} enabled
        </p>
      </div>

      {error ? <Notice tone="warn">{ERRORS[error] ?? error}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      {/* Users */}
      <section id="users">
        <h2 className="text-xl font-semibold tracking-tight">Readers</h2>
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="wire border-b border-ink text-left text-ink-2">
              <th className="py-2 pr-3 font-medium">Email</th>
              <th className="py-2 pr-3 font-medium">Plan</th>
              <th className="hidden py-2 pr-3 font-medium sm:table-cell">Sign-in · last</th>
              <th className="py-2 pr-3 text-right font-medium">Topics</th>
              <th className="py-2 pr-3 text-right font-medium">Briefs</th>
              <th className="hidden py-2 pr-3 font-medium md:table-cell">Channels</th>
              <th className="hidden py-2 pr-3 font-medium md:table-cell">Last brief</th>
              <th className="hidden py-2 font-medium lg:table-cell">Joined</th>
            </tr>
          </thead>
          <tbody>
            {readers.map((u) => (
              <tr key={u.id} className="border-b border-rule align-top">
                <td className="py-2.5 pr-3">
                  <span className="font-medium">{u.email}</span>
                  {u.isSuperAdmin ? <span className="wire ml-2 text-accent">staff</span> : null}
                  {!signedIn(u) ? <span className="wire ml-2 text-ink-3">invited · not signed in</span> : null}
                </td>
                <td className="py-2.5 pr-3">
                  <form action={setUserPlan}>
                    <input type="hidden" name="userId" value={u.id} />
                    <AutoSelect name="plan" defaultValue={u.plan} className="input py-1 text-xs" aria-label={`Plan for ${u.email}`}>
                      {PLAN_ORDER.map((p) => (
                        <option key={p} value={p}>{PLANS[p].name}</option>
                      ))}
                    </AutoSelect>
                  </form>
                </td>
                <td className="wire hidden py-2.5 pr-3 sm:table-cell">
                  {u.accounts.map((a) => a.provider).join(", ") || (signedIn(u) ? "email link" : "—")}
                  {u.lastSignInAt ? <span className="block normal-case tracking-normal text-ink-3">{when(u.lastSignInAt)}</span> : null}
                </td>
                <td className="fig py-2.5 pr-3 text-right">{u.topics.length}</td>
                <td className="fig py-2.5 pr-3 text-right">{u._count.briefs}</td>
                <td className="hidden py-2.5 pr-3 text-xs text-ink-2 md:table-cell">
                  {u.channels.map((c) => `${c.channel.toLowerCase()}${c.enabled ? "" : " (off)"}${c.verified ? "" : " (unverified)"}`).join(", ") || "—"}
                </td>
                <td className="wire hidden py-2.5 pr-3 md:table-cell">{when(u.briefs[0]?.createdAt)}</td>
                <td className="wire hidden py-2.5 lg:table-cell">{when(u.createdAt).slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={inviteUser} className="card mt-4 flex items-end gap-3">
          <div className="flex-1"><Field label="Invite a reader (they sign in with Google)" name="email" type="email" required placeholder="someone@example.com" /></div>
          <button type="submit" className="btn-quiet">Invite</button>
        </form>
      </section>

      {/* Per-user feeds */}
      <section id="feeds">
        <h2 className="text-xl font-semibold tracking-tight">What each reader follows</h2>
        <div className="mt-4 space-y-6">
          {readers.filter((u) => u.topics.length).map((u) => (
            <div key={u.id}>
              <p className="text-sm font-semibold">{u.email}</p>
              <ul className="mt-2 divide-y divide-rule rounded-lg border border-rule bg-card">
                {u.topics.map((t) => (
                  <li key={t.id} className="px-4 py-3">
                    <p className="text-sm">
                      <span className="font-medium">{t.name}</span>
                      <span className="wire ml-2 text-ink-3">“{t.query}” · {t.lang} · {t.sources.length} feeds</span>
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {t.sources.map(({ source, origin }) => (
                        <li key={source.id} className="wire truncate text-ink-2">
                          {source.kind.toLowerCase().replace("_", " ")} · {origin} · {source._count.items} items ·{" "}
                          <span className={source.enabled ? "" : "text-warn"}>{source.enabled ? "on" : "off"}</span> ·{" "}
                          <a href={source.url} target="_blank" rel="noreferrer" className="normal-case tracking-normal hover:text-accent hover:underline">{source.title ?? source.publisher ?? source.url}</a>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!readers.some((u) => u.topics.length) ? <p className="text-sm text-ink-3">No reader has added a topic yet.</p> : null}
          {showcase ? (
            <p className="wire text-ink-3">
              Showcase (landing page): {showcase.topics.map((t) => t.name).join(" · ")} — {showcase.topics.reduce((n, t) => n + t.sources.length, 0)} feeds, never briefed.
            </p>
          ) : null}
        </div>
      </section>

      {/* Sources */}
      <section id="sources">
        <h2 className="text-xl font-semibold tracking-tight">Sources</h2>
        <p className="wire mt-1 text-ink-3">Global: one row per feed no matter how many topics follow it. Disabled = 20 consecutive failures, or switched off here.</p>
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="wire border-b border-ink text-left text-ink-2">
              <th className="py-2 pr-3 font-medium">Feed</th>
              <th className="hidden py-2 pr-3 font-medium sm:table-cell">Kind</th>
              <th className="py-2 pr-3 text-right font-medium">Items</th>
              <th className="py-2 pr-3 text-right font-medium">Topics</th>
              <th className="hidden py-2 pr-3 font-medium md:table-cell">Polled</th>
              <th className="py-2 pr-3 font-medium">Health</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className={`border-b border-rule align-top ${s.enabled ? "" : "text-ink-3"}`}>
                <td className="max-w-[28rem] py-2.5 pr-3">
                  <p className="truncate font-medium">{s.title ?? s.publisher ?? "(untitled)"}</p>
                  <a href={s.url} target="_blank" rel="noreferrer" className="wire block truncate normal-case tracking-normal text-ink-3 hover:text-accent hover:underline">{s.url}</a>
                </td>
                <td className="wire hidden py-2.5 pr-3 sm:table-cell">{s.kind.toLowerCase().replace("_", " ")}</td>
                <td className="fig py-2.5 pr-3 text-right">{s._count.items}</td>
                <td className="fig py-2.5 pr-3 text-right">{s._count.topics}</td>
                <td className="wire hidden py-2.5 pr-3 md:table-cell">{when(s.lastPolledAt)}</td>
                <td className="py-2.5 pr-3 text-xs">
                  {!s.enabled ? <span className="text-warn">disabled</span> : s.lastError ? <span className="text-warn">failing ×{s.failCount}</span> : <span className="text-accent">ok</span>}
                  {s.lastError ? <p className="mt-0.5 max-w-[16rem] truncate text-ink-3" title={s.lastError}>{s.lastError}</p> : null}
                </td>
                <td className="py-2.5 text-right">
                  <div className="flex justify-end gap-3">
                    <form action={pollSource}>
                      <input type="hidden" name="sourceId" value={s.id} />
                      <SubmitButton className="text-xs text-ink-3 hover:text-ink" pending="Polling…">Poll now</SubmitButton>
                    </form>
                    <form action={toggleSource}>
                      <input type="hidden" name="sourceId" value={s.id} />
                      <button type="submit" className="text-xs text-ink-3 hover:text-ink">{s.enabled ? "Disable" : "Enable"}</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
