import { graticule, project, type Desk, type LatLon } from "@/lib/domain/globe";

/**
 * The world behind the sheet: an orthographic globe projected in code,
 * centred on wherever today's desks are, with a pin per desk. Pure SVG,
 * server-rendered; nothing here is an image.
 */

const R = 220;
const DEFAULT_CENTER: LatLon = { lat: 15, lon: -35 };

function centerFor(desks: Desk[]): LatLon {
  if (!desks.length) return DEFAULT_CENTER;
  // Circular mean of longitudes so London and Santiago do not average to the Pacific.
  let x = 0;
  let y = 0;
  let lat = 0;
  for (const d of desks) {
    x += Math.cos((d.lon * Math.PI) / 180);
    y += Math.sin((d.lon * Math.PI) / 180);
    lat += d.lat;
  }
  const lon = (Math.atan2(y, x) * 180) / Math.PI;
  return { lat: Math.max(-40, Math.min(40, lat / desks.length)), lon };
}

/** Visible runs of the equator and of the meridian through the centre of view. */
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
  for (let lon = -180; lon <= 180; lon += 2) equator.push({ lat: 0, lon });
  emit(equator);
  const meridian: LatLon[] = [];
  for (let lat = -90; lat <= 90; lat += 2) meridian.push({ lat, lon: center.lon });
  emit(meridian);
  return out;
}

export function Globe({ desks, className = "" }: { desks: Desk[]; className?: string }) {
  const center = centerFor(desks);
  const paths = graticule(center, R, 15);
  const pins = desks.map((d) => ({ ...d, ...project(d, center, R) })).filter((p) => p.visible);
  // Labels sit to the right unless that would run into a neighbour's label,
  // in which case they sit to the left. Two neighbours is as far as this goes.
  const placed: { x: number; y: number }[] = [];
  const labelled = pins.map((p) => {
    const clash = placed.some((q) => Math.abs(q.y - p.y) < 14 && Math.abs(q.x - p.x) < 110);
    placed.push(p);
    return { ...p, left: clash };
  });

  return (
    <svg viewBox={`${-R - 40} ${-R - 20} ${2 * R + 80} ${2 * R + 40}`} className={className} role="img" aria-label="Where today's stories were filed from">
      <circle r={R} fill="var(--card)" stroke="var(--ink)" strokeWidth="1" />
      <g fill="none" stroke="var(--ink-3)" strokeWidth="0.6" opacity="0.7">
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {/* The mark's two lines: the equator and the meridian facing the viewer, heavier. */}
      <g fill="none" stroke="var(--ink)" strokeWidth="1">
        {greatCircles(center).map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {labelled.map((p) => (
        <g key={p.city} transform={`translate(${p.x} ${p.y})`}>
          <circle r="4.5" fill="var(--accent)" stroke="var(--card)" strokeWidth="1.5" />
          <text x={p.left ? -9 : 9} y="4" textAnchor={p.left ? "end" : "start"} className="wire" fill="var(--ink)" style={{ fontSize: 11, letterSpacing: "0.06em" }}>
            {p.city}
          </text>
        </g>
      ))}
    </svg>
  );
}
