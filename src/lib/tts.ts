import textToSpeech from "@google-cloud/text-to-speech";
import { GoogleAuth } from "google-gax";

import { chunkScript } from "@/lib/domain/audio";
import { voiceFor, type VoiceGender } from "@/lib/domain/voices";

/**
 * Google Cloud Text-to-Speech, Neural2 voices. Same project as everything
 * else and authenticated by the runtime service account (ADC) — there is
 * no key to manage, so "configured" means the API is enabled, which
 * `./deploy.sh --setup` does.
 */

/** The API caps a request at 5,000 bytes; 4,000 characters keeps accented text under it. */
const CHUNK_CHARS = 4000;

let client: InstanceType<typeof textToSpeech.TextToSpeechClient> | null = null;

function tts() {
  if (!client) {
    // On Cloud Run the service account's project pays. Locally, user ADC
    // bills whatever project gcloud last set; pin it so a laptop test hits
    // the project where the API is enabled.
    const quotaProjectId = process.env.GOOGLE_CLOUD_QUOTA_PROJECT;
    client = new textToSpeech.TextToSpeechClient(
      quotaProjectId ? { auth: new GoogleAuth({ clientOptions: { quotaProjectId }, scopes: ["https://www.googleapis.com/auth/cloud-platform"] }) } : {},
    );
  }
  return client;
}

export function ttsConfigured(): boolean {
  // ADC is always present on Cloud Run; locally it needs `gcloud auth application-default login`.
  return process.env.TTS_DISABLED !== "1";
}

export async function synthesize(script: string, lang: string, gender: VoiceGender, speed = 1): Promise<Buffer> {
  const voice = voiceFor(lang, gender);
  const parts: Buffer[] = [];
  for (const chunk of chunkScript(script, CHUNK_CHARS)) {
    const [response] = await tts().synthesizeSpeech({
      input: { text: chunk },
      voice,
      audioConfig: { audioEncoding: "MP3", speakingRate: speed },
    });
    if (!response.audioContent) throw new Error("Text-to-Speech returned no audio.");
    parts.push(Buffer.from(response.audioContent as Uint8Array));
  }
  // MP3 frames concatenate; one voice and one config per brief keeps it seamless enough.
  return Buffer.concat(parts);
}
