// Runs against real DynamoDB Local when DYNAMODB_ENDPOINT is set (CI and `make test`), otherwise skipped.
import { randomUUID } from 'node:crypto';
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAggregateHandler } from '../src/aggregate.js';
import { SHARDS, shardPk } from '../src/events.js';
import { play, sqsEvent } from './fixtures.js';

const endpoint = process.env.DYNAMODB_ENDPOINT;
const table = `test-${randomUUID()}`;
const raw = endpoint && new DynamoDBClient({ endpoint, region: 'us-west-2', credentials: { accessKeyId: 'x', secretAccessKey: 'x' } });
const ddb = raw && DynamoDBDocumentClient.from(raw);

async function totals(period) {
  let events = 0;
  for (let s = 0; s < SHARDS; s++) {
    const { Items } = await ddb.send(new QueryCommand({
      TableName: table, KeyConditionExpression: 'pk = :pk AND sk = :sk', ExpressionAttributeValues: { ':pk': shardPk(period, s), ':sk': 'TOTAL' },
    }));
    events += Items.reduce((n, i) => n + i.events, 0);
  }
  return events;
}

describe.skipIf(!endpoint)('aggregator against DynamoDB Local', () => {
  beforeAll(async () => {
    await raw.send(new CreateTableCommand({
      TableName: table, BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'sk', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }],
    }));
  });
  afterAll(async () => raw?.send(new DeleteTableCommand({ TableName: table })));

  it('counts each event exactly once under concurrent duplicate delivery', async () => {
    const handler = createAggregateHandler({ ddb, table, log: { error: console.error, info: () => {} } });
    const events = Array.from({ length: 400 }, (_, i) => play({ isrc: `USRC1760${String(i % 7).padStart(4, '0')}` }));
    const messages = Array.from({ length: 16 }, (_, i) => events.slice(i * 25, i * 25 + 25));
    // Deliver every message three times, concurrently, like an unlucky SQS consumer fleet.
    const results = await Promise.all([...messages, ...messages, ...messages].map((m) => handler(sqsEvent(m))));
    expect(results.flatMap((r) => r.batchItemFailures)).toEqual([]);
    expect(await totals('2026-10')).toBe(400);
  }, 60_000);
});
