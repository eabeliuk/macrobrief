"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * The schedule, in the reader's own terms: a 12-hour clock with AM/PM, a
 * timezone picked from the browser's list (defaulting to the browser's
 * own), and the current time in that zone so "7 AM" is anchored to
 * something visible. The server still stores hour 0–23 + IANA zone.
 */

type Props = {
  action: (formData: FormData) => Promise<void>;
  cadence: string;
  cadences: { id: string; label: string; allowed: boolean }[];
  hour: number;
  weekday: number;
  timezone: string;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function nowIn(timezone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: timezone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date());
  } catch {
    return "unknown timezone";
  }
}

export function ScheduleForm({ action, cadence, cadences, hour, weekday, timezone }: Props) {
  const browserZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [zone, setZone] = useState(timezone === "UTC" && browserZone ? browserZone : timezone);
  const [clock, setClock] = useState(() => nowIn(zone));
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    setClock(nowIn(zone));
    const timer = setInterval(() => setClock(nowIn(zone)), 30_000);
    return () => clearInterval(timer);
  }, [zone]);

  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const meridiem = hour < 12 ? "AM" : "PM";

  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-semibold">Schedule</h2>
      <label className="block">
        <span className="label mb-1">Cadence</span>
        <select name="cadence" className="input" defaultValue={cadence}>
          {cadences.map((c) => (
            <option key={c.id} value={c.id} disabled={!c.allowed}>
              {c.label}{c.allowed ? "" : " — upgrade"}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="label mb-1">Hour</span>
          <select name="hour12" className="input" defaultValue={String(hour12)}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label mb-1">AM / PM</span>
          <select name="meridiem" className="input" defaultValue={meridiem}>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </label>
        <label className="block">
          <span className="label mb-1">Weekday (weekly)</span>
          <select name="weekday" className="input" defaultValue={String(weekday)}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label mb-1">Timezone</span>
        <input className="input" name="timezone" list="timezones" value={zone} onChange={(e) => setZone(e.target.value)} required />
        <datalist id="timezones">
          {zones.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
        <span className="wire mt-1 block text-ink-3">Now in {zone}: {clock}</span>
      </label>
      <button type="submit" className="btn-quiet">Save schedule</button>
    </form>
  );
}
