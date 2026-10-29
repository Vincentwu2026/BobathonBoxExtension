import { apiGet } from '@/lib/http';
import type { PreviewResponse } from '@/types';

/** Loads the preview for one demo file. Fetched only when the pop-up opens, because it parses the file. */
export function getPreview(id: string): Promise<PreviewResponse> {
  return apiGet<PreviewResponse>(`/demo/documents/${encodeURIComponent(id)}/preview`, 45_000);
}
