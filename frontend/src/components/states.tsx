import type { ReactNode } from 'react';
import { Info, TriangleAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/card';
import { LiveUnavailable } from '@/components/LiveUnavailable';
import { isLiveUnavailable, userMessage } from '@/services/errors';
import type { DataSource } from '@/types';

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

/** Standard rendering for a failed query: Live-unavailable gets the dedicated banner. */
export function QueryError({ error }: { error: unknown }) {
  if (isLiveUnavailable(error)) return <LiveUnavailable />;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{userMessage(error)}</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/** Tells the audience when Demo Mode is running from the bundled copy instead of the SQLite-backed API. */
export function SourceNote({ source }: { source: DataSource | undefined }) {
  if (source !== 'bundled') return null;
  return (
    <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
      <Info className="h-3.5 w-3.5" aria-hidden="true" />
      Backend API not running: using the seeded data bundled with the app. Start it with <code>npm run web-api</code> to query the
      real SQLite index.
    </p>
  );
}
