import { apiGet } from '@/lib/http';
import { demoCall, liveCall, type Result } from '@/services/shared';
import { offlineDocuments } from '@/services/offlineDemo';
import type { DocumentItem, FolderView } from '@/types';

/** Live Mode: a real Box folder, evaluated server-side through the Box integration layer. */
export function getLiveFolder(folderId: string): Promise<Result<FolderView>> {
  return liveCall(() => apiGet<FolderView>(`/live/folders/${encodeURIComponent(folderId)}`, 60_000));
}

/** Demo Mode: the seeded documents. */
export function getDemoDocuments(): Promise<Result<DocumentItem[]>> {
  return demoCall(
    async () => (await apiGet<{ documents: DocumentItem[] }>('/demo/documents')).documents,
    () => offlineDocuments()
  );
}

/** Groups seeded documents into a folder tree by their path (used for the demo Folder Explorer). */
export interface TreeNode {
  name: string;
  path: string;
  folders: TreeNode[];
  files: DocumentItem[];
}

export function buildTree(documents: DocumentItem[]): TreeNode {
  const root: TreeNode = { name: 'All Files', path: '/', folders: [], files: [] };
  for (const doc of documents) {
    const segments = doc.path.split('/').filter(Boolean);
    segments.pop(); // file name
    let node = root;
    let acc = '';
    for (const seg of segments) {
      acc += `/${seg}`;
      let child = node.folders.find((f) => f.name === seg);
      if (!child) {
        child = { name: seg, path: acc, folders: [], files: [] };
        node.folders.push(child);
      }
      node = child;
    }
    node.files.push(doc);
  }
  const sort = (n: TreeNode): void => {
    n.folders.sort((a, b) => a.name.localeCompare(b.name));
    n.files.sort((a, b) => a.name.localeCompare(b.name));
    n.folders.forEach(sort);
  };
  sort(root);
  return root;
}

export function countFiles(node: TreeNode): number {
  return node.files.length + node.folders.reduce((n, f) => n + countFiles(f), 0);
}
