import { describe, expect, it } from "vitest";

import { hostIsForbidden, ipIsPrivate } from "@/lib/domain/netguard";

describe("ipIsPrivate", () => {
  it("flags loopback, RFC1918, link-local (incl. the cloud metadata address), CGNAT and IPv6 equivalents", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.3.4", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fc00::1", "fd12::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:169.254.169.254"]) {
      expect(ipIsPrivate(ip), ip).toBe(true);
    }
  });
  it("passes public addresses", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "104.18.0.1", "2606:4700::1111"]) expect(ipIsPrivate(ip), ip).toBe(false);
  });
});

describe("hostIsForbidden", () => {
  it("blocks the metadata host, localhost and bare private IPs before any DNS lookup", () => {
    expect(hostIsForbidden("metadata.google.internal")).toBe(true);
    expect(hostIsForbidden("METADATA")).toBe(true);
    expect(hostIsForbidden("localhost")).toBe(true);
    expect(hostIsForbidden("169.254.169.254")).toBe(true);
    expect(hostIsForbidden("[::1]")).toBe(true);
    expect(hostIsForbidden("foo.localhost")).toBe(true);
    expect(hostIsForbidden("something.internal")).toBe(true);
  });
  it("allows ordinary public hostnames", () => {
    expect(hostIsForbidden("news.google.com")).toBe(false);
    expect(hostIsForbidden("blog.rust-lang.org")).toBe(false);
  });
});
