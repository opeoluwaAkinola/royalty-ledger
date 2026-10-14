import { z } from 'zod';

/** Streams shorter than this don't count as a royalty-bearing play (the industry's 30-second rule). */
export const QUALIFYING_MS = 30_000;
/** Aggregates and totals are spread over this many partition keys to avoid a hot partition per period. */
export const SHARDS = 16;
/** Dedupe records expire after this; partners may not send events older than this. */
export const MAX_EVENT_AGE_DAYS = 30;

export const TIERS = ['premium', 'ad_supported'];

const isrc = z.string().regex(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/, 'expected a 12-character ISRC, e.g. USRC17607839');

export const playEventSchema = z.object({
  eventId: z.string().uuid(),
  isrc,
  territory: z.string().regex(/^[A-Z]{2}$/, 'expected an ISO 3166-1 alpha-2 code'),
  tier: z.enum(TIERS),
  playedAt: z.string().datetime({ offset: true }),
  durationMs: z.number().int().min(0).max(24 * 3600 * 1000),
});

/** Validates the time window separately so the clock can be injected in tests. */
export function checkWindow(event, now = Date.now()) {
  const t = Date.parse(event.playedAt);
  if (t > now + 5 * 60_000) return 'playedAt is in the future';
  if (t < now - MAX_EVENT_AGE_DAYS * 86_400_000) return `playedAt is older than ${MAX_EVENT_AGE_DAYS} days`;
  return null;
}

/** Statement period (UTC month) a play belongs to, e.g. "2026-10". */
export const periodOf = (playedAt) => new Date(playedAt).toISOString().slice(0, 7);

/** FNV-1a: tiny, fast, stable across languages. Only used to pick a shard. */
export function shardOf(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % SHARDS;
}

export const shardPk = (period, shard) => `PERIOD#${period}#S${String(shard).padStart(2, '0')}`;
export const aggregateSk = (e) => `AGG#${e.isrc}#${e.territory}#${e.tier}`;
