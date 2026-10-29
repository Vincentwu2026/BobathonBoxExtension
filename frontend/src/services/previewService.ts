import { apiGet } from '@/lib/http';
import { ApiUnreachableError } from '@/services/errors';
import { liveCall, type Result } from '@/services/shared';
import type { Mode, PreviewResponse } from '@/types';

/**
 * Loads the preview for one file. Previews are fetched only when the user asks for one, because
 * they download and parse the file. There is no bundled fallback: with no backend running, Demo
 * Mode says so instead of pretending.
 */
export async function getPreview(mode: Mode, id: string): Promise<Result<PreviewResponse>> {
  const path = `/${mode}/documents/${encodeURIComponent(id)}/preview`;
  if (mode === 'live') return liveCall(() => apiGet<PreviewResponse>(path, 45_000));
  try {
    return { data: await apiGet<PreviewResponse>(path, 45_000), source: 'api' };
  } catch (e) {
    if (e instanceof ApiUnreachableError) {
      return {
        data: {
          documentId: id,
          fileName: '',
          preview: { kind: 'unavailable', reason: 'Previews need the backend API. Start it with: npm run web-api' },
        },
        source: 'bundled',
      };
    }
    throw e;
  }
}
