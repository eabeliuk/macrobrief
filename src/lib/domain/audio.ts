import type { Composed } from "./brief";

/**
 * The brief, as something to be read aloud.
 *
 * A listener cannot see where one story ends and the next begins, so the
 * script gives them two cues: silence (SSML breaks — short between stories,
 * longer between topics) and signposts ("Story two of four", "Next topic:
 * …"), in the brief's language. Links and bullets are for eyes; a listener
 * gets the headline, who reported it, and the summary. Pure — synthesis
 * lives in lib/tts.ts.
 */

export type Lang = "en" | "es" | "pt" | "fr" | "de";

const WORDS: Record<Lang, { next: string; topic: (name: string, n: number) => string; story: (i: number, n: number) => string; from: (p: string) => string; nothing: string; end: string }> = {
  en: { next: "Next topic.", topic: (name, n) => `${n === 1 ? "One story" : `${n} stories`} on ${name}.`, story: (i, n) => `Story ${i} of ${n}.`, from: (p) => `from ${p}`, nothing: "Nothing new this period.", end: "That's your brief." },
  es: { next: "Siguiente tema.", topic: (name, n) => `${n === 1 ? "Una noticia" : `${n} noticias`} sobre ${name}.`, story: (i, n) => `Noticia ${i} de ${n}.`, from: (p) => `de ${p}`, nothing: "Nada nuevo en este período.", end: "Ese fue tu resumen." },
  pt: { next: "Próximo tema.", topic: (name, n) => `${n === 1 ? "Uma notícia" : `${n} notícias`} sobre ${name}.`, story: (i, n) => `Notícia ${i} de ${n}.`, from: (p) => `de ${p}`, nothing: "Nada de novo neste período.", end: "Esse foi o seu resumo." },
  fr: { next: "Sujet suivant.", topic: (name, n) => `${n === 1 ? "Une actualité" : `${n} actualités`} sur ${name}.`, story: (i, n) => `Actualité ${i} sur ${n}.`, from: (p) => `selon ${p}`, nothing: "Rien de nouveau cette période.", end: "C'était votre brief." },
  de: { next: "Nächstes Thema.", topic: (name, n) => `${n === 1 ? "Eine Meldung" : `${n} Meldungen`} zu ${name}.`, story: (i, n) => `Meldung ${i} von ${n}.`, from: (p) => `von ${p}`, nothing: "Nichts Neues in diesem Zeitraum.", end: "Das war Ihr Brief." },
};

const STORY_PAUSE = "900ms";
const TOPIC_PAUSE = "1400ms";
const HEADLINE_PAUSE = "450ms";

/** One synthesisable unit: SSML for the voice, plain text for tests and transcripts. */
export type Segment = { ssml: string; text: string };

function langOf(lang: string): Lang {
  return (lang in WORDS ? lang : "en") as Lang;
}

function sentence(text: string): string {
  const t = text.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The script as segments: title, then per topic an intro and one segment per story, then the sign-off. */
export function audioSegments(c: Composed, lang = "en"): Segment[] {
  const w = WORDS[langOf(lang)];
  const out: Segment[] = [];
  const title = sentence(c.title.replace(/^MacroBrief:\s*/, "MacroBrief. "));
  out.push({ ssml: `<p>${esc(title)}</p>${c.intro ? `<break time="${HEADLINE_PAUSE}"/><p>${esc(sentence(c.intro))}</p>` : ""}`, text: c.intro ? `${title} ${sentence(c.intro)}` : title });

  c.sections.forEach((section, si) => {
    const n = section.stories.length;
    // "Next topic." before every topic but the first — the spoken equivalent of a heading.
    // The story count is an English habit; other languages introduce the topic by name.
    const lead = si > 0 ? `${w.next} ` : "";
    const named = langOf(lang) === "en" && n ? w.topic(section.heading, n) : sentence(section.heading);
    const intro = `${lead}${n ? named : `${sentence(section.heading)} ${w.nothing}`}`;
    out.push({ ssml: `<break time="${TOPIC_PAUSE}"/><p>${esc(intro)}</p>`, text: intro });
    section.stories.forEach((story, i) => {
      const sign = n > 1 ? `${w.story(i + 1, n)} ` : "";
      const headline = `${story.headline.replace(/[.!?]+$/, "")}${story.publisher ? `, ${w.from(story.publisher)}` : ""}.`;
      const body = sentence(story.summary);
      out.push({
        ssml: `<break time="${STORY_PAUSE}"/><p>${esc(sign)}${esc(headline)}</p><break time="${HEADLINE_PAUSE}"/><p>${esc(body)}</p>`,
        text: `${sign}${headline} ${body}`,
      });
    });
  });

  out.push({ ssml: `<break time="${TOPIC_PAUSE}"/><p>${esc(w.end)}</p>`, text: w.end });
  return out;
}

/** Plain-text script — what the segments say, for transcripts and tests. */
export function audioScript(c: Composed, lang = "en"): string {
  return audioSegments(c, lang).map((s) => s.text).join("\n\n");
}

/**
 * Group segments into SSML documents under `maxBytes` (the provider caps a
 * request), never splitting a story. Silence at the seams comes from the
 * segments' own leading breaks.
 */
export function ssmlChunks(segments: Segment[], maxBytes: number): string[] {
  const wrap = (parts: string[]) => `<speak>${parts.join("")}</speak>`;
  const chunks: string[] = [];
  let current: string[] = [];
  for (const seg of segments) {
    const candidate = wrap([...current, seg.ssml]);
    if (current.length && Buffer.byteLength(candidate, "utf8") > maxBytes) {
      chunks.push(wrap(current));
      current = [seg.ssml];
    } else {
      current.push(seg.ssml);
    }
  }
  if (current.length) chunks.push(wrap(current));
  return chunks;
}

/** Kept for callers that split plain text by size (unused by the SSML path). */
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

/** Google's MP3 output is constant 64 kbit/s (measured: 399,360 bytes ↔ 49.9 s), so length falls out of size. */
const MP3_BYTES_PER_SECOND = 8000;
const WORDS_PER_MINUTE = 200;

export function mp3Seconds(bytes: number): number {
  return Math.round(bytes / MP3_BYTES_PER_SECOND);
}

export function readingSeconds(text: string): number {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return Math.round((words / WORDS_PER_MINUTE) * 60);
}

/** "2 min" — whole minutes, rounded up, never "0 min". */
export function minutesLabel(seconds: number): string {
  return `${Math.max(1, Math.ceil(seconds / 60))} min`;
}
