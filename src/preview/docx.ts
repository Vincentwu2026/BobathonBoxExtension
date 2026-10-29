import { BlockSink, Budget, PreviewError, cleanText } from './limits.js';
import type { PreviewDTO } from './types.js';
import { decodeUtf8, readZip } from './zip.js';
import { decodeXml, firstElement, getAttr, scanElements } from './xml.js';

/** Visible text of one <w:p>: runs, tabs and line breaks. Deleted text (w:delText) is excluded. */
function paragraphText(inner: string): string {
  let out = '';
  for (const el of scanElements(inner, ['w:t', 'w:tab', 'w:br', 'w:cr'])) {
    if (el.tag === 'w:t') out += decodeXml(el.inner);
    else if (el.tag === 'w:tab') out += '\t';
    else out += '\n';
  }
  return cleanText(out);
}

function headingLevel(style: string | undefined): number | null {
  if (!style) return null;
  if (/^title$/i.test(style)) return 1;
  const m = /^heading\s?([1-6])$/i.exec(style);
  return m ? Number(m[1]) : null;
}

export function extractDocx(bytes: Uint8Array): PreviewDTO {
  const parts = readZip(bytes, (name) => name === 'word/document.xml');
  const doc = parts.get('word/document.xml');
  if (!doc) throw new PreviewError('This Word document has no readable content.');

  const xml = decodeUtf8(doc);
  const body = firstElement(xml, 'w:body')?.inner ?? xml;

  const budget = new Budget();
  const sink = new BlockSink(budget);

  for (const el of scanElements(body, ['w:p', 'w:tbl'])) {
    if (sink.full) break;

    if (el.tag === 'w:tbl') {
      const rows: string[][] = [];
      for (const tr of scanElements(el.inner, ['w:tr'])) {
        const cells: string[] = [];
        for (const tc of scanElements(tr.inner, ['w:tc'])) {
          const text: string[] = [];
          for (const p of scanElements(tc.inner, ['w:p'])) text.push(paragraphText(p.inner));
          cells.push(text.join(' ').trim());
        }
        rows.push(cells);
        if (rows.length > 200) break;
      }
      sink.addTable(rows);
      continue;
    }

    const pPr = firstElement(el.inner, 'w:pPr')?.inner ?? '';
    const style = getAttr(firstElement(pPr, 'w:pStyle')?.attrs ?? '', 'w:val');
    const text = paragraphText(el.inner).trim();
    const heading = headingLevel(style);
    const numPr = firstElement(pPr, 'w:numPr');
    // numId 0 means "numbering removed", even though a numPr element is present.
    const numbered = numPr && getAttr(firstElement(numPr.inner, 'w:numId')?.attrs ?? '', 'w:val') !== '0';
    const listStyle = style !== undefined && /^List(Bullet|Number|Continue)/i.test(style);

    if (heading !== null) {
      sink.add({ type: 'heading', level: heading, text });
    } else if (numbered || listStyle) {
      const ilvl = Number(getAttr(firstElement(numPr?.inner ?? '', 'w:ilvl')?.attrs ?? '', 'w:val') ?? '0');
      sink.add({
        type: 'list_item',
        text,
        level: Number.isInteger(ilvl) ? Math.min(Math.max(ilvl, 0), 8) : 0,
        ordered: style !== undefined && /number/i.test(style),
      });
    } else {
      sink.add({ type: 'paragraph', text });
    }
  }

  return { kind: 'document', format: 'docx', blocks: sink.blocks, truncated: budget.truncated };
}
