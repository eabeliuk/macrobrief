"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/** A share link is a random token on the brief; anyone with it can read that brief and nothing else. */
export async function shareBrief(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("briefId"));
  const brief = await prisma.brief.findFirst({ where: { id, userId: user.id }, select: { id: true, shareToken: true } });
  if (!brief) redirect("/app/briefs");
  if (!brief.shareToken) {
    await prisma.brief.update({ where: { id }, data: { shareToken: randomBytes(12).toString("base64url") } });
  }
  revalidatePath(`/app/briefs/${id}`);
  redirect(`/app/briefs/${id}?shared=1`);
}

export async function unshareBrief(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("briefId"));
  const brief = await prisma.brief.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!brief) redirect("/app/briefs");
  await prisma.brief.update({ where: { id }, data: { shareToken: null } });
  revalidatePath(`/app/briefs/${id}`);
  redirect(`/app/briefs/${id}`);
}

/** Staff: re-make a brief's audio — after a voice, speed or language fix. */
export async function regenerateAudio(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/app/briefs");
  const id = String(formData.get("briefId"));
  const brief = await prisma.brief.findFirst({ where: { id, userId: user.id }, include: { sections: { orderBy: { position: "asc" }, take: 1, include: { topic: { select: { lang: true } } } } } });
  if (!brief) redirect("/app/briefs");
  // The language the brief was written in is its first topic's.
  const lang = brief.sections[0]?.topic.lang ?? brief.lang;
  await prisma.brief.update({ where: { id }, data: { lang, audioUrl: null, audioSeconds: null } });
  await prisma.delivery.deleteMany({ where: { briefId: id, channel: "AUDIO" } });
  await prisma.delivery.create({ data: { briefId: id, channel: "AUDIO", address: "app" } });
  const { deliverPending } = await import("@/lib/delivery");
  await deliverPending();
  revalidatePath(`/app/briefs/${id}`);
  redirect(`/app/briefs/${id}`);
}
