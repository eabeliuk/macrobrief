import Link from "next/link";
import { notFound } from "next/navigation";

import { BriefBody } from "@/components/brief-body";
import { CopyLink } from "@/components/copy-link";
import { CopyText } from "@/components/copy-text";
import { Notice } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { siteUrl } from "@/lib/stripe/client";

import { regenerateAudio, shareBrief, unshareBrief } from "../share-actions";
import { SubmitButton } from "@/components/submit-button";

export default async function BriefPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ shared?: string }> }) {
  const { id } = await params;
  const { shared } = await searchParams;
  const user = await requireUser();
  const brief = await prisma.brief.findFirst({
    where: { id, userId: user.id },
    include: { sections: { orderBy: { position: "asc" } }, deliveries: true },
  });
  if (!brief) notFound();

  return (
    <article className="space-y-8">
      <div>
        <Link href="/app/briefs" className="text-sm text-ink-3 hover:underline">← Briefs</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{brief.title}</h1>
        <p className="text-sm text-ink-3">
          {brief.periodKey} · covers {brief.windowStart.toISOString().slice(0, 10)} → {brief.windowEnd.toISOString().slice(0, 16).replace("T", " ")} UTC
          {brief.deliveries.length ? ` · ${brief.deliveries.map((d) => `${d.channel.toLowerCase()} ${d.status.toLowerCase()}${d.error ? ` (${d.error})` : ""}`).join(", ")}` : ""}
        </p>
      </div>

      {brief.audioUrl || user.isSuperAdmin ? (
        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Listen{brief.audioUrl ? <span className="wire ml-2 text-ink-3">{brief.lang}</span> : null}</h2>
            {user.isSuperAdmin ? (
              <form action={regenerateAudio} title="Staff: re-synthesise with the brief's language and your current voice/speed">
                <input type="hidden" name="briefId" value={brief.id} />
                <SubmitButton className="btn-quiet px-3 py-1 text-xs" pending="Synthesising…">{brief.audioUrl ? "Regenerate audio" : "Make audio"} · staff</SubmitButton>
              </form>
            ) : null}
          </div>
          {brief.audioUrl ? <audio controls preload="none" src={brief.audioUrl} className="mt-3 w-full" /> : null}
        </section>
      ) : null}

      <BriefBody sections={brief.sections} />

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Share</h2>
          {brief.shareToken ? (
            <form action={unshareBrief}>
              <input type="hidden" name="briefId" value={brief.id} />
              <button type="submit" className="text-xs text-ink-3 hover:text-warn">Stop sharing</button>
            </form>
          ) : null}
        </div>
        {brief.shareToken ? (
          <>
            {shared ? <Notice>Anyone with this link can read the brief{brief.audioUrl ? " and listen to it" : ""} — no account needed.</Notice> : null}
            <CopyLink url={`${siteUrl()}/s/${brief.shareToken}`} />
          </>
        ) : (
          <form action={shareBrief} className="flex items-center gap-3">
            <input type="hidden" name="briefId" value={brief.id} />
            <button type="submit" className="btn-quiet">Create share link</button>
            <span className="text-xs text-ink-3">Readable by anyone with the link, no account needed. You can stop sharing at any time.</span>
          </form>
        )}
      </section>

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Plain text</h2>
          <CopyText text={brief.bodyText} />
        </div>
        <pre className="mt-3 whitespace-pre-wrap text-xs text-ink-2 [overflow-wrap:anywhere]">{brief.bodyText}</pre>
      </section>
    </article>
  );
}
