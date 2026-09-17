import { redirect } from "next/navigation";
import type { User } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function currentUser(): Promise<User | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  return user ? settleStaff(user) : null;
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

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
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
