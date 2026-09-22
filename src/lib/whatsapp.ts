/**
 * WhatsApp, through whichever Business Solution Provider is configured:
 * Telnyx (preferred — templates are referenced by Meta name + language,
 * thinner markup) or Twilio (superMila's SMS account). Meta's rules are
 * the same behind both: free-form text only inside 24 h of the reader's
 * last message; a scheduled brief must be an approved template with three
 * variables — 1 title, 2 digest body, 3 link.
 */

const FREE_FORM_MAX = 1600;
export const WHATSAPP_MAX_CHARS = FREE_FORM_MAX;
// Meta rejects a template parameter that holds a newline, a tab or 4+ consecutive
// spaces (error 132018), and caps each at 1024 characters — enforced by both BSPs.
const TEMPLATE_PARAM_MAX = 1024;

export type WhatsAppMessage = { title: string; body: string; link: string; text: string };
type Outcome = { sent: boolean; error?: string };

export type Provider = "telnyx" | "twilio";

/** Explicit WHATSAPP_PROVIDER wins; otherwise whichever provider has credentials. */
export function whatsappProvider(): Provider | null {
  const forced = process.env.WHATSAPP_PROVIDER;
  if (forced === "telnyx" || forced === "twilio") return forced;
  if (process.env.TELNYX_API_KEY && process.env.TELNYX_WHATSAPP_FROM) return "telnyx";
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM) return "twilio";
  return null;
}

export function whatsappConfigured(): boolean {
  return whatsappProvider() !== null;
}

export async function sendWhatsApp(to: string, message: WhatsAppMessage): Promise<Outcome> {
  const provider = whatsappProvider();
  if (provider === "telnyx") return sendViaTelnyx(to, message);
  if (provider === "twilio") return sendViaTwilio(to, message);
  return { sent: false, error: "whatsapp not configured" };
}

// ── Telnyx ──────────────────────────────────────────────────────────────

/** The request body for Telnyx's POST /v2/messages/whatsapp; exported so the shape is testable. */
export function telnyxPayload(from: string, to: string, message: WhatsAppMessage, template: { name: string; language: string } | null) {
  const base = { from: e164(from), to: e164(to) };
  if (!template) return { ...base, whatsapp_message: { type: "text", text: { body: message.text, preview_url: true } } };
  return {
    ...base,
    whatsapp_message: {
      type: "template",
      template: {
        name: template.name,
        language: { policy: "deterministic", code: template.language },
        components: [{ type: "body", parameters: templateParams(message).map((text) => ({ type: "text", text })) }],
      },
    },
  };
}

async function sendViaTelnyx(to: string, message: WhatsAppMessage): Promise<Outcome> {
  const key = process.env.TELNYX_API_KEY;
  const from = process.env.TELNYX_WHATSAPP_FROM;
  if (!key || !from) return { sent: false, error: "telnyx not configured" };
  const name = process.env.TELNYX_WA_TEMPLATE;
  const template = name ? { name, language: process.env.TELNYX_WA_TEMPLATE_LANG || "en" } : null;

  const response = await fetch("https://api.telnyx.com/v2/messages/whatsapp", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(telnyxPayload(from, to, message, template)),
  });
  if (response.ok) return { sent: true };
  const detail = await response.text();
  console.error(`[whatsapp/telnyx] send failed (${response.status}): ${detail.slice(0, 300)}`);
  let reason = `telnyx ${response.status}`;
  try {
    const parsed = JSON.parse(detail) as { errors?: { code?: string; title?: string; detail?: string }[] };
    const first = parsed.errors?.[0];
    if (first) reason = `telnyx ${first.code ?? response.status}: ${(first.detail ?? first.title ?? "").slice(0, 160)}`;
  } catch {
    // Non-JSON error body; the status is enough.
  }
  return { sent: false, error: reason };
}

// ── Twilio ──────────────────────────────────────────────────────────────

async function sendViaTwilio(to: string, message: WhatsAppMessage): Promise<Outcome> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) return { sent: false, error: "twilio not configured" };

  const form = new URLSearchParams({ To: `whatsapp:${e164(to)}`, From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}` });
  const template = process.env.TWILIO_WA_TEMPLATE_SID;
  if (template) {
    form.set("ContentSid", template);
    const [title, body, link] = templateParams(message);
    form.set("ContentVariables", JSON.stringify({ "1": title, "2": body, "3": link }));
  } else {
    form.set("Body", message.text);
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (response.ok) return { sent: true };
  const detail = await response.text();
  console.error(`[whatsapp/twilio] send failed (${response.status}): ${detail.slice(0, 300)}`);
  let reason = `twilio ${response.status}`;
  try {
    const parsed = JSON.parse(detail) as { message?: string; code?: number };
    if (parsed.message) reason = `twilio ${parsed.code ?? response.status}: ${parsed.message.slice(0, 160)}`;
  } catch {
    // Non-JSON error body; the status is enough.
  }
  return { sent: false, error: reason };
}

/** The three template variables — 1 title, 2 digest, 3 link — flattened to what Meta accepts. */
function templateParams(message: WhatsAppMessage): [string, string, string] {
  const flat = (text: string) => text.replace(/[\t\r\n]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, TEMPLATE_PARAM_MAX);
  return [flat(message.title), flat(message.body), flat(message.link)];
}

/** Strip any `whatsapp:` prefix; both providers here take bare E.164. */
function e164(value: string): string {
  return value.replace(/^whatsapp:/i, "");
}
