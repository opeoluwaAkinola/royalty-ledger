import { describe, expect, it, vi } from 'vitest';
import { createIngestHandler } from '../src/ingest.js';
import { NOW, play } from './fixtures.js';

const request = (body) => ({ requestContext: { http: { method: 'POST' } }, body: typeof body === 'string' ? body : JSON.stringify(body) });

function setup(failFirst = 0) {
  let failures = failFirst;
  const sqs = {
    send: vi.fn(async (cmd) => {
      const entries = cmd.input.Entries;
      if (failures > 0) {
        failures--;
        return { Failed: [{ Id: entries[0].Id }] };
      }
      return { Successful: entries.map((e) => ({ Id: e.Id })) };
    }),
  };
  return { sqs, handler: createIngestHandler({ sqs, queueUrl: 'q', now: () => NOW }) };
}

const sentEvents = (sqs) => sqs.send.mock.calls.flatMap(([cmd]) => cmd.input.Entries.flatMap((e) => JSON.parse(e.MessageBody)));

describe('ingest', () => {
  it('accepts valid events and batches them into SQS messages', async () => {
    const { sqs, handler } = setup();
    const events = Array.from({ length: 300 }, () => play());
    const res = await handler(request({ events }));
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body)).toEqual({ accepted: 300, rejected: [] });
    // 300 events / 25 per message = 12 messages = 2 SendMessageBatch calls
    expect(sqs.send).toHaveBeenCalledTimes(2);
    expect(sentEvents(sqs)).toHaveLength(300);
  });

  it('rejects bad rows individually without failing the batch', async () => {
    const { sqs, handler } = setup();
    const res = await handler(request({ events: [
      play(),
      play({ isrc: 'nope' }),
      play({ playedAt: '2026-08-01T00:00:00Z' }),
      play({ playedAt: '2026-10-21T12:00:00Z' }),
    ] }));
    const body = JSON.parse(res.body);
    expect(body.accepted).toBe(1);
    expect(body.rejected.map((r) => r.index)).toEqual([1, 2, 3]);
    expect(body.rejected[0].errors[0]).toMatch(/^isrc:/);
    expect(body.rejected[1].errors[0]).toMatch(/older than 30 days/);
    expect(body.rejected[2].errors[0]).toMatch(/future/);
    expect(sentEvents(sqs)).toHaveLength(1);
  });

  it('retries entries SQS fails to accept', async () => {
    const { sqs, handler } = setup(1);
    const res = await handler(request({ events: [play()] }));
    expect(res.statusCode).toBe(202);
    expect(sqs.send).toHaveBeenCalledTimes(2);
  });

  it('returns 503 when SQS keeps failing so the partner retries', async () => {
    const { handler } = setup(99);
    expect((await handler(request({ events: [play()] }))).statusCode).toBe(503);
  });

  it('validates the envelope', async () => {
    const { handler } = setup();
    expect((await handler(request('{'))).statusCode).toBe(400);
    expect((await handler(request({ events: [] }))).statusCode).toBe(400);
    expect((await handler(request({ events: Array(501).fill(play()) }))).statusCode).toBe(400);
  });
});
