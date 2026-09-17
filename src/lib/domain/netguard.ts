import { isIP } from "node:net";

/**
 * Server-side fetches of user-supplied URLs are an SSRF surface: on Cloud
 * Run, `http://169.254.169.254/` is the metadata server and answers with
 * the service account's token. Nothing here may reach loopback, private,
 * link-local or cloud-internal addresses — checked on the hostname before
 * DNS, and on every resolved address after (a public name can resolve to a
 * private address on purpose).
 */

const FORBIDDEN_HOSTS = new Set(["localhost", "metadata", "metadata.google.internal"]);
const FORBIDDEN_SUFFIXES = [".localhost", ".internal", ".local"];

export function hostIsForbidden(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (FORBIDDEN_HOSTS.has(host)) return true;
  if (FORBIDDEN_SUFFIXES.some((s) => host.endsWith(s))) return true;
  if (isIP(host)) return ipIsPrivate(host);
  return false;
}

export function ipIsPrivate(ip: string): boolean {
  let addr = ip.toLowerCase();
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) is judged as the IPv4 it wraps.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) addr = mapped[1];

  if (isIP(addr) === 4) {
    const [a, b] = addr.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (isIP(addr) === 6) {
    if (addr === "::" || addr === "::1") return true;
    if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique local
    if (addr.startsWith("fe8") || addr.startsWith("fe9") || addr.startsWith("fea") || addr.startsWith("feb")) return true; // link-local
    return false;
  }
  return true; // not an address at all — refuse
}
