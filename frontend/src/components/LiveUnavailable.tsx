import { CloudOff, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMode } from '@/state/ModeContext';
import { LIVE_UNAVAILABLE_MESSAGE } from '@/types';

/** Shown whenever Live Box Mode cannot be served. Offers a one-click switch to Demo Mode. */
export function LiveUnavailable() {
  const { setMode } = useMode();
  const [line1, line2] = LIVE_UNAVAILABLE_MESSAGE.split('\n');

  return (
    <div role="alert" className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
      <CloudOff className="mx-auto h-10 w-10 text-amber-600" aria-hidden="true" />
      <p className="mt-4 text-lg font-semibold text-amber-900">{line1}</p>
      <p className="text-lg font-semibold text-amber-900">{line2}</p>
      <p className="mt-2 text-sm text-amber-800">
        Box credentials are missing or have expired. Paste a fresh developer token in the bar at the top of the page, or use Demo Mode to see every capability with seeded data.
      </p>
      <Button className="mt-5" onClick={() => setMode('demo')}>
        <FlaskConical className="h-4 w-4" aria-hidden="true" />
        Switch to Demo Mode
      </Button>
    </div>
  );
}
