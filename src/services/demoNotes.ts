import type { NoteItem, WeekNote, MonthNote } from '../types/calendar';
import { formatDateKey, getWeekKey } from '../utils/dateUtils';

export interface DayNoteBlueprint {
  id: string;
  content: string;
  originalContent?: string;
  isStruck?: boolean;
  strikeStyle?: 'single' | 'double' | 'scribble';
  colorTag?: string;
  dayOffsets: number[]; // Relative offset in days from today (0 = today, 1 = tomorrow, etc.)
}

export interface WeekNoteBlueprint {
  id: string;
  content: string;
  originalContent?: string;
  isStruck?: boolean;
  strikeStyle?: 'single' | 'double' | 'scribble';
  colorTag?: string;
  weekOffsets: number[]; // Relative offset in weeks from current week (0 = this week, 1 = next week, etc.)
}

export interface MonthNoteBlueprint {
  id: string;
  content: string;
  originalContent?: string;
  isStruck?: boolean;
  strikeStyle?: 'single' | 'double' | 'scribble';
  colorTag?: string;
  monthOffsets: number[]; // Relative offset in months from current month (0 = this month, 1 = next month, etc.)
}

export const DEMO_DAY_NOTE_BLUEPRINTS: readonly DayNoteBlueprint[] = [
  {
    id: 'demo-1',
    originalContent: 'Review quarterly architecture plan',
    content: 'Review quarterly architecture and security plan with team @important',
    dayOffsets: [0],
    isStruck: false,
  },
  {
    id: 'demo-2',
    content: 'Finalize server migration roadmap @important',
    dayOffsets: [0],
    isStruck: false,
  },
  {
    id: 'demo-3',
    content: 'Tokyo Design & Engineering Offsite @4:00pm',
    dayOffsets: [1, 2],
    isStruck: false,
  },
  {
    id: 'demo-4',
    content: 'Draft proposal for client team @wait on legal team brief',
    dayOffsets: [1],
    isStruck: false,
  },
  {
    id: 'demo-5',
    content: 'Explore zero-latency state sync @explore',
    dayOffsets: [2],
    isStruck: false,
  },
  {
    id: 'demo-6',
    content: 'The simplest abstractions are discovered, not designed @thought',
    dayOffsets: [5],
    isStruck: false,
  },
  {
    id: 'demo-7',
    content: 'Completed initial user interviews @skipped',
    dayOffsets: [0],
    isStruck: true,
    strikeStyle: 'single',
  },
];

export const DEMO_WEEK_NOTE_BLUEPRINTS: readonly WeekNoteBlueprint[] = [
  {
    id: 'wnote-1',
    content: 'Week 42 Focus: 3-Tier temporal planning (Day → Week → Month)',
    weekOffsets: [0],
    isStruck: false,
    colorTag: '#E29578',
  },
  {
    id: 'wnote-2',
    content: '2-Week Sprint (Spanning W42 – W43)',
    weekOffsets: [0, 1],
    isStruck: false,
    colorTag: '#83C5BE',
  },
  {
    id: 'wnote-3',
    content: 'Feature: Search & filter all @todo notes across timeline (Cmd+K / Ledger drawer) @todo @explore',
    weekOffsets: [0],
    isStruck: false,
    colorTag: '#EADA25',
  },
];

export const DEMO_MONTH_NOTE_BLUEPRINTS: readonly MonthNoteBlueprint[] = [
  {
    id: 'mnote-1',
    content: 'October Focus: Ship continuous jigsaw calendar',
    monthOffsets: [0],
    isStruck: false,
    colorTag: '#E29578',
  },
  {
    id: 'mnote-2',
    content: 'Q4 Product Initiative (Spanning Oct – Dec)',
    monthOffsets: [0, 1, 2],
    isStruck: false,
    colorTag: '#83C5BE',
  },
];

/**
 * Canonical dictionary mapping demo note IDs to their initial pristine content & struck state.
 * Automatically computed from the blueprints above — zero manual duplication.
 */
const ALL_DEMO_BLUEPRINTS: readonly (DayNoteBlueprint | WeekNoteBlueprint | MonthNoteBlueprint)[] = [
  ...DEMO_DAY_NOTE_BLUEPRINTS,
  ...DEMO_WEEK_NOTE_BLUEPRINTS,
  ...DEMO_MONTH_NOTE_BLUEPRINTS,
];

const DEMO_BLUEPRINT_MAP = new Map<string, { content: string; isStruck: boolean }>(
  ALL_DEMO_BLUEPRINTS.map((bp) => [
    bp.id,
    { content: bp.content.trim(), isStruck: Boolean(bp.isStruck) },
  ])
);

/**
 * Generates initial starter notes for guest sandbox mode.
 */
export function createDefaultNotes(): NoteItem[] {
  const now = new Date();
  const nowIso = now.toISOString();

  return DEMO_DAY_NOTE_BLUEPRINTS.map((bp) => {
    const parentDates = bp.dayOffsets.map((offset) => {
      const d = new Date(now);
      d.setDate(now.getDate() + offset);
      return formatDateKey(d);
    });

    return {
      id: bp.id,
      content: bp.content,
      originalContent: bp.originalContent,
      scope: 'day',
      targets: parentDates,
      parentDates,
      isStruck: Boolean(bp.isStruck),
      strikeStyle: bp.strikeStyle,
      colorTag: bp.colorTag,
      createdAt: nowIso,
      updatedAt: bp.originalContent ? nowIso : undefined,
    };
  });
}

/**
 * Generates initial week notes for guest sandbox mode.
 */
export function createDefaultWeekNotes(): WeekNote[] {
  const now = new Date();
  const nowIso = now.toISOString();

  return DEMO_WEEK_NOTE_BLUEPRINTS.map((bp) => {
    const parentWeeks = bp.weekOffsets.map((offset) => {
      const d = new Date(now);
      d.setDate(now.getDate() + offset * 7);
      return getWeekKey(d, 0);
    });

    return {
      id: bp.id,
      content: bp.content,
      originalContent: bp.originalContent,
      scope: 'week',
      targets: parentWeeks,
      parentWeeks,
      isStruck: Boolean(bp.isStruck),
      strikeStyle: bp.strikeStyle,
      colorTag: bp.colorTag,
      createdAt: nowIso,
    };
  });
}

/**
 * Generates initial month notes for guest sandbox mode.
 */
export function createDefaultMonthNotes(): MonthNote[] {
  const now = new Date();
  const nowIso = now.toISOString();

  return DEMO_MONTH_NOTE_BLUEPRINTS.map((bp) => {
    const parentMonths = bp.monthOffsets.map((offset) => {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    });

    return {
      id: bp.id,
      content: bp.content,
      originalContent: bp.originalContent,
      scope: 'month',
      targets: parentMonths,
      parentMonths,
      isStruck: Boolean(bp.isStruck),
      strikeStyle: bp.strikeStyle,
      colorTag: bp.colorTag,
      createdAt: nowIso,
    };
  });
}

/**
 * Returns true if an item matches its initial demo blueprint exactly
 * (same text content and same struck status).
 */
export function isUntouchedDemoNote(item: { id: string; content: string; isStruck?: boolean }): boolean {
  const blueprint = DEMO_BLUEPRINT_MAP.get(item.id);
  if (!blueprint) return false;
  return item.content.trim() === blueprint.content && Boolean(item.isStruck) === blueprint.isStruck;
}

/**
 * Filters out untouched demo notes, and promotes any edited demo notes to a fresh
 * collision-resistant unique ID so they safely merge into SQLite.
 */
export function filterAndPromoteGuestNotes<T extends { id: string; content: string; isStruck?: boolean }>(
  items: T[],
  idPrefix: string
): T[] {
  return items
    .filter((item) => !isUntouchedDemoNote(item))
    .map((item) => {
      if (DEMO_BLUEPRINT_MAP.has(item.id)) {
        return {
          ...item,
          id: `${idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        };
      }
      return item;
    });
}
