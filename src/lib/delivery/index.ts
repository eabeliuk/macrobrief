import type { Delivery } from "@prisma/client";

import { renderHtml, type Composed } from "@/lib/domain/brief";
import { sendEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";

/**
 * Sending. One row per (brief, channel); this walks the pending ones and
 * hands each to its channel. Channels that are not built yet are marked
 * SKIPPED with a reason, so the audit trail says what happened and no row
 * sits pending forever.
 */

const MAX_ATTEMPTS = 3;

export type DeliverSummary = { sent: number; failed: number; skipped: number };

export async function deliverPending({ limit = 50 } = {}): Promise<DeliverSummary> {
  const pending = await prisma.delivery.findMany({
    where: { status: "PENDING", attempts: { lt: MAX_ATTEMPTS } },
    include: { brief: { include: { sections: { orderBy: { position: "asc" } } } } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const summary: DeliverSummary = { sent: 0, failed: 0, skipped: 0 };
  for (const delivery of pending) {
    const outcome = await send(delivery);
    await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        attempts: { increment: 1 },
        status: outcome.status,
        error: outcome.error ?? null,
        sentAt: outcome.status === "SENT" ? new Date() : null,
      },
    });
    if (outcome.status === "SENT") summary.sent++;
    else if (outcome.status === "SKIPPED") summary.skipped++;
    else summary.failed++;
  }
  return summary;
}

type PendingDelivery = Delivery & {
  brief: { title: string; bodyText: string; bodyMd: string; sections: { topicId: string; heading: string; stories: unknown }[] };
};

type Outcome = { status: "SENT" | "FAILED" | "SKIPPED"; error?: string };

async function send(delivery: PendingDelivery): Promise<Outcome> {
  switch (delivery.channel) {
    case "EMAIL": {
      const composed: Composed = {
        title: delivery.brief.title,
        sections: delivery.brief.sections.map((s) => ({ topicId: s.topicId, heading: s.heading, stories: s.stories as Composed["sections"][number]["stories"] })),
      };
      const result = await sendEmail({
        to: delivery.address,
        subject: delivery.brief.title,
        text: delivery.brief.bodyText,
        html: renderHtml(composed),
      });
      return result.sent ? { status: "SENT" } : { status: "FAILED", error: result.error };
    }
    case "AUDIO":
    case "WHATSAPP":
    case "INSTAGRAM":
      return { status: "SKIPPED", error: `${delivery.channel} delivery is not live yet` };
    default:
      return { status: "SKIPPED", error: `${delivery.channel} has no sender` };
  }
}
