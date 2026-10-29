import { apiPost, apiUpload } from '@/lib/http';
import type { DocumentItem } from '@/types';

/** Keep in step with the server (src/api/demo-files.ts); the server checks again. */
export const MAX_UPLOAD_MB = 10;
export const ACCEPTED_EXTENSIONS = ['.docx', '.pptx', '.xlsx', '.boxnote', '.txt', '.md', '.csv', '.json', '.log'];

/** A friendly message if the file is obviously not acceptable, otherwise null. */
export function checkUpload(file: File): string | null {
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `That file is too large. The limit is ${MAX_UPLOAD_MB} MB.`;
  const lower = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return 'This type of file is not supported. Upload a Word, PowerPoint, Excel, Box Note or text file.';
  }
  return null;
}

export function uploadFile(file: File): Promise<DocumentItem> {
  return apiUpload<DocumentItem>(`/demo/files?name=${encodeURIComponent(file.name)}`, file);
}

export interface PermissionsInput {
  owner: string;
  collaborators: string[];
  doNotDelete: boolean;
}

export function setPermissions(id: string, input: PermissionsInput): Promise<DocumentItem> {
  return apiPost<DocumentItem>(`/demo/documents/${encodeURIComponent(id)}/permissions`, 20_000, input);
}

export function deleteFile(id: string): Promise<{ id: string; name: string }> {
  return apiPost<{ id: string; name: string }>(`/demo/documents/${encodeURIComponent(id)}/delete`, 20_000, {});
}
