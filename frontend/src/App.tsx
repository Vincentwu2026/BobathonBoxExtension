import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MyBoxTab } from '@/pages/MyBoxTab';
import { DemoTab } from '@/pages/DemoTab';
import { cn } from '@/lib/utils';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 15_000 } },
});

type Tab = 'demo' | 'box';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'demo', label: 'Demo files' },
  { id: 'box', label: 'My Box' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('demo');

  return (
    <QueryClientProvider client={queryClient}>
      <div className="mx-auto max-w-4xl px-4 pb-16 pt-6">
        <header className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Package className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="text-lg font-bold">Box Productivity Suite</h1>
        </header>

        <div role="tablist" aria-label="Choose where your files are" className="mt-6 flex gap-1 border-b border-border">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              onClick={() => setTab(id)}
              className={cn(
                '-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <main id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-6">
          <ErrorBoundary>{tab === 'demo' ? <DemoTab /> : <MyBoxTab onUseDemo={() => setTab('demo')} />}</ErrorBoundary>
        </main>
      </div>
    </QueryClientProvider>
  );
}
