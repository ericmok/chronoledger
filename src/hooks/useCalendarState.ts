import { useState, useEffect, useCallback } from 'react';
import type { NoteItem, MonthNote, WeekNote, DrawingElement, CalendarSettings } from '../types/calendar';
import { formatDateKey } from '../utils/dateUtils';
import { storage, downloadJsonFile, readJsonFile, type CalendarBackupData } from '../services/storage';

export function useCalendarState() {
  const [notes, setNotes] = useState<NoteItem[]>(() => storage.loadNotes());
  const [weekNotes, setWeekNotes] = useState<WeekNote[]>(() => storage.loadWeekNotes());
  const [monthNotes, setMonthNotes] = useState<MonthNote[]>(() => storage.loadMonthNotes());
  const [drawings, setDrawings] = useState<DrawingElement[]>(() => storage.loadDrawings());
  const [settings, setSettings] = useState<CalendarSettings>(() => storage.loadSettings());

  // Storage synchronization via storage service
  useEffect(() => {
    storage.saveNotes(notes);
  }, [notes]);

  useEffect(() => {
    storage.saveWeekNotes(weekNotes);
  }, [weekNotes]);

  useEffect(() => {
    storage.saveMonthNotes(monthNotes);
  }, [monthNotes]);

  useEffect(() => {
    storage.saveDrawings(drawings);
  }, [drawings]);

  useEffect(() => {
    storage.saveSettings(settings);
  }, [settings]);

  // Date notes
  const addNote = useCallback((content: string, parentDates: string[], colorTag?: string) => {
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
  }, []);

  const toggleStrikeNote = useCallback((noteId: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, isStruck: !n.isStruck } : n))
    );
  }, []);

  const removeNote = useCallback((noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, []);

  const updateNote = useCallback((noteId: string, newContent: string) => {
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id === noteId) {
          const trimmed = newContent.trim();
          if (trimmed === n.content) return n;
          return {
            ...n,
            originalContent: n.originalContent ?? n.content,
            content: trimmed,
            updatedAt: new Date().toISOString(),
          };
        }
        return n;
      })
    );
  }, []);

  // Week notes
  const addWeekNote = useCallback((content: string, parentWeeks: string[], colorTag?: string) => {
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
  }, []);

  const toggleStrikeWeekNote = useCallback((noteId: string) => {
    setWeekNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, isStruck: !n.isStruck } : n))
    );
  }, []);

  const removeWeekNote = useCallback((noteId: string) => {
    setWeekNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, []);

  const updateWeekNote = useCallback((noteId: string, newContent: string) => {
    setWeekNotes((prev) =>
      prev.map((n) => {
        if (n.id === noteId) {
          const trimmed = newContent.trim();
          if (trimmed === n.content) return n;
          return {
            ...n,
            originalContent: n.originalContent ?? n.content,
            content: trimmed,
            updatedAt: new Date().toISOString(),
          };
        }
        return n;
      })
    );
  }, []);

  // Month notes
  const addMonthNote = useCallback((content: string, parentMonths: string[], colorTag?: string) => {
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
  }, []);

  const toggleStrikeMonthNote = useCallback((noteId: string) => {
    setMonthNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, isStruck: !n.isStruck } : n))
    );
  }, []);

  const removeMonthNote = useCallback((noteId: string) => {
    setMonthNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, []);

  const updateMonthNote = useCallback((noteId: string, newContent: string) => {
    setMonthNotes((prev) =>
      prev.map((n) => {
        if (n.id === noteId) {
          const trimmed = newContent.trim();
          if (trimmed === n.content) return n;
          return {
            ...n,
            originalContent: n.originalContent ?? n.content,
            content: trimmed,
            updatedAt: new Date().toISOString(),
          };
        }
        return n;
      })
    );
  }, []);

  // Drawings
  const addDrawing = useCallback((drawingData: Omit<DrawingElement, 'id' | 'createdAt'>) => {
    const newDrawing: DrawingElement = {
      ...drawingData,
      id: `draw-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: new Date().toISOString(),
    };
    setDrawings((prev) => [...prev, newDrawing]);
    return newDrawing;
  }, []);

  const removeDrawing = useCallback((drawingId: string) => {
    setDrawings((prev) => prev.filter((d) => d.id !== drawingId));
  }, []);

  const removeDrawings = useCallback((drawingIds: string[]) => {
    if (drawingIds.length === 0) return;
    const idSet = new Set(drawingIds);
    setDrawings((prev) => prev.filter((d) => !idSet.has(d.id)));
  }, []);

  const clearAllDrawings = useCallback(() => {
    setDrawings([]);
  }, []);

  const updateSettings = useCallback((partial: Partial<CalendarSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  // Backup & Restore
  const exportBackup = useCallback(() => {
    const json = storage.exportBackup();
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadJsonFile(json, `chrono-ledger-backup-${dateStr}.json`);
  }, []);

  const importBackupFile = useCallback(async (file: File): Promise<boolean> => {
    try {
      const text = await readJsonFile(file);
      const data: CalendarBackupData = storage.importBackup(text);
      setNotes(data.notes);
      setWeekNotes(data.weekNotes);
      setMonthNotes(data.monthNotes);
      setDrawings(data.drawings);
      setSettings(data.settings);
      return true;
    } catch (err) {
      console.error('Failed to import backup:', err);
      return false;
    }
  }, []);

  return {
    notes,
    weekNotes,
    monthNotes,
    drawings,
    settings,
    addNote,
    toggleStrikeNote,
    removeNote,
    updateNote,
    addWeekNote,
    toggleStrikeWeekNote,
    removeWeekNote,
    updateWeekNote,
    addMonthNote,
    toggleStrikeMonthNote,
    removeMonthNote,
    updateMonthNote,
    addDrawing,
    removeDrawing,
    removeDrawings,
    clearAllDrawings,
    updateSettings,
    exportBackup,
    importBackupFile,
  };
}
