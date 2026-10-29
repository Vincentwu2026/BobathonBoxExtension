import { apiGet } from '@/lib/http';
import { demoCall, liveCall, type Result } from '@/services/shared';
import { offlineAudit } from '@/services/offlineDemo';
import { ApiUnreachableError } from '@/services/errors';
import type { AuditEntry, Mode, SystemStatus } from '@/types';

export function getAuditLog(mode: Mode, limit = 200): Promise<Result<AuditEntry[]>> {
  const path = `/${mode}/audit?limit=${limit}`;
  const pick = (r: { entries: AuditEntry[] }): AuditEntry[] => r.entries;

  if (mode === 'live') {
    return liveCall(async () => pick(await apiGet<{ entries: AuditEntry[] }>(path)));
  }
  return demoCall(
    async () => pick(await apiGet<{ entries: AuditEntry[] }>(path)),
    () => offlineAudit(limit)
  );
}

/**
 * System status. If the API itself is down, the page still renders: every backend-dependent
 * component is reported as unreachable instead of throwing.
 */
export async function getSystemStatus(): Promise<SystemStatus> {
  try {
    return await apiGet<SystemStatus>('/status', 15_000);
  } catch (e) {
    if (!(e instanceof ApiUnreachableError)) throw e;
    return {
      checkedAt: new Date().toISOString(),
      components: [
        {
          key: 'api',
          label: 'Backend API',
          state: 'error',
          headline: 'Backend API not reachable',
          detail: 'Start it with "npm run web-api" in the repo root. Demo Mode still works from bundled seeded data.',
        },
      ],
    };
  }
}
