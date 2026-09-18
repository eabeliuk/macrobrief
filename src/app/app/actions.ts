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
import { normalizeE164 } from "@/lib/domain/whatsapp";
import { sendEmail } from "@/lib/mailer";
import { sendWhatsApp, whatsappConfigured } from "@/lib/whatsapp";
import { pollDueSources } from "@/lib/ingest";
import { prisma } from "@/lib/prisma";
import { ownedTopic, planOf, requireUser } from "@/lib/session";
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
  const user = await requireUser();
  const parsed = TopicInput.safeParse({
    name: formData.get("name"),
    query: formData.get("query") || undefined,
    lang: formData.get("lang") || "en",
  });
  if (!parsed.success) redirect("/app?error=topic");

  const count = await prisma.topic.count({ where: { userId: user.id } });
  if (!canAddTopic(planOf(user), count)) redirect("/app?error=limit");

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
  revalidatePath("/app");
  redirect(`/app/topics/${topic.id}`);
}

export async function deleteTopic(formData: FormData): Promise<void> {
  const user = await requireUser();
  const topic = await ownedTopic(user, String(formData.get("topicId")));
  if (topic) await prisma.topic.delete({ where: { id: topic.id } });
  revalidatePath("/app");
  redirect("/app");
}

export async function addSource(formData: FormData): Promise<void> {
  const user = await requireUser();
  const topic = await ownedTopic(user, String(formData.get("topicId")));
  if (!topic) redirect("/app");
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
  const user = await requireUser();
  const topic = await ownedTopic(user, String(formData.get("topicId")));
  if (!topic) redirect("/app");
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
  const user = await requireUser();
  const parsed = ScheduleInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app?error=schedule");
  const cadence: CadenceId = cadenceAllowed(planOf(user), parsed.data.cadence) ? parsed.data.cadence : "WEEKLY";
  try {
    Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone });
  } catch {
    redirect("/app?error=timezone");
  }
  const { hour12, meridiem, weekday, timezone } = parsed.data;
  const hour = (hour12 % 12) + (meridiem === "PM" ? 12 : 0);
  await prisma.schedule.upsert({
    where: { userId: user.id },
    update: { cadence, hour, weekday, timezone },
    create: { userId: user.id, cadence, hour, weekday, timezone },
  });
  revalidatePath("/app");
  redirect("/app");
}

const ChannelInput = z.object({
  channel: z.enum(["EMAIL", "WHATSAPP", "INSTAGRAM", "AUDIO"]),
  address: z.string().trim().max(200),
  enabled: z.coerce.boolean(),
});

export async function setChannel(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = ChannelInput.safeParse({
    channel: formData.get("channel"),
    address: formData.get("address") ?? "",
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success) redirect("/app?error=channel");
  const channel: ChannelId = parsed.data.channel;
  if (!channelAllowed(planOf(user), channel)) redirect("/app?error=plan");
  // AUDIO has no address: it lives in the app and rides along in the email.
  let address = parsed.data.address || (channel === "EMAIL" ? user.email ?? "" : channel === "AUDIO" ? "app" : "");
  if (channel === "WHATSAPP") {
    // Refuse a number without a country code rather than guess one.
    const phone = address ? normalizeE164(address) : null;
    if (!phone) redirect("/app?error=phone");
    address = phone;
  }
  if (!address) redirect("/app?error=address");

  const existing = await prisma.deliveryChannel.findUnique({ where: { userId_channel: { userId: user.id, channel } } });
  const unchanged = existing?.address === address;
  const challenge = needsVerification(channel, address, user.email);
  // A verified address stays verified; a new or changed one that needs
  // proving starts unverified with a fresh code.
  const verified = unchanged ? existing.verified : !challenge;
  const code = challenge && !verified ? newCode() : null;

  await prisma.deliveryChannel.upsert({
    where: { userId_channel: { userId: user.id, channel } },
    update: { address, enabled: parsed.data.enabled, verified, ...(code ? { verifyCode: code, verifyExpires: new Date(Date.now() + CODE_TTL_MIN * 60_000) } : {}) },
    create: { userId: user.id, channel, address, enabled: parsed.data.enabled, verified, verifyCode: code, verifyExpires: code ? new Date(Date.now() + CODE_TTL_MIN * 60_000) : null },
  });
  revalidatePath("/app");
  if (code) {
    const sent = await sendCode(channel, address, code);
    redirect(sent ? `/app?notice=${encodeURIComponent(`Code sent to ${address} — enter it below to verify.`)}` : `/app?error=codesend`);
  }
  redirect("/app");
}

async function sendCode(channel: ChannelId, address: string, code: string): Promise<boolean> {
  const text = `Your MacroBrief verification code is ${code}. It expires in ${CODE_TTL_MIN} minutes.`;
  if (channel === "EMAIL") return (await sendEmail({ to: address, subject: `${code} is your MacroBrief code`, text })).sent;
  if (channel === "WHATSAPP" && whatsappConfigured()) {
    return (await sendWhatsApp(address, { title: "MacroBrief code", body: text, link: "", text })).sent;
  }
  return false;
}

export async function verifyChannel(formData: FormData): Promise<void> {
  const user = await requireUser();
  const channel = String(formData.get("channel")) as ChannelId;
  const row = await prisma.deliveryChannel.findUnique({ where: { userId_channel: { userId: user.id, channel: channel as Channel } } });
  if (!row) redirect("/app?error=channel");
  if (!codeMatches(String(formData.get("code") ?? ""), row.verifyCode, row.verifyExpires, new Date())) redirect("/app?error=code");
  await prisma.deliveryChannel.update({ where: { id: row.id }, data: { verified: true, verifyCode: null, verifyExpires: null } });
  revalidatePath("/app");
  redirect(`/app?notice=${encodeURIComponent(`${row.address} verified.`)}`);
}

/** "Brief me now": poll this reader's sources, compose a fresh on-demand brief, deliver, open it. */
export async function briefNow(): Promise<void> {
  const user = await requireUser();
  const now = new Date();
  const sources = await prisma.topicSource.findMany({ where: { topic: { userId: user.id } }, select: { sourceId: true } });
  await pollDueSources(now, { sourceIds: sources.map((s) => s.sourceId) });
  const outcome = await composeOnDemand(user.id, now);
  if (!outcome.ok) redirect(`/app?notice=${encodeURIComponent(`No brief made: ${outcome.reason}.`)}`);
  await deliverPending();
  revalidatePath("/app");
  redirect(`/app/briefs/${outcome.briefId}`);
}
