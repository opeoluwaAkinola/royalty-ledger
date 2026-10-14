import { randomUUID } from 'node:crypto';

export const NOW = Date.parse('2026-10-20T12:00:00Z');

export const play = (overrides = {}) => ({
  eventId: randomUUID(),
  isrc: 'USRC17607839',
  territory: 'US',
  tier: 'premium',
  playedAt: '2026-10-20T11:00:00Z',
  durationMs: 180_000,
  ...overrides,
});

export const sqsEvent = (...bodies) => ({
  Records: bodies.map((events, i) => ({ messageId: `m${i}`, body: typeof events === 'string' ? events : JSON.stringify(events) })),
});
