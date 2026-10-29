import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, LoadingRows, PageHeader, QueryError, SourceNote } from '@/components/states';
import { getAuditLog } from '@/services/auditService';
import { useMode } from '@/state/ModeContext';
import { cn, formatDateTime } from '@/lib/utils';
import type { AuditEntry, AuditFilter } from '@/types';

const FILTERS: Array<{ value: AuditFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'allowed', label: 'Allowed' },
];

export function AuditPage() {
  const { mode } = useMode();
  const [filter, setFilter] = useState<AuditFilter>('all');

  const audit = useQuery({
    queryKey: ['audit', mode],
    queryFn: () => getAuditLog(mode),
  });

  const entries = useMemo(() => audit.data?.data ?? [], [audit.data]);
  const visible = filter === 'all' ? entries : entries.filter((e) => e.result === filter);

  const counts = useMemo(() => countByResult(entries), [entries]);

  return (
    <div>
      <PageHeader title="Audit Logs" description="Every retention decision, recorded. Nothing is deleted without a trail." />

      {audit.isLoading && <LoadingRows rows={5} />}
      {audit.isError && <QueryError error={audit.error} />}

      {audit.isSuccess && (
        <>
          <SourceNote source={audit.data.source} />

          <div className="mb-6 grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Decisions</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={counts} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                      <Tooltip cursor={{ fill: 'rgba(148,163,184,0.15)' }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {counts.map((c) => (
                          <Cell key={c.name} fill={c.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex h-full flex-col justify-center gap-1">
                <p className="text-sm text-muted-foreground">Accidental knowledge loss prevented</p>
                <p className="text-4xl font-bold tabular-nums text-destructive">{counts[0].count}</p>
                <p className="text-sm text-muted-foreground">
                  deletion attempts blocked out of {entries.length} audited events.
                </p>
              </CardContent>
            </Card>
          </div>

          <div role="group" aria-label="Filter audit log" className="mb-3 inline-flex rounded-lg border border-border bg-muted p-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  filter === f.value ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState title="No audit entries">
              {mode === 'live' ? 'Live attempts and checks will appear here once they are made.' : 'Nothing matches this filter.'}
            </EmptyState>
          ) : (
            <AuditTable entries={visible} />
          )}
        </>
      )}
    </div>
  );
}

function countByResult(entries: AuditEntry[]) {
  const n = (r: AuditEntry['result']) => entries.filter((e) => e.result === r).length;
  return [
    { name: 'Blocked', count: n('blocked'), color: '#dc2626' },
    { name: 'Allowed', count: n('allowed'), color: '#059669' },
    { name: 'Checks', count: n('info'), color: '#6366f1' },
  ];
}

function AuditTable({ entries }: { entries: AuditEntry[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Timestamp</th>
              <th scope="col" className="px-4 py-2.5 font-medium">File name</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Action</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Result</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-xs">{formatDateTime(e.timestamp)}</td>
                <td className="px-4 py-3 font-medium">{e.fileName}</td>
                <td className="px-4 py-3 text-xs">{e.action}</td>
                <td className="px-4 py-3">
                  <ResultBadge result={e.result} />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ResultBadge({ result }: { result: AuditEntry['result'] }) {
  if (result === 'blocked') return <Badge variant="danger">Blocked</Badge>;
  if (result === 'allowed') return <Badge variant="success">Allowed</Badge>;
  return <Badge variant="info">Check</Badge>;
}
