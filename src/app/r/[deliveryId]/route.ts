import { NextResponse } from "next/server";

import { verifyTracked } from "@/lib/domain/tracking";
import { prisma } from "@/lib/prisma";

/** Record the click, then forward. Never blocks the reader on a database hiccup. */
export async function GET(request: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  const { deliveryId } = await params;
  const url = new URL(request.url);
  const to = url.searchParams.get("to") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  const secret = process.env.AUTH_SECRET ?? "";
  const destination = secret ? verifyTracked(deliveryId, to, sig, secret) : null;
  if (!destination) return NextResponse.json({ error: "Bad link." }, { status: 400 });

  try {
    await prisma.$transaction([
      prisma.click.create({ data: { deliveryId, link: destination } }),
      prisma.delivery.updateMany({ where: { id: deliveryId, openedAt: null }, data: { openedAt: new Date() } }),
    ]);
  } catch (error) {
    console.warn("[tracking] click not recorded", error);
  }
  return NextResponse.redirect(destination, 302);
}
