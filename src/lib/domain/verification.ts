import { randomInt } from "node:crypto";

/**
 * A delivery address that is not the account's own email must prove it
 * belongs to the reader before anything is sent to it — otherwise the
 * product is a way to point briefs at a stranger's inbox or phone.
 */

export const CODE_TTL_MIN = 15;

export function needsVerification(channel: string, address: string, accountEmail: string | null): boolean {
  if (channel === "AUDIO") return false;
  if (channel === "EMAIL" && accountEmail && address.trim().toLowerCase() === accountEmail.toLowerCase()) return false;
  return true;
}

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function codeMatches(entered: string, stored: string | null, expires: Date | null, now: Date): boolean {
  if (!stored || !expires || expires <= now) return false;
  return entered.replace(/\s+/g, "") === stored;
}
