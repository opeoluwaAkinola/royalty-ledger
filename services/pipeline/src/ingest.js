import { randomUUID } from 'node:crypto';
import { SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { checkWindow, playEventSchema } from './events.js';
import { sqs as defaultSqs } from './clients.js';

export const MAX_EVENTS_PER_REQUEST = 500;
const EVENTS_PER_MESSAGE = 25;
const MESSAGES_PER_BATCH = 10;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': statusCode >= 400 ? 'application/problem+json' : 'application/json' },
  body: JSON.stringify(body),
});

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/**
 * Validates play events and enqueues them. Invalid events are reported individually so a partner
 * never has to resend a whole batch for one bad row. Resending valid events is always safe:
 * the aggregator deduplicates on eventId.
 */
export function createIngestHandler({ sqs = defaultSqs(), queueUrl = process.env.QUEUE_URL, now = () => Date.now() } = {}) {
  return async function handler(request) {
    if (request.requestContext?.http?.method && request.requestContext.http.method !== 'POST') {
      return json(405, { title: 'Method not allowed', status: 405 });
    }
    let body;
    try {
      body = JSON.parse(request.isBase64Encoded ? Buffer.from(request.body ?? '', 'base64').toString() : request.body ?? '');
    } catch {
      return json(400, { title: 'Invalid request', status: 400, detail: 'Body must be JSON' });
    }
    const events = body?.events;
    if (!Array.isArray(events) || events.length === 0 || events.length > MAX_EVENTS_PER_REQUEST) {
      return json(400, { title: 'Invalid request', status: 400, detail: `events must be an array of 1-${MAX_EVENTS_PER_REQUEST} play events` });
    }

    const accepted = [];
    const rejected = [];
    const t = now();
    events.forEach((raw, index) => {
      const parsed = playEventSchema.safeParse(raw);
      if (!parsed.success) {
        rejected.push({ index, eventId: raw?.eventId, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
        return;
      }
      const windowError = checkWindow(parsed.data, t);
      if (windowError) rejected.push({ index, eventId: parsed.data.eventId, errors: [windowError] });
      else accepted.push(parsed.data);
    });

    const messages = chunk(accepted, EVENTS_PER_MESSAGE).map((evts) => ({ Id: randomUUID(), MessageBody: JSON.stringify(evts) }));
    for (const batch of chunk(messages, MESSAGES_PER_BATCH)) {
      let pending = batch;
      for (let attempt = 0; attempt < 3 && pending.length; attempt++) {
        const res = await sqs.send(new SendMessageBatchCommand({ QueueUrl: queueUrl, Entries: pending }));
        const failed = new Set((res.Failed ?? []).map((f) => f.Id));
        pending = pending.filter((m) => failed.has(m.Id));
      }
      if (pending.length) {
        // Nothing is lost by retrying: already-queued events are deduplicated downstream.
        return json(503, { title: 'Temporarily unavailable', status: 503, detail: 'Could not enqueue all events; retry the request' });
      }
    }

    return json(202, { accepted: accepted.length, rejected });
  };
}

export const handler = (event) => createIngestHandler()(event);
