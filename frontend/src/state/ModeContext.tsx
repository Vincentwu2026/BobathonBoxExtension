import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Mode } from '@/types';

const STORAGE_KEY = 'bps-mode';

interface ModeContextValue {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

function readInitialMode(): Mode {
  // Demo is the default because it works with no credentials.
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'live' ? 'live' : 'demo';
  } catch {
    return 'demo';
  }
}

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(readInitialMode);

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the in-memory choice still applies.
    }
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useMode(): ModeContextValue {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error('useMode must be used inside <ModeProvider>');
  return ctx;
}
