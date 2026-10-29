import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ModeProvider } from '@/state/ModeContext';
import { SearchPage } from '@/pages/SearchPage';
import { ExplorerPage } from '@/pages/ExplorerPage';
import { RetentionPage } from '@/pages/RetentionPage';
import { LoadingRows } from '@/components/states';
import { StatusPage } from '@/pages/StatusPage';

// Recharts is large and only the Audit page needs it, so that route is loaded on demand.
const AuditPage = lazy(() => import('@/pages/AuditPage').then((m) => ({ default: m.AuditPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false, // Failures are expected (Box unavailable) and handled in the UI, not retried.
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ModeProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/search" replace />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="explorer" element={<ExplorerPage />} />
              <Route path="retention" element={<RetentionPage />} />
              <Route
                path="audit"
                element={
                  <Suspense fallback={<LoadingRows rows={5} />}>
                    <AuditPage />
                  </Suspense>
                }
              />
              <Route path="status" element={<StatusPage />} />
              <Route path="*" element={<Navigate to="/search" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ModeProvider>
    </QueryClientProvider>
  );
}
