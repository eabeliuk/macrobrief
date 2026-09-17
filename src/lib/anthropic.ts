import Anthropic from "@anthropic-ai/sdk";

/**
 * One client, one model. The model is used for exactly two things: proposing
 * publisher feeds for a topic (verified by fetching before anything is
 * stored) and composing a brief from ranked items. Everything else — polling,
 * dedupe, ranking, scheduling — is code.
 */

let client: Anthropic | null = null;

export const MODEL = "claude-opus-5";

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function anthropic(): Anthropic {
  if (!anthropicConfigured()) throw new Error("ANTHROPIC_API_KEY is not set.");
  if (!client) client = new Anthropic();
  return client;
}
