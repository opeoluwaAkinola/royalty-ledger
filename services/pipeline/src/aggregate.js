import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb as defaultDdb } from './clients.js';
import { aggregateSk, MAX_EVENT_AGE_DAYS, periodOf, QUALIFYING_MS, shardOf, shardPk } from './events.js';

/** 40 dedupe puts + at most 40 aggregate updates + at most 16 shard totals stays under DynamoDB's 100-item limit. */
export const EVENTS_PER_TRANSACTION = 40;
const MAX_ATTEMPTS = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Builds one transaction that, for a group of events, atomically:
 *   1. records each eventId (fails if it was seen before), and
 *   2. adds the plays to the merged aggregate rows and to the sharded period totals.
 * Either everything in the group is counted, or nothing is. That gives exactly-once counting
 * on top of SQS's at-least-once delivery.
 */
export function buildTransaction(events, table) {
  const dedupe = events.map((e) => ({
    Put: {
      TableName: table,
      // Expire the dedupe record a few days after the event becomes too old to be accepted again.
      Item: { pk: `EVT#${e.eventId}`, sk: 'EVT', ttl: Math.floor(Date.parse(e.playedAt) / 1000) + (MAX_EVENT_AGE_DAYS + 5) * 86_400 },
      ConditionExpression: 'attribute_not_exists(pk)',
    },
  }));

  const aggregates = new Map();
  const totals = new Map();
  for (const e of events) {
    const period = periodOf(e.playedAt);
    const qualifying = e.durationMs >= QUALIFYING_MS ? 1 : 0;
    const aggKey = `${period}|${aggregateSk(e)}`;
    const agg = aggregates.get(aggKey) ?? { period, e, streams: 0, plays: 0 };
    agg.streams += 1;
    agg.plays += qualifying;
    aggregates.set(aggKey, agg);

    const totKey = shardPk(period, shardOf(e.eventId));
    const tot = totals.get(totKey) ?? { period, events: 0, plays: 0 };
    tot.events += 1;
    tot.plays += qualifying;
    totals.set(totKey, tot);
  }

  const aggregateUpdates = [...aggregates.values()].map(({ period, e, streams, plays }) => ({
    Update: {
      TableName: table,
      Key: { pk: shardPk(period, shardOf(aggregateSk(e))), sk: aggregateSk(e) },
      UpdateExpression: 'ADD streams :s, plays :p SET isrc = :isrc, territory = :t, tier = :tier, period = :period',
      ExpressionAttributeValues: { ':s': streams, ':p': plays, ':isrc': e.isrc, ':t': e.territory, ':tier': e.tier, ':period': period },
    },
  }));

  const totalUpdates = [...totals].map(([pk, { period, events: n, plays }]) => ({
    Update: {
      TableName: table,
      Key: { pk, sk: 'TOTAL' },
      UpdateExpression: 'ADD events :n, plays :p SET period = :period',
      ExpressionAttributeValues: { ':n': n, ':p': plays, ':period': period },
    },
  }));

  return [...dedupe, ...aggregateUpdates, ...totalUpdates];
}

/** Writes one group of events. Returns how many were new and how many were duplicates. */
export async function writeGroup(events, { ddb, table, backoff = sleep }) {
  let pending = events;
  let duplicates = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (pending.length === 0) return { counted: 0, duplicates };
    try {
      await ddb.send(new TransactWriteCommand({ TransactItems: buildTransaction(pending, table) }));
      return { counted: pending.length, duplicates };
    } catch (err) {
      if (err.name !== 'TransactionCanceledException' && err.name !== 'TransactionInProgressException') throw err;
      const reasons = err.CancellationReasons ?? [];
      // Dedupe puts come first, so reason[i] for i < pending.length belongs to pending[i].
      const seen = new Set(pending.map((_, i) => i).filter((i) => reasons[i]?.Code === 'ConditionalCheckFailed'));
      if (seen.size > 0) {
        duplicates += seen.size;
        pending = pending.filter((_, i) => !seen.has(i));
        continue;
      }
      // Conflicts with a concurrent writer on a hot aggregate row: back off with full jitter and retry.
      await backoff(Math.random() * Math.min(1000, 25 * 2 ** attempt));
    }
  }
  throw new Error(`Transaction kept conflicting after ${MAX_ATTEMPTS} attempts`);
}

/** Drops in-batch repeats so a transaction never touches the same dedupe key twice. */
function uniqueById(events) {
  const seen = new Map();
  for (const e of events) if (!seen.has(e.eventId)) seen.set(e.eventId, e);
  return { unique: [...seen.values()], repeats: events.length - seen.size };
}

/**
 * SQS-triggered Lambda. Uses partial batch responses, so one poisoned message is retried
 * (and eventually lands in the DLQ) without blocking the others.
 */
export function createAggregateHandler({ ddb = defaultDdb(), table = process.env.TABLE_NAME, log = console } = {}) {
  return async function handler(sqsEvent) {
    const batchItemFailures = [];
    let counted = 0;
    let duplicates = 0;
    for (const record of sqsEvent.Records ?? []) {
      try {
        const { unique, repeats } = uniqueById(JSON.parse(record.body));
        duplicates += repeats;
        for (let i = 0; i < unique.length; i += EVENTS_PER_TRANSACTION) {
          const res = await writeGroup(unique.slice(i, i + EVENTS_PER_TRANSACTION), { ddb, table });
          counted += res.counted;
          duplicates += res.duplicates;
        }
      } catch (err) {
        log.error(JSON.stringify({ msg: 'failed to aggregate message', messageId: record.messageId, error: err.message }));
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }
    log.info?.(JSON.stringify({ msg: 'aggregated', messages: sqsEvent.Records?.length ?? 0, counted, duplicates, failed: batchItemFailures.length }));
    return { batchItemFailures };
  };
}

export const handler = (event) => createAggregateHandler()(event);
