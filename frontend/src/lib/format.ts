/**
 * format.ts — small display helpers shared by components. Pure functions only.
 */

/** "2026-11-14" -> "14 Nov 2026". Returns the input unchanged if it can't be parsed. */
export function formatIsoDate(iso: string): string {
  const time = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(time)) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(time);
}

/** True when a display date like "Dec 12, 2026" falls after the ISO reference date. */
export function isAfter(displayDate: string, referenceIso: string): boolean {
  const date = Date.parse(displayDate);
  const reference = Date.parse(`${referenceIso}T23:59:59Z`);
  if (Number.isNaN(date) || Number.isNaN(reference)) return false;
  return date > reference;
}

/** Sort key for display dates; unparseable dates sort last. */
export function dateValue(displayDate: string): number {
  const time = Date.parse(displayDate);
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}
