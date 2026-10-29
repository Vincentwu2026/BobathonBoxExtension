import { LIMITS, PreviewError, cell, cleanText } from './limits.js';
import type { PreviewDTO, PreviewSheet } from './types.js';
import { decodeUtf8, readZip } from './zip.js';
import { decodeXml, firstElement, getAttr, scanElements } from './xml.js';

const SHEET_PART = /^xl\/worksheets\/[^/]+\.xml$/;

/** Number formats Excel treats as dates/times without a custom format string. */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/** Relationship targets are relative to the folder of the part that OWNS the .rels file. */
function resolveTarget(ownerPart: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const stack = ownerPart.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') stack.pop();
    else if (seg !== '.' && seg !== '') stack.push(seg);
  }
  return stack.join('/');
}

/** A custom format is a date format if it has y/m/d/h/s outside quotes, brackets and escapes. */
function isDateFormatCode(code: string): boolean {
  let stripped = '';
  let inQuote = false;
  let inBracket = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code.charAt(i);
    if (ch === '"') inQuote = !inQuote;
    else if (inQuote) continue;
    else if (ch === '[') inBracket = true;
    else if (ch === ']') inBracket = false;
    else if (inBracket) continue;
    else if (ch === '\\' || ch === '_' || ch === '*') i += 1;
    else stripped += ch;
  }
  return /[ymdhs]/i.test(stripped) && !/^general$/i.test(stripped.trim());
}

/** Per cell-style index: is it a date/time format? */
function dateStyles(stylesXml: string | undefined): boolean[] {
  if (!stylesXml) return [];
  const custom = new Map<number, string>();
  const numFmts = firstElement(stylesXml, 'numFmts')?.inner ?? '';
  for (const nf of scanElements(numFmts, ['numFmt'])) {
    const id = Number(getAttr(nf.attrs, 'numFmtId'));
    const code = getAttr(nf.attrs, 'formatCode');
    if (Number.isInteger(id) && code !== undefined) custom.set(id, code);
  }
  const out: boolean[] = [];
  const cellXfs = firstElement(stylesXml, 'cellXfs')?.inner ?? '';
  for (const xf of scanElements(cellXfs, ['xf'])) {
    const id = Number(getAttr(xf.attrs, 'numFmtId') ?? '0');
    const code = custom.get(id);
    out.push(code !== undefined ? isDateFormatCode(code) : BUILTIN_DATE_FORMATS.has(id));
    if (out.length >= 20000) break;
  }
  return out;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(serial: number, date1904: boolean): string {
  if (!Number.isFinite(serial) || serial < 0 || serial > 2958465) return String(serial);
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(epoch + Math.round(serial * 86_400_000));
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  if (serial < 1) return time;
  return Number.isInteger(serial) ? day : `${day} ${time}`;
}

function formatNumber(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  // Strips binary floating point noise such as 1234.5600000000001.
  return String(Number(n.toPrecision(12)));
}

function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const out: string[] = [];
  for (const si of scanElements(xml, ['si'])) {
    let text = '';
    // <rPh> (phonetic hints) is yielded as a whole element, so its inner <t> is not read.
    for (const el of scanElements(si.inner, ['t', 'rPh'])) {
      if (el.tag === 't') text += decodeXml(el.inner);
    }
    out.push(cell(text));
    if (out.length >= 200_000) break;
  }
  return out;
}

function columnIndex(ref: string): number {
  let col = 0;
  for (let i = 0; i < ref.length; i++) {
    const code = ref.charCodeAt(i);
    if (code < 65 || code > 90) break;
    col = col * 26 + (code - 64);
  }
  return col - 1;
}

function rowNumber(ref: string): number {
  const m = /(\d+)$/.exec(ref);
  return m ? Number(m[1]) : 0;
}

function parseSheet(
  name: string,
  xml: string,
  strings: string[],
  dates: boolean[],
  date1904: boolean
): PreviewSheet {
  const rows: string[][] = [];
  let totalRows = 0;
  let totalColumns = 0;

  const dim = getAttr(firstElement(xml, 'dimension')?.attrs ?? '', 'ref');
  if (dim) {
    const end = dim.split(':').pop() ?? '';
    totalRows = rowNumber(end);
    totalColumns = columnIndex(end) + 1;
  }

  const data = firstElement(xml, 'sheetData')?.inner ?? '';
  let scanned = 0;
  for (const row of scanElements(data, ['row'])) {
    const r = Number(getAttr(row.attrs, 'r') ?? '0');
    const rowIdx = Number.isInteger(r) && r > 0 ? r - 1 : scanned;
    scanned += 1;
    totalRows = Math.max(totalRows, rowIdx + 1);
    if (rowIdx >= LIMITS.maxRows) {
      // Past the preview window. Totals come from <dimension> or the last row seen; stop scanning.
      if (dim) break;
      continue;
    }

    const cells: string[] = [];
    let next = 0;
    for (const c of scanElements(row.inner, ['c'])) {
      const ref = getAttr(c.attrs, 'r');
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      totalColumns = Math.max(totalColumns, col + 1);
      if (col < 0 || col >= LIMITS.maxCols) continue;

      const type = getAttr(c.attrs, 't');
      const style = Number(getAttr(c.attrs, 's') ?? '0');
      const v = firstElement(c.inner, 'v');
      let text = '';

      if (type === 'inlineStr') {
        for (const t of scanElements(firstElement(c.inner, 'is')?.inner ?? '', ['t', 'rPh'])) {
          if (t.tag === 't') text += decodeXml(t.inner);
        }
      } else if (v) {
        const raw = decodeXml(v.inner);
        // A formula the producer never calculated has an empty <v>; show it blank, not as 0.
        if (raw.trim() === '') text = '';
        else if (type === 's') text = strings[Number(raw)] ?? '';
        else if (type === 'b') text = raw === '1' ? 'TRUE' : 'FALSE';
        else if (type === 'e') text = raw;
        else if (type === 'str') text = raw;
        else if (dates[style]) text = formatDate(Number(raw), date1904);
        else text = formatNumber(raw);
      }

      while (cells.length < col) cells.push('');
      cells[col] = cell(text);
    }

    while (rows.length < rowIdx) rows.push([]);
    rows[rowIdx] = cells;
  }

  return {
    name: cell(name),
    rows,
    totalRows,
    totalColumns,
    truncated: totalRows > LIMITS.maxRows || totalColumns > LIMITS.maxCols,
  };
}

export function extractXlsx(bytes: Uint8Array): PreviewDTO {
  const parts = readZip(
    bytes,
    (name) =>
      name === 'xl/workbook.xml' ||
      name === 'xl/_rels/workbook.xml.rels' ||
      name === 'xl/sharedStrings.xml' ||
      name === 'xl/styles.xml' ||
      SHEET_PART.test(name)
  );

  const workbook = parts.get('xl/workbook.xml');
  const rels = parts.get('xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) throw new PreviewError('This spreadsheet has no readable content.');

  const workbookXml = decodeUtf8(workbook);
  const date1904 = /^(1|true)$/i.test(getAttr(firstElement(workbookXml, 'workbookPr')?.attrs ?? '', 'date1904') ?? '');

  const targets = new Map<string, string>();
  for (const rel of scanElements(decodeUtf8(rels), ['Relationship'])) {
    const id = getAttr(rel.attrs, 'Id');
    const target = getAttr(rel.attrs, 'Target');
    if (id && target) targets.set(id, resolveTarget('xl/workbook.xml', target));
  }

  const strings = sharedStrings(parts.has('xl/sharedStrings.xml') ? decodeUtf8(parts.get('xl/sharedStrings.xml')!) : undefined);
  const dates = dateStyles(parts.has('xl/styles.xml') ? decodeUtf8(parts.get('xl/styles.xml')!) : undefined);

  const listed: Array<{ name: string; path: string }> = [];
  for (const sheet of scanElements(firstElement(workbookXml, 'sheets')?.inner ?? '', ['sheet'])) {
    // Hidden sheets are not shown in a preview, matching what Excel shows on open.
    if (getAttr(sheet.attrs, 'state') && getAttr(sheet.attrs, 'state') !== 'visible') continue;
    const path = targets.get(getAttr(sheet.attrs, 'r:id') ?? '');
    if (path && SHEET_PART.test(path)) listed.push({ name: cleanText(getAttr(sheet.attrs, 'name') ?? 'Sheet'), path });
  }

  const sheets: PreviewSheet[] = [];
  for (const entry of listed.slice(0, LIMITS.maxSheets)) {
    const data = parts.get(entry.path);
    if (data) sheets.push(parseSheet(entry.name, decodeUtf8(data), strings, dates, date1904));
  }

  return {
    kind: 'spreadsheet',
    format: 'xlsx',
    sheets,
    totalSheets: listed.length,
    truncated: listed.length > sheets.length || sheets.some((s) => s.truncated),
  };
}
