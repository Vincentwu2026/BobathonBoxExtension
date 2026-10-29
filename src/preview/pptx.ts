import { BlockSink, Budget, LIMITS, PreviewError, cell, cleanText, clip } from './limits.js';
import type { PreviewDTO, PreviewSlide } from './types.js';
import { decodeUtf8, readZip } from './zip.js';
import { decodeXml, firstElement, getAttr, scanElements } from './xml.js';

const SLIDE_PART = /^ppt\/slides\/slide\d+\.xml$/;
const SLIDE_RELS = /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/;
const NOTES_PART = /^ppt\/notesSlides\/notesSlide\d+\.xml$/;

/** Text of one <a:p>: runs, field text and line breaks. */
function drawingParagraph(inner: string): { text: string; level: number } {
  let text = '';
  for (const el of scanElements(inner, ['a:t', 'a:br'])) {
    text += el.tag === 'a:t' ? decodeXml(el.inner) : '\n';
  }
  const lvl = Number(getAttr(firstElement(inner, 'a:pPr')?.attrs ?? '', 'lvl') ?? '0');
  return { text: cleanText(text).trim(), level: Number.isInteger(lvl) ? Math.min(Math.max(lvl, 0), 8) : 0 };
}

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

function relationships(xml: string, ownerPart: string): Array<{ id: string; type: string; target: string }> {
  const out: Array<{ id: string; type: string; target: string }> = [];
  for (const rel of scanElements(xml, ['Relationship'])) {
    const id = getAttr(rel.attrs, 'Id');
    const type = getAttr(rel.attrs, 'Type');
    const target = getAttr(rel.attrs, 'Target');
    if (id && type && target) out.push({ id, type, target: resolveTarget(ownerPart, target) });
  }
  return out;
}

function parseSlide(xml: string, index: number, notesXml: string | undefined, budget: Budget): PreviewSlide {
  const sink = new BlockSink(budget);
  let title = '';

  for (const el of scanElements(xml, ['p:sp', 'p:graphicFrame'])) {
    if (sink.full) break;

    if (el.tag === 'p:graphicFrame') {
      const rows: string[][] = [];
      for (const tr of scanElements(el.inner, ['a:tr'])) {
        const cells: string[] = [];
        for (const tc of scanElements(tr.inner, ['a:tc'])) {
          const text: string[] = [];
          for (const p of scanElements(tc.inner, ['a:p'])) text.push(drawingParagraph(p.inner).text);
          cells.push(text.join(' ').trim());
        }
        rows.push(cells);
        if (rows.length > 200) break;
      }
      if (rows.length > 0) sink.addTable(rows);
      continue;
    }

    const ph = firstElement(el.inner, 'p:ph');
    const phType = ph ? (getAttr(ph.attrs, 'type') ?? 'body') : null;
    // Footers, dates and slide numbers are chrome, not content.
    if (phType === 'sldNum' || phType === 'ftr' || phType === 'dt') continue;

    const isTitle = phType === 'title' || phType === 'ctrTitle';
    const paragraphs = [...scanElements(firstElement(el.inner, 'p:txBody')?.inner ?? '', ['a:p'])]
      .map((p) => drawingParagraph(p.inner))
      .filter((p) => p.text.length > 0);

    if (isTitle) {
      if (!title) title = paragraphs.map((p) => p.text).join(' ');
      continue;
    }
    for (const p of paragraphs) {
      if (phType === 'body' || phType === 'subTitle') {
        sink.add({ type: 'list_item', text: p.text, level: p.level, ordered: false });
      } else {
        sink.add({ type: 'paragraph', text: p.text });
      }
    }
  }

  let notes = '';
  if (notesXml) {
    const lines: string[] = [];
    for (const sp of scanElements(notesXml, ['p:sp'])) {
      const ph = firstElement(sp.inner, 'p:ph');
      // The notes page also holds the slide image and slide number placeholders.
      if (!ph || getAttr(ph.attrs, 'type') !== 'body') continue;
      for (const p of scanElements(firstElement(sp.inner, 'p:txBody')?.inner ?? '', ['a:p'])) {
        const text = drawingParagraph(p.inner).text;
        if (text) lines.push(text);
      }
    }
    notes = clip(lines.join('\n'), LIMITS.maxNotesChars);
  }

  return { index, title: cell(title), blocks: sink.blocks, notes };
}

export function extractPptx(bytes: Uint8Array): PreviewDTO {
  const parts = readZip(
    bytes,
    (name) =>
      name === 'ppt/presentation.xml' ||
      name === 'ppt/_rels/presentation.xml.rels' ||
      SLIDE_PART.test(name) ||
      SLIDE_RELS.test(name) ||
      NOTES_PART.test(name)
  );

  const presentation = parts.get('ppt/presentation.xml');
  const presentationRels = parts.get('ppt/_rels/presentation.xml.rels');
  if (!presentation || !presentationRels) throw new PreviewError('This presentation has no readable content.');

  const byId = new Map(relationships(decodeUtf8(presentationRels), 'ppt/presentation.xml').map((r) => [r.id, r]));
  const order: string[] = [];
  for (const sld of scanElements(decodeUtf8(presentation), ['p:sldId'])) {
    const target = byId.get(getAttr(sld.attrs, 'r:id') ?? '');
    if (target && SLIDE_PART.test(target.target)) order.push(target.target);
  }

  const budget = new Budget();
  const slides: PreviewSlide[] = [];

  for (const [i, path] of order.slice(0, LIMITS.maxSlides).entries()) {
    if (budget.truncated) break;
    const slideBytes = parts.get(path);
    if (!slideBytes) continue;

    const relsBytes = parts.get(path.replace('slides/', 'slides/_rels/') + '.rels');
    const notesTarget = relsBytes ? relationships(decodeUtf8(relsBytes), path).find((r) => r.type.endsWith('/notesSlide')) : undefined;
    const notesBytes = notesTarget ? parts.get(notesTarget.target) : undefined;

    slides.push(parseSlide(decodeUtf8(slideBytes), i + 1, notesBytes ? decodeUtf8(notesBytes) : undefined, budget));
  }

  return {
    kind: 'presentation',
    format: 'pptx',
    slides,
    totalSlides: order.length,
    truncated: budget.truncated || order.length > slides.length,
  };
}
