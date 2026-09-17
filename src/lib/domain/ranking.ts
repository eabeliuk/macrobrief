/**
 * Editorial ranking for a topic's candidate pool.
 *
 * "Newest N wins" lets five wire rewrites of one story crowd out a real
 * exclusive. Instead: group near-duplicate headlines, score each group by
 * `log1p(mentions) × tier_weight`, take the best-tier / newest member as the
 * canonical article, and break ties by spreading picks across the window so
 * a multi-day brief covers the period rather than its last few hours.
 *
 * Pure functions, no I/O. Ported from roiver's `news_ranking.py` (minus the
 * embedding clustering — headline-prefix grouping is the M1 fallback there
 * and the default here).
 */

export type Rankable = {
  title: string;
  publisher: string | null;
  publishedAt: Date;
};

export type RankingGroup<T extends Rankable> = {
  signature: string;
  members: T[];
  canonical: T;
  bestTier: 1 | 2 | 3;
  score: number;
};

// Tier boundaries are editorial policy, not config: move outlets by review.
const TIER_1 = [
  "reuters",
  "bloomberg",
  "associated press",
  "ap news",
  "the new york times",
  "new york times",
  "nyt",
  "washington post",
  "wall street journal",
  "wsj",
  "financial times",
  "bbc",
  "the guardian",
  "the economist",
  "afp",
  "el país",
  "el pais",
  "le monde",
  "nature",
  "science",
];

const TIER_2 = [
  "cnbc",
  "axios",
  "politico",
  "the verge",
  "techcrunch",
  "ars technica",
  "wired",
  "the atlantic",
  "forbes",
  "fortune",
  "business insider",
  "the information",
  "marketwatch",
  "barron",
  "npr",
  "cnn",
  "nbc",
  "cbs",
  "abc news",
  "al jazeera",
  "la tercera",
  "emol",
  "el mercurio",
  "folha",
  "clarín",
  "clarin",
  "the hill",
  "semafor",
  "stat news",
  "mit technology review",
  "ieee spectrum",
];

const TIER_WEIGHT: Record<1 | 2 | 3, number> = { 1: 3, 2: 2, 3: 1 };
/**
 * How much a reader's own clicks can lift a publisher: at full affinity a
 * tier-3 outlet scores like a strong tier-2 (1 × 2.2 > 2), never like tier 1.
 * The editor's tiers stay the spine; the reader bends it, not breaks it.
 */
const MAX_AFFINITY_BOOST = 1.2;

export type RankOptions = {
  /** 0..1 — how much this reader opens this publisher's stories. */
  affinity?: (publisher: string | null) => number;
};
const HEADLINE_PREFIX_CHARS = 80;
const TIED_EPSILON = 1e-9;

export function publisherTier(publisher: string | null): 1 | 2 | 3 {
  if (!publisher) return 3;
  const needle = ` ${publisher.toLowerCase().trim()} `;
  if (TIER_1.some((m) => needle.includes(m))) return 1;
  if (TIER_2.some((m) => needle.includes(m))) return 2;
  return 3;
}

/** Lowercase, strip punctuation, collapse whitespace, keep the leading prefix. */
export function normalizeHeadline(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, HEADLINE_PREFIX_CHARS);
}

function canonicalOf<T extends Rankable>(group: T[]): T {
  return group.reduce((best, a) => {
    const ta = publisherTier(a.publisher);
    const tb = publisherTier(best.publisher);
    if (ta !== tb) return ta < tb ? a : best;
    return a.publishedAt > best.publishedAt ? a : best;
  });
}

export function rankGroups<T extends Rankable>(items: T[], options: RankOptions = {}): RankingGroup<T>[] {
  const groups = new Map<string, T[]>();
  items.forEach((item, index) => {
    // An empty signature must not merge unrelated unknowns.
    const signature = normalizeHeadline(item.title) || `__nosig__${index}`;
    const list = groups.get(signature);
    if (list) list.push(item);
    else groups.set(signature, [item]);
  });

  const out: RankingGroup<T>[] = [];
  for (const [signature, members] of groups) {
    // Tier of the best publisher in the group, not just the canonical one —
    // if a blog was the freshest dupe the group still reflects that Reuters ran it.
    const bestTier = Math.min(...members.map((m) => publisherTier(m.publisher))) as 1 | 2 | 3;
    // The group's affinity is its most-read member's, clamped to 0..1.
    const affinity = options.affinity ? Math.min(1, Math.max(0, ...members.map((m) => options.affinity!(m.publisher)))) : 0;
    out.push({
      signature,
      members,
      canonical: canonicalOf(members),
      bestTier,
      score: Math.log1p(members.length) * (TIER_WEIGHT[bestTier] + MAX_AFFINITY_BOOST * affinity),
    });
  }
  out.sort((a, b) => b.score - a.score || b.canonical.publishedAt.getTime() - a.canonical.publishedAt.getTime());
  return out;
}

/**
 * Greedy pick in score order; among effectively-tied groups, prefer the one
 * farthest in time from anything already picked.
 */
function pickWithSpread<T extends Rankable>(groups: RankingGroup<T>[], maxN: number): RankingGroup<T>[] {
  if (groups.length <= maxN) return groups;
  const remaining = [...groups];
  const picked: RankingGroup<T>[] = [];
  while (remaining.length && picked.length < maxN) {
    const head = remaining[0].score;
    const tied = remaining.map((g, i) => i).filter((i) => Math.abs(remaining[i].score - head) < TIED_EPSILON);
    let chosen = tied[0];
    if (picked.length && tied.length > 1) {
      const pickedTs = picked.map((p) => p.canonical.publishedAt.getTime());
      const minDist = (i: number) => Math.min(...pickedTs.map((t) => Math.abs(remaining[i].canonical.publishedAt.getTime() - t)));
      chosen = tied.reduce((best, i) => (minDist(i) > minDist(best) ? i : best), tied[0]);
    }
    picked.push(remaining.splice(chosen, 1)[0]);
  }
  return picked;
}

/** Up to `maxN` canonical items, best first, spread across the window among ties. */
export function rankItems<T extends Rankable>(items: T[], maxN: number, options: RankOptions = {}): T[] {
  return pickWithSpread(rankGroups(items, options), maxN).map((g) => g.canonical);
}
