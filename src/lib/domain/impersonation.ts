import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * "View as reader" for staff: a signed cookie naming the reader being
 * viewed. Signed so the cookie cannot be forged, and short-lived so a
 * forgotten session expires by itself. The privilege check lives at the
 * point of use — the cookie alone grants nothing.
 */

export const VIEW_AS_COOKIE = "mb_view_as";
export const VIEW_AS_MAX_AGE_S = 2 * 60 * 60;

function sign(userId: string, issuedAt: number, secret: string): string {
  return createHmac("sha256", secret).update(`${userId}\n${issuedAt}`).digest("base64url").slice(0, 32);
}

export function makeViewAsCookie(userId: string, secret: string, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  return `${userId}.${issuedAt}.${sign(userId, issuedAt, secret)}`;
}

/** The reader id if the cookie is intact and unexpired; null otherwise. */
export function readViewAsCookie(value: string | undefined, secret: string, now = Date.now()): string | null {
  if (!value || !secret) return null;
  const [userId, issuedRaw, sig] = value.split(".");
  if (!userId || !issuedRaw || !sig) return null;
  const issuedAt = Number(issuedRaw);
  if (!Number.isFinite(issuedAt)) return null;
  if (Math.floor(now / 1000) - issuedAt > VIEW_AS_MAX_AGE_S) return null;
  const expected = sign(userId, issuedAt, secret);
  if (expected.length !== sig.length) return null;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig)) ? userId : null;
}
