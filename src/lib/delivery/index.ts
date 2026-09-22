import type { Delivery } from "@prisma/client";

import { audioSegments, mp3Seconds } from "@/lib/domain/audio";
import { renderHtml, type Composed } from "@/lib/domain/brief";
import { trackedUrl } from "@/lib/domain/tracking";
import { whatsappText } from "@/lib/domain/whatsapp";
import { sendEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/stripe/client";
import { saveObject, storageConfigured } from "@/lib/storage";
import { synthesize, ttsConfigured } from "@/lib/tts";
import { WHATSAPP_MAX_CHARS, sendWhatsApp, whatsappConfigured } from "@/lib/whatsapp";

/**
 * Sending. One row per (brief, channel); this walks the pending ones and
 * hands each to its channel. Channels that are not built yet are marked
 * SKIPPED with a reason, so the audit trail says what happened and no row
 * sits pending forever.
 */

const MAX_ATTEMPTS = 3;
/** Audio first, so the email that follows can link to it. */
const CHANNEL_ORDER: Record<string, number> = { AUDIO: 0, EMAIL: 1, WHATSAPP: 2, INSTAGRAM: 3 };

export type DeliverSummary = { sent: number; failed: number; skipped: number };

export async function deliverPending({ limit = 50 } = {}): Promise<DeliverSummary> {
  const pending = await prisma.delivery.findMany({
    where: { status: "PENDING", attempts: { lt: MAX_ATTEMPTS } },
    include: { brief: { include: { sections: { orderBy: { position: "asc" } }, user: { select: { audioVoice: true, audioSpeed: true } } } } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  pending.sort((a, b) => (CHANNEL_ORDER[a.channel] ?? 9) - (CHANNEL_ORDER[b.channel] ?? 9));

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
  brief: {
    id: string;
    title: string;
    bodyText: string;
    bodyMd: string;
    sections: { topicId: string; heading: string; stories: unknown }[];
    lang: string;
    user: { audioVoice: "MALE" | "FEMALE"; audioSpeed: number };
  };
};

function composedOf(brief: PendingDelivery["brief"]): Composed {
  return {
    title: brief.title,
    sections: brief.sections.map((s) => ({ topicId: s.topicId, heading: s.heading, stories: s.stories as Composed["sections"][number]["stories"] })),
  };
}

type Outcome = { status: "SENT" | "FAILED" | "SKIPPED"; error?: string };

async function send(delivery: PendingDelivery): Promise<Outcome> {
  switch (delivery.channel) {
    case "EMAIL": {
      // Re-read: an AUDIO delivery earlier in this run may have set audioUrl.
      const fresh = await prisma.brief.findUnique({ where: { id: delivery.brief.id }, select: { audioUrl: true } });
      const listen = fresh?.audioUrl ? `${siteUrl()}${fresh.audioUrl}` : null;
      // Short links in the text body carry the delivery id so an open from a text-only client is recorded too.
      const text = delivery.brief.bodyText.replace(/(\/l\/[a-z0-9]+)(?=\s|$)/g, `$1?d=${delivery.id}`);
      const result = await sendEmail({
        to: delivery.address,
        subject: delivery.brief.title,
        text: listen ? `Listen to this brief: ${listen}\n\n${text}` : text,
        html: renderHtml(composedOf(delivery.brief), {
          listenUrl: listen,
          // Story links go through the signed redirect so opens are recorded.
          linkFor: process.env.AUTH_SECRET ? (url) => trackedUrl(siteUrl(), delivery.id, url, process.env.AUTH_SECRET!) : undefined,
        }),
      });
      return result.sent ? { status: "SENT" } : { status: "FAILED", error: result.error };
    }
    case "AUDIO": {
      if (!ttsConfigured()) return { status: "FAILED", error: "audio not configured" };
      if (!storageConfigured()) return { status: "FAILED", error: "audio storage not configured (AUDIO_BUCKET)" };
      // The brief's own language, recorded at composition — not the reader's first topic.
      const lang = delivery.brief.lang;
      const mp3 = await synthesize(audioSegments(composedOf(delivery.brief), lang), lang, delivery.brief.user.audioVoice, delivery.brief.user.audioSpeed);
      await saveObject(`briefs/${delivery.brief.id}.mp3`, mp3, "audio/mpeg");
      // The app streams it after an ownership check; the URL is never a public object.
      // A version stamp in the URL: a regenerated file must never be served from the browser's cache of the old one.
      await prisma.brief.update({ where: { id: delivery.brief.id }, data: { audioUrl: `/app/briefs/${delivery.brief.id}/audio?v=${Date.now()}`, audioSeconds: mp3Seconds(mp3.length) } });
      return { status: "SENT" };
    }
    case "WHATSAPP": {
      if (!whatsappConfigured()) return { status: "FAILED", error: "whatsapp not configured (TELNYX_* or TWILIO_*)" };
      const composed = composedOf(delivery.brief);
      const link = `${siteUrl()}/app/briefs/${delivery.brief.id}`;
      const text = whatsappText(composed, link, WHATSAPP_MAX_CHARS);
      // Template variable 2 is the digest without the title/link lines the template already frames.
      const body = text.split("\n\n").slice(1, -1).join("\n\n");
      const result = await sendWhatsApp(delivery.address, { title: composed.title, body, link, text });
      return result.sent ? { status: "SENT" } : { status: "FAILED", error: result.error };
    }
    case "INSTAGRAM":
      return { status: "SKIPPED", error: `${delivery.channel} delivery is not live yet` };
    default:
      return { status: "SKIPPED", error: `${delivery.channel} has no sender` };
  }
}
