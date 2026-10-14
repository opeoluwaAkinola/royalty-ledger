// Local stand-in for the Lambda SQS event source mapping: long-polls the queue, invokes the
// aggregator with SQS-shaped events, and deletes only the messages that succeeded.
// Failed messages reappear after the visibility timeout and move to the DLQ after maxReceiveCount.
import { DeleteMessageBatchCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { sqs as makeSqs } from '../clients.js';
import { createAggregateHandler } from '../aggregate.js';

const sqs = makeSqs();
const queueUrl = process.env.QUEUE_URL;
const concurrency = Number(process.env.CONCURRENCY ?? 4);
const handler = createAggregateHandler({ log: { error: console.error, info: () => {} } });

let processed = 0;
let stopping = false;

async function worker() {
  while (!stopping) {
    const { Messages = [] } = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: 10, MessageSystemAttributeNames: ['ApproximateReceiveCount'],
    }));
    if (!Messages.length) continue;
    const { batchItemFailures } = await handler({
      Records: Messages.map((m) => ({ messageId: m.MessageId, receiptHandle: m.ReceiptHandle, body: m.Body, attributes: m.Attributes })),
    });
    const failed = new Set(batchItemFailures.map((f) => f.itemIdentifier));
    const done = Messages.filter((m) => !failed.has(m.MessageId));
    if (done.length) {
      await sqs.send(new DeleteMessageBatchCommand({
        QueueUrl: queueUrl, Entries: done.map((m, i) => ({ Id: String(i), ReceiptHandle: m.ReceiptHandle })),
      }));
    }
    processed += done.length;
  }
}

setInterval(() => {
  if (processed) console.log(JSON.stringify({ msg: 'aggregator progress', messagesProcessed: processed }));
}, 10_000).unref();

process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
console.log(`aggregator polling ${queueUrl} with ${concurrency} workers`);
await Promise.all(Array.from({ length: concurrency }, async () => {
  for (;;) {
    try {
      await worker();
      return;
    } catch (err) {
      console.error('poll error, retrying', err.message);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}));
