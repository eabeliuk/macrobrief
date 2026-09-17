import Link from "next/link";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import { Field, Notice } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { ownedTopic, requireUser } from "@/lib/session";

import { addSource, removeSource } from "../../actions";

export default async function TopicPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await requireUser();
  const topic = await ownedTopic(user, id);
  if (!topic) notFound();

  const [sources, sections, recent] = await Promise.all([
    prisma.topicSource.findMany({ where: { topicId: topic.id }, include: { source: { include: { _count: { select: { items: true } } } } }, orderBy: { createdAt: "asc" } }),
    prisma.briefSection.findMany({ where: { topicId: topic.id }, include: { brief: true }, orderBy: { brief: { createdAt: "desc" } }, take: 5 }),
    prisma.item.findMany({ where: { source: { topics: { some: { topicId: topic.id } } } }, orderBy: { publishedAt: "desc" }, take: 15 }),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <Link href="/app" className="text-sm text-ink-3 hover:underline">← Topics</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{topic.name}</h1>
        <p className="text-sm text-ink-3">query “{topic.query}” · {topic.lang}</p>
      </div>

      {error ? <Notice tone="warn">{error}</Notice> : null}

      <section>
        <h2 className="text-xl font-semibold tracking-tight">Sources</h2>
        <ul className="mt-4 divide-y divide-rule rounded-lg border border-rule bg-card">
          {sources.map(({ source, origin }) => (
            <li key={source.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{source.title ?? source.publisher ?? source.url}</p>
                <p className="truncate text-xs text-ink-3">
                  {source.kind.toLowerCase().replace("_", " ")} · {origin} · {source._count.items} items ·{" "}
                  {source.enabled ? (source.lastError ? <span className="text-warn">last poll failed</span> : "ok") : <span className="text-warn">disabled after repeated failures</span>}
                </p>
                <a href={source.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-ink-3 hover:text-accent hover:underline">{source.url}</a>
              </div>
              <form action={removeSource}>
                <input type="hidden" name="topicId" value={topic.id} />
                <input type="hidden" name="sourceId" value={source.id} />
                <button type="submit" className="text-xs text-ink-3 hover:text-warn">Remove</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addSource} className="card mt-4 flex items-end gap-3">
          <input type="hidden" name="topicId" value={topic.id} />
          <div className="flex-1"><Field label="Add a feed or site URL" name="url" required placeholder="https://example.com/feed.xml" /></div>
          <SubmitButton className="btn-quiet" pending="Fetching…">Verify &amp; add</SubmitButton>
        </form>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">Latest items</h2>
        <ul className="mt-4 space-y-2">
          {recent.map((i) => (
            <li key={i.id} className="text-sm">
              <a href={i.link} target="_blank" rel="noreferrer" className="hover:underline">{i.title}</a>
              <span className="text-xs text-ink-3"> · {i.publisher ?? "—"} · {i.publishedAt ? i.publishedAt.toISOString().slice(0, 10) : "undated"}</span>
            </li>
          ))}
          {!recent.length ? <li className="text-sm text-ink-3">Nothing fetched yet — the next poll runs within 10 minutes.</li> : null}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">In your briefs</h2>
        <ul className="mt-4 space-y-2">
          {sections.map((s) => (
            <li key={s.id} className="text-sm">
              <Link href={`/app/briefs/${s.briefId}`} className="hover:underline">{s.brief.title}</Link>
              <span className="text-xs text-ink-3"> · {(s.stories as unknown[]).length} stories</span>
            </li>
          ))}
          {!sections.length ? <li className="text-sm text-ink-3">Not in a brief yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}
