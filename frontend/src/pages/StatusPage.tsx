import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleX, TriangleAlert, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingRows, PageHeader, QueryError } from '@/components/states';
import { getSystemStatus } from '@/services/auditService';
import { formatDateTime } from '@/lib/utils';
import type { ComponentState } from '@/types';

const ICONS: Record<ComponentState, { Icon: typeof CircleCheck; className: string; label: string }> = {
  ok: { Icon: CircleCheck, className: 'text-success', label: 'Operational' },
  warn: { Icon: TriangleAlert, className: 'text-warning', label: 'Attention' },
  error: { Icon: CircleX, className: 'text-destructive', label: 'Unavailable' },
};

export function StatusPage() {
  const status = useQuery({
    queryKey: ['status'],
    queryFn: getSystemStatus,
    refetchInterval: 30_000,
  });

  return (
    <div>
      <PageHeader title="System Status" description="Health of each component behind the suite, checked live." />

      <div className="mb-4 flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => void status.refetch()} disabled={status.isFetching}>
          <RefreshCw className={status.isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} aria-hidden="true" />
          Refresh
        </Button>
        {status.data && <span className="text-xs text-muted-foreground">Checked {formatDateTime(status.data.checkedAt)}</span>}
      </div>

      {status.isLoading && <LoadingRows rows={5} />}
      {status.isError && <QueryError error={status.error} />}

      {status.isSuccess && (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Component status">
          {status.data.components.map((c) => {
            const { Icon, className, label } = ICONS[c.state];
            return (
              <li key={c.key}>
                <Card>
                  <CardContent className="flex items-start gap-3">
                    <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${className}`} aria-label={label} role="img" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
                      <p className="font-semibold">{c.headline}</p>
                      {c.detail && <p className="mt-0.5 text-sm text-muted-foreground">{c.detail}</p>}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
