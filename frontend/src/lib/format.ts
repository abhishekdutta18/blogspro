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
