/** Stable Cafe24 origin tokens. No schema/backfill or external calls. */
export const C24_SOURCE = 'c24-mirror';
export const C24_MANUAL_SOURCE = 'c24-mirror:manual';
export const C24_NOTE_PREFIX = 'c24:';
const ID = /^[A-Za-z0-9_-]+$/;
const WHITESPACE = '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';

export function validC24ClassId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

/** Preserve appended end-makeup annotations; do not choose among conflicting IDs. */
export function c24NoteIds(notes: unknown): string[] {
  return [...new Set(Array.from(String(notes ?? '').matchAll(/(?:^|\s)c24:([A-Za-z0-9_-]+)/g), m => m[1]))];
}

export function trustworthyC24Identity(row: any): boolean {
  const text = String(row?.notes ?? '');
  const date = String(row?.scheduled_date ?? '');
  return c24NoteIds(text).length === 1 && !text.includes('\0')
    && !/(?:^|\s)c24:(?![A-Za-z0-9_-])/.test(text)
    && !!String(row?.user_id ?? '').trim()
    && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date + 'T00:00:00Z'))
    && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
}

/** A bound SQLite GLOB, with the same token boundaries as c24NoteIds.
 * IDs cannot contain GLOB metacharacters. Include every ECMAScript \s character;
 * the caller pads notes with a space at both ends to cover start/end tokens.
 * Matching any conflicting token is deliberately conservative at write time.
 */
export function c24IdentityGlob(id: string): string {
  if (!validC24ClassId(id)) throw new Error('invalid_c24_class_id');
  return '*[' + WHITESPACE + ']c24:' + id + '[^A-Za-z0-9_-]*';
}

/** Used only for the legacy same-student/day fallback at write time. */
export function c24AnyIdentityGlob(): string {
  return '*[' + WHITESPACE + ']c24:[A-Za-z0-9_-]*';
}
