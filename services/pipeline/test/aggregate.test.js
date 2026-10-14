import { beforeEach, describe, expect, it } from 'vitest';
import { buildTransaction, createAggregateHandler, EVENTS_PER_TRANSACTION, writeGroup } from '../src/aggregate.js';
import { FakeDynamo } from './fakeDynamo.js';
import { play, sqsEvent } from './fixtures.js';

const quiet = { error: () => {}, info: () => {} };
let ddb;
let handler;

beforeEach(() => {
  ddb = new FakeDynamo();
  handler = createAggregateHandler({ ddb, table: 't', log: quiet });
});

describe('buildTransaction', () => {
  it('merges events for the same track/territory/tier into one aggregate update', () => {
    const items = buildTransaction([play(), play(), play({ territory: 'GB' })], 't');
    const updates = items.filter((i) => i.Update?.Key.sk.startsWith('AGG#'));
    expect(updates).toHaveLength(2);
    expect(updates.find((u) => u.Update.Key.sk.endsWith('#US#premium')).Update.ExpressionAttributeValues[':s']).toBe(2);
  });

  it('never exceeds the 100-item transaction limit', () => {
    const events = Array.from({ length: EVENTS_PER_TRANSACTION }, (_, i) =>
      play({ isrc: `USRC1760${String(i).padStart(4, '0')}`, territory: i % 2 ? 'US' : 'GB' }));
    expect(buildTransaction(events, 't').length).toBeLessThanOrEqual(100);
  });
});

describe('aggregator', () => {
  it('counts qualifying plays and all streams', async () => {
    await handler(sqsEvent([play(), play({ durationMs: 12_000 }), play({ tier: 'ad_supported' })]));
    expect(ddb.sum('AGG#', 'streams')).toBe(3);
    expect(ddb.sum('AGG#', 'plays')).toBe(2);
    expect(ddb.sum('TOTAL', 'events')).toBe(3);
  });

  it('is exactly-once: redelivered messages are not double counted', async () => {
    const batch = [play(), play(), play()];
    await handler(sqsEvent(batch));
    const res = await handler(sqsEvent(batch)); // SQS at-least-once redelivery
    expect(res.batchItemFailures).toEqual([]);
    expect(ddb.sum('AGG#', 'plays')).toBe(3);
    expect(ddb.sum('TOTAL', 'events')).toBe(3);
  });

  it('counts the new events in a batch that also contains already-seen ones', async () => {
    const seen = play();
    await handler(sqsEvent([seen]));
    await handler(sqsEvent([seen, play(), play()]));
    expect(ddb.sum('TOTAL', 'events')).toBe(3);
  });

  it('ignores repeats inside a single message', async () => {
    const e = play();
    await handler(sqsEvent([e, e, e]));
    expect(ddb.sum('TOTAL', 'events')).toBe(1);
  });

  it('retries through transaction conflicts on hot rows', async () => {
    ddb.conflictsToInject = 2;
    const res = await writeGroup([play()], { ddb, table: 't', backoff: async () => {} });
    expect(res.counted).toBe(1);
    expect(ddb.calls).toBe(3);
  });

  it('reports only the poisoned message as a batch item failure', async () => {
    const res = await handler(sqsEvent([play()], 'not json', [play()]));
    expect(res.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
    expect(ddb.sum('TOTAL', 'events')).toBe(2);
  });

  it('spreads totals and aggregates across shards', async () => {
    const events = Array.from({ length: 200 }, (_, i) => play({ isrc: `USRC1760${String(i).padStart(4, '0')}` }));
    await handler(sqsEvent(events));
    const pks = new Set(ddb.rows('TOTAL').map((r) => r.pk));
    expect(pks.size).toBeGreaterThan(10);
    expect(ddb.sum('TOTAL', 'events')).toBe(200);
  });
});
