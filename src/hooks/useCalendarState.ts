import { useState, useEffect, useCallback, useRef } from 'react';
import type { NoteItem, MonthNote, WeekNote, DrawingElement, CalendarSettings } from '../types/calendar';
import { formatDateKey } from '../utils/dateUtils';
import { 
  storage, 
  downloadJsonFile, 
  readJsonFile, 
  fetchRemoteCalendar, 
  saveRemoteCalendar, 
  type CalendarBackupData 
} from '../services/storage';

export interface HistorySnapshot {
  notes: NoteItem[];
  weekNotes: WeekNote[];
  monthNotes: MonthNote[];
  drawings: DrawingElement[];
}

export type SyncStatus = 'synced' | 'syncing' | 'offline';

export function useCalendarState() {
  const [notes, setNotes] = useState<NoteItem[]>(() => storage.loadNotes());
  const [weekNotes, setWeekNotes] = useState<WeekNote[]>(() => storage.loadWeekNotes());
  const [monthNotes, setMonthNotes] = useState<MonthNote[]>(() => storage.loadMonthNotes());
  const [drawings, setDrawings] = useState<DrawingElement[]>(() => storage.loadDrawings());
  const [settings, setSettings] = useState<CalendarSettings>(() => storage.loadSettings());

  // SQLite sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const isHydratedRef = useRef(false);
  const syncDebounceRef = useRef<number | null>(null);

  // History stack for Undo / Redo
  const undoStackRef = useRef<HistorySnapshot[]>([]);
  const redoStackRef = useRef<HistorySnapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const lastRecordTimeRef = useRef<number>(0);

  // Keep a ref of the current state so callbacks always have fresh data
  const currentStateRef = useRef<HistorySnapshot>({
    notes,
    weekNotes,
    monthNotes,
    drawings,
  });

  useEffect(() => {
    currentStateRef.current = { notes, weekNotes, monthNotes, drawings };
  }, [notes, weekNotes, monthNotes, drawings]);

  // Initial SQLite hydration with safe non-destructive merging
  useEffect(() => {
    let isCancelled = false;

    // Helper: merge collections by ID to never drop locally created entries
    function safeMerge<T extends { id: string }>(localList: T[], remoteList: T[]): T[] {
      const map = new Map<string, T>();
      for (const item of localList) {
        map.set(item.id, item);
      }
      for (const item of remoteList) {
        map.set(item.id, item);
      }
      return Array.from(map.values());
    }

    async function hydrate() {
      // 1. Save an emergency local recovery snapshot before any remote sync
      try {
        localStorage.setItem(
          'chrono_ledger_recovery_snapshot_v1',
          JSON.stringify(currentStateRef.current)
        );
      } catch {
        // quota or privacy mode
      }

      const remote = await fetchRemoteCalendar();
      if (isCancelled) return;

      if (remote) {
        if (remote.hasData) {
          // Non-destructive merge: preserve any local items while adopting remote items
          const mergedNotes = safeMerge(currentStateRef.current.notes, remote.notes);
          const mergedWeekNotes = safeMerge(currentStateRef.current.weekNotes, remote.weekNotes);
          const mergedMonthNotes = safeMerge(currentStateRef.current.monthNotes, remote.monthNotes);
          const mergedDrawings = safeMerge(currentStateRef.current.drawings, remote.drawings);

          setNotes(mergedNotes);
          setWeekNotes(mergedWeekNotes);
          setMonthNotes(mergedMonthNotes);
          setDrawings(mergedDrawings);
          if (remote.settings) {
            setSettings(remote.settings);
          }

          storage.saveNotes(mergedNotes);
          storage.saveWeekNotes(mergedWeekNotes);
          storage.saveMonthNotes(mergedMonthNotes);
          storage.saveDrawings(mergedDrawings);
          if (remote.settings) {
            storage.saveSettings(remote.settings);
          }

          // If local had extra items not yet in remote, sync merged set back to SQLite
          if (
            mergedNotes.length !== remote.notes.length ||
            mergedWeekNotes.length !== remote.weekNotes.length ||
            mergedMonthNotes.length !== remote.monthNotes.length ||
            mergedDrawings.length !== remote.drawings.length
          ) {
            saveRemoteCalendar({
              notes: mergedNotes,
              weekNotes: mergedWeekNotes,
              monthNotes: mergedMonthNotes,
              drawings: mergedDrawings,
              settings: remote.settings || storage.loadSettings(),
            });
          }

          setLastSyncedAt(remote.syncedAt || new Date().toISOString());
          setSyncStatus('synced');
        } else {
          // Remote SQLite database is empty: seed it from current client state
          const snapshot = currentStateRef.current;
          const currentSettings = storage.loadSettings();
          const result = await saveRemoteCalendar({
            notes: snapshot.notes,
            weekNotes: snapshot.weekNotes,
            monthNotes: snapshot.monthNotes,
            drawings: snapshot.drawings,
            settings: currentSettings,
          });
          if (result && result.ok) {
            setLastSyncedAt(result.syncedAt || new Date().toISOString());
            setSyncStatus('synced');
          } else {
            setSyncStatus('synced');
          }
        }
      } else {
        setSyncStatus('offline');
      }
      isHydratedRef.current = true;
    }

    hydrate();
    return () => {
      isCancelled = true;
    };
  }, []);

  const recordHistory = useCallback((force = false) => {
    const now = Date.now();
    // Batch rapid consecutive events (e.g. continuous eraser brush moves within 400ms)
    if (!force && now - lastRecordTimeRef.current < 400) {
      redoStackRef.current = [];
      setCanRedo(false);
      return;
    }
    lastRecordTimeRef.current = now;

    undoStackRef.current.push({
      notes: currentStateRef.current.notes,
      weekNotes: currentStateRef.current.weekNotes,
      monthNotes: currentStateRef.current.monthNotes,
      drawings: currentStateRef.current.drawings,
    });

    if (undoStackRef.current.length > 50) {
      undoStackRef.current.shift();
    }

    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const previous = undoStackRef.current.pop()!;

    redoStackRef.current.push({
      notes: currentStateRef.current.notes,
      weekNotes: currentStateRef.current.weekNotes,
      monthNotes: currentStateRef.current.monthNotes,
      drawings: currentStateRef.current.drawings,
    });

    if (redoStackRef.current.length > 50) {
      redoStackRef.current.shift();
    }

    setNotes(previous.notes);
    setWeekNotes(previous.weekNotes);
    setMonthNotes(previous.monthNotes);
    setDrawings(previous.drawings);

    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop()!;

    undoStackRef.current.push({
      notes: currentStateRef.current.notes,
      weekNotes: currentStateRef.current.weekNotes,
      monthNotes: currentStateRef.current.monthNotes,
      drawings: currentStateRef.current.drawings,
    });

    if (undoStackRef.current.length > 50) {
      undoStackRef.current.shift();
    }

    setNotes(next.notes);
    setWeekNotes(next.weekNotes);
    setMonthNotes(next.monthNotes);
    setDrawings(next.drawings);

    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  // Synchronous LocalStorage synchronization
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

  // Debounced auto-sync to SQLite database
  useEffect(() => {
    if (!isHydratedRef.current) return;

    setSyncStatus('syncing');
    if (syncDebounceRef.current) {
      window.clearTimeout(syncDebounceRef.current);
    }

    syncDebounceRef.current = window.setTimeout(async () => {
      const payload = {
        notes,
        weekNotes,
        monthNotes,
        drawings,
        settings,
      };

      const result = await saveRemoteCalendar(payload);
      if (result && result.ok) {
        setSyncStatus('synced');
        setLastSyncedAt(result.syncedAt || new Date().toISOString());
      } else {
        setSyncStatus('offline');
      }
    }, 600);

    return () => {
      if (syncDebounceRef.current) {
        window.clearTimeout(syncDebounceRef.current);
      }
    };
  }, [notes, weekNotes, monthNotes, drawings, settings]);

  const forceSync = useCallback(async () => {
    setSyncStatus('syncing');
    const payload = {
      notes,
      weekNotes,
      monthNotes,
      drawings,
      settings,
    };
    const result = await saveRemoteCalendar(payload);
    if (result && result.ok) {
      setSyncStatus('synced');
      setLastSyncedAt(result.syncedAt || new Date().toISOString());
      return true;
    } else {
      setSyncStatus('offline');
      return false;
    }
  }, [notes, weekNotes, monthNotes, drawings, settings]);

  // Date notes
  const addNote = useCallback((content: string, parentDates: string[], colorTag?: string) => {
    recordHistory(true);
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
  }, [recordHistory]);

  const toggleStrikeNote = useCallback((noteId: string) => {
    recordHistory(true);
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, isStruck: !n.isStruck } : n))
    );
  }, [recordHistory]);

  const removeNote = useCallback((noteId: string) => {
    recordHistory(true);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, [recordHistory]);

  const updateNote = useCallback((noteId: string, newContent: string) => {
    const current = currentStateRef.current.notes.find((n) => n.id === noteId);
    if (current && current.content === newContent.trim()) return;

    recordHistory(true);
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id === noteId) {
          const trimmed = newContent.trim();
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
  }, [recordHistory]);

  // Week notes
  const addWeekNote = useCallback((content: string, parentWeeks: string[], colorTag?: string) => {
    recordHistory(true);
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
  }, [recordHistory]);

  const toggleStrikeWeekNote = useCallback((noteId: string) => {
    recordHistory(true);
    setWeekNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, isStruck: !n.isStruck } : n))
    );
  }, [recordHistory]);

  const removeWeekNote = useCallback((noteId: string) => {
    recordHistory(true);
    setWeekNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, [recordHistory]);

  const updateWeekNote = useCallback((noteId: string, newContent: string) => {
    const current = currentStateRef.current.weekNotes.find((n) => n.id === noteId);
    if (current && current.content === newContent.trim()) return;

    recordHistory(true);
    setWeekNotes((prev) =>
      prev.map((n) => {
        if (n.id === noteId) {
          const trimmed = newContent.trim();
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
  }, [recordHistory]);

  // Month notes
  const addMonthNote = useCallback((content: string, parentMonths: string[], colorTag?: string) => {
    recordHistory(true);
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
  }, [recordHistory]);

  const toggleStrikeMonthNote = useCallback((noteId: string) => {
    recordHistory(true);
    setMonthNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, isStruck: !n.isStruck } : n))
    );
  }, [recordHistory]);

  const removeMonthNote = useCallback((noteId: string) => {
    recordHistory(true);
    setMonthNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, [recordHistory]);

  const updateMonthNote = useCallback((noteId: string, newContent: string) => {
    const current = currentStateRef.current.monthNotes.find((n) => n.id === noteId);
    if (current && current.content === newContent.trim()) return;

    recordHistory(true);
    setMonthNotes((prev) =>
      prev.map((n) => {
        if (n.id === noteId) {
          const trimmed = newContent.trim();
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
  }, [recordHistory]);

  // Drawings
  const addDrawing = useCallback((drawingData: Omit<DrawingElement, 'id' | 'createdAt'>) => {
    recordHistory(true);
    const newDrawing: DrawingElement = {
      ...drawingData,
      id: `draw-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: new Date().toISOString(),
    };
    setDrawings((prev) => [...prev, newDrawing]);
    return newDrawing;
  }, [recordHistory]);

  const removeDrawing = useCallback((drawingId: string) => {
    recordHistory(false);
    setDrawings((prev) => prev.filter((d) => d.id !== drawingId));
  }, [recordHistory]);

  const removeDrawings = useCallback((drawingIds: string[]) => {
    if (drawingIds.length === 0) return;
    recordHistory(false);
    const idSet = new Set(drawingIds);
    setDrawings((prev) => prev.filter((d) => !idSet.has(d.id)));
  }, [recordHistory]);

  const updateDrawing = useCallback((drawingId: string, partial: Partial<DrawingElement>) => {
    recordHistory(true);
    setDrawings((prev) =>
      prev.map((d) => (d.id === drawingId ? { ...d, ...partial } : d))
    );
  }, [recordHistory]);

  const clearAllDrawings = useCallback(() => {
    recordHistory(true);
    setDrawings([]);
  }, [recordHistory]);

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
      recordHistory(true);
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
  }, [recordHistory]);

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
    updateDrawing,
    clearAllDrawings,
    updateSettings,
    exportBackup,
    importBackupFile,
    undo,
    redo,
    canUndo,
    canRedo,
    syncStatus,
    lastSyncedAt,
    forceSync,
  };
}

