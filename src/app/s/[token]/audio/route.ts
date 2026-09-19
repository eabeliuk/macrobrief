import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { readObject, storageConfigured } from "@/lib/storage";

/** The shared brief's audio: the token is the authorisation. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const brief = await prisma.brief.findUnique({ where: { shareToken: token }, select: { id: true, audioUrl: true } });
  if (!brief?.audioUrl) return NextResponse.json({ error: "No audio." }, { status: 404 });
  if (!storageConfigured()) return NextResponse.json({ error: "Audio storage is not configured." }, { status: 503 });
  const object = await readObject(`briefs/${brief.id}.mp3`);
  if (!object) return NextResponse.json({ error: "Audio not found." }, { status: 404 });
  return new NextResponse(new Uint8Array(object.data), {
    headers: { "Content-Type": object.contentType, "Content-Length": String(object.data.length), "Cache-Control": "private, no-cache" },
  });
}
