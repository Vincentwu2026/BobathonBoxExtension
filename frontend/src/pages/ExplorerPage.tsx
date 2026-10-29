import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Folder, FolderOpen, FileText, Plug, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DocumentPanel } from '@/components/DocumentPanel';
import { RetentionBadge } from '@/components/RetentionBadge';
import { EmptyState, LoadingRows, PageHeader, QueryError, SourceNote } from '@/components/states';
import { buildTree, countFiles, getDemoDocuments, getLiveFolder, type TreeNode } from '@/services/boxService';
import { useMode } from '@/state/ModeContext';
import { cn } from '@/lib/utils';
import type { DocumentItem, FolderView } from '@/types';

const SAMPLE_FOLDER_ID = '414969397645';
const FOLDER_ID_PATTERN = /^\d{1,20}$/;

export function ExplorerPage() {
  const { mode, setMode } = useMode();
  const [folderInput, setFolderInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const live = useMutation({ mutationFn: (id: string) => getLiveFolder(id) });
  const demo = useQuery({
    queryKey: ['demo-documents'],
    queryFn: getDemoDocuments,
    enabled: mode === 'demo' && demoLoaded,
  });

  const connect = (e: FormEvent) => {
    e.preventDefault();
    const id = folderInput.trim();
    if (!FOLDER_ID_PATTERN.test(id)) {
      setInputError('Folder ID must be numeric, e.g. ' + SAMPLE_FOLDER_ID);
      return;
    }
    setInputError(null);
    setSelectedId(null);
    live.mutate(id);
  };

  const loadDemo = () => {
    setSelectedId(null);
    setDemoLoaded(true);
    if (mode !== 'demo') setMode('demo');
  };

  return (
    <div>
      <PageHeader
        title="Folder Explorer"
        description="Browse a Box folder with its files, collaborators and retention state, or load the seeded demo folder."
      />

      <Card>
        <CardContent>
          <form onSubmit={connect} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="folder-id" className="mb-1 block text-sm font-medium">
                Box Folder ID
              </label>
              <Input
                id="folder-id"
                inputMode="numeric"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder={`e.g. ${SAMPLE_FOLDER_ID}`}
                aria-invalid={inputError ? true : undefined}
                aria-describedby={inputError ? 'folder-id-error' : undefined}
                maxLength={20}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={live.isPending || mode !== 'live'} title={mode !== 'live' ? 'Switch to LIVE BOX to connect' : undefined}>
                <Plug className="h-4 w-4" aria-hidden="true" />
                Connect Folder
              </Button>
              <Button type="button" variant="outline" onClick={loadDemo}>
                Load Demo Folder
              </Button>
            </div>
          </form>
          {inputError && (
            <p id="folder-id-error" role="alert" className="mt-2 text-sm text-destructive">
              {inputError}
            </p>
          )}
          {mode !== 'live' && (
            <p className="mt-2 text-xs text-muted-foreground">
              Connect Folder uses a real Box folder and requires LIVE BOX mode. Demo Mode needs no credentials.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="mt-6">
        {mode === 'live' ? (
          <LiveFolderView
            state={live}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ) : (
          <DemoFolderView
            loaded={demoLoaded}
            isLoading={demo.isLoading}
            error={demo.error}
            documents={demo.data?.data}
            source={demo.data?.source}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ live folder

function LiveFolderView({
  state,
  selectedId,
  onSelect,
}: {
  state: ReturnType<typeof useMutation<Awaited<ReturnType<typeof getLiveFolder>>, Error, string>>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (state.isPending) return <LoadingRows rows={5} />;
  if (state.isError) return <QueryError error={state.error} />;
  if (!state.data) {
    return (
      <EmptyState title="No folder connected">
        Enter a Box Folder ID and choose Connect Folder. If Box is unavailable you will be offered Demo Mode.
      </EmptyState>
    );
  }

  const folder: FolderView = state.data.data;
  const selected = folder.files.find((f) => f.id === selectedId) ?? null;
  const protectedCount = folder.files.filter((f) => f.retention.status !== 'unprotected').length;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" aria-hidden="true" />
              {folder.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{folder.path}</p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Files" value={folder.fileCount} />
            <Stat label="Subfolders" value={folder.subfolders.length} />
            <Stat label="Protected" value={protectedCount} />
            <Stat label="Folder collaborators" value={folder.folderCollaborators.length} />
          </CardContent>
        </Card>

        {folder.truncated && (
          <p className="text-xs text-muted-foreground">
            Showing retention for the first {folder.files.length} files only. Large folders are capped to keep the demo responsive.
          </p>
        )}

        {folder.subfolders.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Subfolders</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {folder.subfolders.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <Folder className="h-4 w-4 text-amber-500" aria-hidden="true" />
                    {s.name}
                    <span className="text-xs text-muted-foreground">({s.id})</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <FileList files={folder.files} selectedId={selectedId} onSelect={onSelect} />
      </div>

      {selected && (
        <aside aria-label="Document details" className="xl:sticky xl:top-24 xl:self-start">
          <DocumentPanel doc={selected} onClose={() => onSelect(null)} />
        </aside>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function FileList({
  files,
  selectedId,
  onSelect,
}: {
  files: DocumentItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (files.length === 0) return <EmptyState title="This folder has no files" />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Files</CardTitle>
      </CardHeader>
      <ul className="divide-y divide-border">
        {files.map((f) => (
          <FileRow key={f.id} file={f} selected={selectedId === f.id} onSelect={onSelect} />
        ))}
      </ul>
    </Card>
  );
}

function FileRow({ file, selected, onSelect }: { file: DocumentItem; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(file.id)}
        aria-pressed={selected}
        className={cn(
          'flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          selected && 'bg-accent'
        )}
      >
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 break-words font-medium">{file.name}</span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3" aria-hidden="true" />
          {file.collaborators.length}
        </span>
        <RetentionBadge status={file.retention.status} />
      </button>
    </li>
  );
}

// ------------------------------------------------------------------ demo folder (tree)

function DemoFolderView({
  loaded,
  isLoading,
  error,
  documents,
  source,
  selectedId,
  onSelect,
}: {
  loaded: boolean;
  isLoading: boolean;
  error: unknown;
  documents: DocumentItem[] | undefined;
  source: 'api' | 'bundled' | undefined;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (!loaded) {
    return <EmptyState title="Load the demo folder">Choose Load Demo Folder to explore the seeded enterprise content as a tree.</EmptyState>;
  }
  if (isLoading) return <LoadingRows rows={6} />;
  if (error) return <QueryError error={error} />;
  if (!documents) return null;

  const tree = buildTree(documents);
  const selected = documents.find((d) => d.id === selectedId) ?? null;
  const protectedCount = documents.filter((d) => d.retention.status !== 'unprotected').length;

  return (
    <div>
      <SourceNote source={source} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" aria-hidden="true" />
              Demo Enterprise Folder
              <Badge variant="neutral">{documents.length} files</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {protectedCount} protected · {documents.length - protectedCount} unprotected
            </p>
          </CardHeader>
          <CardContent>
            <ul role="tree" aria-label="Folder structure" className="text-sm">
              {tree.folders.map((f) => (
                <TreeFolder key={f.path} node={f} depth={0} selectedId={selectedId} onSelect={onSelect} />
              ))}
            </ul>
          </CardContent>
        </Card>

        {selected && (
          <aside aria-label="Document details" className="xl:sticky xl:top-24 xl:self-start">
            <DocumentPanel doc={selected} onClose={() => onSelect(null)} />
          </aside>
        )}
      </div>
    </div>
  );
}

function TreeFolder({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <li role="treeitem" aria-expanded={open} aria-selected={false}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ paddingLeft: `${depth * 16 + 6}px` }}
      >
        <Chevron className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {open ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        )}
        <span className="font-medium">{node.name.replace(/_/g, ' ')}</span>
        <span className="text-xs text-muted-foreground">({countFiles(node)})</span>
      </button>
      {open && (
        <ul role="group">
          {node.folders.map((f) => (
            <TreeFolder key={f.path} node={f} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
          ))}
          {node.files.map((file) => (
            <li key={file.id} role="treeitem" aria-selected={selectedId === file.id}>
              <button
                type="button"
                onClick={() => onSelect(file.id)}
                className={cn(
                  'flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded px-1.5 py-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selectedId === file.id && 'bg-accent'
                )}
                style={{ paddingLeft: `${(depth + 1) * 16 + 28}px` }}
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 break-words">{file.name}</span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" aria-hidden="true" />
                  {file.collaborators.length}
                </span>
                <RetentionBadge status={file.retention.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
