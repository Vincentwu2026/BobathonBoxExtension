/**
 * System status probes for the web UI.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getBoxClient } from '../box-client.js';
import { getDatabase, getDatabasePath } from '../indexer/schema.js';
import { RetentionLogger } from '../retention/logger.js';
import { createServer } from '../server.js';
import { DEMO_ID_PREFIX } from './demo.js';
import type { ComponentStatusDTO, SystemStatusDTO } from './dto.js';

const BOX_PROBE_TIMEOUT_MS = 5000;
const BOX_PROBE_TTL_MS = 15_000;

let cachedBox: { at: number; value: ComponentStatusDTO } | null = null;

/** Forget the cached Box probe (called when the session connection changes). */
export function resetBoxProbeCache(): void {
  cachedBox = null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

async function probeBox(): Promise<ComponentStatusDTO> {
  if (cachedBox && Date.now() - cachedBox.at < BOX_PROBE_TTL_MS) return cachedBox.value;

  let value: ComponentStatusDTO;
  try {
    const client = await getBoxClient();
    await withTimeout(client.users.getUserMe(), BOX_PROBE_TIMEOUT_MS);
    value = { key: 'box', label: 'Box Authentication', state: 'ok', headline: 'Box connected' };
  } catch (err: any) {
    const msg = String(err?.message ?? '');
    console.error(`[WebApi] Box status probe failed: ${msg}`);
    const missing = /Missing Box JWT Credentials/i.test(msg);
    value = {
      key: 'box',
      label: 'Box Authentication',
      state: 'warn',
      headline: 'Box authentication pending',
      detail: missing
        ? 'No Box credentials are configured. Demo Mode works without them.'
        : 'Box rejected or could not be reached with the configured credentials (for example an expired developer token). Restart the API after refreshing credentials.',
    };
  }

  cachedBox = { at: Date.now(), value };
  return value;
}

function mcpStatus(): ComponentStatusDTO {
  try {
    const server = createServer() as unknown as { _registeredTools?: Record<string, unknown> };
    const count = Object.keys(server._registeredTools ?? {}).length;
    return {
      key: 'mcp',
      label: 'MCP Server',
      state: count > 0 ? 'ok' : 'warn',
      headline: count > 0 ? `${count} MCP tools registered` : 'No MCP tools registered',
      detail: 'Verified by instantiating the server definition. The stdio server itself runs under Bob.',
    };
  } catch (err: any) {
    console.error(`[WebApi] MCP status failed: ${err?.message ?? err}`);
    return { key: 'mcp', label: 'MCP Server', state: 'error', headline: 'MCP server definition failed to load' };
  }
}

function indexStatus(): ComponentStatusDTO[] {
  try {
    const db = getDatabase();
    const total = (db.prepare('SELECT COUNT(*) AS c FROM files').get() as unknown as { c: number }).c;
    const demo = (db.prepare('SELECT COUNT(*) AS c FROM files WHERE box_id LIKE ?').get(`${DEMO_ID_PREFIX}%`) as unknown as { c: number }).c;
    const dbPath = getDatabasePath();
    const sizeKb = Math.round(fs.statSync(dbPath).size / 1024);

    return [
      {
        key: 'index',
        label: 'Search Index',
        state: total > 0 ? 'ok' : 'warn',
        headline: total > 0 ? 'Search index online' : 'Search index is empty',
        detail: `${total} documents indexed (${demo} seeded demo documents). Run "npm run seed-demo" to load demo data.`,
      },
      {
        key: 'database',
        label: 'Database',
        state: 'ok',
        headline: 'SQLite database online',
        detail: `${path.basename(dbPath)} (${sizeKb} KB), FTS5 enabled`,
      },
    ];
  } catch (err: any) {
    console.error(`[WebApi] Index status failed: ${err?.message ?? err}`);
    return [
      { key: 'index', label: 'Search Index', state: 'error', headline: 'Search index unavailable' },
      { key: 'database', label: 'Database', state: 'error', headline: 'SQLite database unavailable' },
    ];
  }
}

function retentionStatus(): ComponentStatusDTO {
  try {
    const logPath = RetentionLogger.getLogPath();
    const dir = path.dirname(logPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    const entries = RetentionLogger.readLogs(10_000).length;
    return {
      key: 'retention',
      label: 'Retention Engine',
      state: 'ok',
      headline: 'Retention engine active',
      detail: `Audit log writable, ${entries} entries recorded`,
    };
  } catch (err: any) {
    console.error(`[WebApi] Retention status failed: ${err?.message ?? err}`);
    return { key: 'retention', label: 'Retention Engine', state: 'error', headline: 'Audit log is not writable' };
  }
}

export async function getSystemStatus(): Promise<SystemStatusDTO> {
  const box = await probeBox();
  return {
    checkedAt: new Date().toISOString(),
    components: [mcpStatus(), box, ...indexStatus(), retentionStatus()],
  };
}
