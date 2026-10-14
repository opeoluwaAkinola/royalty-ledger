// Moves every message from the dead-letter queue back to the main queue.
// Safe to run any time: the aggregator deduplicates on eventId, so nothing is double counted.
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import { sqs as makeSqs } from '../clients.js';

const sqs = makeSqs();
const { QUEUE_URL, DLQ_URL } = process.env;
let moved = 0;
for (;;) {
  const { Messages = [] } = await sqs.send(new ReceiveMessageCommand({ QueueUrl: DLQ_URL, MaxNumberOfMessages: 10, WaitTimeSeconds: 1 }));
  if (!Messages.length) break;
  for (const m of Messages) {
    await sqs.send(new SendMessageCommand({ QueueUrl: QUEUE_URL, MessageBody: m.Body }));
    await sqs.send(new DeleteMessageCommand({ QueueUrl: DLQ_URL, ReceiptHandle: m.ReceiptHandle }));
    moved++;
  }
}
console.log(`redrove ${moved} message(s) from the DLQ`);
