import { NavLink, Outlet } from 'react-router-dom';
import { Activity, FolderTree, Package, ScrollText, Search, ShieldCheck } from 'lucide-react';
import { ModeNote, ModeToggle } from '@/components/ModeToggle';
import { ConnectBar } from '@/components/ConnectBar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/search', label: 'Search', Icon: Search },
  { to: '/explorer', label: 'Folder Explorer', Icon: FolderTree },
  { to: '/retention', label: 'Retention Center', Icon: ShieldCheck },
  { to: '/audit', label: 'Audit Logs', Icon: ScrollText },
  { to: '/status', label: 'System Status', Icon: Activity },
];

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Package className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <h1 className="text-base font-bold">Box Productivity Suite</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">Find it. Protect it. Prove it.</p>
            </div>
          </div>
          <ModeToggle />
        </div>
        <ModeNote />
        <ConnectBar />
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <nav aria-label="Primary" className="bg-sidebar text-slate-300 md:w-60 md:shrink-0">
          <ul className="flex gap-1 overflow-x-auto p-2 md:sticky md:top-[65px] md:flex-col md:p-3">
            {NAV.map(({ to, label, Icon }) => (
              <li key={to} className="shrink-0">
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-slate-800 hover:text-white'
                    )
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
