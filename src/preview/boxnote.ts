import { BlockSink, Budget, LIMITS, PreviewError, cleanText, clip } from './limits.js';
import type { PreviewBlock, PreviewDTO } from './types.js';

type Json = unknown;

const MAX_DEPTH = 40;

function isObject(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function children(node: Record<string, Json>): Json[] {
  return Array.isArray(node.content) ? node.content : [];
}

/** Concatenated inline text of a node (text leaves and hard breaks), without block structure. */
function inlineText(node: Json, depth = 0): string {
  if (depth > MAX_DEPTH || !isObject(node)) return '';
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
  if (node.type === 'hard_break' || node.type === 'hardBreak') return '\n';
  return children(node)
    .map((c) => inlineText(c, depth + 1))
    .join('');
}

function level(node: Record<string, Json>): number {
  const attrs = node.attrs;
  const raw = isObject(attrs) ? Number(attrs.level) : 1;
  return Number.isInteger(raw) ? Math.min(Math.max(raw, 1), 6) : 1;
}

function walk(node: Json, sink: BlockSink, depth: number, list: { level: number; ordered: boolean } | null): void {
  if (sink.full || depth > MAX_DEPTH || !isObject(node)) return;
  const type = typeof node.type === 'string' ? node.type : '';

  switch (type) {
    case 'heading':
      sink.add({ type: 'heading', level: level(node), text: cleanText(inlineText(node)).trim() });
      return;
    case 'paragraph': {
      const text = cleanText(inlineText(node)).trim();
      if (list) sink.add({ type: 'list_item', text, level: list.level, ordered: list.ordered });
      else sink.add({ type: 'paragraph', text });
      return;
    }
    case 'code_block':
    case 'codeBlock':
      sink.add({ type: 'preformatted', text: cleanText(inlineText(node)) });
      return;
    case 'bullet_list':
    case 'bulletList':
    case 'ordered_list':
    case 'orderedList':
    case 'check_list':
    case 'checkList': {
      const ordered = type === 'ordered_list' || type === 'orderedList';
      const next = { level: list ? list.level + 1 : 0, ordered };
      for (const child of children(node)) walk(child, sink, depth + 1, next);
      return;
    }
    case 'table': {
      const rows: string[][] = [];
      for (const row of children(node)) {
        if (!isObject(row)) continue;
        rows.push(children(row).map((c) => cleanText(inlineText(c)).replace(/\s+/g, ' ').trim()));
        if (rows.length > LIMITS.maxRows) break;
      }
      sink.addTable(rows);
      return;
    }
    default:
      // doc, blockquote, list_item, and anything unknown: descend, so text is never silently lost.
      for (const child of children(node)) walk(child, sink, depth + 1, list);
  }
}

/**
 * Box Notes (.boxnote) are JSON. Current notes hold a ProseMirror document under `doc`;
 * older notes only carry plain text under `atext.text`. Both are handled.
 */
export function extractBoxNote(bytes: Uint8Array): PreviewDTO {
  let parsed: Json;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch {
    // Includes RangeError from absurdly deep nesting.
    throw new PreviewError('This Box Note could not be read.');
  }
  if (!isObject(parsed)) throw new PreviewError('This Box Note could not be read.');

  const budget = new Budget();
  const sink = new BlockSink(budget);

  if (isObject(parsed.doc)) {
    walk(parsed.doc, sink, 0, null);
  } else if (isObject(parsed.atext) && typeof parsed.atext.text === 'string') {
    for (const line of cleanText(parsed.atext.text).split('\n')) {
      if (!sink.add({ type: 'paragraph', text: line.trim() })) break;
    }
  } else {
    throw new PreviewError('This Box Note has an unrecognised format.');
  }

  return { kind: 'document', format: 'boxnote', blocks: sink.blocks, truncated: budget.truncated };
}

/** Plain text, Markdown, CSV, JSON and similar. Shown verbatim, as text. */
export function extractText(bytes: Uint8Array): PreviewDTO {
  const head = bytes.subarray(0, 8192);
  if (head.includes(0)) throw new PreviewError('This looks like a binary file, so it cannot be previewed as text.');

  const text = cleanText(new TextDecoder('utf-8').decode(bytes.subarray(0, LIMITS.maxTextChars * 4)));
  const clipped = clip(text, LIMITS.maxTextChars);
  const blocks: PreviewBlock[] = clipped.length > 0 ? [{ type: 'preformatted', text: clipped }] : [];
  return { kind: 'document', format: 'text', blocks, truncated: clipped.length < text.length || bytes.length > LIMITS.maxTextChars * 4 };
}
