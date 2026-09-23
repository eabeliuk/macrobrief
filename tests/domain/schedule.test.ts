import { describe, expect, it } from "vitest";

import { duePeriod, localParts } from "@/lib/domain/schedule";

describe("localParts", () => {
  it("converts an instant into wall-clock parts in a zone", () => {
    // Chile is on summer time (UTC-3) from the first Sunday of September.
    const p = localParts(new Date("2026-09-17T03:30:00Z"), "America/Santiago");
    expect(p).toMatchObject({ year: 2026, month: 9, day: 17, hour: 0, weekday: 4 });
    // …and still UTC-4 on 1 September.
    expect(localParts(new Date("2026-09-01T03:30:00Z"), "America/Santiago")).toMatchObject({ day: 31, hour: 23 });
  });
});

describe("duePeriod — DAILY", () => {
  const spec = { cadence: "DAILY" as const, hour: 7, timezone: "America/Santiago", weekday: 1 };

  it("before the hour, the due period is yesterday's", () => {
    // 06:00 local on Sep 17 → most recent 07:00 was Sep 16 (UTC-3 → 10:00Z).
    const due = duePeriod(spec, new Date("2026-09-17T09:00:00Z"));
    expect(due.periodKey).toBe("2026-09-16");
    expect(due.windowEnd.toISOString()).toBe("2026-09-16T10:00:00.000Z");
    expect(due.windowStart.toISOString()).toBe("2026-09-15T10:00:00.000Z");
  });

  it("after the hour, the due period is today's", () => {
    const due = duePeriod(spec, new Date("2026-09-17T10:05:00Z")); // 07:05 local
    expect(due.periodKey).toBe("2026-09-17");
    expect(due.windowEnd.toISOString()).toBe("2026-09-17T10:00:00.000Z");
  });

  it("is stable across the day: every cron tick maps to the same key", () => {
    const a = duePeriod(spec, new Date("2026-09-17T10:05:00Z"));
    const b = duePeriod(spec, new Date("2026-09-18T09:55:00Z")); // 06:55 next day, still before 07:00
    expect(a.periodKey).toBe(b.periodKey);
  });
});

describe("duePeriod — TWICE_DAILY", () => {
  const spec = { cadence: "TWICE_DAILY" as const, hour: 7, timezone: "UTC", weekday: 1 };
  it("labels the two slots", () => {
    expect(duePeriod(spec, new Date("2026-09-17T08:00:00Z")).periodKey).toBe("2026-09-17/am");
    expect(duePeriod(spec, new Date("2026-09-17T20:00:00Z")).periodKey).toBe("2026-09-17/pm");
    expect(duePeriod(spec, new Date("2026-09-18T03:00:00Z")).periodKey).toBe("2026-09-17/pm");
  });
  it("uses a 12-hour window", () => {
    const due = duePeriod(spec, new Date("2026-09-17T20:00:00Z"));
    expect(due.windowStart.toISOString()).toBe("2026-09-17T07:00:00.000Z");
    expect(due.windowEnd.toISOString()).toBe("2026-09-17T19:00:00.000Z");
  });
});

describe("duePeriod — WEEKLY", () => {
  const spec = { cadence: "WEEKLY" as const, hour: 8, timezone: "Europe/Madrid", weekday: 1 };
  it("keys on the ISO week of the most recent Monday 08:00", () => {
    // Thu 2026-09-17 → most recent Monday is 2026-09-14 (ISO week 38).
    const due = duePeriod(spec, new Date("2026-09-17T12:00:00Z"));
    expect(due.periodKey).toBe("2026-W38");
    expect(due.windowEnd.toISOString()).toBe("2026-09-14T06:00:00.000Z"); // 08:00 CEST
    expect(due.windowStart.toISOString()).toBe("2026-09-07T06:00:00.000Z");
  });
  it("on Monday before 08:00 it is still the previous week", () => {
    expect(duePeriod(spec, new Date("2026-09-14T05:00:00Z")).periodKey).toBe("2026-W37");
  });
});

describe("duePeriod — LIVE", () => {
  const spec = { cadence: "LIVE" as const, hour: 7, timezone: "America/Santiago", weekday: 1 };
  it("keys on the hour just gone and covers exactly that hour", () => {
    const due = duePeriod(spec, new Date("2026-09-23T14:37:00Z"));
    expect(due.periodKey).toBe("2026-09-23T14/live");
    expect(due.windowEnd.toISOString()).toBe("2026-09-23T14:00:00.000Z");
    expect(due.windowStart.toISOString()).toBe("2026-09-23T13:00:00.000Z");
  });
  it("gives every tick in an hour the same key, so a reader is briefed once", () => {
    const a = duePeriod(spec, new Date("2026-09-23T14:01:00Z"));
    const b = duePeriod(spec, new Date("2026-09-23T14:59:00Z"));
    expect(a.periodKey).toBe(b.periodKey);
    expect(duePeriod(spec, new Date("2026-09-23T15:00:00Z")).periodKey).toBe("2026-09-23T15/live");
  });
  it("ignores the hour and zone the other cadences use", () => {
    const utc = duePeriod({ ...spec, timezone: "UTC", hour: 3 }, new Date("2026-09-23T14:37:00Z"));
    expect(utc.periodKey).toBe("2026-09-23T14/live");
  });
});
