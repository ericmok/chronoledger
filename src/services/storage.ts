import type { NoteItem, MonthNote, WeekNote, DrawingElement, CalendarSettings } from '../types/calendar';
import { formatDateKey, getWeekKey } from '../utils/dateUtils';

export const STORAGE_VERSION = 1;

export const STORAGE_KEYS = {
  NOTES: 'chrono_ledger_notes_v1',
  WEEK_NOTES: 'chrono_ledger_week_notes_v1',
  MONTH_NOTES: 'chrono_ledger_month_notes_v1',
  DRAWINGS: 'chrono_ledger_drawings_v1',
  SETTINGS: 'chrono_ledger_settings_v1',
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
      return Array.isArray(parsed) ? parsed : [];
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

    const data: CalendarBackupData = {
      version: parsed.version || STORAGE_VERSION,
      exportedAt: parsed.exportedAt || new Date().toISOString(),
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      weekNotes: Array.isArray(parsed.weekNotes) ? parsed.weekNotes : [],
      monthNotes: Array.isArray(parsed.monthNotes) ? parsed.monthNotes : [],
      drawings: Array.isArray(parsed.drawings) ? parsed.drawings : [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
    };

    this.saveNotes(data.notes);
    this.saveWeekNotes(data.weekNotes);
    this.saveMonthNotes(data.monthNotes);
    this.saveDrawings(data.drawings);
    this.saveSettings(data.settings);

    return data;
  }
}

export const storage = new LocalStorageAdapter();

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
