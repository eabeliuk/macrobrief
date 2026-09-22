import Link from "next/link";

import { Reveal } from "@/components/reveal";
import { SubmitButton } from "@/components/submit-button";
import { Field, Notice } from "@/components/ui";
import { PLANS } from "@/lib/domain/plans";
import { prisma } from "@/lib/prisma";
import { planOf, requireUser } from "@/lib/session";

import { ERRORS } from "../_shared";
import { addTopic, briefNow, deleteTopic } from "../actions";

export default async function TopicsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const topics = await prisma.topic.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, include: { _count: { select: { sources: true } } } });
  const plan = PLANS[planOf(user)];

  return (
    <div className="space-y-6">
      {error ? <Notice tone="warn">{ERRORS[error] ?? error}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      {(() => {
        const title = (
          <h1 className="text-2xl font-bold tracking-tight">
            Topics <span className="wire ml-2 align-middle text-ink-3">{topics.length} / {plan.maxTopics}</span>
          </h1>
        );
        if (topics.length >= plan.maxTopics) return <div className="flex items-center justify-between gap-4">{title}</div>;
        return (
          <Reveal heading={title} label="Add topic">
            <form action={addTopic} className="card grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
              <Field label="Topic" name="name" required placeholder="Chilean lithium policy" />
              <Field label="Search query (optional)" name="query" placeholder="lithium chile royalty" />
              <label className="block">
                <span className="label mb-1">Language</span>
                <select name="lang" className="input" defaultValue="en">
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="pt">Português</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                </select>
              </label>
              <SubmitButton pending="Finding sources… ~30 s">Add topic</SubmitButton>
              <p className="text-xs text-ink-3 sm:col-span-4">Adding a topic takes about 30 seconds: publisher feeds are proposed by the model, each is fetched to prove it works, then everything is polled once.</p>
            </form>
          </Reveal>
        );
      })()}
      <ul className="divide-y divide-rule rounded-lg border border-rule bg-card">
        {topics.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <Link href={`/app/topics/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
              {/* The query is only worth showing when the reader changed it from the name. */}
              <span className="wire truncate text-ink-3">
                {t.query.toLowerCase() !== t.name.toLowerCase() ? `“${t.query}” · ` : ""}
                {t.lang} · {t._count.sources} sources
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {user.isSuperAdmin ? (
                <form action={briefNow} title="Staff only: an on-demand brief on this topic (one model call)">
                  <input type="hidden" name="topicId" value={t.id} />
                  <SubmitButton className="btn-quiet px-3 py-1 text-xs" pending="Writing… ~1 min">Brief me now</SubmitButton>
                </form>
              ) : null}
              <form action={deleteTopic}>
                <input type="hidden" name="topicId" value={t.id} />
                <button type="submit" className="text-xs text-ink-3 hover:text-warn">Remove</button>
              </form>
            </div>
          </li>
        ))}
        {!topics.length ? <li className="px-4 py-6 text-sm text-ink-3">No topics yet. Add one below — sources are found automatically.</li> : null}
      </ul>
      {topics.length >= plan.maxTopics ? (
        <p className="text-sm text-ink-3">Your plan's topic limit is reached. Remove one, or upgrade under Billing in the profile menu.</p>
      ) : null}
    </div>
  );
}
