/**
 * When is a brief due, and what is its idempotency key?
 *
 * The cron runs every ten minutes and must never brief anyone twice for the
 * same period. So instead of "is it 07:00 now?" (fragile — a missed tick
 * skips a day) we ask "what was the most recent scheduled instant at or
 * before now, in the user's zone?" and derive a period key from it. The
 * brief is due until a row with that key exists; a missed tick is just
 * delivered ten minutes late.
 */

import type { CadenceId } from "./plans";

export type ScheduleSpec = {
  cadence: CadenceId;
  /** Local hour 0–23. */
  hour: number;
  /** IANA zone. */
  timezone: string;
  /** WEEKLY only, 0 = Sunday … 6 = Saturday. */
  weekday: number;
};

export type DuePeriod = {
  periodKey: string;
  windowStart: Date;
  windowEnd: Date;
};

export type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const HOUR_MS = 3_600_000;
/**
 * LIVE covers the hour just gone and is keyed by the hour, so the cron can
 * look every tick while a reader is briefed at most once an hour — and only
 * when that hour actually brought something (the composer skips an empty
 * pool before it ever calls the model).
 */
const LIVE_WINDOW_MS = HOUR_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timezone: string): Intl.DateTimeFormat {
  let f = formatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "short",
    });
    formatters.set(timezone, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a zone. Throws on an unknown zone. */
export function localParts(instant: Date, timezone: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(timezone).formatToParts(instant)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday),
  };
}

/** The instant at which the zone's wall clock reads (y, m, d, hour:00). */
function zonedToInstant(year: number, month: number, day: number, hour: number, timezone: string): Date {
  // Guess as if UTC, measure how far the zone's wall clock is from that, and
  // correct. Two passes settle DST edges.
  const target = Date.UTC(year, month - 1, day, hour);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess), timezone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += target - asUtc;
  }
  return new Date(guess);
}

function dateKey(p: LocalParts): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function isoWeekKey(p: LocalParts): string {
  // ISO week: Thursday of the same week decides the year.
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function duePeriod(spec: ScheduleSpec, now: Date): DuePeriod {
  const tz = spec.timezone;
  const today = localParts(now, tz);

  if (spec.cadence === "LIVE") {
    const end = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
    return { periodKey: `${end.toISOString().slice(0, 13)}/live`, windowStart: new Date(end.getTime() - LIVE_WINDOW_MS), windowEnd: end };
  }

  if (spec.cadence === "DAILY") {
    let end = zonedToInstant(today.year, today.month, today.day, spec.hour, tz);
    if (end > now) end = new Date(end.getTime() - DAY_MS);
    return { periodKey: dateKey(localParts(end, tz)), windowStart: new Date(end.getTime() - DAY_MS), windowEnd: end };
  }

  if (spec.cadence === "TWICE_DAILY") {
    const am = zonedToInstant(today.year, today.month, today.day, spec.hour, tz);
    const slots = [
      { at: new Date(am.getTime() - 12 * HOUR_MS), label: "pm" },
      { at: am, label: "am" },
      { at: new Date(am.getTime() + 12 * HOUR_MS), label: "pm" },
    ];
    const slot = slots.filter((s) => s.at <= now).pop() ?? slots[0];
    // A "pm" slot that spilled past midnight still belongs to the day of its "am".
    const dayOf = slot.label === "pm" ? new Date(slot.at.getTime() - 12 * HOUR_MS) : slot.at;
    return {
      periodKey: `${dateKey(localParts(dayOf, tz))}/${slot.label}`,
      windowStart: new Date(slot.at.getTime() - 12 * HOUR_MS),
      windowEnd: slot.at,
    };
  }

  // WEEKLY: most recent (weekday, hour) at or before now.
  const daysBack = (today.weekday - spec.weekday + 7) % 7;
  let end = zonedToInstant(today.year, today.month, today.day - daysBack, spec.hour, tz);
  if (end > now) end = zonedToInstant(today.year, today.month, today.day - daysBack - 7, spec.hour, tz);
  return { periodKey: isoWeekKey(localParts(end, tz)), windowStart: new Date(end.getTime() - 7 * DAY_MS), windowEnd: end };
}

export function periodLabel(cadence: CadenceId): string {
  if (cadence === "WEEKLY") return "the last 7 days";
  if (cadence === "DAILY") return "the last 24 hours";
  if (cadence === "LIVE") return "the last hour";
  return "the last 12 hours";
}
