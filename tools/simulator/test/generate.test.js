import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGenerator, weightedPicker, zipfWeights } from '../src/generate.js';

test('weighted picker respects weights', () => {
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = weightedPicker(['a', 'b'], [9, 1], random);
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 10_000; i++) counts[pick()]++;
  assert.ok(counts.a > 8_500 && counts.a < 9_500, JSON.stringify(counts));
});

test('zipf puts the hits first', () => {
  const w = zipfWeights(10);
  assert.ok(w[0] > w[1] && w[1] > w[9]);
});

test('generated events are valid-looking and include skips and unknown ISRCs', () => {
  const next = createGenerator({ isrcs: Array.from({ length: 40 }, (_, i) => `USRL1260${String(i + 1).padStart(4, '0')}`) });
  const events = Array.from({ length: 5_000 }, next);
  assert.equal(new Set(events.map((e) => e.eventId)).size, 5_000);
  assert.ok(events.some((e) => e.durationMs < 30_000));
  assert.ok(events.some((e) => e.isrc.startsWith('ZZ')));
  assert.ok(events.every((e) => /^[A-Z]{2}$/.test(e.territory)));
});
