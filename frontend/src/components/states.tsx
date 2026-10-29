import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/card';
import { userMessage } from '@/services/errors';

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

/** Standard rendering for a failed query. */
export function QueryError({ error }: { error: unknown }) {
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
