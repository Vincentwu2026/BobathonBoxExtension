import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Box links are only rendered as anchors when they point at Box itself. */
export function safeBoxUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'app.box.com' ? u.toString() : null;
  } catch {
    return null;
  }
}

export interface SnippetPart {
  text: string;
  marked: boolean;
}

/**
 * Splits an FTS5 snippet on its <mark> tags. Everything else is plain text, so snippets
 * derived from document content can never inject markup.
 */
export function parseSnippet(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  const re = /<mark>(.*?)<\/mark>/gs;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(snippet)) !== null) {
    if (match.index > last) parts.push({ text: snippet.slice(last, match.index), marked: false });
    parts.push({ text: match[1], marked: true });
    last = match.index + match[0].length;
  }
  if (last < snippet.length) parts.push({ text: snippet.slice(last), marked: false });
  // Strip any stray tags left in plain segments.
  return parts.map((p) => ({ ...p, text: p.text.replace(/<[^>]*>/g, '') }));
}
