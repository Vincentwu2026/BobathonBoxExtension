/**
 * Normalises a Box date value to an ISO-8601 string.
 *
 * box-node-sdk v10 deserialises date-time fields into a wrapper object ({ value: Date }),
 * not a string or Date. Raw REST payloads use strings. Both are handled here, so callers
 * can safely store the result (node:sqlite rejects objects) and compare it between crawls.
 * Returns '' when the value is missing or not a valid date.
 */
export function boxDateToIso(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';

  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    date = new Date(value);
  } else if (typeof value === 'object' && 'value' in value) {
    const inner = (value as { value: unknown }).value;
    date = inner instanceof Date ? inner : new Date(String(inner));
  } else {
    return '';
  }

  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}
