import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BriefBody } from "@/components/brief-body";
import { Isotype } from "@/components/marks";
import { Wordmark } from "@/components/ui";
import { minutesLabel } from "@/lib/domain/audio";
import { prisma } from "@/lib/prisma";

/**
 * A brief shared by its reader: readable by anyone holding the link, with
 * the audio if there is any. Not indexed — a share is a message to a
 * person, not a publication.
 */

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SharedBriefPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const brief = await prisma.brief.findUnique({
    where: { shareToken: token },
    include: { sections: { orderBy: { position: "asc" } }, user: { select: { name: true } } },
  });
  if (!brief) notFound();
  const who = brief.user.name ? `${brief.user.name} shared this brief` : "A MacroBrief reader shared this brief";

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <header className="flex items-center justify-between border-b border-rule pb-4">
        <Wordmark />
        <Link href="/" className="btn-quiet">Get your own brief</Link>
      </header>
      <article className="mt-8 space-y-8">
        <div>
          <p className="wire text-ink-3">{who} · {brief.createdAt.toISOString().slice(0, 10)}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{brief.title.replace(/^MacroBrief:\s*/, "")}</h1>
        </div>
        {brief.audioUrl ? (
          <section className="card">
            <h2 className="font-semibold">Listen{brief.audioSeconds ? <span className="wire ml-2 text-ink-3">{minutesLabel(brief.audioSeconds)}</span> : null}</h2>
            <audio controls preload="none" src={`/s/${token}/audio?v=${brief.audioUrl.split("?v=")[1] ?? "0"}`} className="mt-3 w-full" />
          </section>
        ) : null}
        <BriefBody sections={brief.sections} />
      </article>
      <footer className="mt-16 flex items-center gap-4 border-t-2 border-ink pt-6">
        <Isotype height={28} />
        <p className="text-sm text-ink-2">
          MacroBrief reads the sources for the topics you follow and sends you one brief on your schedule.{" "}
          <Link href="/" className="text-accent hover:underline">See how it works →</Link>
        </p>
      </footer>
    </main>
  );
}
