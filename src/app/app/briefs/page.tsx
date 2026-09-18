import Link from "next/link";

import { Notice } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

import { ERRORS } from "../_shared";

export default async function BriefsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const [briefs, topicCount] = await Promise.all([
    prisma.brief.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30, include: { deliveries: true } }),
    prisma.topic.count({ where: { userId: user.id } }),
  ]);

  return (
    <div className="space-y-6">
      {error ? <Notice tone="warn">{ERRORS[error] ?? error}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      <h1 className="text-2xl font-bold tracking-tight">Briefs</h1>
      <ul className="divide-y divide-rule rounded-lg border border-rule bg-card">
        {briefs.map((b) => (
          <li key={b.id} className="px-4 py-3">
            <Link href={`/app/briefs/${b.id}`} className="font-medium hover:underline">{b.title}</Link>
            <p className="text-xs text-ink-3">
              {b.periodKey.endsWith("/now") ? "on demand" : b.periodKey} · {b.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC ·{" "}
              {b.deliveries.map((d) => `${d.channel.toLowerCase()} ${d.status.toLowerCase()}${d.error ? ` — ${d.error}` : ""}`).join(", ") || "web only"}
            </p>
          </li>
        ))}
        {!briefs.length ? (
          <li className="px-4 py-6 text-sm text-ink-3">
            No briefs yet. {topicCount ? "The first one arrives on your schedule." : <>Add a <Link href="/app/topics" className="underline">topic</Link> first.</>}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
