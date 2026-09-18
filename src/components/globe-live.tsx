"use client";

import { useEffect, useState } from "react";

import { graticule, project, WORLD_CITIES, type Desk, type LatLon } from "@/lib/domain/globe";

/**
 * The world behind the sheet, turning. The same orthographic projection as
 * the static globe, re-projected each frame as the view's longitude
 * advances — one revolution a minute. Every city is a signal-blue pin;
 * today's desks are the larger, always-labelled ones, so the motion shows
 * coverage sweeping the globe rather than decorating it. Server-rendered at a fixed start so nothing pops, and
 * still under prefers-reduced-motion.
 */

const R = 220;
const TILT = 15;
const DEGREES_PER_SECOND = 6;
const START_LON = -40;

export function GlobeLive({ desks, className = "" }: { desks: Desk[]; className?: string }) {
  const [lon, setLon] = useState(START_LON);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setLon((l) => (l + DEGREES_PER_SECOND * dt) % 360);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const center: LatLon = { lat: TILT, lon };
  const paths = graticule(center, R, 15);
  const deskCities = new Set(desks.map((d) => d.city));
  const cities = [...desks, ...WORLD_CITIES.filter((c) => !deskCities.has(c.city))]
    .map((c) => ({ ...c, ...project(c, center, R), today: deskCities.has(c.city) }))
    .filter((c) => c.visible);
  // Depth: 1 at the centre of the disc, 0 at the limb — labels fade before they fall off the edge.
  const depth = (x: number, y: number) => Math.sqrt(Math.max(0, 1 - (x * x + y * y) / (R * R)));
  // A quiet label yields to a today label it would sit on.
  const todays = cities.filter((c) => c.today);
  const crowded = (c: { x: number; y: number }) => todays.some((t) => Math.abs(t.y - c.y) < 14 && Math.abs(t.x - c.x) < 90);

  return (
    <svg viewBox={`${-R - 40} ${-R - 20} ${2 * R + 80} ${2 * R + 40}`} className={className} role="img" aria-label="Where today's stories were filed from, around the world">
      <circle r={R} fill="var(--card)" stroke="var(--ink)" strokeWidth="1" />
      <g fill="none" stroke="var(--ink-3)" strokeWidth="0.6" opacity="0.7">
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g fill="none" stroke="var(--ink)" strokeWidth="1">
        {greatCircles(center).map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {cities.map((c) => {
        const z = depth(c.x, c.y);
        return (
          <g key={c.city} transform={`translate(${c.x} ${c.y})`} opacity={c.today ? 0.35 + 0.65 * z : 0.25 + 0.65 * z}>
            <circle r={c.today ? 5 : 3.2} fill="var(--accent)" stroke="var(--card)" strokeWidth={c.today ? 1.5 : 1} />
            {c.today || (z > 0.55 && !crowded(c)) ? (
              <text x={c.x > 0 ? -8 : 8} y="4" textAnchor={c.x > 0 ? "end" : "start"} className="wire" fill={c.today ? "var(--ink)" : "var(--ink-3)"} style={{ fontSize: c.today ? 11 : 9, letterSpacing: "0.06em" }}>
                {c.city}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function greatCircles(center: LatLon): string[] {
  const out: string[] = [];
  const emit = (points: LatLon[]) => {
    let run: string[] = [];
    const flush = () => {
      if (run.length > 1) out.push(`M${run.join("L")}`);
      run = [];
    };
    for (const p of points) {
      const q = project(p, center, R);
      if (q.visible) run.push(`${q.x},${q.y}`);
      else flush();
    }
    flush();
  };
  const equator: LatLon[] = [];
  for (let l = -180; l <= 180; l += 2) equator.push({ lat: 0, lon: l });
  emit(equator);
  const meridian: LatLon[] = [];
  for (let lat = -90; lat <= 90; lat += 2) meridian.push({ lat, lon: center.lon });
  emit(meridian);
  return out;
}
