#!/usr/bin/env node
/**
 * Web UI API for the Box Productivity Suite frontend.
 *
 * Security posture:
 *  - Binds to 127.0.0.1 only (never 0.0.0.0).
 *  - No CORS headers: the Vite dev server proxies /api, so the browser sees one origin.
 *  - Host header allowlist (DNS-rebinding defence) and Origin check on POST.
 *  - POST requires a custom header, forcing a CORS preflight that this server never grants.
 *  - Strict input validation; errors are generic, details are logged server-side only.
 *  - The UI can never delete from Box: delete attempts are dry runs.
 */

import http from 'node:http';
import { URL } from 'node:url';
import { closeDatabase, getDatabase } from '../indexer/schema.js';
import { ApiError, classifyBoxError } from './errors.js';
import { listDemoDocuments, searchDemoDocuments, DEMO_ID_PREFIX } from './demo.js';
import { getLiveDocument, getLiveFolder, liveDeleteAttempt, searchLive, assertBoxId } from './live.js';
import { logDemoDeleteAttempt, readDemoAudit, readLiveAudit, ensureDemoAuditSeed } from './audit.js';
import { getSystemStatus } from './status.js';
import type { DeleteAttemptDTO, DocumentDTO } from './dto.js';
import { evaluateDemoRetention } from '../demo/demo-retention.js';
import { connectWithToken, disconnect, getConnection, validateToken } from './connection.js';

const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.WEB_API_PORT || '8799', 10);
const ORIGIN_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const HOST_PATTERN = /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const CLIENT_HEADER = 'x-bps-client';

type Mode = 'demo' | 'live';

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(payload);
}

function sendError(res: http.ServerResponse, err: unknown): void {
  if (err instanceof ApiError) {
    send(res, err.status, { error: { code: err.code, message: err.message } });
    return;
  }
  console.error('[WebApi] Unhandled error:', err);
  send(res, 500, { error: { code: 'INTERNAL', message: 'Unexpected server error.' } });
}

function parseMode(raw: string | undefined): Mode {
  if (raw === 'demo' || raw === 'live') return raw;
  throw new ApiError(404, 'NOT_FOUND', 'Unknown route.');
}

function parseLimit(url: URL, def: number, max: number): number {
  const raw = url.searchParams.get('limit');
  if (raw === null) return def;
  if (!/^\d{1,4}$/.test(raw)) throw new ApiError(400, 'BAD_REQUEST', 'limit must be a positive integer.');
  const n = Number.parseInt(raw, 10);
  if (n < 1 || n > max) throw new ApiError(400, 'BAD_REQUEST', `limit must be between 1 and ${max}.`);
  return n;
}

function parseDemoId(raw: string): string {
  if (!/^[0-9]{1,20}$/.test(raw)) throw new ApiError(400, 'BAD_REQUEST', 'File ID must be numeric.');
  if (!raw.startsWith(DEMO_ID_PREFIX)) throw new ApiError(404, 'NOT_FOUND', 'File not found in the demo dataset.');
  return raw;
}

function demoDocument(id: string): DocumentDTO {
  const doc = listDemoDocuments().find((d) => d.id === id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'File not found in the demo dataset.');
  return doc;
}

const MAX_BODY_BYTES = 4096;

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  if (!/^application\/json(;|$)/i.test(req.headers['content-type'] ?? '')) {
    throw new ApiError(415, 'BAD_REQUEST', 'Content-Type must be application/json.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new ApiError(413, 'BAD_REQUEST', 'Request body too large.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch {
    throw new ApiError(400, 'BAD_REQUEST', 'Request body must be valid JSON.');
  }
}

async function route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const host = req.headers.host ?? '';
  if (!HOST_PATTERN.test(host)) throw new ApiError(403, 'FORBIDDEN', 'Host not allowed.');

  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');

  if (method === 'POST') {
    const origin = req.headers.origin;
    if (origin && !ORIGIN_PATTERN.test(origin)) throw new ApiError(403, 'FORBIDDEN', 'Origin not allowed.');
    if (req.headers[CLIENT_HEADER] !== 'web') throw new ApiError(403, 'FORBIDDEN', 'Missing client header.');
  }

  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  const parts = url.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p));

  if (parts[0] !== 'api') throw new ApiError(404, 'NOT_FOUND', 'Unknown route.');

  // GET /api/health
  if (method === 'GET' && parts.length === 2 && parts[1] === 'health') {
    return send(res, 200, { ok: true });
  }

  // GET /api/status
  if (method === 'GET' && parts.length === 2 && parts[1] === 'status') {
    return send(res, 200, await getSystemStatus());
  }

  const mode = parseMode(parts[1]);
  const resource = parts[2];

  // GET /api/live/connection  |  POST /api/live/connect  |  POST /api/live/disconnect
  if (mode === 'live' && method === 'GET' && resource === 'connection' && parts.length === 3) {
    return send(res, 200, getConnection());
  }
  if (mode === 'live' && method === 'POST' && resource === 'connect' && parts.length === 3) {
    const body = (await readJsonBody(req)) as { token?: unknown } | null;
    const token = validateToken(body && typeof body === 'object' ? body.token : undefined);
    return send(res, 200, await connectWithToken(token));
  }
  if (mode === 'live' && method === 'POST' && resource === 'disconnect' && parts.length === 3) {
    return send(res, 200, disconnect());
  }

  // GET /api/:mode/search?q=
  if (method === 'GET' && resource === 'search' && parts.length === 3) {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (q.length === 0 || q.length > 200) throw new ApiError(400, 'BAD_REQUEST', 'q must be 1-200 characters.');
    const limit = parseLimit(url, 20, 50);
    const results = mode === 'demo' ? searchDemoDocuments(q, limit) : await searchLive(q, limit);
    return send(res, 200, { query: q, results });
  }

  // GET /api/demo/documents
  if (method === 'GET' && mode === 'demo' && resource === 'documents' && parts.length === 3) {
    return send(res, 200, { documents: listDemoDocuments() });
  }

  // GET /api/:mode/documents/:id
  if (method === 'GET' && resource === 'documents' && parts.length === 4) {
    const doc = mode === 'demo' ? demoDocument(parseDemoId(parts[3])) : await getLiveDocument(parts[3]);
    return send(res, 200, doc);
  }

  // POST /api/:mode/documents/:id/delete-attempt
  if (method === 'POST' && resource === 'documents' && parts.length === 5 && parts[4] === 'delete-attempt') {
    if (mode === 'live') {
      const result: DeleteAttemptDTO = await liveDeleteAttempt(parts[3]);
      return send(res, 200, result);
    }
    const id = parseDemoId(parts[3]);
    const document = demoDocument(id);
    const blocked = document.retention.status !== 'unprotected';
    const explanation = evaluateDemoRetention(id)?.explanation ?? document.retention.explanation;
    logDemoDeleteAttempt(document.id, document.name, blocked, explanation);
    const result: DeleteAttemptDTO = { outcome: blocked ? 'blocked' : 'allowed', dryRun: true, document };
    return send(res, 200, result);
  }

  // GET /api/live/folders/:id
  if (method === 'GET' && mode === 'live' && resource === 'folders' && parts.length === 4) {
    assertBoxId(parts[3], 'Folder ID');
    return send(res, 200, await getLiveFolder(parts[3]));
  }

  // GET /api/:mode/audit
  if (method === 'GET' && resource === 'audit' && parts.length === 3) {
    const limit = parseLimit(url, 100, 500);
    return send(res, 200, { entries: mode === 'demo' ? readDemoAudit(limit) : readLiveAudit(limit) });
  }

  throw new ApiError(404, 'NOT_FOUND', 'Unknown route.');
}

function main(): void {
  // Fail fast if the database cannot be opened, and make sure the demo audit trail exists.
  getDatabase();
  ensureDemoAuditSeed();

  const server = http.createServer((req, res) => {
    route(req, res).catch((err) => {
      if (res.headersSent) return;
      sendError(res, err instanceof ApiError ? err : err && typeof err === 'object' ? classifyOrPass(err) : err);
    });
  });

  server.requestTimeout = 60_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;

  server.listen(PORT, HOST, () => {
    console.error(`[WebApi] Listening on http://${HOST}:${PORT}`);
  });

  const shutdown = () => {
    server.close(() => {
      closeDatabase();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/** Non-ApiError exceptions from Box calls become generic ApiErrors; anything else is logged as INTERNAL. */
function classifyOrPass(err: object): unknown {
  return 'statusCode' in err || 'responseInfo' in err ? classifyBoxError(err) : err;
}

main();
