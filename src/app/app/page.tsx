import Link from "next/link";

import { ScheduleForm } from "@/components/schedule-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Notice } from "@/components/ui";
import { PLANS, cadenceAllowed, channelAllowed, type ChannelId } from "@/lib/domain/plans";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

import { addTopic, briefNow, deleteTopic, setChannel, updateSchedule, verifyChannel } from "./actions";

const ERRORS: Record<string, string> = {
  topic: "A topic needs a name of at least two characters.",
  limit: "Your plan's topic limit is reached. Remove one, or upgrade under Billing.",
  schedule: "That schedule didn't make sense.",
  timezone: "Unknown timezone.",
  channel: "That channel setting didn't make sense.",
  plan: "That channel isn't on your plan.",
  address: "That channel needs an address.",
  phone: "WhatsApp needs a full international number, like +56 9 1234 5678.",
  codesend: "Saved, but the verification code couldn't be sent — that channel isn't configured on this deployment yet. Save again later to get a code.",
  code: "That code didn't match or has expired. Save the address again for a new one.",
};

const CHANNEL_HELP: Record<Exclude<ChannelId, "WEB" | "TEXT">, { label: string; placeholder: string; note?: string }> = {
  EMAIL: { label: "Email", placeholder: "you@example.com" },
  AUDIO: { label: "Audio", placeholder: "(no address needed)", note: "The brief read aloud — a player in the app and a Listen link in the email." },
  WHATSAPP: { label: "WhatsApp", placeholder: "+56 9 1234 5678", note: "A short digest with a link to the full brief. Include the country code." },
  INSTAGRAM: { label: "Instagram", placeholder: "@handle", note: "Coming in M3 — you DM the bot, it replies with your brief." },
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const [topics, briefs, schedule, channels] = await Promise.all([
    prisma.topic.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, include: { _count: { select: { sources: true } } } }),
    prisma.brief.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10, include: { deliveries: true } }),
    prisma.schedule.findUnique({ where: { userId: user.id } }),
    prisma.deliveryChannel.findMany({ where: { userId: user.id } }),
  ]);
  const plan = PLANS[user.plan];
  const channelByKind = new Map(channels.map((c) => [c.channel, c]));

  return (
    <div className="space-y-10">
      {error ? <Notice tone="warn">{ERRORS[error] ?? error}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      <section>
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Topics</h1>
          <span className="text-sm text-ink-3">{topics.length} / {plan.maxTopics}</span>
        </div>
        <ul className="mt-4 divide-y divide-rule rounded-lg border border-rule bg-card">
          {topics.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <Link href={`/app/topics/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
                <p className="text-xs text-ink-3">{t.query} · {t.lang} · {t._count.sources} sources</p>
              </div>
              <form action={deleteTopic}>
                <input type="hidden" name="topicId" value={t.id} />
                <button type="submit" className="text-xs text-ink-3 hover:text-warn">Remove</button>
              </form>
            </li>
          ))}
          {!topics.length ? <li className="px-4 py-6 text-sm text-ink-3">No topics yet. Add one below — sources are found automatically.</li> : null}
        </ul>
        {topics.length < plan.maxTopics ? (
          <form action={addTopic} className="card mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
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
        ) : null}
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Briefs</h2>
          {topics.length ? (
            <form action={briefNow}>
              <SubmitButton className="btn-quiet" pending="Polling, ranking, writing… ~1–2 min">Brief me now</SubmitButton>
            </form>
          ) : null}
        </div>
        <ul className="mt-4 divide-y divide-rule rounded-lg border border-rule bg-card">
          {briefs.map((b) => (
            <li key={b.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <Link href={`/app/briefs/${b.id}`} className="font-medium hover:underline">{b.title}</Link>
                <p className="text-xs text-ink-3">
                  {b.periodKey} · {b.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC ·{" "}
                  {b.deliveries.map((d) => `${d.channel.toLowerCase()} ${d.status.toLowerCase()}`).join(", ") || "web only"}
                </p>
              </div>
            </li>
          ))}
          {!briefs.length ? <li className="px-4 py-6 text-sm text-ink-3">No briefs yet. The first one arrives on your schedule, or press “Brief me now”.</li> : null}
        </ul>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <ScheduleForm
          action={updateSchedule}
          cadence={schedule?.cadence ?? "WEEKLY"}
          cadences={(["WEEKLY", "DAILY", "TWICE_DAILY"] as const).map((c) => ({ id: c, label: c.toLowerCase().replace("_", " "), allowed: cadenceAllowed(user.plan, c) }))}
          hour={schedule?.hour ?? 7}
          weekday={schedule?.weekday ?? 1}
          timezone={schedule?.timezone ?? "UTC"}
        />

        <div className="card space-y-4">
          <h2 className="font-semibold">Channels</h2>
          <p className="text-xs text-ink-3">The web view and plain text are always available. These are pushed to you.</p>
          {(Object.keys(CHANNEL_HELP) as (keyof typeof CHANNEL_HELP)[]).map((channel) => {
            const help = CHANNEL_HELP[channel];
            const row = channelByKind.get(channel);
            const allowed = channelAllowed(user.plan, channel);
            return (
              <form key={channel} action={setChannel} className="space-y-2 border-t border-rule pt-3 first:border-t-0 first:pt-0">
                <input type="hidden" name="channel" value={channel} />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {help.label}
                    {allowed ? "" : <span className="ml-2 text-xs text-ink-3">upgrade</span>}
                    {row && !row.verified ? <span className="wire ml-2 text-warn">unverified</span> : null}
                  </span>
                  <label className="flex items-center gap-2 text-xs text-ink-2">
                    <input type="checkbox" name="enabled" defaultChecked={row?.enabled ?? false} disabled={!allowed} /> on
                  </label>
                </div>
                <div className="flex gap-2">
                  <input className="input" name="address" placeholder={help.placeholder} defaultValue={row?.address ?? (channel === "EMAIL" ? user.email ?? "" : "")} disabled={!allowed} />
                  <button type="submit" className="btn-quiet" disabled={!allowed}>Save</button>
                </div>
                {help.note ? <p className="text-xs text-ink-3">{help.note}</p> : null}
              </form>
            );
          })}
          {channels.filter((c) => !c.verified && c.channel !== "AUDIO").map((c) => (
            <form key={`verify-${c.channel}`} action={verifyChannel} className="flex items-end gap-2 border-t border-rule pt-3">
              <input type="hidden" name="channel" value={c.channel} />
              <div className="flex-1">
                <span className="label mb-1">Verify {c.channel.toLowerCase()} · code sent to {c.address}</span>
                <input className="input font-mono" name="code" inputMode="numeric" placeholder="123456" required />
              </div>
              <button type="submit" className="btn-quiet">Verify</button>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}
