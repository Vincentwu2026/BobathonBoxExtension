import { apiGet, apiPost } from '@/lib/http';

export interface Connection {
  connected: boolean;
  accountName: string | null;
}

export function getConnection(): Promise<Connection> {
  return apiGet<Connection>('/live/connection');
}

/** The token travels only in the POST body to the local API and is never stored by the browser. */
export function connectBox(token: string): Promise<Connection> {
  return apiPost<Connection>('/live/connect', 30_000, { token });
}

export function disconnectBox(): Promise<Connection> {
  return apiPost<Connection>('/live/disconnect');
}
