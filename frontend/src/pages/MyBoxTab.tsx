import { CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Live Box is not available until the Box app is approved, so this tab only explains that. */
export function MyBoxTab({ onUseDemo }: { onUseDemo: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
      <CloudOff className="mx-auto h-10 w-10 text-amber-600" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold text-amber-900">Your Box files are not available yet</h2>
      <p className="mt-2 text-sm text-amber-800">
        The Box app is still waiting for approval from your Box administrator. Once it is approved, your own files will show up here.
      </p>
      <p className="mt-2 text-sm text-amber-800">Until then, you can try everything with the demo files.</p>
      <Button className="mt-5" onClick={onUseDemo}>
        Open the demo files
      </Button>
    </div>
  );
}
