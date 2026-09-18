import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

/**
 * Short story link: `/l/<item id>` → the story's URL. Used in plain-text
 * briefs, where a 300-character redirect URL is unreadable. With `?d=`,
 * the open is recorded against that delivery; without it, just forwarded.
 * The item id is unguessable (cuid) and the destination comes from our own
 * row, so this is not an open redirect.
 */
export async function GET(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { link: true } });
  if (!item || !/^https?:\/\//i.test(item.link)) return NextResponse.json({ error: "Unknown story." }, { status: 404 });

  const deliveryId = new URL(request.url).searchParams.get("d");
  if (deliveryId) {
    try {
      await prisma.$transaction([
        prisma.click.create({ data: { deliveryId, link: item.link } }),
        prisma.delivery.updateMany({ where: { id: deliveryId, openedAt: null }, data: { openedAt: new Date() } }),
      ]);
    } catch {
      // An unknown delivery id must not stop the reader reaching the story.
    }
  }
  return NextResponse.redirect(item.link, 302);
}
