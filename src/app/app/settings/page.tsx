import { AutoInput, AutoSelect } from "@/components/auto-submit";
import { ScheduleForm } from "@/components/schedule-form";
import { Toggle } from "@/components/toggle";
import { Notice } from "@/components/ui";
import { cadenceAllowed, channelAllowed, type ChannelId } from "@/lib/domain/plans";
import { AUDIO_SPEEDS } from "@/lib/domain/voices";
import { prisma } from "@/lib/prisma";
import { planOf, requireUser } from "@/lib/session";
import { whatsappSenderNumber } from "@/lib/whatsapp";

import { ERRORS } from "../_shared";
import { resendCode, setAudioPrefs, setChannelAddress, toggleChannel, updateSchedule, verifyChannel } from "../actions";

/**
 * Where and when the brief arrives. Every control saves itself: toggles
 * are switches, selects save on choose, addresses save on blur or Enter.
 * A channel switched on without an address is flagged in red — it will
 * not receive anything until an address is set and verified.
 */

const CHANNELS: { id: Exclude<ChannelId, "WEB" | "TEXT">; label: string; placeholder?: string; note: string }[] = [
  { id: "EMAIL", label: "Email", note: "Sent to your account email." },
  { id: "AUDIO", label: "Audio", note: "The brief read aloud — a player in the app and a Listen link in the email." },
  { id: "WHATSAPP", label: "WhatsApp", placeholder: "+56 9 1234 5678", note: "A short digest with a link to the full brief. Include the country code." },
  { id: "INSTAGRAM", label: "Instagram", placeholder: "@handle", note: "Coming later — you DM the bot, it replies with your brief." },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const [schedule, channels] = await Promise.all([
    prisma.schedule.findUnique({ where: { userId: user.id } }),
    prisma.deliveryChannel.findMany({ where: { userId: user.id } }),
  ]);
  const rowOf = new Map(channels.map((c) => [c.channel, c]));
  const plan = planOf(user);
  const sender = whatsappSenderNumber();

  return (
    <div className="space-y-6">
      {error ? <Notice tone="warn">{ERRORS[error] ?? error}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="-mt-4 text-sm text-ink-2">When your brief arrives, and where. Changes save as you make them.</p>

      <section className="grid gap-6 lg:grid-cols-2">
        <ScheduleForm
          action={updateSchedule}
          cadence={schedule?.cadence ?? "WEEKLY"}
          cadences={(["WEEKLY", "DAILY", "TWICE_DAILY"] as const).map((c) => ({ id: c, label: c.toLowerCase().replace("_", " "), allowed: cadenceAllowed(plan, c) }))}
          hour={schedule?.hour ?? 7}
          weekday={schedule?.weekday ?? 1}
          timezone={schedule?.timezone ?? "UTC"}
        />

        <div className="card space-y-4">
          <h2 className="font-semibold">Channels</h2>
          <p className="text-xs text-ink-3">The web view and plain text are always available. These are pushed to you.</p>
          {CHANNELS.map((ch) => {
            const row = rowOf.get(ch.id);
            const allowed = channelAllowed(plan, ch.id);
            const on = row?.enabled ?? false;
            const needsAddress = ch.id === "WHATSAPP" || ch.id === "INSTAGRAM";
            const missing = needsAddress && on && !row?.address;
            const unverified = needsAddress && Boolean(row?.address) && !row?.verified;
            return (
              <div key={ch.id} className="space-y-2 border-t border-rule pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">
                    {ch.label}
                    {!allowed ? <span className="ml-2 text-xs text-ink-3">upgrade</span> : null}
                    {missing ? <span className="wire ml-2 text-warn">⚑ no {ch.id === "WHATSAPP" ? "number" : "handle"} — nothing will be sent</span> : null}
                    {unverified ? <span className="wire ml-2 text-warn">unverified</span> : null}
                  </span>
                  {allowed ? (
                    <form action={toggleChannel}>
                      <input type="hidden" name="channel" value={ch.id} />
                      <Toggle on={on} label={`${ch.label} ${on ? "active" : "disabled"}`} />
                    </form>
                  ) : (
                    <span className="wire text-ink-3">Disabled</span>
                  )}
                </div>

                {ch.id === "EMAIL" ? <p className="text-xs text-ink-2">{user.email}</p> : null}

                {needsAddress && allowed ? (
                  <form action={setChannelAddress}>
                    <input type="hidden" name="channel" value={ch.id} />
                    <AutoInput className={`input ${missing ? "border-warn" : ""}`} name="address" placeholder={ch.placeholder} defaultValue={row?.address ?? ""} aria-label={`${ch.label} address`} />
                  </form>
                ) : null}

                {unverified && ch.id === "WHATSAPP" && sender ? (
                  // Meta only lets a business text a number that messaged it in the last 24 h,
                  // so the reader opens the conversation first and then asks for the code.
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                    <span>
                      1. Send us any message on WhatsApp:{" "}
                      <a className="text-accent underline" href={`https://wa.me/${sender.replace(/\D/g, "")}?text=${encodeURIComponent("MacroBrief")}`} target="_blank" rel="noreferrer">
                        open chat with {sender}
                      </a>
                    </span>
                    <form action={resendCode} className="inline-flex items-center gap-2">
                      <input type="hidden" name="channel" value={ch.id} />
                      <span>2.</span>
                      <button type="submit" className="btn-quiet py-1 text-xs">Send code</button>
                    </form>
                  </div>
                ) : null}

                {unverified ? (
                  <form action={verifyChannel} className="flex items-end gap-2">
                    <input type="hidden" name="channel" value={ch.id} />
                    <div className="flex-1">
                      <span className="label mb-1">{ch.id === "WHATSAPP" ? "3. Enter the code" : `Enter the code sent to ${row?.address}`}</span>
                      <input className="input font-mono" name="code" inputMode="numeric" placeholder="123456" required />
                    </div>
                    <button type="submit" className="btn-quiet">Verify</button>
                  </form>
                ) : null}

                {ch.id === "AUDIO" && allowed ? (
                  <form action={setAudioPrefs} className="flex items-center gap-2">
                    <span className="label">Voice</span>
                    <AutoSelect name="voice" className="input w-auto py-1 text-xs" defaultValue={user.audioVoice} disabled={plan === "FREE"}>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                    </AutoSelect>
                    <span className="label">Speed</span>
                    <AutoSelect name="speed" className="input w-auto py-1 text-xs" defaultValue={String(user.audioSpeed)} disabled={plan === "FREE"}>
                      {AUDIO_SPEEDS.map((r) => (
                        <option key={r} value={String(r)}>{r}×</option>
                      ))}
                    </AutoSelect>
                    {plan === "FREE" ? <span className="text-xs text-ink-3">paid plans choose</span> : null}
                  </form>
                ) : null}

                <p className="text-xs text-ink-3">{ch.note}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
