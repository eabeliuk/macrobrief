import { describe, expect, it } from "vitest";

import { trackedUrl, verifyTracked } from "@/lib/domain/tracking";

const SECRET = "s3cret";
const SITE = "https://macrobrief.com";

describe("trackedUrl / verifyTracked", () => {
  it("round-trips a link through a signed redirect", () => {
    const url = trackedUrl(SITE, "dlv_1", "https://reuters.test/a?x=1&y=2", SECRET);
    expect(url.startsWith(`${SITE}/r/dlv_1?`)).toBe(true);
    const parsed = new URL(url);
    expect(verifyTracked("dlv_1", parsed.searchParams.get("to")!, parsed.searchParams.get("sig")!, SECRET)).toBe("https://reuters.test/a?x=1&y=2");
  });
  it("rejects a tampered destination (no open redirect)", () => {
    const url = new URL(trackedUrl(SITE, "dlv_1", "https://reuters.test/a", SECRET));
    expect(verifyTracked("dlv_1", "https://evil.test/", url.searchParams.get("sig")!, SECRET)).toBeNull();
    expect(verifyTracked("dlv_2", "https://reuters.test/a", url.searchParams.get("sig")!, SECRET)).toBeNull();
  });
  it("rejects non-http destinations even when signed", () => {
    const url = new URL(trackedUrl(SITE, "dlv_1", "javascript:alert(1)", SECRET));
    expect(verifyTracked("dlv_1", "javascript:alert(1)", url.searchParams.get("sig")!, SECRET)).toBeNull();
  });
});
