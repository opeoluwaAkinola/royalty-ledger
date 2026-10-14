# 1. Exactly-once counting on top of at-least-once delivery

**Status:** Accepted

## Context
SQS delivers each message at least once, Lambda retries failed batches, and partners resend requests when they time out. A play that is counted twice pays a rights holder money they didn't earn. A play that is lost underpays them. Both are unacceptable in a royalty system.

## Decision
Every play event carries a partner-generated `eventId`. The aggregator writes each group of up to 40 events in **one DynamoDB transaction** that:

1. puts a dedupe record `EVT#<eventId>` with `attribute_not_exists(pk)`, and
2. `ADD`s the plays to the merged aggregate rows and to the sharded period totals.

If any event was already seen, DynamoDB cancels the whole transaction and returns per-item `CancellationReasons`. The aggregator drops exactly those events and retries the rest. Transaction conflicts on hot rows are retried with full-jitter exponential backoff.

Dedupe records expire through TTL 35 days after the play. Ingest rejects events older than 30 days, so a duplicate can never arrive after its dedupe record is gone.

## Consequences
- Delivery semantics are at-least-once; **counting** is exactly-once. A test delivers every message 3 times concurrently against DynamoDB Local, and CI re-sends 5% of batches end to end.
- Retrying is always safe for everyone: partners, Lambda, and the DLQ redrive script.
- Each event costs one extra write (the dedupe record). That is the price of correctness, and it is bounded by TTL.
- Merging events into one update per (track, territory, tier) keeps a 40-event transaction well under DynamoDB's 100-item limit.
