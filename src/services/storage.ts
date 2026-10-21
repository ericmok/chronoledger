import type { NoteItem, MonthNote, WeekNote, DrawingElement, CalendarSettings } from '../types/calendar';
import { createDefaultNotes, createDefaultWeekNotes, createDefaultMonthNotes } from './demoNotes';

export const STORAGE_VERSION = 3;

export const STORAGE_KEYS = {
  NOTES: 'chrono_ledger_notes_v1',
  WEEK_NOTES: 'chrono_ledger_week_notes_v1',
  MONTH_NOTES: 'chrono_ledger_month_notes_v1',
  DRAWINGS: 'chrono_ledger_drawings_v1',
  CIRCLED_DATES: 'chrono_ledger_circled_dates_v1',
  DELETED_CIRCLES: 'chrono_ledger_deleted_circles_v1',
  DELETED_IDS: 'chrono_ledger_deleted_ids_v1',
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
  circledDates?: Record<string, { color: string }>;
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
  loadCircledDates(): Record<string, { color: string }>;
  saveCircledDates(circledDates: Record<string, { color: string }>): void;
  loadDeletedCircleKeys(): Set<string>;
  saveDeletedCircleKeys(keys: Set<string>): void;
  addDeletedCircleKey(key: string): void;
  removeDeletedCircleKey(key: string): void;
  clearDeletedCircleKeys(): void;
  loadDeletedIds(): Set<string>;
  saveDeletedIds(keys: Set<string>): void;
  addDeletedId(id: string): void;
  removeDeletedId(id: string): void;
  clearDeletedIds(): void;
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
  badgeTheme: 'solid',
};

export { createDefaultNotes, createDefaultWeekNotes, createDefaultMonthNotes };

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

/**
 * Safe wrapper around localStorage.setItem that catches QuotaExceededError
 * and other storage quota exceptions without crashing the application.
 */
export function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`[ChronoLedger Storage] Failed to write key "${key}" to localStorage (quota or privacy mode):`, err);
    return false;
  }
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
    safeLocalStorageSet(STORAGE_KEYS.NOTES, JSON.stringify(notes));
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
    safeLocalStorageSet(STORAGE_KEYS.WEEK_NOTES, JSON.stringify(weekNotes));
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
    safeLocalStorageSet(STORAGE_KEYS.MONTH_NOTES, JSON.stringify(monthNotes));
  }

  loadDrawings(): DrawingElement[] {
    const raw = localStorage.getItem(STORAGE_KEYS.DRAWINGS);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      const notes = this.loadNotes();
      const migrated = migrateDrawingsV1ToV2(parsed, notes);

      // Permanently filter out any legacy circle drawings so they never persist in drawings store
      const cleanDrawings = migrated.filter((d) => d.type !== 'circle');
      if (cleanDrawings.length !== parsed.length) {
        this.saveDrawings(cleanDrawings);
      }

      const hadUnmigrated = parsed.some(
        (d) => d.type === 'arrow' && (!d.startAnchor || !d.endAnchor)
      );
      if (hadUnmigrated) {
        this.saveDrawings(cleanDrawings);
        safeLocalStorageSet(STORAGE_KEYS.SCHEMA_VERSION, String(STORAGE_VERSION));
      }

      return cleanDrawings;
    } catch {
      return [];
    }
  }

  saveDrawings(drawings: DrawingElement[]): void {
    const cleanDrawings = drawings.filter((d) => d.type !== 'circle');
    safeLocalStorageSet(STORAGE_KEYS.DRAWINGS, JSON.stringify(cleanDrawings));
  }

  loadCircledDates(): Record<string, { color: string }> {
    const raw = localStorage.getItem(STORAGE_KEYS.CIRCLED_DATES);
    let circled: Record<string, { color: string }> = {};
    const hasExistingCircledStore = raw !== null;

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          circled = parsed;
        }
      } catch {
        circled = {};
      }
    }

    // One-time auto-migration for legacy circle drawings found in local drawings store.
    // If the user already has a first-class circledDates store (hasExistingCircledStore is true),
    // NEVER resurrect previously deleted circles from drawings!
    const rawDrawings = localStorage.getItem(STORAGE_KEYS.DRAWINGS);
    if (rawDrawings) {
      try {
        const drawings = JSON.parse(rawDrawings);
        if (Array.isArray(drawings)) {
          const hasLegacyCircles = drawings.some((d: { type?: string }) => d.type === 'circle');
          if (hasLegacyCircles) {
            // Only seed circled dates if no circled store existed yet
            if (!hasExistingCircledStore || Object.keys(circled).length === 0) {
              for (const d of drawings) {
                if (d.type === 'circle' && d.anchorStartDate) {
                  if (!circled[d.anchorStartDate]) {
                    circled[d.anchorStartDate] = { color: d.color || '#D23B38' };
                  }
                }
              }
              this.saveCircledDates(circled);
            }
            // Permanently purge legacy circles from drawings store so they never re-appear
            const cleanDrawings = drawings.filter((d: { type?: string }) => d.type !== 'circle');
            safeLocalStorageSet(STORAGE_KEYS.DRAWINGS, JSON.stringify(cleanDrawings));
          }
        }
      } catch {
        // ignore parse error
      }
    }

    return circled;
  }

  saveCircledDates(circledDates: Record<string, { color: string }>): void {
    safeLocalStorageSet(STORAGE_KEYS.CIRCLED_DATES, JSON.stringify(circledDates));
  }

  loadDeletedCircleKeys(): Set<string> {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_CIRCLES);
    if (!raw) return new Set();
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((k) => typeof k === 'string'));
      }
    } catch {
      // ignore parse error
    }
    return new Set();
  }

  saveDeletedCircleKeys(keys: Set<string>): void {
    if (keys.size === 0) {
      localStorage.removeItem(STORAGE_KEYS.DELETED_CIRCLES);
    } else {
      safeLocalStorageSet(STORAGE_KEYS.DELETED_CIRCLES, JSON.stringify(Array.from(keys)));
    }
  }

  addDeletedCircleKey(key: string): void {
    const keys = this.loadDeletedCircleKeys();
    keys.add(key);
    this.saveDeletedCircleKeys(keys);
  }

  removeDeletedCircleKey(key: string): void {
    const keys = this.loadDeletedCircleKeys();
    if (keys.delete(key)) {
      this.saveDeletedCircleKeys(keys);
    }
  }

  clearDeletedCircleKeys(): void {
    localStorage.removeItem(STORAGE_KEYS.DELETED_CIRCLES);
  }

  loadDeletedIds(): Set<string> {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_IDS);
    if (!raw) return new Set();
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((k) => typeof k === 'string'));
      }
    } catch {
      // ignore parse error
    }
    return new Set();
  }

  saveDeletedIds(keys: Set<string>): void {
    if (keys.size === 0) {
      localStorage.removeItem(STORAGE_KEYS.DELETED_IDS);
    } else {
      safeLocalStorageSet(STORAGE_KEYS.DELETED_IDS, JSON.stringify(Array.from(keys)));
    }
  }

  addDeletedId(id: string): void {
    const keys = this.loadDeletedIds();
    keys.add(id);
    this.saveDeletedIds(keys);
  }

  removeDeletedId(id: string): void {
    const keys = this.loadDeletedIds();
    if (keys.delete(id)) {
      this.saveDeletedIds(keys);
    }
  }

  clearDeletedIds(): void {
    localStorage.removeItem(STORAGE_KEYS.DELETED_IDS);
  }

  loadSettings(): CalendarSettings {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    try {
      const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      // Fallback if legacy settings stored circle as active drawing tool
      if ((parsed.activeTool as string) === 'circle') {
        parsed.activeTool = 'select';
      }
      return parsed;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  saveSettings(settings: CalendarSettings): void {
    safeLocalStorageSet(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }

  exportBackup(): string {
    const backup: CalendarBackupData = {
      version: STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      notes: this.loadNotes(),
      weekNotes: this.loadWeekNotes(),
      monthNotes: this.loadMonthNotes(),
      drawings: this.loadDrawings(),
      circledDates: this.loadCircledDates(),
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
    const circledDates = parsed.circledDates && typeof parsed.circledDates === 'object' && !Array.isArray(parsed.circledDates)
      ? parsed.circledDates
      : {};

    const data: CalendarBackupData = {
      version: STORAGE_VERSION,
      exportedAt: parsed.exportedAt || new Date().toISOString(),
      notes,
      weekNotes: Array.isArray(parsed.weekNotes) ? parsed.weekNotes : [],
      monthNotes: Array.isArray(parsed.monthNotes) ? parsed.monthNotes : [],
      drawings: migratedDrawings,
      circledDates,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
    };

    this.saveNotes(data.notes);
    this.saveWeekNotes(data.weekNotes);
    this.saveMonthNotes(data.monthNotes);
    this.saveDrawings(data.drawings);
    this.saveCircledDates(data.circledDates || {});
    this.saveSettings(data.settings);
    safeLocalStorageSet(STORAGE_KEYS.SCHEMA_VERSION, String(STORAGE_VERSION));

    return data;
  }
}

export const storage = new LocalStorageAdapter();

export interface RemoteCalendarResponse {
  notes: NoteItem[];
  weekNotes: WeekNote[];
  monthNotes: MonthNote[];
  drawings: DrawingElement[];
  circledDates?: Record<string, { color: string }>;
  settings: CalendarSettings | null;
  syncedAt: string | null;
  schemaVersion: number;
  hasData: boolean;
}

export interface CalendarDeltaPayload {
  notes?: {
    upsert?: NoteItem[];
    delete?: string[];
  };
  weekNotes?: {
    upsert?: WeekNote[];
    delete?: string[];
  };
  monthNotes?: {
    upsert?: MonthNote[];
    delete?: string[];
  };
  drawings?: {
    upsert?: DrawingElement[];
    delete?: string[];
  };
  circledDates?: {
    upsert?: Record<string, { color: string }>;
    delete?: string[];
  };
  settings?: CalendarSettings;
}

export async function fetchRemoteCalendar(): Promise<RemoteCalendarResponse | null> {
  try {
    const res = await fetch('/api/calendar', {
      credentials: 'include',
    });
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
  circledDates?: Record<string, { color: string }>;
  settings: CalendarSettings;
}): Promise<{ ok: boolean; syncedAt?: string } | null> {
  try {
    const res = await fetch('/api/calendar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    return (await res.json()) as { ok: boolean; syncedAt?: string };
  } catch (err) {
    console.debug('Failed to save to SQLite server:', err);
    return null;
  }
}

export async function saveRemoteCalendarDelta(
  delta: CalendarDeltaPayload
): Promise<{ ok: boolean; syncedAt?: string } | null> {
  try {
    const res = await fetch('/api/calendar/delta', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(delta),
    });
    if (!res.ok) return null;
    return (await res.json()) as { ok: boolean; syncedAt?: string };
  } catch (err) {
    console.debug('Failed to save delta to SQLite server:', err);
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

