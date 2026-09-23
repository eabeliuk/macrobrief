"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { makeViewAsCookie, VIEW_AS_COOKIE, VIEW_AS_MAX_AGE_S } from "@/lib/domain/impersonation";
import { PLAN_ORDER, type PlanId } from "@/lib/domain/plans";
import { pollDueSources } from "@/lib/ingest";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/session";
import { SHOWCASE_EMAIL } from "@/lib/showcase";

/** Invite = a User row. The beta gate admits any email that has one. */
export async function inviteUser(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const parsed = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!parsed.success) redirect("/app/admin?error=email");
  const email = parsed.data;
  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existing) redirect(`/app/admin?notice=${encodeURIComponent(`${email} already has an account.`)}`);
  await prisma.user.create({
    data: {
      email,
      schedule: { create: {} },
      channels: { create: { channel: "EMAIL", address: email, verified: true } },
    },
  });
  revalidatePath("/app/admin");
  redirect(`/app/admin?notice=${encodeURIComponent(`${email} invited — they can sign in with Google now.`)}`);
}

export async function setUserPlan(formData: FormData): Promise<void> {
  const admin = await requireSuperAdmin();
  const userId = String(formData.get("userId"));
  const plan = String(formData.get("plan")) as PlanId;
  if (!PLAN_ORDER.includes(plan)) redirect("/app/admin?error=plan");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.email === SHOWCASE_EMAIL) redirect("/app/admin?error=user");
  await prisma.user.update({ where: { id: userId }, data: { plan } });
  console.info(`[admin] ${admin.email} set ${user.email} → ${plan}`);
  revalidatePath("/app/admin");
  redirect("/app/admin");
}

/** Poll one source right now, regardless of its interval, and show the outcome. */
export async function pollSource(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("sourceId"));
  const source = await prisma.source.findUnique({ where: { id } });
  if (!source) redirect("/app/admin?error=source");
  if (!source.enabled) await prisma.source.update({ where: { id }, data: { enabled: true, failCount: 0 } });
  const result = await pollDueSources(new Date(), { sourceIds: [id] });
  const after = await prisma.source.findUnique({ where: { id } });
  revalidatePath("/app/admin");
  const msg = result.ok ? `Polled ${source.title ?? source.url}: ${result.inserted} new items.` : `Poll failed: ${after?.lastError ?? "unknown error"}`;
  redirect(`/app/admin?${result.ok ? "notice" : "error"}=${encodeURIComponent(msg)}#sources`);
}

export async function toggleSource(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("sourceId"));
  const source = await prisma.source.findUnique({ where: { id } });
  if (!source) redirect("/app/admin?error=source");
  // Re-enabling clears the failure count so the poller gives it a fresh run.
  await prisma.source.update({ where: { id }, data: { enabled: !source.enabled, failCount: source.enabled ? source.failCount : 0, lastError: null } });
  revalidatePath("/app/admin");
  redirect("/app/admin#sources");
}

/**
 * View a reader's account as they see it: topics, briefs, settings. Staff
 * powers are dropped for the duration and nothing can be changed — see
 * requireWriter. Every start is logged with both identities.
 */
export async function viewAsReader(formData: FormData): Promise<void> {
  const admin = await requireSuperAdmin();
  const userId = String(formData.get("userId"));
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!target || target.id === admin.id) redirect("/app/admin?error=user");
  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret) redirect("/app/admin?error=user");
  (await cookies()).set(VIEW_AS_COOKIE, makeViewAsCookie(target.id, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VIEW_AS_MAX_AGE_S,
  });
  console.info(`[admin] ${admin.email} is viewing ${target.email}`);
  redirect("/app/briefs");
}

export async function stopViewing(): Promise<void> {
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect("/app/admin");
}
