"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireWriter } from "@/lib/session";

const ProfileInput = z.object({ name: z.string().trim().max(80) });

export async function updateProfile(formData: FormData): Promise<void> {
  const user = await requireWriter();
  const parsed = ProfileInput.safeParse({ name: formData.get("name") ?? "" });
  if (!parsed.success) redirect("/app/profile?error=name");
  await prisma.user.update({ where: { id: user.id }, data: { name: parsed.data.name || null } });
  revalidatePath("/app");
  redirect("/app/profile?saved=1");
}
