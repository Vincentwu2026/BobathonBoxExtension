import { parseSnippet } from '@/lib/utils';

/** Renders an FTS5 snippet. Only <mark> is honoured, and it is built as React elements, never as HTML. */
export function Snippet({ text }: { text: string }) {
  return (
    <>
      {parseSnippet(text).map((part, i) =>
        part.marked ? (
          <mark key={i} className="rounded bg-yellow-200 px-0.5 text-foreground">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}
