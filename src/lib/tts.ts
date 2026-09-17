import { chunkScript } from "@/lib/domain/audio";

/**
 * ElevenLabs text-to-speech, the provider macroscene already uses (its
 * multilingual model reads Spanish and Portuguese briefs cleanly). Unset key
 * → `null`, and the AUDIO delivery records "not configured" rather than
 * failing silently.
 */

const BASE = "https://api.elevenlabs.io/v1";
const MODEL = "eleven_multilingual_v2";
/** "Rachel", an ElevenLabs premade voice — a sane default until a brand voice is chosen. */
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";
/** Per-request cap; the multilingual model accepts more but shorter chunks fail less. */
const CHUNK_CHARS = 4000;
const ATTEMPTS = 3;

export function ttsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export async function synthesize(script: string): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set.");
  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;

  const parts: Buffer[] = [];
  for (const chunk of chunkScript(script, CHUNK_CHARS)) {
    parts.push(await synthesizeChunk(chunk, voice, key));
  }
  // MP3 frames concatenate; same voice + settings per chunk keeps it seamless enough.
  return Buffer.concat(parts);
}

async function synthesizeChunk(text: string, voice: string, key: string): Promise<Buffer> {
  let lastError = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const response = await fetch(`${BASE}/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0 },
      }),
    });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    lastError = `HTTP ${response.status} ${(await response.text()).slice(0, 160)}`;
    // Transient (throttle / server) → back off; anything else is permanent.
    if (response.status !== 429 && response.status < 500) break;
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error(`ElevenLabs: ${lastError}`);
}
