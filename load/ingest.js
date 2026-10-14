// k6 load test for the ingest API.
//   docker run --rm -i --add-host=host.docker.internal:host-gateway grafana/k6:0.54.0 run - < load/ingest.js
// Ramps to a sustained arrival rate of batch requests and enforces latency/error SLOs as thresholds.
import http from 'k6/http';
import { check } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE = __ENV.INGEST_URL || 'http://host.docker.internal:8090';
const BATCH = Number(__ENV.BATCH || 100);
const RPS = Number(__ENV.RPS || 40); // requests/s; events/s = RPS x BATCH
const TERRITORIES = ['US', 'GB', 'DE', 'JP', 'BR', 'MX', 'FR', 'IN'];

export const options = {
  scenarios: {
    sustained: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { target: RPS, duration: '15s' },
        { target: RPS, duration: '60s' },
        { target: 0, duration: '5s' },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.001'],
    http_req_duration: ['p(95)<250', 'p(99)<500'],
    checks: ['rate>0.999'],
  },
};

export default function () {
  const now = Date.now();
  const events = Array.from({ length: BATCH }, (_, i) => ({
    eventId: uuidv4(),
    isrc: `USRL1260${String(1 + ((i * 7 + __ITER) % 40)).padStart(4, '0')}`,
    territory: TERRITORIES[(i + __VU) % TERRITORIES.length],
    tier: i % 3 === 0 ? 'ad_supported' : 'premium',
    playedAt: new Date(now - (i % 60) * 1000).toISOString(),
    durationMs: i % 7 === 0 ? 12000 : 185000,
  }));
  const res = http.post(`${BASE}/v1/plays`, JSON.stringify({ events }), { headers: { 'content-type': 'application/json' } });
  check(res, {
    'accepted (202)': (r) => r.status === 202,
    'no rejected rows': (r) => r.status === 202 && r.json('rejected').length === 0,
  });
}
