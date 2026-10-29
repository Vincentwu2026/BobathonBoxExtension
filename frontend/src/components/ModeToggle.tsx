import { Database, FlaskConical, Plug } from 'lucide-react';
import { useMode } from '@/state/ModeContext';
import { cn } from '@/lib/utils';
import type { Mode } from '@/types';

const OPTIONS: Array<{ mode: Mode; label: string; Icon: typeof Plug }> = [
  { mode: 'live', label: 'LIVE BOX', Icon: Plug },
  { mode: 'demo', label: 'DEMO MODE', Icon: FlaskConical },
];

export function ModeToggle() {
  const { mode, setMode } = useMode();

  return (
    <div role="group" aria-label="Data mode" className="inline-flex rounded-lg border border-border bg-muted p-1">
      {OPTIONS.map(({ mode: m, label, Icon }) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            onClick={() => setMode(m)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? m === 'live'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-amber-500 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function ModeNote() {
  const { mode } = useMode();
  if (mode === 'live') return null;
  return (
    <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
      <Database className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        <strong>Demo Mode:</strong> seeded, fictional data. No Box credentials are used and nothing is ever deleted.
      </span>
    </div>
  );
}
