import type { Composed } from "./brief";

/**
 * A WhatsApp message is a glance, not a document: bold title, the intro,
 * each topic with its headlines, one link to the full brief. Headlines are
 * dropped from the end before the link ever is, so the message always
 * fits the provider's limit.
 */

const NOTHING_NEW = "nothing new";

export function whatsappText(c: Composed, briefUrl: string, maxChars: number): string {
  const head = [`*${c.title}*`, c.intro ? c.intro : null].filter(Boolean).join("\n");
  const tail = `Full brief: ${briefUrl}`;
  const lines: string[] = [];
  for (const section of c.sections) {
    if (!section.stories.length) {
      lines.push(`*${section.heading}* — ${NOTHING_NEW}`);
      continue;
    }
    lines.push(`*${section.heading}*`);
    for (const story of section.stories) lines.push(`• ${story.headline}${story.publisher ? ` (${story.publisher})` : ""}`);
  }
  const assemble = (body: string[]) => [head, body.join("\n"), tail].filter(Boolean).join("\n\n");
  let body = lines;
  while (assemble(body).length > maxChars && body.length) body = body.slice(0, -1);
  return assemble(body);
}

const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/**
 * E.164 or null. A number without a country code is refused rather than
 * guessed: the wrong guess sends someone's brief to a stranger.
 */
export function normalizeE164(input: string): string | null {
  const raw = input.trim().replace(/^whatsapp:/i, "");
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;
  // Without "+", only a leading 1 (NANP) is unambiguous enough to accept.
  if (!hasPlus && !digits.startsWith("1")) return null;
  if (!hasPlus && digits.length !== 11) return null;
  return `+${digits}`;
}
