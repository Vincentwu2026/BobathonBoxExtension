import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, FileSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { QueryError } from '@/components/states';
import { getPreview } from '@/services/previewService';
import { useMode } from '@/state/ModeContext';
import { cn } from '@/lib/utils';
import type { Preview, PreviewBlock, PreviewSheet, PreviewSlide } from '@/types';

/**
 * Everything below renders extracted file content as React text nodes. There is no
 * dangerouslySetInnerHTML anywhere, so markup inside a file ("<script>…") is shown literally.
 */

function Blocks({ blocks }: { blocks: PreviewBlock[] }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return (
              <p key={i} className={cn('font-semibold', b.level <= 1 ? 'pt-1 text-base' : b.level === 2 ? 'text-[0.95rem]' : 'text-sm')}>
                {b.text}
              </p>
            );
          case 'paragraph':
            return <p key={i}>{b.text}</p>;
          case 'preformatted':
            return (
              <pre key={i} className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs">
                {b.text}
              </pre>
            );
          case 'list_item':
            return (
              <div key={i} className="flex gap-2" style={{ paddingLeft: `${Math.min(b.level, 6) * 1.25}rem` }}>
                <span aria-hidden="true" className="text-muted-foreground">
                  {b.ordered ? '•' : b.level > 0 ? '◦' : '•'}
                </span>
                <span className="min-w-0 break-words">{b.text}</span>
              </div>
            );
          case 'table':
            return <TextTable key={i} rows={b.rows} />;
        }
      })}
    </div>
  );
}

function TextTable({ rows }: { rows: string[][] }) {
  const width = rows.reduce((n, r) => Math.max(n, r.length), 0);
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-xs">
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className={r === 0 ? 'bg-muted font-medium' : 'border-t border-border'}>
              {Array.from({ length: width }, (_, c) => (
                <td key={c} className="px-2 py-1 align-top">
                  {row[c] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Slides({ slides, total }: { slides: PreviewSlide[]; total: number }) {
  const [i, setI] = useState(0);
  const slide = slides[Math.min(i, slides.length - 1)];
  if (!slide) return <p className="text-sm text-muted-foreground">This presentation has no slides.</p>;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          Slide {slide.index} of {total}
        </span>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0} aria-label="Previous slide">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setI((n) => Math.min(slides.length - 1, n + 1))} disabled={i >= slides.length - 1} aria-label="Next slide">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="min-h-40 rounded-lg border border-border bg-card p-4">
        <h4 className="mb-3 text-base font-semibold">{slide.title || <span className="text-muted-foreground">Untitled slide</span>}</h4>
        {slide.blocks.length > 0 ? <Blocks blocks={slide.blocks} /> : <p className="text-sm text-muted-foreground">No text on this slide.</p>}
      </div>
      {slide.notes && (
        <div className="mt-2 rounded-md bg-muted px-3 py-2 text-xs">
          <span className="font-medium">Speaker notes: </span>
          <span className="whitespace-pre-line">{slide.notes}</span>
        </div>
      )}
    </div>
  );
}

function colLabel(i: number): string {
  let s = '';
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
}

function Sheets({ sheets, total }: { sheets: PreviewSheet[]; total: number }) {
  const [active, setActive] = useState(0);
  const sheet = sheets[Math.min(active, sheets.length - 1)];
  if (!sheet) return <p className="text-sm text-muted-foreground">This workbook has no visible sheets.</p>;
  const cols = Math.min(sheet.totalColumns || 0, 30) || sheet.rows.reduce((n, r) => Math.max(n, r.length), 0);

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="Sheets">
        {sheets.map((s, i) => (
          <button
            key={`${s.name}-${i}`}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              i === active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted'
            )}
          >
            {s.name}
          </button>
        ))}
        {total > sheets.length && <span className="self-center text-xs text-muted-foreground">+{total - sheets.length} more</span>}
      </div>
      <div className="max-h-96 overflow-auto rounded-md border border-border">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="w-10 border-b border-r border-border px-2 py-1 text-right font-normal text-muted-foreground" />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className="border-b border-border px-2 py-1 text-left font-normal text-muted-foreground">
                  {colLabel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r} className="border-t border-border">
                <td className="border-r border-border bg-muted px-2 py-1 text-right text-muted-foreground">{r + 1}</td>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c} className="max-w-56 truncate px-2 py-1" title={row[c] ?? ''}>
                    {row[c] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(sheet.truncated || sheet.totalRows > sheet.rows.length) && (
        <p className="mt-1 text-xs text-muted-foreground">
          Showing {sheet.rows.length} of {sheet.totalRows} rows
          {sheet.totalColumns > 30 ? ` and 30 of ${sheet.totalColumns} columns` : ''}. Open the file in Box to see everything.
        </p>
      )}
    </div>
  );
}

const FORMAT_LABEL: Record<string, string> = {
  boxnote: 'Box Note',
  docx: 'Word document',
  pptx: 'Presentation',
  xlsx: 'Spreadsheet',
  text: 'Text file',
};

function Body({ preview }: { preview: Preview }) {
  switch (preview.kind) {
    case 'unavailable':
      return (
        <p className="rounded-md bg-muted px-3 py-2 text-sm" role="status">
          {preview.reason}
        </p>
      );
    case 'document':
      return preview.blocks.length > 0 ? <Blocks blocks={preview.blocks} /> : <p className="text-sm text-muted-foreground">This file is empty.</p>;
    case 'presentation':
      return <Slides slides={preview.slides} total={preview.totalSlides} />;
    case 'spreadsheet':
      return <Sheets sheets={preview.sheets} total={preview.totalSheets} />;
  }
}

export function PreviewPanel({ docId }: { docId: string }) {
  const { mode } = useMode();
  const [requested, setRequested] = useState(false);

  // A different document starts closed: previews download and parse the file, so they are on demand.
  useEffect(() => setRequested(false), [docId, mode]);

  const query = useQuery({
    queryKey: ['preview', mode, docId],
    queryFn: () => getPreview(mode, docId),
    enabled: requested,
    staleTime: 60_000,
    retry: false,
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">File preview</h3>
        {query.data && query.data.data.preview.kind !== 'unavailable' && (
          <span className="text-xs text-muted-foreground">{FORMAT_LABEL[query.data.data.preview.format]}</span>
        )}
      </div>

      {!requested && (
        <Button variant="outline" size="sm" className="mt-2" onClick={() => setRequested(true)}>
          <FileSearch className="h-4 w-4" aria-hidden="true" />
          Preview file
        </Button>
      )}

      {requested && query.isPending && (
        <div className="mt-2 space-y-2" role="status" aria-label="Loading preview">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      )}

      {requested && query.isError && (
        <div className="mt-2">
          <QueryError error={query.error} />
        </div>
      )}

      {requested && query.data && (
        <div className="mt-2" data-testid="preview-body">
          <Body preview={query.data.data.preview} />
          {query.data.data.preview.kind !== 'unavailable' && query.data.data.preview.truncated && (
            <p className="mt-2 text-xs text-muted-foreground">Preview shortened. Open the file in Box to see everything.</p>
          )}
        </div>
      )}
    </div>
  );
}
