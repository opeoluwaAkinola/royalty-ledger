#!/usr/bin/env node
// Usage: node src/simulate.js --events 50000 --rate 2000 --duplicates 0.05
//   --events      total unique events to send
//   --rate        target events per second
//   --batch       events per HTTP request (max 500)
//   --duplicates  fraction of batches re-sent, simulating partner retries; they must not be double counted
import { parseArgs } from 'node:util';
import { createGenerator } from './generate.js';

const { values: args } = parseArgs({
  options: {
    events: { type: 'string', default: '20000' },
    rate: { type: 'string', default: '1000' },
    batch: { type: 'string', default: '250' },
    duplicates: { type: 'string', default: '0.05' },
    concurrency: { type: 'string', default: '8' },
    ingest: { type: 'string', default: process.env.INGEST_URL ?? 'http://localhost:8090' },
    catalog: { type: 'string', default: process.env.CATALOG_URL ?? 'http://localhost:8085' },
  },
});

const total = Number(args.events);
const rate = Number(args.rate);
const batchSize = Number(args.batch);
const dupRate = Number(args.duplicates);

const isrcs = (await (await fetch(`${args.catalog}/api/tracks`)).json()).map((t) => t.isrc);
const next = createGenerator({ isrcs });

let sent = 0;
let accepted = 0;
let resent = 0;
let rejected = 0;
const latencies = [];
const started = Date.now();

async function post(events) {
  const t0 = performance.now();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${args.ingest}/v1/plays`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }),
    });
    if (res.status === 202) {
      const body = await res.json();
      latencies.push(performance.now() - t0);
      return body;
    }
    if (attempt >= 4) throw new Error(`ingest returned ${res.status}`);
    await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
  }
}

async function worker() {
  while (sent < total) {
    const n = Math.min(batchSize, total - sent);
    sent += n;
    const events = Array.from({ length: n }, next);
    const due = started + (sent / rate) * 1000;
    if (due > Date.now()) await new Promise((r) => setTimeout(r, due - Date.now()));
    const res = await post(events);
    accepted += res.accepted;
    rejected += res.rejected.length;
    if (Math.random() < dupRate) {
      await post(events); // a partner retry: same eventIds again
      resent += n;
    }
  }
}

await Promise.all(Array.from({ length: Number(args.concurrency) }, worker));
const secs = (Date.now() - started) / 1000;
latencies.sort((a, b) => a - b);
const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))]?.toFixed(0);
console.log(JSON.stringify({
  uniqueEvents: accepted, duplicateEventsSent: resent, rejected, seconds: Number(secs.toFixed(1)),
  eventsPerSecond: Math.round((accepted + resent) / secs), requestLatencyMs: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99) },
}, null, 2));
