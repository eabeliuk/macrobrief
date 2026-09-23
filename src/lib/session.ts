import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";

import { auth } from "@/auth";
import { readViewAsCookie, VIEW_AS_COOKIE } from "@/lib/domain/impersonation";
import type { PlanId } from "@/lib/domain/plans";
import { prisma } from "@/lib/prisma";

export async function currentUser(): Promise<User | null> {
  return (await viewer()).user;
}

export type Viewer = {
  /** Who the app should behave as — the reader being viewed while staff impersonate. */
  user: User | null;
  /** The signed-in person, always. */
  realUser: User | null;
  impersonating: boolean;
};

/**
 * Who is looking, and as whom. Staff may view a reader's account read-only:
 * the effective user is the reader with staff powers dropped, so admin
 * pages and staff-only actions are unavailable while viewing, and nothing
 * can be changed on the reader's behalf (see requireWriter).
 */
export async function viewer(): Promise<Viewer> {
  const session = await auth();
  if (!session?.user?.id) return { user: null, realUser: null, impersonating: false };
  const signedIn = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!signedIn) return { user: null, realUser: null, impersonating: false };
  const realUser = await settleStaff(signedIn);

  const raw = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  const targetId = realUser.isSuperAdmin ? readViewAsCookie(raw, process.env.AUTH_SECRET ?? "") : null;
  if (!targetId || targetId === realUser.id) return { user: realUser, realUser, impersonating: false };

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return { user: realUser, realUser, impersonating: false };
  return { user: { ...target, isSuperAdmin: false }, realUser, impersonating: true };
}

/**
 * Platform staff, from an allowlist, written once. The list decides who
 * becomes staff; the database decides who is — revoking is a write, not a
 * redeploy.
 */
async function settleStaff(user: User): Promise<User> {
  if (user.isSuperAdmin || !user.email) return user;
  const allowed = (process.env.SUPER_ADMINS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(user.email.toLowerCase())) return user;
  return prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: true } });
}

/** The plan whose limits apply. Staff run on Max whatever the stored plan says. */
export function planOf(user: Pick<User, "plan" | "isSuperAdmin">): PlanId {
  return user.isSuperAdmin ? "MAX" : user.plan;
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * A caller allowed to change things. Viewing a reader's account is
 * read-only: staff can see what a reader sees, never act as them.
 */
export async function requireWriter(): Promise<User> {
  const { user, impersonating } = await viewer();
  if (!user) redirect("/login");
  if (impersonating) redirect("/app/briefs?error=viewing");
  return user;
}

/** Platform staff only. Anyone else is sent to their own dashboard, not told the page exists. */
export async function requireSuperAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/app");
  return user;
}

/**
 * A topic the caller owns, or null. Every topic-scoped read and write goes
 * through here — an id in a URL is a guess anyone can make.
 */
export async function ownedTopic(user: User, topicId: string) {
  return prisma.topic.findFirst({ where: { id: topicId, userId: user.id } });
}
