/**
 * The sheet's globe, and the sheet's slugs.
 *
 * `project` is an orthographic projection of the sphere as seen from
 * infinitely far away along the line through `center`: the familiar
 * "globe" picture. A point is visible when it lies on the near hemisphere;
 * everything else is culled, which is what makes the graticule read as a
 * solid ball rather than a wireframe. `graticule` walks parallels and
 * meridians and emits only their visible runs as SVG path data.
 *
 * `deskFor` places a publisher's desk on the globe so today's sheet can pin
 * where its stories came from. `slugFor` writes the wire-style slug that
 * heads each row of the sheet.
 */

export type LatLon = { lat: number; lon: number };
export type Projected = { x: number; y: number; visible: boolean };

const RAD = Math.PI / 180;

export function project(point: LatLon, center: LatLon, radius: number): Projected {
  const φ = point.lat * RAD;
  const λ = point.lon * RAD;
  const φ0 = center.lat * RAD;
  const λ0 = center.lon * RAD;
  const cosc = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(λ - λ0);
  const x = radius * Math.cos(φ) * Math.sin(λ - λ0);
  const y = -radius * (Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(λ - λ0));
  return { x: round(x), y: round(y), visible: cosc > 0 };
}

function round(v: number): number {
  // `+ 0` folds -0 into 0 so path data never reads "-0".
  return Math.round(v * 100) / 100 + 0;
}

/** Visible arcs of parallels and meridians every `step` degrees, as SVG `d` strings. */
export function graticule(center: LatLon, radius: number, step = 15): string[] {
  const paths: string[] = [];
  const SAMPLE = 3;
  const emit = (points: LatLon[]) => {
    let run: string[] = [];
    const flush = () => {
      if (run.length > 1) paths.push(`M${run.join("L")}`);
      run = [];
    };
    for (const p of points) {
      const q = project(p, center, radius);
      if (q.visible) run.push(`${q.x},${q.y}`);
      else flush();
    }
    flush();
  };
  for (let lat = -90 + step; lat < 90; lat += step) {
    const pts: LatLon[] = [];
    for (let lon = -180; lon <= 180; lon += SAMPLE) pts.push({ lat, lon });
    emit(pts);
  }
  for (let lon = -180; lon < 180; lon += step) {
    const pts: LatLon[] = [];
    for (let lat = -90; lat <= 90; lat += SAMPLE) pts.push({ lat, lon });
    emit(pts);
  }
  return paths;
}

export type Desk = { city: string; lat: number; lon: number };

// Where the desk sits — the wire's dateline, not the company's registration.
const DESKS: [RegExp, Desk][] = [
  [/reuters|bbc|financial times|\bft\b|the guardian|the economist|sky news|telegraph|the times\b/i, { city: "London", lat: 51.51, lon: -0.13 }],
  [/bloomberg|new york times|nyt|wall street journal|wsj|associated press|ap news|\bap\b|cnbc|cnn|nbc|cbs|abc news|forbes|fortune|business insider|the verge|axios|semafor|the information/i, { city: "New York", lat: 40.71, lon: -74.01 }],
  [/washington post|politico|the hill|npr/i, { city: "Washington", lat: 38.9, lon: -77.04 }],
  [/techcrunch|wired|the atlantic|ars technica|marketwatch|barron/i, { city: "San Francisco", lat: 37.77, lon: -122.42 }],
  [/la tercera|emol|el mercurio|biobio|cooperativa|diario financiero|\bdf\b|la nación|latercera/i, { city: "Santiago", lat: -33.45, lon: -70.67 }],
  [/el país|el pais|el mundo|expansión|abc\.es/i, { city: "Madrid", lat: 40.42, lon: -3.7 }],
  [/le monde|afp|le figaro/i, { city: "Paris", lat: 48.86, lon: 2.35 }],
  [/folha|globo|estadão|estadao/i, { city: "São Paulo", lat: -23.55, lon: -46.63 }],
  [/clarín|clarin|la nación|infobae/i, { city: "Buenos Aires", lat: -34.6, lon: -58.38 }],
  [/al jazeera/i, { city: "Doha", lat: 25.29, lon: 51.53 }],
  [/nikkei|japan times|asahi/i, { city: "Tokyo", lat: 35.68, lon: 139.69 }],
  [/south china morning post|scmp|xinhua/i, { city: "Hong Kong", lat: 22.32, lon: 114.17 }],
  [/mining\.com|northern miner/i, { city: "Vancouver", lat: 49.28, lon: -123.12 }],
  [/mit technology review|stat news|nature|science/i, { city: "Boston", lat: 42.36, lon: -71.06 }],
  [/deutsche welle|\bdw\b|spiegel|handelsblatt/i, { city: "Berlin", lat: 52.52, lon: 13.41 }],
  // Outlets that turn up on the showcase sheet.
  [/bnamericas|reuters\.cl|diario financiero/i, { city: "Santiago", lat: -33.45, lon: -70.67 }],
  [/mining technology|the register|techradar|new scientist|reuters\.com|independent|daily mail|evening standard|city a\.?m/i, { city: "London", lat: 51.51, lon: -0.13 }],
  [/usa today|spacenews|space news|nasa|federal news|defense one|breaking defense|the war zone/i, { city: "Washington", lat: 38.9, lon: -77.04 }],
  [/space\.com|aol|engadget|yahoo|gizmodo|quartz|vice|huffpost|newsweek|time\b|the daily beast|futurism|observer/i, { city: "New York", lat: 40.71, lon: -74.01 }],
  [/cnet|the information|sfgate|sf chronicle|techmeme|venturebeat|9to5|electrek|the block/i, { city: "San Francisco", lat: 37.77, lon: -122.42 }],
  [/times-union|jacksonville/i, { city: "Jacksonville", lat: 30.33, lon: -81.66 }],
  [/orlando sentinel|florida today|spacecoast|space coast/i, { city: "Orlando", lat: 28.54, lon: -81.38 }],
  [/houston chronicle|texas tribune|dallas morning/i, { city: "Houston", lat: 29.76, lon: -95.37 }],
  [/los angeles times|la times|hollywood reporter|variety|deadline/i, { city: "Los Angeles", lat: 34.05, lon: -118.24 }],
  [/chicago tribune|crain/i, { city: "Chicago", lat: 41.88, lon: -87.63 }],
  [/china ?daily|global times|people's daily|caixin|sixth tone/i, { city: "Beijing", lat: 39.9, lon: 116.4 }],
  [/philippine|inquirer|rappler|manila/i, { city: "Manila", lat: 14.6, lon: 120.98 }],
  [/times of india|the hindu|hindustan times|indian express|ndtv|economic times|mint\b|livemint/i, { city: "New Delhi", lat: 28.61, lon: 77.21 }],
  [/abc\.net\.au|sydney morning herald|the australian|news\.com\.au|the age\b|the conversation/i, { city: "Sydney", lat: -33.87, lon: 151.21 }],
  [/cbc|globe and mail|toronto star|national post|the logic/i, { city: "Toronto", lat: 43.65, lon: -79.38 }],
  [/el universal|milenio|reforma|excélsior|excelsior|el economista/i, { city: "Mexico City", lat: 19.43, lon: -99.13 }],
  [/euronews|france 24|rfi/i, { city: "Paris", lat: 48.86, lon: 2.35 }],
  [/korea herald|yonhap|korea times|chosun/i, { city: "Seoul", lat: 37.57, lon: 126.98 }],
  [/straits times|channel news asia|cna\b/i, { city: "Singapore", lat: 1.35, lon: 103.82 }],
  [/haaretz|times of israel|jerusalem post/i, { city: "Tel Aviv", lat: 32.08, lon: 34.78 }],
  [/moneyweb|news24|daily maverick/i, { city: "Johannesburg", lat: -26.2, lon: 28.05 }],
  [/el comercio|gestión|gestion\b|la república/i, { city: "Lima", lat: -12.05, lon: -77.04 }],
  [/el tiempo|semana|portafolio/i, { city: "Bogotá", lat: 4.71, lon: -74.07 }],
];

export function deskFor(publisher: string | null): Desk | null {
  if (!publisher) return null;
  for (const [pattern, desk] of DESKS) if (pattern.test(publisher)) return desk;
  return null;
}

const STOPWORDS = new Set(["a", "an", "the", "as", "at", "by", "for", "in", "of", "on", "to", "and", "or", "is", "are", "its", "with", "from", "amid", "after", "over", "into", "vs", "de", "la", "el", "en", "y", "los", "las", "del", "un", "una", "por", "para", "con"]);
const SLUG_WORDS = 4;

/** `TOPIC/HEADLINE-WORDS` in caps — the wire's slug convention. Topic words are not repeated on the right. */
export function slugFor(topic: string, headline: string): string {
  const left = words(topic).join("-").toUpperCase() || "TOPIC";
  const topicWords = new Set(words(topic));
  const right = words(headline)
    .filter((w) => !STOPWORDS.has(w) && !topicWords.has(w))
    .slice(0, SLUG_WORDS)
    .join("-")
    .toUpperCase();
  return `${left}/${right || "UNTITLED"}`;
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9. ]+/g, " ")
    .replace(/\./g, "-")
    .split(/[\s-]+/)
    .filter(Boolean);
}
