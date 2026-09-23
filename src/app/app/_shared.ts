/** Error copy shared by the app's pages; the key rides in `?error=`. */
export const ERRORS: Record<string, string> = {
  topic: "A topic needs a name of at least two characters.",
  limit: "Your plan's topic limit is reached. Remove one, or upgrade under Billing (profile menu).",
  schedule: "That schedule didn't make sense.",
  timezone: "Unknown timezone.",
  channel: "That channel setting didn't make sense.",
  plan: "That channel isn't on your plan.",
  address: "That channel needs an address.",
  phone: "WhatsApp needs a full international number, like +56 9 1234 5678.",
  codesend: "Saved, but the verification code couldn't be sent. On WhatsApp, message us first (the link under the number), then tap Send code.",
  code: "That code didn't match or has expired. Save the address again for a new one.",
  viewing: "You are viewing a reader's account. Stop viewing to make changes.",
  voice: "Pick a voice (male or female) and a speed (1×, 1.2×, 1.5× or 2×).",
};
