import { CircleHelp, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { RetentionStatus } from '@/types';

export function RetentionBadge({ status }: { status: RetentionStatus }) {
  if (status === 'protected') {
    return (
      <Badge variant="danger">
        <ShieldAlert className="h-3 w-3" aria-hidden="true" />
        Protected
      </Badge>
    );
  }
  if (status === 'unprotected') {
    return (
      <Badge variant="success">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        Unprotected
      </Badge>
    );
  }
  return (
    <Badge variant="warning">
      <CircleHelp className="h-3 w-3" aria-hidden="true" />
      Unverified
    </Badge>
  );
}
