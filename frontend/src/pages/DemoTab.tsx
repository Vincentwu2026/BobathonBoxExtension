import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileText, Presentation, Search as SearchIcon, StickyNote, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/card';
import { PreviewDialog } from '@/components/PreviewPanel';
import { RetentionBadge } from '@/components/RetentionBadge';
import { Snippet } from '@/components/Snippet';
import { EmptyState, LoadingRows, QueryError } from '@/components/states';
import { listDocuments, searchDocuments } from '@/services/searchService';
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

  const query = useQuery({
    queryKey: ['files', submitted],
    queryFn: () => (submitted ? searchDocuments(submitted) : listDocuments()),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(input.trim().slice(0, 200));
  };
  const clear = () => {
    setInput('');
    setSubmitted('');
  };

  const files = query.data ?? [];

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        Sample documents with made-up data. Click a file to read it, check if it can be deleted, or ask Bob about it.
      </p>

      <form onSubmit={onSubmit} className="mt-4 flex gap-2" role="search">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search inside the files, e.g. renewal"
            aria-label="Search files"
            maxLength={200}
            className="pl-9"
          />
        </div>
        <Button type="submit">Search</Button>
        {submitted && (
          <Button type="button" variant="outline" onClick={clear}>
            <X className="h-4 w-4" aria-hidden="true" />
            Show all
          </Button>
        )}
      </form>

      <div className="mt-5" aria-live="polite">
        {query.isLoading && <LoadingRows rows={8} />}
        {query.isError && <QueryError error={query.error} />}
        {query.isSuccess && files.length === 0 && (
          <EmptyState title={submitted ? 'No files matched' : 'No demo files found'}>
            {submitted ? 'Try a different word, or show all files.' : 'Start the server from the project folder: npm run web-api'}
          </EmptyState>
        )}
        {query.isSuccess && files.length > 0 && (
          <>
            <p className="mb-2 text-sm text-muted-foreground">
              {submitted ? (
                <>
                  {files.length} file{files.length === 1 ? '' : 's'} match <strong className="text-foreground">“{submitted}”</strong>
                </>
              ) : (
                `${files.length} files`
              )}
            </p>
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
                      {doc.snippet && (
                        <span className="mt-1 block text-xs leading-relaxed text-foreground/80">
                          <Snippet text={doc.snippet} />
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

      <PreviewDialog doc={open} searchQuery={submitted || undefined} onClose={() => setOpen(null)} />
    </div>
  );
}
