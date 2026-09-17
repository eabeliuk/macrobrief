import type { Composed } from "./brief";

/**
 * The brief, as something to be read aloud. Links and bullets are for eyes;
 * a listener gets the headline, who reported it, and the summary, with the
 * topic named before its stories. Pure — the synthesis lives in lib/tts.ts.
 */

const NOTHING_NEW = "Nothing new this period.";
const SIGN_OFF = "That's your brief.";

export function audioScript(c: Composed): string {
  const paragraphs: string[] = [sentence(c.title)];
  if (c.intro) paragraphs.push(sentence(c.intro));
  for (const section of c.sections) {
    const lines = [sentence(section.heading)];
    if (!section.stories.length) lines.push(NOTHING_NEW);
    for (const story of section.stories) {
      const who = story.publisher ? `, from ${story.publisher}` : "";
      lines.push(`${story.headline.replace(/[.!?]+$/, "")}${who}. ${sentence(story.summary)}`);
    }
    paragraphs.push(lines.join(" "));
  }
  paragraphs.push(SIGN_OFF);
  return paragraphs.join("\n\n");
}

function sentence(text: string): string {
  const t = text.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/**
 * Split a script into chunks under `max` characters, on paragraph breaks
 * first and sentence ends second, so each chunk is a natural pause. The
 * provider caps request length; the chunks' audio is concatenated after.
 */
export function chunkScript(script: string, max: number): string[] {
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const para of script.split(/\n\n+/)) {
    const pieces = para.length > max ? splitSentences(para, max) : [para];
    for (const piece of pieces) {
      const next = current ? `${current}\n\n${piece}` : piece;
      if (next.length > max) push();
      current = current ? `${current}\n\n${piece}` : piece;
      if (current.length > max) push();
    }
  }
  push();
  return chunks;
}

function splitSentences(para: string, max: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const s of para.split(/(?<=[.!?…])\s+/)) {
    const next = current ? `${current} ${s}` : s;
    if (next.length > max && current) {
      out.push(current);
      current = s;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out;
}
