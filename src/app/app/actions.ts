"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { composeDueBriefs } from "@/lib/briefs";
import { deliverPending } from "@/lib/delivery";
import { normalizeQuery } from "@/lib/domain/discovery";
import { cadenceAllowed, canAddTopic, channelAllowed, type CadenceId, type ChannelId } from "@/lib/domain/plans";
import { pollDueSources } from "@/lib/ingest";
import { prisma } from "@/lib/prisma";
import { ownedTopic, requireUser } from "@/lib/session";
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
  if (!canAddTopic(user.plan, count)) redirect("/app?error=limit");

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
  hour: z.coerce.number().int().min(0).max(23),
  weekday: z.coerce.number().int().min(0).max(6),
  timezone: z.string().min(1).max(64),
});

export async function updateSchedule(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = ScheduleInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app?error=schedule");
  const cadence: CadenceId = cadenceAllowed(user.plan, parsed.data.cadence) ? parsed.data.cadence : "WEEKLY";
  try {
    Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone });
  } catch {
    redirect("/app?error=timezone");
  }
  await prisma.schedule.upsert({
    where: { userId: user.id },
    update: { ...parsed.data, cadence },
    create: { userId: user.id, ...parsed.data, cadence },
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
  if (!channelAllowed(user.plan, channel)) redirect("/app?error=plan");
  // AUDIO has no address: it lives in the app and rides along in the email.
  const address = parsed.data.address || (channel === "EMAIL" ? user.email ?? "" : channel === "AUDIO" ? "app" : "");
  if (!address) redirect("/app?error=address");
  await prisma.deliveryChannel.upsert({
    where: { userId_channel: { userId: user.id, channel } },
    update: { address, enabled: parsed.data.enabled },
    create: { userId: user.id, channel, address, enabled: parsed.data.enabled, verified: channel === "EMAIL" && address === user.email },
  });
  revalidatePath("/app");
  redirect("/app");
}

/** "Brief me now": poll this user's sources, compose the due period if missing, deliver. */
export async function briefNow(): Promise<void> {
  const user = await requireUser();
  const now = new Date();
  const sources = await prisma.topicSource.findMany({ where: { topic: { userId: user.id } }, select: { sourceId: true } });
  await pollDueSources(now, { sourceIds: sources.map((s) => s.sourceId) });
  const result = await composeDueBriefs(now, { userId: user.id });
  await deliverPending();
  revalidatePath("/app");
  const reason = result.skipped[0]?.reason;
  redirect(reason ? `/app?notice=${encodeURIComponent(reason)}` : "/app");
}
