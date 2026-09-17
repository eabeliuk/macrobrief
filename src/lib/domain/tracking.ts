import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed redirect links for emails. `/r/<deliveryId>?to=<url>&sig=<hmac>`
 * records the click and forwards. The signature binds the destination to
 * the delivery so the endpoint cannot be used as an open redirect.
 */

function sign(deliveryId: string, to: string, secret: string): string {
  return createHmac("sha256", secret).update(`${deliveryId}\n${to}`).digest("base64url").slice(0, 32);
}

export function trackedUrl(site: string, deliveryId: string, to: string, secret: string): string {
  const url = new URL(`/r/${encodeURIComponent(deliveryId)}`, site);
  url.searchParams.set("to", to);
  url.searchParams.set("sig", sign(deliveryId, to, secret));
  return url.toString();
}

/** The destination if the signature is valid and the destination is http(s); otherwise null. */
export function verifyTracked(deliveryId: string, to: string, sig: string, secret: string): string | null {
  if (!/^https?:\/\//i.test(to)) return null;
  const expected = sign(deliveryId, to, secret);
  if (expected.length !== sig.length) return null;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig)) ? to : null;
}
