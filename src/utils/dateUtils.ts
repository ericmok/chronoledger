import type { DateItem, WeekStartDay } from '../types/calendar';


export const DAY_LETTERS = ['S', 'M', 'T', 'W', 'Th', 'F', 'Sa'];

export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Formats a Date object to YYYY-MM-DD string
 */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Calculates standard ISO week number
 */
export function getWeekNumber(date: Date, weekStartsOn: WeekStartDay = 0): number {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() - weekStartsOn + 7) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

/**
 * Formats a week key string: YYYY-Www
 */
export function getWeekKey(date: Date, weekStartsOn: WeekStartDay = 0): string {
  const year = date.getFullYear();
  const weekNum = getWeekNumber(date, weekStartsOn);
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}


/**
 * Parses YYYY-MM-DD string to local Date
 */
export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Creates a DateItem representation for a specific calendar date
 */
export function createDateItem(date: Date, weekStartsOn: WeekStartDay = 0, todayKey?: string): DateItem {
  const dateString = formatDateKey(date);
  const currentTodayKey = todayKey || formatDateKey(new Date());
  const dayOfWeek = date.getDay(); // 0 = Sun ... 6 = Sat
  const dayOfMonth = date.getDate();
  const monthIndex = date.getMonth();

  // If week starts on Sunday (0), week end is Saturday (6).
  // If week starts on Monday (1), week end is Sunday (0).
  const isWeekEnd = weekStartsOn === 0 ? dayOfWeek === 6 : dayOfWeek === 0;

  return {
    dateString,
    year: date.getFullYear(),
    monthIndex,
    monthName: MONTH_NAMES[monthIndex],
    dayOfMonth,
    dayOfWeek,
    dayOfWeekLetter: DAY_LETTERS[dayOfWeek],
    isWeekEnd,
    isFirstDayOfMonth: dayOfMonth === 1,
    isToday: dateString === currentTodayKey,
    epochDay: Math.floor(date.getTime() / (1000 * 60 * 60 * 24)),
  };
}

/**
 * Generates an array of DateItems centered around a reference date
 */
export function generateDateRange(
  centerDate: Date,
  daysBefore: number = 180,
  daysAfter: number = 365,
  weekStartsOn: WeekStartDay = 0
): DateItem[] {
  const items: DateItem[] = [];
  const todayKey = formatDateKey(new Date());

  const start = new Date(centerDate);
  start.setDate(start.getDate() - daysBefore);

  const totalDays = daysBefore + daysAfter;
  for (let i = 0; i <= totalDays; i++) {
    const current = new Date(start);
    current.setDate(current.getDate() + i);
    items.push(createDateItem(current, weekStartsOn, todayKey));
  }

  return items;
}

/**
 * Determines whether an array of ISO date strings are contiguous
 */
export function analyzeDateSpan(dates: string[]): {
  isContiguous: boolean;
  sortedDates: string[];
  startDate: string;
  endDate: string;
  count: number;
} {
  if (dates.length === 0) {
    return { isContiguous: true, sortedDates: [], startDate: '', endDate: '', count: 0 };
  }

  const sortedDates = [...dates].sort();
  const startDate = sortedDates[0];
  const endDate = sortedDates[sortedDates.length - 1];

  if (dates.length <= 1) {
    return { isContiguous: true, sortedDates, startDate, endDate, count: dates.length };
  }

  let isContiguous = true;
  for (let i = 0; i < sortedDates.length - 1; i++) {
    const d1 = parseDateKey(sortedDates[i]);
    const d2 = parseDateKey(sortedDates[i + 1]);
    const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays !== 1) {
      isContiguous = false;
      break;
    }
  }

  return { isContiguous, sortedDates, startDate, endDate, count: dates.length };
}

export interface WeekBlock {
  weekKey: string;
  weekNumber: number;
  year: number;
  startDate: DateItem;
  endDate: DateItem;
  label: string;
  days: DateItem[];
  containsToday: boolean;
}

/**
 * Groups DateItems into continuous 7-day WeekBlocks
 */
export function groupDatesIntoWeeks(dates: DateItem[], weekStartsOn: WeekStartDay = 0): WeekBlock[] {
  const blocks: WeekBlock[] = [];
  let currentDays: DateItem[] = [];

  for (let i = 0; i < dates.length; i++) {
    currentDays.push(dates[i]);

    if (dates[i].isWeekEnd || i === dates.length - 1) {
      const first = currentDays[0];
      const last = currentDays[currentDays.length - 1];
      const d = parseDateKey(first.dateString);
      const weekNum = getWeekNumber(d, weekStartsOn);
      const weekKey = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
      const containsToday = currentDays.some((day) => day.isToday);

      const label = `Week ${weekNum} · ${first.monthName} ${first.dayOfMonth} – ${last.monthName} ${last.dayOfMonth}`;

      blocks.push({
        weekKey,
        weekNumber: weekNum,
        year: d.getFullYear(),
        startDate: first,
        endDate: last,
        label,
        days: currentDays,
        containsToday,
      });

      currentDays = [];
    }
  }

  return blocks;
}

/**
 * Determines whether an array of week keys (YYYY-Www) are contiguous
 */
export function analyzeWeekSpan(weeks: string[], availableWeeks?: { weekKey: string }[]): {
  isContiguous: boolean;
  sortedWeeks: string[];
  startWeek: string;
  endWeek: string;
  count: number;
} {
  if (weeks.length === 0) {
    return { isContiguous: true, sortedWeeks: [], startWeek: '', endWeek: '', count: 0 };
  }

  const sortedWeeks = [...weeks].sort();
  const startWeek = sortedWeeks[0];
  const endWeek = sortedWeeks[sortedWeeks.length - 1];

  if (weeks.length <= 1) {
    return { isContiguous: true, sortedWeeks, startWeek, endWeek, count: weeks.length };
  }

  if (availableWeeks && availableWeeks.length > 0) {
    const indices = sortedWeeks.map((w) => availableWeeks.findIndex((b) => b.weekKey === w));
    if (indices.every((idx) => idx !== -1)) {
      const orderedIndices = [...indices].sort((a, b) => a - b);
      let isContiguous = true;
      for (let i = 0; i < orderedIndices.length - 1; i++) {
        if (orderedIndices[i + 1] - orderedIndices[i] !== 1) {
          isContiguous = false;
          break;
        }
      }
      return { isContiguous, sortedWeeks, startWeek, endWeek, count: weeks.length };
    }
  }

  let isContiguous = true;
  for (let i = 0; i < sortedWeeks.length - 1; i++) {
    const [y1, w1] = sortedWeeks[i].split('-W').map(Number);
    const [y2, w2] = sortedWeeks[i + 1].split('-W').map(Number);
    if (y1 === y2) {
      if (w2 - w1 !== 1) {
        isContiguous = false;
        break;
      }
    } else if (y2 - y1 === 1) {
      if (w2 !== 1 || (w1 !== 52 && w1 !== 53)) {
        isContiguous = false;
        break;
      }
    } else {
      isContiguous = false;
      break;
    }
  }

  return { isContiguous, sortedWeeks, startWeek, endWeek, count: weeks.length };
}

/**
 * Determines whether an array of month keys (YYYY-MM) are contiguous
 */
export function analyzeMonthSpan(months: string[]): {
  isContiguous: boolean;
  sortedMonths: string[];
  startMonth: string;
  endMonth: string;
  count: number;
} {
  if (months.length === 0) {
    return { isContiguous: true, sortedMonths: [], startMonth: '', endMonth: '', count: 0 };
  }

  const sortedMonths = [...months].sort();
  const startMonth = sortedMonths[0];
  const endMonth = sortedMonths[sortedMonths.length - 1];

  if (months.length <= 1) {
    return { isContiguous: true, sortedMonths, startMonth, endMonth, count: months.length };
  }

  let isContiguous = true;
  for (let i = 0; i < sortedMonths.length - 1; i++) {
    const [y1, m1] = sortedMonths[i].split('-').map(Number);
    const [y2, m2] = sortedMonths[i + 1].split('-').map(Number);
    const diff = (y2 * 12 + m2) - (y1 * 12 + m1);
    if (diff !== 1) {
      isContiguous = false;
      break;
    }
  }

  return { isContiguous, sortedMonths, startMonth, endMonth, count: months.length };
}

