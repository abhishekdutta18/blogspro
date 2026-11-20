/**
 * slot.js — the IST hour a briefing belongs to. The id is deterministic, so re-running
 * the same hour overwrites that hour's briefing instead of adding a duplicate.
 */

const IST = 'Asia/Kolkata';

/** @param {number} now epoch ms */
function istParts(now) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(now));
  return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}

/**
 * @param {number} now epoch ms
 * @returns {{id: string, label: string, date: string, hour: number}}
 */
export function hourlySlot(now) {
  const { year, month, day, hour } = istParts(now);
  const date = `${year}-${month}-${day}`;
  const monthName = new Intl.DateTimeFormat('en-GB', { timeZone: IST, month: 'short' }).format(new Date(now));
  return {
    id: `H_${date}_${hour}`,
    label: `${hour}:00 IST, ${Number(day)} ${monthName} ${year}`,
    date,
    hour: Number(hour)
  };
}
