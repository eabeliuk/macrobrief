"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { composeOnDemand } from "@/lib/briefs";
import { deliverPending } from "@/lib/delivery";
import { normalizeQuery } from "@/lib/domain/discovery";
import type { Channel } from "@prisma/client";

import { cadenceAllowed, canAddTopic, channelAllowed, type CadenceId, type ChannelId } from "@/lib/domain/plans";
import { CODE_TTL_MIN, codeMatches, needsVerification, newCode } from "@/lib/domain/verification";
import { isAudioSpeed } from "@/lib/domain/voices";
import { normalizeE164 } from "@/lib/domain/whatsapp";
import { sendEmail } from "@/lib/mailer";
import { sendWhatsAppCode, whatsappConfigured } from "@/lib/whatsapp";
import { pollDueSources } from "@/lib/ingest";
import { prisma } from "@/lib/prisma";
import { ownedTopic, planOf, requireWriter } from "@/lib/session";
import { attachManualSource, attachSourcesForTopic } from "@/lib/sources";

/**
 * Every action re-derives the caller from the session and checks ownership
 * of anything it touches. Ids from the form are guesses until proven.
 */

const TopicInput = z.object({
  name: z.string().trim().min(2).max(120),
  query: z.string().trim().max(200).optional(),
  lang: z.enum(["en", "es", "pt", "fr", "de"]).default("en"),
});

export async function addTopic(formData: FormData): Promise<void> {
  const user = await requireWriter();
  const parsed = TopicInput.safeParse({
    name: formData.get("name"),
    query: formData.get("query") || undefined,
    lang: formData.get("lang") || "en",
  });
  if (!parsed.success) redirect("/app/topics?error=topic");

  const count = await prisma.topic.count({ where: { userId: user.id } });
  if (!canAddTopic(planOf(user), count)) redirect("/app/topics?error=limit");

  const topic = await prisma.topic.create({
    data: {
      userId: user.id,
      name: parsed.data.name,
      query: normalizeQuery(parsed.data.query || parsed.data.name),
      lang: parsed.data.lang,
    },
  });
  // Query feeds are attached immediately; publisher suggestions take a few
  // seconds of model + fetch time and run inline so the topic page is
  // complete when it first renders.
  await attachSourcesForTopic(topic);
  const sources = await prisma.topicSource.findMany({ where: { topicId: topic.id }, select: { sourceId: true } });
  await pollDueSources(new Date(), { sourceIds: sources.map((s) => s.sourceId) });
  revalidatePath("/app/topics");
  redirect(`/app/topics/${topic.id}`);
}

export async function deleteTopic(formData: FormData): Promise<void> {
  const user = await requireWriter();
  const topic = await ownedTopic(user, String(formData.get("topicId")));
  if (topic) await prisma.topic.delete({ where: { id: topic.id } });
  revalidatePath("/app/topics");
  redirect("/app/topics");
}

export async function addSource(formData: FormData): Promise<void> {
  const user = await requireWriter();
  const topic = await ownedTopic(user, String(formData.get("topicId")));
  if (!topic) redirect("/app/topics");
  const url = String(formData.get("url") ?? "").trim();
  try {
    await attachManualSource(topic, url);
  } catch (error) {
    redirect(`/app/topics/${topic.id}?error=${encodeURIComponent((error as Error).message.slice(0, 200))}`);
  }
  revalidatePath(`/app/topics/${topic.id}`);
  redirect(`/app/topics/${topic.id}`);
}

export async function removeSource(formData: FormData): Promise<void> {
  const user = await requireWriter();
  const topic = await ownedTopic(user, String(formData.get("topicId")));
  if (!topic) redirect("/app/topics");
  const sourceId = String(formData.get("sourceId"));
  // Only the join row: the source stays for everyone else following it.
  await prisma.topicSource.deleteMany({ where: { topicId: topic.id, sourceId } });
  revalidatePath(`/app/topics/${topic.id}`);
  redirect(`/app/topics/${topic.id}`);
}

const ScheduleInput = z.object({
  cadence: z.enum(["WEEKLY", "DAILY", "TWICE_DAILY"]),
  // The form speaks a 12-hour clock; the schedule stores 0–23.
  hour12: z.coerce.number().int().min(1).max(12),
  meridiem: z.enum(["AM", "PM"]),
  weekday: z.coerce.number().int().min(0).max(6),
  timezone: z.string().min(1).max(64),
});

export async function updateSchedule(formData: FormData): Promise<void> {
  const user = await requireWriter();
  const parsed = ScheduleInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/settings?error=schedule");
  const cadence: CadenceId = cadenceAllowed(planOf(user), parsed.data.cadence) ? parsed.data.cadence : "WEEKLY";
  try {
    Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone });
  } catch {
    redirect("/app/settings?error=timezone");
  }
  const { hour12, meridiem, weekday, timezone } = parsed.data;
  const hour = (hour12 % 12) + (meridiem === "PM" ? 12 : 0);
  await prisma.schedule.upsert({
    where: { userId: user.id },
    update: { cadence, hour, weekday, timezone },
    create: { userId: user.id, cadence, hour, weekday, timezone },
  });
  revalidatePath("/app/settings");
  redirect("/app/settings");
}

const CHANNEL_IDS = ["EMAIL", "AUDIO", "WHATSAPP", "INSTAGRAM"] as const;
type PushChannel = (typeof CHANNEL_IDS)[number];

function isPushChannel(value: string): value is PushChannel {
  return (CHANNEL_IDS as readonly string[]).includes(value);
}

/** Flip a channel between Active and Disabled. The row is created on first use. */
export async function toggleChannel(formData: FormData): Promise<void> {
  const user = await requireWriter();
  const channel = String(formData.get("channel"));
  if (!isPushChannel(channel)) redirect("/app/settings?error=channel");
  if (!channelAllowed(planOf(user), channel)) redirect("/app/settings?error=plan");
  const existing = await prisma.deliveryChannel.findUnique({ where: { userId_channel: { userId: user.id, channel } } });
  if (existing) {
    await prisma.deliveryChannel.update({ where: { id: existing.id }, data: { enabled: !existing.enabled } });
  } else {
    // Email is always the account's own address; audio lives in the app. Both are verified by construction.
    const address = channel === "EMAIL" ? (user.email ?? "") : channel === "AUDIO" ? "app" : "";
    await prisma.deliveryChannel.create({ data: { userId: user.id, channel, address, enabled: true, verified: channel === "EMAIL" || channel === "AUDIO" } });
  }
  revalidatePath("/app/settings");
  redirect("/app/settings");
}

/** Set the address of a WhatsApp or Instagram channel; a changed address must be verified again. */
export async function setChannelAddress(formData: FormData): Promise<void> {
  const user = await requireWriter();
  const channel = String(formData.get("channel"));
  if (channel !== "WHATSAPP" && channel !== "INSTAGRAM") redirect("/app/settings?error=channel");
  if (!channelAllowed(planOf(user), channel)) redirect("/app/settings?error=plan");
  let address = String(formData.get("address") ?? "").trim();
  if (channel === "WHATSAPP" && address) {
    // Refuse a number without a country code rather than guess one.
    const phone = normalizeE164(address);
    if (!phone) redirect("/app/settings?error=phone");
    address = phone;
  }
  const existing = await prisma.deliveryChannel.findUnique({ where: { userId_channel: { userId: user.id, channel } } });
  if (existing?.address === address) redirect("/app/settings");

  const challenge = Boolean(address) && needsVerification(channel, address, user.email);
  const code = challenge ? newCode() : null;
  const expires = code ? new Date(Date.now() + CODE_TTL_MIN * 60_000) : null;
  await prisma.deliveryChannel.upsert({
    where: { userId_channel: { userId: user.id, channel } },
    update: { address, verified: !challenge, verifyCode: code, verifyExpires: expires },
    create: { userId: user.id, channel, address, enabled: existing?.enabled ?? true, verified: !challenge, verifyCode: code, verifyExpires: expires },
  });
  revalidatePath("/app/settings");
  if (code) {
    const sent = await sendCode(channel, address, code);
    redirect(sent ? `/app/settings?notice=${encodeURIComponent(`Code sent to ${address} — enter it to verify.`)}` : `/app/settings?error=codesend`);
  }
  redirect("/app/settings");
}

/** Voice and speed for audio briefs — a choice for paid plans; Free readers keep the defaults. */
export async function setAudioPrefs(formData: FormData): Promise<void> {
  const user = await requireWriter();
  if (planOf(user) === "FREE") redirect("/app/settings?error=plan");
  const voice = String(formData.get("voice") ?? user.audioVoice);
  const speed = Number(formData.get("speed") ?? user.audioSpeed);
  if ((voice !== "MALE" && voice !== "FEMALE") || !isAudioSpeed(speed)) redirect("/app/settings?error=voice");
  await prisma.user.update({ where: { id: user.id }, data: { audioVoice: voice, audioSpeed: speed } });
  revalidatePath("/app/settings");
  redirect("/app/settings");
}

async function sendCode(channel: string, address: string, code: string): Promise<boolean> {
  const text = `Your MacroBrief verification code is ${code}. It expires in ${CODE_TTL_MIN} minutes.`;
  if (channel === "EMAIL") return (await sendEmail({ to: address, subject: `${code} is your MacroBrief code`, text })).sent;
  if (channel === "WHATSAPP" && whatsappConfigured()) {
    return (await sendWhatsAppCode(address, code, text)).sent;
  }
  return false;
}

/**
 * A fresh code on request. WhatsApp needs it: the first code (sent on save)
 * bounces until the reader has messaged the sender, so the page asks them to
 * do that and then tap Send code.
 */
export async function resendCode(formData: FormData): Promise<void> {
  const user = await requireWriter();
  const channel = String(formData.get("channel"));
  if (!isPushChannel(channel)) redirect("/app/settings?error=channel");
  const row = await prisma.deliveryChannel.findUnique({ where: { userId_channel: { userId: user.id, channel } } });
  if (!row?.address || row.verified) redirect("/app/settings?error=channel");
  const code = newCode();
  await prisma.deliveryChannel.update({ where: { id: row.id }, data: { verifyCode: code, verifyExpires: new Date(Date.now() + CODE_TTL_MIN * 60_000) } });
  revalidatePath("/app/settings");
  const sent = await sendCode(channel, row.address, code);
  redirect(sent ? `/app/settings?notice=${encodeURIComponent(`Code sent to ${row.address} — enter it to verify.`)}` : `/app/settings?error=codesend`);
}

export async function verifyChannel(formData: FormData): Promise<void> {
  const user = await requireWriter();
  const channel = String(formData.get("channel"));
  if (!isPushChannel(channel)) redirect("/app/settings?error=channel");
  const row = await prisma.deliveryChannel.findUnique({ where: { userId_channel: { userId: user.id, channel } } });
  if (!row) redirect("/app/settings?error=channel");
  if (!codeMatches(String(formData.get("code") ?? ""), row.verifyCode, row.verifyExpires, new Date())) redirect("/app/settings?error=code");
  await prisma.deliveryChannel.update({ where: { id: row.id }, data: { verified: true, verifyCode: null, verifyExpires: null } });
  revalidatePath("/app/settings");
  redirect(`/app/settings?notice=${encodeURIComponent(`${row.address} verified.`)}`);
}

/**
 * "Brief me now": poll this reader's sources, compose a fresh on-demand
 * brief, deliver, open it. Staff only — each press is a model call, and
 * readers get their briefs on the schedule they chose.
 */
export async function briefNow(formData: FormData): Promise<void> {
  const user = await requireWriter();
  if (!user.isSuperAdmin) redirect("/app/briefs");
  const now = new Date();
  // Scoped to one topic when the form names one (the per-topic button); all topics otherwise.
  const topic = formData.get("topicId") ? await ownedTopic(user, String(formData.get("topicId"))) : null;
  const sources = await prisma.topicSource.findMany({ where: topic ? { topicId: topic.id } : { topic: { userId: user.id } }, select: { sourceId: true } });
  await pollDueSources(now, { sourceIds: sources.map((s) => s.sourceId) });
  const outcome = await composeOnDemand(user.id, now, topic ? { topicId: topic.id } : {});
  if (!outcome.ok) redirect(`/app/topics?notice=${encodeURIComponent(`No brief made: ${outcome.reason}.`)}`);
  await deliverPending();
  revalidatePath("/app/briefs");
  redirect(`/app/briefs/${outcome.briefId}`);
}
