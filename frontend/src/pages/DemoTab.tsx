import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, FileText, Presentation, Search as SearchIcon, Sparkles, StickyNote, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/card';
import { PreviewDialog } from '@/components/PreviewPanel';
import { RetentionBadge } from '@/components/RetentionBadge';
import { Snippet } from '@/components/Snippet';
import { EmptyState, LoadingRows, QueryError } from '@/components/states';
import { listDocuments, searchDocuments } from '@/services/searchService';
import { ACCEPTED_EXTENSIONS, checkUpload, uploadFile } from '@/services/fileService';
import { userMessage } from '@/services/errors';
import type { DocumentItem } from '@/types';

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase();
  const cls = 'h-5 w-5 shrink-0 text-muted-foreground';
  if (ext === 'xlsx') return <FileSpreadsheet className={cls} aria-hidden="true" />;
  if (ext === 'pptx') return <Presentation className={cls} aria-hidden="true" />;
  if (ext === 'boxnote' || ext === 'txt') return <StickyNote className={cls} aria-hidden="true" />;
  return <FileText className={cls} aria-hidden="true" />;
}

export function DemoTab() {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [open, setOpen] = useState<DocumentItem | null>(null);

  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: uploadFile,
    onSuccess: async (doc) => {
      setUploadError(null);
      await queryClient.invalidateQueries({ queryKey: ['files'] });
      setOpen(doc);
    },
    onError: (err) => setUploadError(userMessage(err)),
  });

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so picking the same file again still fires
    if (!file) return;
    const problem = checkUpload(file);
    if (problem) return setUploadError(problem);
    setUploadError(null);
    upload.mutate(file);
  };

  const query = useQuery({
    queryKey: ['files', submitted],
    queryFn: async () => (submitted ? await searchDocuments(submitted) : { results: await listDocuments(), source: 'all' as const }),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(input.trim().slice(0, 200));
  };
  const clear = () => {
    setInput('');
    setSubmitted('');
  };

  const files = query.data?.results ?? [];
  const bySearch = query.data?.source;

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        Sample documents with made-up data. Click a file to read it, change who has access, delete it, or ask Bob about it.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input ref={fileInput} type="file" accept={ACCEPTED_EXTENSIONS.join(',')} onChange={onPickFile} className="hidden" aria-label="Choose a file to upload" data-testid="upload-input" />
        <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          {upload.isPending ? 'Uploading…' : 'Upload a file'}
        </Button>
        <span className="text-xs text-muted-foreground">Word, PowerPoint, Excel, Box Note or text, up to 10 MB. Kept on this computer.</span>
      </div>
      {uploadError && (
        <p className="mt-2 text-sm text-destructive" role="alert" data-testid="upload-error">
          {uploadError}
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-4 flex gap-2" role="search">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Bob to find a file, e.g. deals at risk"
            aria-label="Search files"
            maxLength={200}
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={query.isFetching && submitted === input.trim()}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Search with Bob
        </Button>
        {submitted && (
          <Button type="button" variant="outline" onClick={clear}>
            <X className="h-4 w-4" aria-hidden="true" />
            Show all
          </Button>
        )}
      </form>

      <div className="mt-5" aria-live="polite">
        {query.isLoading && submitted && (
          <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Sparkles className="h-4 w-4 animate-pulse text-primary" aria-hidden="true" />
            Bob is reading the files…
          </p>
        )}
        {query.isLoading && <LoadingRows rows={submitted ? 3 : 8} />}
        {query.isError && <QueryError error={query.error} />}
        {query.isSuccess && files.length === 0 && (
          <EmptyState title={submitted ? 'No files matched' : 'No demo files found'}>
            {submitted ? 'Bob found nothing about that. Try different words, or show all files.' : 'Start the server from the project folder: npm run web-api'}
          </EmptyState>
        )}
        {query.isSuccess && files.length > 0 && (
          <>
            <p className="mb-2 text-sm text-muted-foreground">
              {submitted ? (
                <>
                  Bob found {files.length} file{files.length === 1 ? '' : 's'} for <strong className="text-foreground">“{submitted}”</strong>
                </>
              ) : (
                `${files.length} files`
              )}
            </p>
            {bySearch === 'keyword' && (
              <p className="mb-2 rounded-md bg-muted px-3 py-2 text-xs" role="status">
                Bob is not available right now, so this is a plain word search instead.
              </p>
            )}
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {files.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(doc)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <FileIcon name={doc.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-medium text-primary">{doc.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">Owner: {doc.owner}</span>
                      {doc.snippet && bySearch === 'keyword' && (
                        <span className="mt-1 block text-xs leading-relaxed text-foreground/80">
                          <Snippet text={doc.snippet} />
                        </span>
                      )}
                      {doc.snippet && bySearch === 'bob' && (
                        <span className="mt-1 flex items-start gap-1 text-xs leading-relaxed text-foreground/80" data-testid="bob-reason">
                          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                          {doc.snippet}
                        </span>
                      )}
                    </span>
                    <RetentionBadge status={doc.retention.status} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <PreviewDialog
        doc={open}
        searchQuery={submitted || undefined}
        onClose={() => setOpen(null)}
        onChanged={(doc) => {
          setOpen(doc);
          void queryClient.invalidateQueries({ queryKey: ['files'] });
        }}
        onDeleted={() => {
          setOpen(null);
          void queryClient.invalidateQueries({ queryKey: ['files'] });
        }}
      />
    </div>
  );
}
