import { useState, useEffect } from 'react';
import type { NoteItem, MonthNote, WeekNote, DrawingElement, CalendarSettings } from '../types/calendar';
import { formatDateKey, getWeekKey } from '../utils/dateUtils';

const STORAGE_KEY_NOTES = 'chrono_ledger_notes_v1';
const STORAGE_KEY_WEEK_NOTES = 'chrono_ledger_week_notes_v1';
const STORAGE_KEY_MONTH_NOTES = 'chrono_ledger_month_notes_v1';
const STORAGE_KEY_DRAWINGS = 'chrono_ledger_drawings_v1';
const STORAGE_KEY_SETTINGS = 'chrono_ledger_settings_v1';

// Seed demo data matching user sketch (around October 2026)
function getInitialNotes(): NoteItem[] {
  const saved = localStorage.getItem(STORAGE_KEY_NOTES);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // fallback
    }
  }

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
      content: 'Review quarterly architecture plan',
      parentDates: [todayStr],
      isStruck: false,
      colorTag: '#E29578',
      createdAt: new Date().toISOString(),
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

function getInitialWeekNotes(): WeekNote[] {
  const saved = localStorage.getItem(STORAGE_KEY_WEEK_NOTES);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // fallback
    }
  }

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

function getInitialMonthNotes(): MonthNote[] {
  const saved = localStorage.getItem(STORAGE_KEY_MONTH_NOTES);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // fallback
    }
  }

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

function getInitialDrawings(): DrawingElement[] {
  const saved = localStorage.getItem(STORAGE_KEY_DRAWINGS);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // fallback
    }
  }
  return [];
}

function getInitialSettings(): CalendarSettings {
  const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // fallback
    }
  }
  return {
    weekStartsOn: 0, // 0 = Sunday start (matches user sketch)
    showStruckItems: true, // Ledger view by default
    activeTool: 'select',
    inkColor: '#2B2C30', // Graphite
  };
}

export function useCalendarState() {
  const [notes, setNotes] = useState<NoteItem[]>(getInitialNotes);
  const [weekNotes, setWeekNotes] = useState<WeekNote[]>(getInitialWeekNotes);
  const [monthNotes, setMonthNotes] = useState<MonthNote[]>(getInitialMonthNotes);
  const [drawings, setDrawings] = useState<DrawingElement[]>(getInitialDrawings);
  const [settings, setSettings] = useState<CalendarSettings>(getInitialSettings);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_WEEK_NOTES, JSON.stringify(weekNotes));
  }, [weekNotes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MONTH_NOTES, JSON.stringify(monthNotes));
  }, [monthNotes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_DRAWINGS, JSON.stringify(drawings));
  }, [drawings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  }, [settings]);

  // Date notes
  const addNote = (content: string, parentDates: string[], colorTag?: string) => {
    const newNote: NoteItem = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      content: content.trim(),
      parentDates: parentDates.length > 0 ? parentDates : [formatDateKey(new Date())],
      isStruck: false,
      colorTag,
      createdAt: new Date().toISOString(),
    };
    setNotes((prev) => [newNote, ...prev]);
    return newNote;
  };

  const toggleStrikeNote = (noteId: string) => {
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id === noteId) {
          return {
            ...n,
            isStruck: !n.isStruck,
            strikeStyle: n.isStruck ? undefined : 'single',
          };
        }
        return n;
      })
    );
  };

  const removeNote = (noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

  // Week notes
  const addWeekNote = (content: string, parentWeeks: string[], colorTag?: string) => {
    const newNote: WeekNote = {
      id: `wnote-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      content: content.trim(),
      parentWeeks,
      isStruck: false,
      colorTag,
      createdAt: new Date().toISOString(),
    };
    setWeekNotes((prev) => [newNote, ...prev]);
    return newNote;
  };

  const toggleStrikeWeekNote = (noteId: string) => {
    setWeekNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, isStruck: !n.isStruck } : n))
    );
  };

  const removeWeekNote = (noteId: string) => {
    setWeekNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

  // Month notes
  const addMonthNote = (content: string, parentMonths: string[], colorTag?: string) => {
    const newNote: MonthNote = {
      id: `mnote-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      content: content.trim(),
      parentMonths,
      isStruck: false,
      colorTag,
      createdAt: new Date().toISOString(),
    };
    setMonthNotes((prev) => [newNote, ...prev]);
    return newNote;
  };

  const toggleStrikeMonthNote = (noteId: string) => {
    setMonthNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, isStruck: !n.isStruck } : n))
    );
  };

  const removeMonthNote = (noteId: string) => {
    setMonthNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

  // Drawings
  const addDrawing = (drawingData: Omit<DrawingElement, 'id' | 'createdAt'>) => {
    const newDrawing: DrawingElement = {
      ...drawingData,
      id: `draw-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: new Date().toISOString(),
    };
    setDrawings((prev) => [...prev, newDrawing]);
    return newDrawing;
  };

  const removeDrawing = (drawingId: string) => {
    setDrawings((prev) => prev.filter((d) => d.id !== drawingId));
  };

  const clearAllDrawings = () => {
    setDrawings([]);
  };

  const updateSettings = (partial: Partial<CalendarSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  return {
    notes,
    weekNotes,
    monthNotes,
    drawings,
    settings,
    addNote,
    toggleStrikeNote,
    removeNote,
    addWeekNote,
    toggleStrikeWeekNote,
    removeWeekNote,
    addMonthNote,
    toggleStrikeMonthNote,
    removeMonthNote,
    addDrawing,
    removeDrawing,
    clearAllDrawings,
    updateSettings,
  };
}
