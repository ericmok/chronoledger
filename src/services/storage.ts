import type { NoteItem, MonthNote, WeekNote, DrawingElement, CalendarSettings } from '../types/calendar';
import { formatDateKey, getWeekKey } from '../utils/dateUtils';

export const STORAGE_VERSION = 2;

export const STORAGE_KEYS = {
  NOTES: 'chrono_ledger_notes_v1',
  WEEK_NOTES: 'chrono_ledger_week_notes_v1',
  MONTH_NOTES: 'chrono_ledger_month_notes_v1',
  DRAWINGS: 'chrono_ledger_drawings_v1',
  SETTINGS: 'chrono_ledger_settings_v1',
  SCHEMA_VERSION: 'chrono_ledger_schema_version',
} as const;

export interface CalendarBackupData {
  version: number;
  exportedAt: string;
  notes: NoteItem[];
  weekNotes: WeekNote[];
  monthNotes: MonthNote[];
  drawings: DrawingElement[];
  settings: CalendarSettings;
}

export interface CalendarStorage {
  loadNotes(): NoteItem[];
  saveNotes(notes: NoteItem[]): void;
  loadWeekNotes(): WeekNote[];
  saveWeekNotes(weekNotes: WeekNote[]): void;
  loadMonthNotes(): MonthNote[];
  saveMonthNotes(monthNotes: MonthNote[]): void;
  loadDrawings(): DrawingElement[];
  saveDrawings(drawings: DrawingElement[]): void;
  loadSettings(): CalendarSettings;
  saveSettings(settings: CalendarSettings): void;
  exportBackup(): string;
  importBackup(jsonString: string): CalendarBackupData;
}

export const DEFAULT_SETTINGS: CalendarSettings = {
  weekStartsOn: 0,
  showStruckItems: true,
  activeTool: 'select',
  inkColor: '#2B2C30',
};

export function createDefaultNotes(): NoteItem[] {
  const today = new Date();
  const todayStr = formatDateKey(today);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = formatDateKey(tomorrow);

  const dayAfter = new Date(today);
  dayAfter.setDate(today.getDate() + 2);
  const dayAfterStr = formatDateKey(dayAfter);

  const nextWeek1 = new Date(today);
  nextWeek1.setDate(today.getDate() + 5);
  const nextWeek1Str = formatDateKey(nextWeek1);

  const nextWeek2 = new Date(today);
  nextWeek2.setDate(today.getDate() + 7);
  const nextWeek2Str = formatDateKey(nextWeek2);

  return [
    {
      id: 'demo-1',
      originalContent: 'Review quarterly architecture plan',
      content: 'Review quarterly architecture and security plan with team',
      parentDates: [todayStr],
      isStruck: false,
      colorTag: '#E29578',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'demo-2',
      content: 'Draft proposal for client team',
      parentDates: [todayStr],
      isStruck: true,
      strikeStyle: 'single',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'demo-3',
      content: 'Tokyo Design & Engineering Offsite',
      parentDates: [tomorrowStr, dayAfterStr],
      isStruck: false,
      colorTag: '#83C5BE',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'demo-4',
      content: 'Milestone Preparation & Sync',
      parentDates: [nextWeek1Str, nextWeek2Str],
      isStruck: false,
      colorTag: '#E9C46A',
      createdAt: new Date().toISOString(),
    },
  ];
}

export function createDefaultWeekNotes(): WeekNote[] {
  const today = new Date();
  const currentWeekKey = getWeekKey(today, 0);

  const nextWeekDate = new Date(today);
  nextWeekDate.setDate(today.getDate() + 7);
  const nextWeekKey = getWeekKey(nextWeekDate, 0);

  return [
    {
      id: 'wnote-1',
      content: 'Week 42 Focus: 3-Tier temporal planning (Day → Week → Month)',
      parentWeeks: [currentWeekKey],
      isStruck: false,
      colorTag: '#E29578',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'wnote-2',
      content: '2-Week Sprint (Spanning W42 – W43)',
      parentWeeks: [currentWeekKey, nextWeekKey],
      isStruck: false,
      colorTag: '#83C5BE',
      createdAt: new Date().toISOString(),
    },
  ];
}

export function createDefaultMonthNotes(): MonthNote[] {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const thisMonthKey = `${y}-${m}`;

  const nextMonthDate = new Date(y, today.getMonth() + 1, 1);
  const nextMonthKey = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const monthAfterDate = new Date(y, today.getMonth() + 2, 1);
  const monthAfterKey = `${monthAfterDate.getFullYear()}-${String(monthAfterDate.getMonth() + 1).padStart(2, '0')}`;

  return [
    {
      id: 'mnote-1',
      content: 'October Focus: Ship continuous jigsaw calendar',
      parentMonths: [thisMonthKey],
      isStruck: false,
      colorTag: '#E29578',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'mnote-2',
      content: 'Q4 Product Initiative (Spanning Oct – Dec)',
      parentMonths: [thisMonthKey, nextMonthKey, monthAfterKey],
      isStruck: false,
      colorTag: '#83C5BE',
      createdAt: new Date().toISOString(),
    },
  ];
}

/**
 * Disciplined data migration from v1 (raw desktop pixel offsets) to v2 (semantic responsive anchors).
 * Idempotent, deterministic, and non-destructive (retains original offsets).
 */
export function migrateDrawingsV1ToV2(
  rawDrawings: DrawingElement[],
  notes: NoteItem[] = []
): DrawingElement[] {
  // Baseline geometry of the desktop notes column:
  // In a standard 1024px container: left margin to notes area is ~204px, width is ~468px.
  const BASELINE_COL_LEFT = 204;
  const BASELINE_COL_WIDTH = 468;

  const notesByDate = new Map<string, NoteItem[]>();
  for (const n of notes) {
    for (const d of n.parentDates) {
      const list = notesByDate.get(d) || [];
      list.push(n);
      notesByDate.set(d, list);
    }
  }

  let migratedCount = 0;

  const migrated = rawDrawings.map((d) => {
    if (d.type !== 'arrow') return d;
    // Already has both anchors: idempotent no-op
    if (d.startAnchor && d.endAnchor) return d;

    migratedCount++;
    const startXRatio = Math.max(
      0.05,
      Math.min(0.95, (d.startOffset.x - BASELINE_COL_LEFT) / BASELINE_COL_WIDTH)
    );
    const endX = d.endOffset ? d.endOffset.x : d.startOffset.x;
    const endXRatio = Math.max(
      0.05,
      Math.min(0.95, (endX - BASELINE_COL_LEFT) / BASELINE_COL_WIDTH)
    );

    const startNotes = notesByDate.get(d.anchorStartDate) || [];
    const endNotes = d.anchorEndDate ? notesByDate.get(d.anchorEndDate) || [] : [];

    const startNoteId = startNotes.length > 0 ? startNotes[0].id : undefined;
    const endNoteId = endNotes.length > 0 ? endNotes[0].id : undefined;

    return {
      ...d,
      startAnchor: d.startAnchor || {
        dateString: d.anchorStartDate,
        noteId: startNoteId,
        xRatio: Number(startXRatio.toFixed(3)),
        yRatio: 0.5,
      },
      endAnchor: d.endAnchor || {
        dateString: d.anchorEndDate || d.anchorStartDate,
        noteId: endNoteId,
        xRatio: Number(endXRatio.toFixed(3)),
        yRatio: 0.5,
      },
    };
  });

  if (migratedCount > 0) {
    console.info(`[ChronoLedger Migration] Successfully migrated ${migratedCount} legacy arrows to schema v2.`);
  }

  return migrated;
}

export class LocalStorageAdapter implements CalendarStorage {
  loadNotes(): NoteItem[] {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTES);
    if (!raw) return createDefaultNotes();
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : createDefaultNotes();
    } catch {
      return createDefaultNotes();
    }
  }

  saveNotes(notes: NoteItem[]): void {
    localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(notes));
  }

  loadWeekNotes(): WeekNote[] {
    const raw = localStorage.getItem(STORAGE_KEYS.WEEK_NOTES);
    if (!raw) return createDefaultWeekNotes();
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : createDefaultWeekNotes();
    } catch {
      return createDefaultWeekNotes();
    }
  }

  saveWeekNotes(weekNotes: WeekNote[]): void {
    localStorage.setItem(STORAGE_KEYS.WEEK_NOTES, JSON.stringify(weekNotes));
  }

  loadMonthNotes(): MonthNote[] {
    const raw = localStorage.getItem(STORAGE_KEYS.MONTH_NOTES);
    if (!raw) return createDefaultMonthNotes();
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : createDefaultMonthNotes();
    } catch {
      return createDefaultMonthNotes();
    }
  }

  saveMonthNotes(monthNotes: MonthNote[]): void {
    localStorage.setItem(STORAGE_KEYS.MONTH_NOTES, JSON.stringify(monthNotes));
  }

  loadDrawings(): DrawingElement[] {
    const raw = localStorage.getItem(STORAGE_KEYS.DRAWINGS);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      const notes = this.loadNotes();
      const migrated = migrateDrawingsV1ToV2(parsed, notes);

      const hadUnmigrated = parsed.some(
        (d) => d.type === 'arrow' && (!d.startAnchor || !d.endAnchor)
      );
      if (hadUnmigrated) {
        this.saveDrawings(migrated);
        localStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, String(STORAGE_VERSION));
      }

      return migrated;
    } catch {
      return [];
    }
  }

  saveDrawings(drawings: DrawingElement[]): void {
    localStorage.setItem(STORAGE_KEYS.DRAWINGS, JSON.stringify(drawings));
  }

  loadSettings(): CalendarSettings {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  saveSettings(settings: CalendarSettings): void {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }

  exportBackup(): string {
    const backup: CalendarBackupData = {
      version: STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      notes: this.loadNotes(),
      weekNotes: this.loadWeekNotes(),
      monthNotes: this.loadMonthNotes(),
      drawings: this.loadDrawings(),
      settings: this.loadSettings(),
    };
    return JSON.stringify(backup, null, 2);
  }

  importBackup(jsonString: string): CalendarBackupData {
    const parsed = JSON.parse(jsonString) as Partial<CalendarBackupData>;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid backup file: not a JSON object');
    }

    const notes = Array.isArray(parsed.notes) ? parsed.notes : [];
    const rawDrawings = Array.isArray(parsed.drawings) ? parsed.drawings : [];
    const migratedDrawings = migrateDrawingsV1ToV2(rawDrawings, notes);

    const data: CalendarBackupData = {
      version: STORAGE_VERSION,
      exportedAt: parsed.exportedAt || new Date().toISOString(),
      notes,
      weekNotes: Array.isArray(parsed.weekNotes) ? parsed.weekNotes : [],
      monthNotes: Array.isArray(parsed.monthNotes) ? parsed.monthNotes : [],
      drawings: migratedDrawings,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
    };

    this.saveNotes(data.notes);
    this.saveWeekNotes(data.weekNotes);
    this.saveMonthNotes(data.monthNotes);
    this.saveDrawings(data.drawings);
    this.saveSettings(data.settings);
    localStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, String(STORAGE_VERSION));

    return data;
  }
}

export const storage = new LocalStorageAdapter();

export interface RemoteCalendarResponse {
  notes: NoteItem[];
  weekNotes: WeekNote[];
  monthNotes: MonthNote[];
  drawings: DrawingElement[];
  settings: CalendarSettings | null;
  syncedAt: string | null;
  schemaVersion: number;
  hasData: boolean;
}

export async function fetchRemoteCalendar(): Promise<RemoteCalendarResponse | null> {
  try {
    const res = await fetch('/api/calendar');
    if (!res.ok) return null;
    return (await res.json()) as RemoteCalendarResponse;
  } catch (err) {
    console.debug('SQLite server not reachable or offline:', err);
    return null;
  }
}

export async function saveRemoteCalendar(data: {
  notes: NoteItem[];
  weekNotes: WeekNote[];
  monthNotes: MonthNote[];
  drawings: DrawingElement[];
  settings: CalendarSettings;
}): Promise<{ ok: boolean; syncedAt?: string } | null> {
  try {
    const res = await fetch('/api/calendar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    return (await res.json()) as { ok: boolean; syncedAt?: string };
  } catch (err) {
    console.debug('Failed to save to SQLite server:', err);
    return null;
  }
}

export function downloadJsonFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function readJsonFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      resolve(text);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsText(file);
  });
}

