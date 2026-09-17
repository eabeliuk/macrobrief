import { Storage } from "@google-cloud/storage";

/**
 * Private object storage for generated audio. Credentials come from the
 * runtime service account on Cloud Run (ADC); locally, `gcloud auth
 * application-default login`. Objects are never public — the app streams
 * them after checking who is asking.
 */

let client: Storage | null = null;

export function storageConfigured(): boolean {
  return Boolean(process.env.AUDIO_BUCKET);
}

function bucket() {
  const name = process.env.AUDIO_BUCKET;
  if (!name) throw new Error("AUDIO_BUCKET is not set.");
  if (!client) client = new Storage();
  return client.bucket(name);
}

export async function saveObject(key: string, data: Buffer, contentType: string): Promise<void> {
  await bucket().file(key).save(data, { contentType, resumable: false });
}

export async function readObject(key: string): Promise<{ data: Buffer; contentType: string } | null> {
  const file = bucket().file(key);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [data] = await file.download();
  const [meta] = await file.getMetadata();
  return { data, contentType: meta.contentType ?? "application/octet-stream" };
}
