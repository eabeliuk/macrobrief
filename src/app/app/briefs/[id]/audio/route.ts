import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";
import { readObject, storageConfigured } from "@/lib/storage";

/** The brief's audio, streamed to its owner. Objects are private; this route is the only door. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"));
  const brief = await prisma.brief.findFirst({ where: { id, userId: user.id }, select: { audioUrl: true } });
  if (!brief?.audioUrl) return NextResponse.json({ error: "No audio for this brief." }, { status: 404 });
  if (!storageConfigured()) return NextResponse.json({ error: "Audio storage is not configured." }, { status: 503 });
  const object = await readObject(`briefs/${id}.mp3`);
  if (!object) return NextResponse.json({ error: "Audio not found." }, { status: 404 });
  return new NextResponse(new Uint8Array(object.data), {
    headers: { "Content-Type": object.contentType, "Content-Length": String(object.data.length), "Cache-Control": "private, no-cache" },
  });
}
