import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Search as SearchIcon, ShieldAlert, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/card';
import { RetentionBadge } from '@/components/RetentionBadge';
import { EmptyState, LoadingRows, PageHeader, QueryError, SourceNote } from '@/components/states';
import { attemptDelete } from '@/services/retentionService';
import { getDemoDocuments } from '@/services/boxService';
import { searchDocuments } from '@/services/searchService';
import { useMode } from '@/state/ModeContext';
import { cn } from '@/lib/utils';
import type { DeleteAttempt, DocumentItem } from '@/types';

export function RetentionPage() {
  const { mode } = useMode();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<DeleteAttempt | null>(null);

  // Demo Mode lists every seeded file. Live Mode lists files matching a Box search.
  const files = useQuery({
    queryKey: ['retention-files', mode, submitted],
    queryFn: async () => (mode === 'demo' ? getDemoDocuments() : searchDocuments('live', submitted)),
    enabled: mode === 'demo' || submitted.length > 0,
  });

  const attempt = useMutation({
    mutationFn: (id: string) => attemptDelete(mode, id),
    onSuccess: (res) => {
      setOutcome(res.data);
      // The attempt was recorded in the audit log, so any cached audit view is stale.
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });

  const list = (files.data?.data ?? []).filter((d) =>
    mode === 'demo' && filter ? d.name.toLowerCase().includes(filter.toLowerCase()) : true
  );
  const selected = list.find((d) => d.id === selectedId) ?? null;

  const select = (id: string) => {
    setSelectedId(id);
    setOutcome(null);
    attempt.reset();
  };

  return (
    <div>
      <PageHeader
        title="Retention Center"
        description="Select a file to see whether it is protected, why, and what happens if someone tries to delete it."
      />

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mode === 'demo' ? (
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by file name…"
                aria-label="Filter files"
                maxLength={100}
              />
            ) : (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmitted(filter.trim().slice(0, 200));
                }}
              >
                <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search Box files…" aria-label="Search Box files" maxLength={200} />
                <Button type="submit" size="icon" aria-label="Search" disabled={!filter.trim()}>
                  <SearchIcon className="h-4 w-4" aria-hidden="true" />
                </Button>
              </form>
            )}

            {files.isLoading && <LoadingRows rows={5} />}
            {files.isError && <QueryError error={files.error} />}
            {files.isSuccess && <SourceNote source={files.data.source} />}
            {mode === 'live' && !submitted && <p className="text-sm text-muted-foreground">Search for a file in Box to evaluate its retention.</p>}

            <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto rounded-md border border-border empty:hidden">
              {list.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => select(d.id)}
                    aria-pressed={selectedId === d.id}
                    className={cn(
                      'flex w-full flex-col gap-1 px-3 py-2 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      selectedId === d.id && 'bg-accent'
                    )}
                  >
                    <span className="break-words font-medium">{d.name}</span>
                    <RetentionBadge status={d.retention.status} />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div>
          {!selected ? (
            <EmptyState title="Select a file">Choose a file on the left to inspect its retention state.</EmptyState>
          ) : (
            <RetentionDetail
              doc={outcome?.document ?? selected}
              outcome={outcome}
              pending={attempt.isPending}
              error={attempt.error}
              onAttempt={() => attempt.mutate(selected.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function RetentionDetail({
  doc,
  outcome,
  pending,
  error,
  onAttempt,
}: {
  doc: DocumentItem;
  outcome: DeleteAttempt | null;
  pending: boolean;
  error: unknown;
  onAttempt: () => void;
}) {
  const r = doc.retention;
  const isProtected = r.status !== 'unprotected';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="break-words">{doc.name}</CardTitle>
        <p className="text-xs text-muted-foreground">{doc.path}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Protected</div>
            <div className={cn('mt-1 text-2xl font-bold', isProtected ? 'text-destructive' : 'text-success')}>
              {r.status === 'unknown' ? 'UNVERIFIED' : isProtected ? 'TRUE' : 'FALSE'}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Collaborators</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{r.collaboratorCount}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">do_not_delete</div>
            <div className="mt-1 text-2xl font-bold">{r.hasDoNotDeleteFlag ? 'Yes' : 'No'}</div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reason</h3>
          {r.reasons.length === 0 ? (
            <p className="mt-1 text-sm">None. No active collaborators and no do_not_delete tag.</p>
          ) : (
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {r.reasons.map((reason) => (
                <li key={reason.code}>
                  <strong>{reasonTitle(reason.code)}:</strong> {reason.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <Button variant="destructive" onClick={onAttempt} disabled={pending}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {pending ? 'Checking…' : 'Attempt Delete'}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            This is a safe simulation: the retention rules are evaluated and the decision is audited, but nothing is ever deleted.
          </p>

          <div aria-live="assertive" className="mt-4">
            {error ? <QueryError error={error} /> : null}
            {outcome && <OutcomeBanner outcome={outcome} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function reasonTitle(code: string): string {
  if (code === 'ACTIVE_COLLABORATORS') return 'Active collaborators';
  if (code === 'DO_NOT_DELETE') return 'do_not_delete tag';
  return 'Unverified';
}

function OutcomeBanner({ outcome }: { outcome: DeleteAttempt }) {
  const r = outcome.document.retention;
  if (outcome.outcome === 'blocked') {
    const reason =
      r.reasons.find((x) => x.code === 'ACTIVE_COLLABORATORS') ? 'Active collaborators detected' : r.reasons[0] ? reasonTitle(r.reasons[0].code) : 'Protected';
    return (
      <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">Deletion Blocked</p>
          <p className="text-sm">
            <span className="font-medium">Reason:</span> {reason}
          </p>
          <p className="mt-1 text-sm">{r.explanation}</p>
          <p className="mt-1 text-xs text-red-800">Recorded in the audit log.</p>
        </div>
      </div>
    );
  }
  return (
    <div role="status" className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
      <CircleCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">Deletion Allowed</p>
        <p className="text-sm">{r.explanation}</p>
        <p className="mt-1 text-xs text-emerald-800">Simulation only: the file was not deleted. Recorded in the audit log.</p>
      </div>
    </div>
  );
}
