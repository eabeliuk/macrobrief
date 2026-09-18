import { ScheduleForm } from "@/components/schedule-form";
import { Field, Notice } from "@/components/ui";
import { cadenceAllowed, channelAllowed, type ChannelId } from "@/lib/domain/plans";
import { AUDIO_SPEEDS } from "@/lib/domain/voices";
import { prisma } from "@/lib/prisma";
import { planOf, requireUser } from "@/lib/session";

import { ERRORS } from "../_shared";
import { setChannel, updateSchedule, verifyChannel } from "../actions";

const CHANNEL_HELP: Record<Exclude<ChannelId, "WEB" | "TEXT">, { label: string; placeholder: string; note?: string }> = {
  EMAIL: { label: "Email", placeholder: "you@example.com" },
  AUDIO: { label: "Audio", placeholder: "", note: undefined },
  WHATSAPP: { label: "WhatsApp", placeholder: "+56 9 1234 5678", note: "A short digest with a link to the full brief. Include the country code." },
  INSTAGRAM: { label: "Instagram", placeholder: "@handle", note: "Coming in M3 — you DM the bot, it replies with your brief." },
};

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const [schedule, channels] = await Promise.all([
    prisma.schedule.findUnique({ where: { userId: user.id } }),
    prisma.deliveryChannel.findMany({ where: { userId: user.id } }),
  ]);
  const channelByKind = new Map(channels.map((c) => [c.channel, c]));

  return (
    <div className="space-y-6">
      {error ? <Notice tone="warn">{ERRORS[error] ?? error}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      <h1 className="text-2xl font-bold tracking-tight">Schedule &amp; channels</h1>
      <section className="grid gap-6 sm:grid-cols-2">
        <ScheduleForm
          action={updateSchedule}
          cadence={schedule?.cadence ?? "WEEKLY"}
          cadences={(["WEEKLY", "DAILY", "TWICE_DAILY"] as const).map((c) => ({ id: c, label: c.toLowerCase().replace("_", " "), allowed: cadenceAllowed(planOf(user), c) }))}
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
            const allowed = channelAllowed(planOf(user), channel);
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
                  {channel !== "AUDIO" ? (
                    <input className="input" name="address" placeholder={help.placeholder} defaultValue={row?.address ?? (channel === "EMAIL" ? user.email ?? "" : "")} disabled={!allowed} />
                  ) : (
                    <span className="flex-1 self-center text-xs text-ink-3">Plays in the app; the email gets a Listen link.</span>
                  )}
                  <button type="submit" className="btn-quiet" disabled={!allowed}>Save</button>
                </div>
                {help.note ? <p className="text-xs text-ink-3">{help.note}</p> : null}
                {channel === "AUDIO" ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="label">Voice</span>
                    <select name="voice" className="input w-auto py-1 text-xs" defaultValue={user.audioVoice} disabled={planOf(user) === "FREE"}>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                    </select>
                    <span className="label">Speed</span>
                    <select name="speed" className="input w-auto py-1 text-xs" defaultValue={String(user.audioSpeed)} disabled={planOf(user) === "FREE"}>
                      {AUDIO_SPEEDS.map((r) => (
                        <option key={r} value={String(r)}>{r}×</option>
                      ))}
                    </select>
                    {planOf(user) === "FREE" ? <span className="text-xs text-ink-3">paid plans choose</span> : null}
                  </div>
                ) : null}
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
