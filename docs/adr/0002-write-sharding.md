# 2. Write sharding for period aggregates

**Status:** Accepted

## Context
The obvious key, `PERIOD#2026-10`, puts every write for a month on one partition. A single DynamoDB partition supports about 1,000 write units per second, and each transactional write costs double. A popular release week would throttle the pipeline.

## Decision
Spread each period over 16 partition keys, `PERIOD#2026-10#S00` to `#S15`.

- Aggregate rows shard by an FNV-1a hash of `isrc#territory#tier`, so each aggregate always lives on exactly one shard.
- Running totals shard by a hash of `eventId`, so totals spread evenly.
- Readers (royalty-service) query all 16 shards. Reads are rare (dashboards, statement runs), and writes are constant.

## Consequences
- Write capacity per period scales about 16x before hitting partition limits.
- Reading a period is 16 small queries instead of 1, which is an acceptable trade for a batch read path.
- The shard count is part of the data format. Changing it later means re-sharding or reading both layouts, so it is a constant in both services.
