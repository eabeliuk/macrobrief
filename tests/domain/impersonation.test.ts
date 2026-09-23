import { describe, expect, it } from "vitest";

import { makeViewAsCookie, readViewAsCookie, VIEW_AS_MAX_AGE_S } from "@/lib/domain/impersonation";

const SECRET = "s3cret";
const NOW = 1_800_000_000_000;

describe("view-as cookie", () => {
  it("round-trips the reader id", () => {
    expect(readViewAsCookie(makeViewAsCookie("usr_1", SECRET, NOW), SECRET, NOW)).toBe("usr_1");
  });
  it("refuses a forged or tampered cookie", () => {
    const good = makeViewAsCookie("usr_1", SECRET, NOW);
    expect(readViewAsCookie(good.replace("usr_1", "usr_2"), SECRET, NOW)).toBeNull();
    expect(readViewAsCookie(good, "other-secret", NOW)).toBeNull();
    expect(readViewAsCookie("usr_1.123.abc", SECRET, NOW)).toBeNull();
    expect(readViewAsCookie(undefined, SECRET, NOW)).toBeNull();
    expect(readViewAsCookie(makeViewAsCookie("usr_1", SECRET, NOW), "", NOW)).toBeNull();
  });
  it("expires", () => {
    const cookie = makeViewAsCookie("usr_1", SECRET, NOW);
    expect(readViewAsCookie(cookie, SECRET, NOW + VIEW_AS_MAX_AGE_S * 1000 - 1000)).toBe("usr_1");
    expect(readViewAsCookie(cookie, SECRET, NOW + (VIEW_AS_MAX_AGE_S + 2) * 1000)).toBeNull();
  });
});
