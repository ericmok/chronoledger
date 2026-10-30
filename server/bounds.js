/**
 * Temporal bounds and ISO calendar calculation utilities.
 * Pure mathematical / calendar date functions without database dependencies.
 */

export function getIsoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function getIsoWeekBounds(weekKey) {
  const match = String(weekKey || '').match(/^(\d{4})-W(\d{2})$/);
  if (!match) {
    const now = new Date();
    return {
      startAt: `${now.toISOString().slice(0, 10)}T00:00:00.000Z`,
      endAt: `${now.toISOString().slice(0, 10)}T23:59:59.999Z`,
    };
  }
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monWeek1 = new Date(jan4.getTime() - (dayOfWeek - 1) * 86400000);
  const monTarget = new Date(monWeek1.getTime() + (week - 1) * 7 * 86400000);
  const sunTarget = new Date(monTarget.getTime() + 6 * 86400000);

  const startAt = monTarget.toISOString().slice(0, 10) + 'T00:00:00.000Z';
  const endAt = sunTarget.toISOString().slice(0, 10) + 'T23:59:59.999Z';
  return { startAt, endAt };
}

/**
 * Calculates normalized ISO-8601 UTC start and end bounding timestamps for a given temporal scope and target array.
 * Enables high-speed multi-year range queries and calendar view bounding.
 * 
 * @param {'time' | 'day' | 'week' | 'month' | 'year' | 'span'} scope 
 * @param {string[]} targets Array of target keys (e.g. ['2026-10-23'], ['2026-W43'], ['2026-10'])
 * @returns {{ startAt: string, endAt: string }}
 */
export function calculateBounds(scope, targets) {
  const targetList = Array.isArray(targets) ? targets : [];
  if (targetList.length === 0) {
    const now = new Date().toISOString();
    return { startAt: now, endAt: now };
  }

  if (scope === 'day' || scope === 'time') {
    const sorted = [...targetList].sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const startDate = first.includes('T') ? first.slice(0, 10) : first;
    const endDate = last.includes('T') ? last.slice(0, 10) : last;
    const startTime = first.includes('T') ? first.slice(11, 19) : '00:00:00';
    const endTime = last.includes('T') ? last.slice(11, 19) : '23:59:59';
    return {
      startAt: `${startDate}T${startTime}.000Z`,
      endAt: `${endDate}T${endTime}.999Z`,
    };
  }

  if (scope === 'week') {
    const sorted = [...targetList].sort();
    const firstBounds = getIsoWeekBounds(sorted[0]);
    const lastBounds = getIsoWeekBounds(sorted[sorted.length - 1]);
    return {
      startAt: firstBounds.startAt,
      endAt: lastBounds.endAt,
    };
  }

  if (scope === 'month') {
    const sorted = [...targetList].sort();
    const firstMatch = String(sorted[0] || '').match(/^(\d{4})-(\d{2})$/);
    const lastMatch = String(sorted[sorted.length - 1] || '').match(/^(\d{4})-(\d{2})$/);
    if (!firstMatch || !lastMatch) {
      const now = new Date().toISOString();
      return { startAt: now, endAt: now };
    }
    const startYear = parseInt(firstMatch[1], 10);
    const startMonth = parseInt(firstMatch[2], 10) - 1;
    const endYear = parseInt(lastMatch[1], 10);
    const endMonth = parseInt(lastMatch[2], 10);
    const startAt = new Date(Date.UTC(startYear, startMonth, 1, 0, 0, 0, 0)).toISOString();
    const endAt = new Date(Date.UTC(endYear, endMonth, 0, 23, 59, 59, 999)).toISOString();
    return { startAt, endAt };
  }

  if (scope === 'year') {
    const sorted = [...targetList].sort();
    const firstYear = parseInt(sorted[0], 10) || new Date().getFullYear();
    const lastYear = parseInt(sorted[sorted.length - 1], 10) || firstYear;
    return {
      startAt: `${firstYear}-01-01T00:00:00.000Z`,
      endAt: `${lastYear}-12-31T23:59:59.999Z`,
    };
  }

  const now = new Date().toISOString();
  return { startAt: now, endAt: now };
}
