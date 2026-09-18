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
