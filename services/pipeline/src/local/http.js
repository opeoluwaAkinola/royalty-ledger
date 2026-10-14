// Local stand-in for API Gateway: turns Node HTTP requests into HTTP API (v2) events for the ingest Lambda.
import { createServer } from 'node:http';
import { createIngestHandler } from '../ingest.js';

const handler = createIngestHandler();
const port = Number(process.env.PORT ?? 8090);
const MAX_BODY = 1024 * 1024;

createServer(async (req, res) => {
  if (req.url === '/health') return res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"UP"}');
  if (!req.url.startsWith('/v1/plays')) return res.writeHead(404).end();

  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) return res.writeHead(413).end();
    chunks.push(c);
  }
  try {
    const out = await handler({
      requestContext: { http: { method: req.method, path: req.url } },
      headers: req.headers,
      body: Buffer.concat(chunks).toString(),
      isBase64Encoded: false,
    });
    res.writeHead(out.statusCode, out.headers).end(out.body);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'content-type': 'application/problem+json' }).end('{"title":"Internal error","status":500}');
  }
}).listen(port, () => console.log(`ingest listening on :${port}`));
