/**
 * Session-scoped Box connection for the web UI.
 *
 * A developer token pasted into the website is held in process memory only:
 *  - never written to disk (credentials/ and .env are not touched),
 *  - never logged (error text is redacted before logging),
 *  - never returned to the browser (responses carry only a connected flag and display name).
 * Restarting the API forgets it. Disconnect drops it immediately.
 */

import { BoxClientManager, getBoxClient } from '../box-client.js';
import { ApiError } from './errors.js';
import { resetBoxProbeCache } from './status.js';

const VERIFY_TIMEOUT_MS = 8000;
// Box developer/access tokens are opaque URL-safe strings. Allowlist, not denylist.
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]{10,512}$/;

export interface ConnectionDTO {
  connected: boolean;
  /** Display name of the Box account the token belongs to. Never the token itself. */
  accountName: string | null;
}

let state: ConnectionDTO = { connected: false, accountName: null };

export function getConnection(): ConnectionDTO {
  return state;
}

export function validateToken(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError(400, 'BAD_REQUEST', 'A token is required.');
  const token = value.trim();
  if (!TOKEN_PATTERN.test(token)) {
    throw new ApiError(400, 'BAD_REQUEST', 'That does not look like a Box token (10-512 URL-safe characters).');
  }
  return token;
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

export async function connectWithToken(token: string): Promise<ConnectionDTO> {
  // The Box client is a cached singleton; drop it so the new token takes effect.
  BoxClientManager.resetInstance();
  try {
    const client = await getBoxClient({ directToken: token });
    const me = await withTimeout(client.users.getUserMe(), VERIFY_TIMEOUT_MS);
    state = { connected: true, accountName: me?.name ? String(me.name) : 'Box user' };
    resetBoxProbeCache();
    return state;
  } catch (err: any) {
    const safe = String(err?.message ?? 'unknown error').split(token).join('[redacted]');
    console.error(`[WebApi] Box token verification failed: ${safe}`);
    BoxClientManager.resetInstance();
    state = { connected: false, accountName: null };
    resetBoxProbeCache();
    throw new ApiError(
      401,
      'INVALID_TOKEN',
      'Box did not accept that token. Developer tokens expire after about 60 minutes; generate a fresh one and try again.'
    );
  }
}

export function disconnect(): ConnectionDTO {
  BoxClientManager.resetInstance();
  state = { connected: false, accountName: null };
  resetBoxProbeCache();
  return state;
}
