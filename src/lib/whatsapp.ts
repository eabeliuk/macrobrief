/**
 * WhatsApp via Twilio's Messages API (same account as superMila's SMS).
 *
 * Meta's rule: a business may message a user free-form only inside 24 h of
 * the user's last message; outside that window the message must be an
 * approved template. So when TWILIO_WA_TEMPLATE_SID is set the brief goes
 * out as that template (variables: 1 = title, 2 = digest body, 3 = link);
 * without it, free-form — which works in the Twilio sandbox and in-window,
 * and is rejected by Meta otherwise with a readable error we record.
 */

const FREE_FORM_MAX = 1600;

export function whatsappConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
}

export const WHATSAPP_MAX_CHARS = FREE_FORM_MAX;

export async function sendWhatsApp(to: string, message: { title: string; body: string; link: string; text: string }): Promise<{ sent: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) return { sent: false, error: "whatsapp not configured" };

  const form = new URLSearchParams({ To: `whatsapp:${to}`, From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}` });
  const template = process.env.TWILIO_WA_TEMPLATE_SID;
  if (template) {
    form.set("ContentSid", template);
    form.set("ContentVariables", JSON.stringify({ "1": message.title, "2": message.body, "3": message.link }));
  } else {
    form.set("Body", message.text);
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error(`[whatsapp] send failed (${response.status}): ${detail.slice(0, 300)}`);
    let reason = `twilio ${response.status}`;
    try {
      const parsed = JSON.parse(detail) as { message?: string; code?: number };
      if (parsed.message) reason = `twilio ${parsed.code ?? response.status}: ${parsed.message.slice(0, 160)}`;
    } catch {
      // Non-JSON error body; the status is enough.
    }
    return { sent: false, error: reason };
  }
  return { sent: true };
}
