import { randomUUID } from 'node:crypto';

// Rough share of streams by territory; the long tail is grouped into a few smaller markets.
export const TERRITORIES = [['US', 34], ['GB', 10], ['DE', 9], ['JP', 8], ['BR', 8], ['MX', 6], ['FR', 6], ['CA', 5], ['AU', 4], ['NG', 3], ['IN', 7]];

/** Zipf-distributed popularity: a few hits, a long tail. */
export function zipfWeights(n, s = 1.1) {
  return Array.from({ length: n }, (_, i) => 1 / (i + 1) ** s);
}

export function weightedPicker(items, weights, random = Math.random) {
  const cumulative = [];
  weights.reduce((sum, w, i) => (cumulative[i] = sum + w), 0);
  const total = cumulative.at(-1);
  return () => {
    const r = random() * total;
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    return items[lo];
  };
}

/**
 * Builds a play-event factory over a catalog. A small share of events use ISRCs that are not in the
 * catalog (they should land in suspense), and ~15% are skips under 30 seconds (not royalty-bearing).
 */
export function createGenerator({ isrcs, unknownIsrcs = ['ZZXXX2600001', 'ZZXXX2600002'], now = () => Date.now(), random = Math.random }) {
  const track = weightedPicker([...isrcs, ...unknownIsrcs], [...zipfWeights(isrcs.length), ...unknownIsrcs.map(() => 0.02)], random);
  const territory = weightedPicker(TERRITORIES.map(([t]) => t), TERRITORIES.map(([, w]) => w), random);
  return () => ({
    eventId: randomUUID(),
    isrc: track(),
    territory: territory(),
    tier: random() < 0.62 ? 'premium' : 'ad_supported',
    playedAt: new Date(now() - Math.floor(random() * 60_000)).toISOString(),
    durationMs: random() < 0.15 ? Math.floor(random() * 29_000) : 30_000 + Math.floor(random() * 240_000),
  });
}
