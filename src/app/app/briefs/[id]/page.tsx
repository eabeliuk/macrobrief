import Link from "next/link";
import { notFound } from "next/navigation";

import { CopyText } from "@/components/copy-text";
import type { Story } from "@/lib/domain/brief";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const brief = await prisma.brief.findFirst({
    where: { id, userId: user.id },
    include: { sections: { orderBy: { position: "asc" } }, deliveries: true },
  });
  if (!brief) notFound();

  return (
    <article className="space-y-8">
      <div>
        <Link href="/app" className="text-sm text-ink-3 hover:underline">← Briefs</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{brief.title}</h1>
        <p className="text-sm text-ink-3">
          {brief.periodKey} · covers {brief.windowStart.toISOString().slice(0, 10)} → {brief.windowEnd.toISOString().slice(0, 16).replace("T", " ")} UTC
          {brief.deliveries.length ? ` · ${brief.deliveries.map((d) => `${d.channel.toLowerCase()} ${d.status.toLowerCase()}${d.error ? ` (${d.error})` : ""}`).join(", ")}` : ""}
        </p>
      </div>

      {brief.sections.map((section) => {
        const stories = section.stories as unknown as Story[];
        return (
          <section key={section.id}>
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            {!stories.length ? <p className="mt-2 text-sm text-ink-3">Nothing new this period.</p> : null}
            <ul className="mt-3 space-y-4">
              {stories.map((story) => (
                <li key={story.link}>
                  <a href={story.link} target="_blank" rel="noreferrer" className="font-medium hover:underline">{story.headline}</a>
                  {story.publisher ? <span className="text-sm text-ink-3"> — {story.publisher}</span> : null}
                  <p className="mt-1 text-sm text-ink-2">{story.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Plain text</h2>
          <CopyText text={brief.bodyText} />
        </div>
        <pre className="mt-3 whitespace-pre-wrap text-xs text-ink-2">{brief.bodyText}</pre>
      </section>
    </article>
  );
}
