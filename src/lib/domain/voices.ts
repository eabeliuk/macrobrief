/**
 * Which voice reads a brief. Google Cloud Neural2 — $16 per million
 * characters, ~1.5¢ a minute, a million characters a month free — chosen
 * after listening to the alternatives on a real brief. Two voices per
 * language, one per gender; the reader's choice is a gender so it carries
 * across languages. Male is the default.
 */

export type VoiceGender = "MALE" | "FEMALE";
export type Voice = { languageCode: string; name: string };

const VOICES: Record<string, Record<VoiceGender, Voice>> = {
  en: { MALE: { languageCode: "en-US", name: "en-US-Neural2-J" }, FEMALE: { languageCode: "en-US", name: "en-US-Neural2-F" } },
  es: { MALE: { languageCode: "es-US", name: "es-US-Neural2-B" }, FEMALE: { languageCode: "es-US", name: "es-US-Neural2-A" } },
  pt: { MALE: { languageCode: "pt-BR", name: "pt-BR-Neural2-B" }, FEMALE: { languageCode: "pt-BR", name: "pt-BR-Neural2-A" } },
  fr: { MALE: { languageCode: "fr-FR", name: "fr-FR-Neural2-G" }, FEMALE: { languageCode: "fr-FR", name: "fr-FR-Neural2-F" } },
  de: { MALE: { languageCode: "de-DE", name: "de-DE-Neural2-H" }, FEMALE: { languageCode: "de-DE", name: "de-DE-Neural2-G" } },
};

export function voiceFor(lang: string, gender: VoiceGender): Voice {
  return (VOICES[lang] ?? VOICES.en)[gender];
}

/** Speaking rates the reader may pick; Google accepts 0.25–4 but these are the ones that read well. */
export const AUDIO_SPEEDS = [1, 1.2, 1.5, 2] as const;
export type AudioSpeed = (typeof AUDIO_SPEEDS)[number];

export function isAudioSpeed(value: number): value is AudioSpeed {
  return (AUDIO_SPEEDS as readonly number[]).includes(value);
}
