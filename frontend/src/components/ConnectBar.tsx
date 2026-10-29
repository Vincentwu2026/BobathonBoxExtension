import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, KeyRound, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/card';
import { connectBox, disconnectBox, getConnection } from '@/services/connectionService';
import { userMessage } from '@/services/errors';
import { useMode } from '@/state/ModeContext';

const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]{10,512}$/;

/** Live Mode only: connect the API to Box with a developer token, entirely from the website. */
export function ConnectBar() {
  const { mode } = useMode();
  const queryClient = useQueryClient();
  const [token, setToken] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const connection = useQuery({
    queryKey: ['live-connection'],
    queryFn: getConnection,
    enabled: mode === 'live',
    staleTime: 0,
  });

  const afterChange = () => {
    // Cached live results were produced with the old credentials.
    void queryClient.invalidateQueries();
  };

  const connect = useMutation({
    mutationFn: (t: string) => connectBox(t),
    onSuccess: () => {
      setToken(''); // never keep the token in memory longer than needed
      afterChange();
    },
  });
  const disconnect = useMutation({ mutationFn: disconnectBox, onSuccess: afterChange });

  if (mode !== 'live') return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = token.trim();
    if (!TOKEN_PATTERN.test(t)) {
      setLocalError('Paste the full developer token from the Box Developer Console.');
      return;
    }
    setLocalError(null);
    connect.mutate(t);
  };

  const apiDown = connection.isError;
  const connected = connection.data?.connected === true;
  const error = localError ?? (connect.isError ? userMessage(connect.error) : null);

  return (
    <div className="border-b border-border bg-muted/60 px-4 py-2.5 md:px-6" data-testid="connect-bar">
      {connected ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <span>
            Connected to Box as <strong>{connection.data?.accountName ?? 'Box user'}</strong>
          </span>
          <Button size="sm" variant="outline" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
            <Unplug className="h-3.5 w-3.5" aria-hidden="true" />
            Disconnect
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-center" aria-label="Connect to Box">
          <label htmlFor="box-token" className="flex items-center gap-1.5 text-sm font-medium">
            <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Box developer token
          </label>
          <Input
            id="box-token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste token from Developer Console → Configuration"
            className="sm:max-w-md"
            maxLength={512}
          />
          <Button type="submit" size="sm" disabled={connect.isPending || apiDown}>
            {connect.isPending ? 'Connecting…' : 'Connect to Box'}
          </Button>
          <span className="text-xs text-muted-foreground">Held in server memory only. Expires after ~60 min.</span>
        </form>
      )}
      {apiDown && !connected && (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          The backend API is not running, so Live Box cannot connect. Demo Mode still works.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
