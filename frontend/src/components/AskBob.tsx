import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { QueryError } from '@/components/states';
import { askBob } from '@/services/askBobService';
import { ApiRequestError } from '@/services/errors';

const MAX_QUESTION = 500;

/**
 * Ask Bob about the open file. The answer is Bob's text, rendered as plain text only.
 * The server reads the file and holds the Bob API key; nothing secret is on this page.
 */
export function AskBob({ docId, searchQuery }: { docId: string; searchQuery?: string }) {
  const [question, setQuestion] = useState('');

  const ask = useMutation({
    mutationFn: (q: string) => askBob(docId, q, searchQuery),
  });

  // A different file starts with a clean slate.
  useEffect(() => {
    setQuestion('');
    ask.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (trimmed && !ask.isPending) ask.mutate(trimmed);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(question);
  };

  const summarise = searchQuery ? `How is this file relevant to “${searchQuery}”?` : 'Summarise this file.';

  return (
    <section aria-label="Ask Bob" className="mt-6 border-t border-border pt-4">
      <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        Ask Bob about this file
      </h3>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={ask.isPending}
          onClick={() => {
            setQuestion(summarise);
            submit(summarise);
          }}
        >
          {searchQuery ? 'Relate to my search' : 'Summarise'}
        </Button>
      </div>

      <form onSubmit={onSubmit} className="mt-2 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={MAX_QUESTION}
          placeholder="Ask a question about this file…"
          aria-label="Question for Bob"
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" size="sm" disabled={ask.isPending || question.trim().length === 0}>
          Ask
        </Button>
      </form>

      {ask.isPending && (
        <div className="mt-3 space-y-2" role="status" aria-label="Bob is reading the file">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}

      {ask.isError && (
        <div className="mt-3">
          {ask.error instanceof ApiRequestError && ask.error.code.startsWith('BOB_') ? (
            <p role="alert" className="rounded-md bg-muted px-3 py-2 text-sm">
              {ask.error.message}
            </p>
          ) : (
            <QueryError error={ask.error} />
          )}
        </div>
      )}

      {ask.data && (
        <div className="mt-3" data-testid="bob-answer">
          <p className="whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 text-sm leading-relaxed">{ask.data.answer}</p>
          {ask.data.documentShortened && (
            <p className="mt-1 text-xs text-muted-foreground">Bob read the first part of this file; it is longer than what can be sent.</p>
          )}
        </div>
      )}
    </section>
  );
}
