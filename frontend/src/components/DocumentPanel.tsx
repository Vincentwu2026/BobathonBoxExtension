import type { ReactNode } from 'react';
import { ExternalLink, User, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PreviewPanel } from '@/components/PreviewPanel';
import { RetentionBadge } from '@/components/RetentionBadge';
import { Snippet } from '@/components/Snippet';
import { formatDate, safeBoxUrl } from '@/lib/utils';
import type { DocumentItem } from '@/types';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{children}</dd>
    </div>
  );
}

interface Props {
  doc: DocumentItem;
  onClose?: () => void;
  /** Hide the content preview, e.g. when it duplicates a surrounding view. */
  compact?: boolean;
}

export function DocumentPanel({ doc, onClose, compact = false }: Props) {
  const boxUrl = safeBoxUrl(doc.url);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="break-words">{doc.name}</CardTitle>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <RetentionBadge status={doc.retention.status} />
            <span className="text-xs text-muted-foreground">{doc.department}</span>
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close details">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Owner">
            <span className="flex items-start gap-1.5">
              <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 break-all">{doc.owner}</span>
            </span>
          </Field>
          <Field label="Modified">{formatDate(doc.modifiedAt)}</Field>
          <div className="sm:col-span-2">
            <Field label="Path">
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{doc.path || '—'}</code>
            </Field>
          </div>
        </dl>

        {!compact && doc.preview && (
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Content preview</h3>
            <p className="mt-1 text-sm leading-relaxed">{doc.snippet ? <Snippet text={doc.snippet} /> : doc.preview}</p>
          </div>
        )}

        <PreviewPanel docId={doc.id} />

        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Collaborators ({doc.collaborators.length})
          </h3>
          {doc.collaborators.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">No active collaborators.</p>
          ) : (
            <ul className="mt-1 divide-y divide-border rounded-md border border-border">
              {doc.collaborators.map((c) => (
                <li key={c.email} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate">{c.name ? `${c.name} · ${c.email}` : c.email}</span>
                  {c.role && <span className="shrink-0 text-xs text-muted-foreground">{c.role}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md bg-muted px-3 py-2 text-sm">
          <span className="font-medium">Retention: </span>
          {doc.retention.explanation}
        </div>

        {boxUrl && (
          <a
            href={boxUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Open in Box <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}
