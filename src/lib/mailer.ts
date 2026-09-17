/**
 * Transactional email via Resend. Unconfigured (local dev) → logs and
 * reports `sent: false`; the caller records the delivery as failed rather
 * than pretending.
 */

type Message = { to: string; subject: string; text: string; html?: string };

export async function sendEmail(message: Message): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.AUTH_RESEND_KEY;
  const from = process.env.EMAIL_FROM || "MacroBrief <brief@macrobrief.com>";

  if (!key) {
    console.info(`[mailer] not configured — would send "${message.subject}" to ${message.to}`);
    return { sent: false, error: "email not configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: message.to, subject: message.subject, text: message.text, html: message.html }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`[mailer] send failed (${response.status}): ${body}`);
    return { sent: false, error: `resend ${response.status}` };
  }
  return { sent: true };
}
