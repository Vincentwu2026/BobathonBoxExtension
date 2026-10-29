import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search as SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DocumentPanel } from '@/components/DocumentPanel';
import { RetentionBadge } from '@/components/RetentionBadge';
import { Snippet } from '@/components/Snippet';
import { EmptyState, LoadingRows, PageHeader, QueryError, SourceNote } from '@/components/states';
import { searchDocuments } from '@/services/searchService';
import { useMode } from '@/state/ModeContext';
import { cn, formatDate } from '@/lib/utils';
import type { DocumentItem } from '@/types';

const SUGGESTIONS = ['revenue', 'ARR', 'mainframe', 'compliance', 'AI', 'customer escalation'];

export function SearchPage() {
  const { mode } = useMode();
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['search', mode, submitted],
    queryFn: () => searchDocuments(mode, submitted),
    enabled: submitted.length > 0,
  });

  const run = (term: string) => {
    const t = term.trim().slice(0, 200);
    if (!t) return;
    setInput(t);
    setSubmitted(t);
    setSelectedId(null);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(input);
  };

  const results = query.data?.data ?? [];
  const selected = results.find((d) => d.id === selectedId) ?? null;

  return (
    <div>
      <PageHeader
        title="Search enterprise knowledge"
        description="Full-text search over the indexed Box content, ranked by relevance (SQLite FTS5 / BM25)."
      />

      <form onSubmit={onSubmit} className="flex gap-2" role="search">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search documents, owners, collaborators…"
            aria-label="Search query"
            maxLength={200}
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={!input.trim()}>
          Search
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Try:</span>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => run(s)}
            className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section aria-live="polite">
          {!submitted && (
            <EmptyState title="Search to get started">
              Enterprise knowledge is hard to find and easy to lose. Try one of the suggested searches above.
            </EmptyState>
          )}
          {submitted && query.isLoading && <LoadingRows />}
          {query.isError && <QueryError error={query.error} />}
          {query.isSuccess && (
            <>
              <SourceNote source={query.data.source} />
              <p className="mb-2 text-sm text-muted-foreground">
                {results.length} result{results.length === 1 ? '' : 's'} for <strong className="text-foreground">“{submitted}”</strong>
              </p>
              {results.length === 0 ? (
                <EmptyState title="No documents matched">Try a different term, or one of the suggestions above.</EmptyState>
              ) : (
                <ResultsTable results={results} selectedId={selectedId} onSelect={setSelectedId} />
              )}
            </>
          )}
        </section>

        {selected && (
          <aside aria-label="Document details" className="2xl:sticky 2xl:top-24 2xl:self-start">
            <DocumentPanel doc={selected} onClose={() => setSelectedId(null)} searchQuery={submitted} />
          </aside>
        )}
      </div>
    </div>
  );
}

function ResultsTable({
  results,
  selectedId,
  onSelect,
}: {
  results: DocumentItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">File name</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Owner</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Department</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Modified</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Relevance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {results.map((doc) => (
              <tr
                key={doc.id}
                className={cn('align-top hover:bg-muted/60', selectedId === doc.id && 'bg-accent')}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelect(doc.id)}
                    aria-pressed={selectedId === doc.id}
                    className="text-left font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {doc.name}
                  </button>
                  <div className="mt-0.5 break-all text-xs text-muted-foreground">{doc.path}</div>
                  {doc.snippet && (
                    <p className="mt-1 text-xs leading-relaxed text-foreground/80">
                      <Snippet text={doc.snippet} />
                    </p>
                  )}
                  <div className="mt-1.5">
                    <RetentionBadge status={doc.retention.status} />
                  </div>
                </td>
                <td className="max-w-[9rem] px-3 py-3 text-xs">
                  <span className="block truncate" title={doc.owner}>
                    {doc.owner}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="info">{doc.department}</Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs">{formatDate(doc.modifiedAt)}</td>
                <td className="px-4 py-3">
                  <Relevance value={doc.relevance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Relevance({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2" title={`Relevance ${value}/100 (relative to the best match)`}>
      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-muted" role="presentation">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
      <span className="w-7 text-xs tabular-nums">{value}</span>
    </div>
  );
}
