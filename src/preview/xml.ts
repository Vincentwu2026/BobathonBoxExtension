/**
 * Minimal, dependency-free XML helpers for reading Office Open XML parts.
 *
 * This is deliberately not a general XML parser:
 *  - no DTD, entity or external-resource handling, so XXE and "billion laughs" do not apply;
 *  - every scan is a single forward pass built on indexOf (no backtracking regular expressions),
 *    so a hostile file cannot cause super-linear running time;
 *  - an unclosed element ends the scan instead of being searched for repeatedly.
 */

export interface XmlElement {
  tag: string;
  /** Raw attribute text between the tag name and '>' (use getAttr to read it). */
  attrs: string;
  inner: string;
  selfClosing: boolean;
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXml(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|amp|lt|gt|quot|apos);/g, (_m, entity: string) => {
    const named = NAMED_ENTITIES[entity];
    if (named !== undefined) return named;
    const code = entity.charAt(1) === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    if (code === 9 || code === 10 || code === 13) return ' ';
    if (!Number.isFinite(code) || code < 32 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '';
    return String.fromCodePoint(code);
  });
}

function isNameBoundary(ch: string): boolean {
  return ch === ' ' || ch === '>' || ch === '/' || ch === '\n' || ch === '\t' || ch === '\r';
}

function findOpen(xml: string, tag: string, from: number): number {
  const needle = `<${tag}`;
  let i = from;
  for (;;) {
    i = xml.indexOf(needle, i);
    if (i < 0) return -1;
    // '<w:t' must not match '<w:tbl' or '<w:tab': the next character has to end the name.
    if (isNameBoundary(xml.charAt(i + needle.length))) return i;
    i += 1;
  }
}

/**
 * Yields, in document order, each element named in `tags`. Elements nested inside a yielded
 * element are not yielded separately (scan its `inner` if you need them). Self-closing
 * elements are yielded with empty `inner`.
 */
export function* scanElements(xml: string, tags: readonly string[]): Generator<XmlElement> {
  const next = new Map<string, number>();
  let cursor = 0;

  for (;;) {
    let best = -1;
    let bestTag = '';
    for (const tag of tags) {
      let pos = next.get(tag);
      if (pos === undefined || (pos >= 0 && pos < cursor)) {
        pos = findOpen(xml, tag, cursor);
        next.set(tag, pos);
      }
      if (pos >= 0 && (best < 0 || pos < best)) {
        best = pos;
        bestTag = tag;
      }
    }
    if (best < 0) return;

    const tagEnd = xml.indexOf('>', best);
    if (tagEnd < 0) return;
    const attrs = xml.slice(best + 1 + bestTag.length, tagEnd);

    if (xml.charAt(tagEnd - 1) === '/') {
      yield { tag: bestTag, attrs, inner: '', selfClosing: true };
      cursor = tagEnd + 1;
      continue;
    }

    const closeNeedle = `</${bestTag}>`;
    const close = xml.indexOf(closeNeedle, tagEnd);
    if (close < 0) return;
    yield { tag: bestTag, attrs, inner: xml.slice(tagEnd + 1, close), selfClosing: false };
    cursor = close + closeNeedle.length;
  }
}

/** First element named `tag` inside `xml`, or undefined. */
export function firstElement(xml: string, tag: string): XmlElement | undefined {
  for (const el of scanElements(xml, [tag])) return el;
  return undefined;
}

export function getAttr(attrs: string, name: string): string | undefined {
  for (const quote of ['"', "'"]) {
    const key = `${name}=${quote}`;
    let i = attrs.indexOf(key);
    while (i >= 0) {
      // Must start a new attribute: 'id' must not match inside 'r:id'.
      if (i === 0 || /\s/.test(attrs.charAt(i - 1))) {
        const end = attrs.indexOf(quote, i + key.length);
        return end < 0 ? undefined : decodeXml(attrs.slice(i + key.length, end));
      }
      i = attrs.indexOf(key, i + 1);
    }
  }
  return undefined;
}
