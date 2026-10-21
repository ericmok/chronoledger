import { useState, useEffect, useCallback, useRef } from 'react';
import type { NoteItem, MonthNote, WeekNote, DrawingElement, CalendarSettings } from '../types/calendar';
import { CIRCLE_DATE_COLORS } from '../types/calendar';
import { formatDateKey } from '../utils/dateUtils';
import { 
  storage, 
  downloadJsonFile, 
  readJsonFile, 
  fetchRemoteCalendar, 
  saveRemoteCalendar, 
  type CalendarBackupData 
} from '../services/storage';
import { filterAndPromoteGuestNotes } from '../services/demoNotes';

export interface HistorySnapshot {
  notes: NoteItem[];
  weekNotes: WeekNote[];
  monthNotes: MonthNote[];
  drawings: DrawingElement[];
  circledDates: Record<string, { color: string }>;
}

export type SyncStatus = 'synced' | 'syncing' | 'offline';

const MAX_HISTORY_SNAPSHOTS = 30;

/**
 * Non-destructive collection reconciliation:
 * 1. Unions items from both local (localStorage) and remote (SQLite).
 * 2. If an item exists in both sources, the version with the newer timestamp (updatedAt/createdAt) wins.
 * 3. Prevents any offline or un-synced client-side notes from ever being dropped or overwritten.
 */
function safeMerge<T extends { id: string; createdAt?: string; updatedAt?: string }>(
  localList: T[],
  remoteList: T[]
): T[] {
  const map = new Map<string, T>();
  for (const item of localList) {
    map.set(item.id, item);
  }
  for (const item of remoteList) {
    const localItem = map.get(item.id);
    if (!localItem) {
      map.set(item.id, item);
    } else {
      const localTime = new Date(localItem.updatedAt || localItem.createdAt || 0).getTime();
      const remoteTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
      if (remoteTime > localTime) {
        map.set(item.id, item);
      }
    }
  }
  return Array.from(map.values());
}

export function useCalendarState() {
  const [notes, setNotes] = useState<NoteItem[]>(() => storage.loadNotes());
  const [weekNotes, setWeekNotes] = useState<WeekNote[]>(() => storage.loadWeekNotes());
  const [monthNotes, setMonthNotes] = useState<MonthNote[]>(() => storage.loadMonthNotes());
  const [drawings, setDrawings] = useState<DrawingElement[]>(() => storage.loadDrawings());
  const [circledDates, setCircledDates] = useState<Record<string, { color: string }>>(() => storage.loadCircledDates());
  const [settings, setSettings] = useState<CalendarSettings>(() => storage.loadSettings());

  // Session deletion tombstone tracking (persisted to prevent zombie note/drawing/circle resurrection on remote sync/refresh)
  const deletedIdsRef = useRef<Set<string>>(storage.loadDeletedIds());
  const deletedCircleKeysRef = useRef<Set<string>>(storage.loadDeletedCircleKeys());

  // SQLite sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const isHydratedRef = useRef(false);
  const syncDebounceRef = useRef<number | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const retryAttemptRef = useRef<number>(0);

  // History stack for Undo / Redo (bounded depth to prevent memory leaks with heavy multi-year drawings)
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
    circledDates,
  });

  useEffect(() => {
    currentStateRef.current = { notes, weekNotes, monthNotes, drawings, circledDates };
  }, [notes, weekNotes, monthNotes, drawings, circledDates]);

  const rehydrateRemoteCalendar = useCallback(async () => {
    // 1. Emergency local recovery snapshot: captured synchronously before any network/SQLite hydration
    try {
      localStorage.setItem(
        'chrono_ledger_recovery_snapshot_v1',
        JSON.stringify(currentStateRef.current)
      );
    } catch (e) {
      console.debug('[ChronoLedger] Snapshot storage skipped (quota/privacy mode):', e);
    }

    setSyncStatus('syncing');
    try {
      const remote = await fetchRemoteCalendar();
      if (!remote) {
        setSyncStatus('offline');
        return false;
      }

      if (remote.hasData) {
        // Discard untouched demo notes; promote any edited demo notes to genuine IDs
        const activeLocalNotes = filterAndPromoteGuestNotes(currentStateRef.current.notes, 'note');
        const activeLocalWeekNotes = filterAndPromoteGuestNotes(currentStateRef.current.weekNotes, 'wnote');
        const activeLocalMonthNotes = filterAndPromoteGuestNotes(currentStateRef.current.monthNotes, 'mnote');
        const activeLocalDrawings = currentStateRef.current.drawings;
        const activeLocalCircledDates = currentStateRef.current.circledDates;

        // Filter remote entities with local session deletions to prevent resurrection
        const filteredRemoteNotes = remote.notes.filter((n) => !deletedIdsRef.current.has(n.id));
        const filteredRemoteWeekNotes = remote.weekNotes.filter((wn) => !deletedIdsRef.current.has(wn.id));
        const filteredRemoteMonthNotes = remote.monthNotes.filter((mn) => !deletedIdsRef.current.has(mn.id));
        const filteredRemoteDrawings = remote.drawings
          .filter((d) => !deletedIdsRef.current.has(d.id))
          .filter((d) => d.type !== 'circle');
        const filteredRemoteCircled = Object.fromEntries(
          Object.entries(remote.circledDates || {}).filter(([k]) => !deletedCircleKeysRef.current.has(k))
        );

        const mergedNotes = safeMerge(activeLocalNotes, filteredRemoteNotes);
        const mergedWeekNotes = safeMerge(activeLocalWeekNotes, filteredRemoteWeekNotes);
        const mergedMonthNotes = safeMerge(activeLocalMonthNotes, filteredRemoteMonthNotes);
        const mergedDrawings = safeMerge(activeLocalDrawings, filteredRemoteDrawings).filter((d) => d.type !== 'circle');
        const mergedCircledDates = {
          ...activeLocalCircledDates,
          ...filteredRemoteCircled,
        };

        setNotes(mergedNotes);
        setWeekNotes(mergedWeekNotes);
        setMonthNotes(mergedMonthNotes);
        setDrawings(mergedDrawings);
        setCircledDates(mergedCircledDates);
        if (remote.settings) {
          setSettings(remote.settings);
        }

        storage.saveNotes(mergedNotes);
        storage.saveWeekNotes(mergedWeekNotes);
        storage.saveMonthNotes(mergedMonthNotes);
        storage.saveDrawings(mergedDrawings);
        storage.saveCircledDates(mergedCircledDates);
        if (remote.settings) {
          storage.saveSettings(remote.settings);
        }

        // If local had extra items not yet in remote, sync merged set back to SQLite
        if (
          mergedNotes.length !== remote.notes.length ||
          mergedWeekNotes.length !== remote.weekNotes.length ||
          mergedMonthNotes.length !== remote.monthNotes.length ||
          mergedDrawings.length !== remote.drawings.length ||
          Object.keys(mergedCircledDates).length !== Object.keys(remote.circledDates || {}).length ||
          deletedIdsRef.current.size > 0 ||
          deletedCircleKeysRef.current.size > 0
        ) {
          const saveResult = await saveRemoteCalendar({
            notes: mergedNotes,
            weekNotes: mergedWeekNotes,
            monthNotes: mergedMonthNotes,
            drawings: mergedDrawings,
            circledDates: mergedCircledDates,
            settings: remote.settings || storage.loadSettings(),
          });
          if (saveResult && saveResult.ok) {
            deletedIdsRef.current.clear();
            deletedCircleKeysRef.current.clear();
            storage.clearDeletedCircleKeys();
            storage.clearDeletedIds();
          }
        }

        setLastSyncedAt(remote.syncedAt || new Date().toISOString());
        setSyncStatus('synced');
      } else {
        // Remote is empty, seed it with current genuine notes (discard untouched demo notes)
        const snapshot = currentStateRef.current;
        const activeNotes = filterAndPromoteGuestNotes(snapshot.notes, 'note');
        const activeWeekNotes = filterAndPromoteGuestNotes(snapshot.weekNotes, 'wnote');
        const activeMonthNotes = filterAndPromoteGuestNotes(snapshot.monthNotes, 'mnote');
        const currentSettings = storage.loadSettings();
        const result = await saveRemoteCalendar({
          notes: activeNotes,
          weekNotes: activeWeekNotes,
          monthNotes: activeMonthNotes,
          drawings: snapshot.drawings,
          circledDates: snapshot.circledDates,
          settings: currentSettings,
        });
        if (result && result.ok) {
          deletedIdsRef.current.clear();
          deletedCircleKeysRef.current.clear();
          storage.clearDeletedCircleKeys();
          storage.clearDeletedIds();
          setLastSyncedAt(result.syncedAt || new Date().toISOString());
        }
        setSyncStatus('synced');
      }
      isHydratedRef.current = true;
      return true;
    } catch (err) {
      console.debug('Failed to rehydrate remote calendar:', err);
      setSyncStatus('offline');
      return false;
    }
  }, []);

  // Initial SQLite hydration with safe non-destructive merging
  useEffect(() => {
    // Expose recovery helper on window for zero-friction disaster recovery in browser console
    if (typeof window !== 'undefined') {
      (window as unknown as { __chronoledger_restore_snapshot?: () => boolean }).__chronoledger_restore_snapshot = () => {
        try {
          const raw = localStorage.getItem('chrono_ledger_recovery_snapshot_v1');
          if (!raw) {
            console.warn('[ChronoLedger] No recovery snapshot found in localStorage.');
            return false;
          }
          const snapshot = JSON.parse(raw);
          if (snapshot.notes) setNotes(snapshot.notes);
          if (snapshot.weekNotes) setWeekNotes(snapshot.weekNotes);
          if (snapshot.monthNotes) setMonthNotes(snapshot.monthNotes);
          if (snapshot.drawings) setDrawings(snapshot.drawings);
          console.info('[ChronoLedger] Successfully restored state from recovery snapshot!', snapshot);
          return true;
        } catch (err) {
          console.error('[ChronoLedger] Failed to restore recovery snapshot:', err);
          return false;
        }
      };
    }

    rehydrateRemoteCalendar();
  }, [rehydrateRemoteCalendar]);

  // Refresh remote state on tab visibility change or window focus (prevents stale multi-device overwrites)
  useEffect(() => {
    let lastRefreshed = Date.now();

    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        const now = Date.now();
        // Throttle to at most once every 3 seconds to avoid spamming on rapid window switching
        if (now - lastRefreshed > 3000) {
          lastRefreshed = now;
          rehydrateRemoteCalendar();
        }
      }
    };

    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityOrFocus);
      window.addEventListener('focus', handleVisibilityOrFocus);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
        window.removeEventListener('focus', handleVisibilityOrFocus);
      };
    }
  }, [rehydrateRemoteCalendar]);

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
      circledDates: currentStateRef.current.circledDates,
    });

    if (undoStackRef.current.length > MAX_HISTORY_SNAPSHOTS) {
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
      circledDates: currentStateRef.current.circledDates,
    });

    if (redoStackRef.current.length > MAX_HISTORY_SNAPSHOTS) {
      redoStackRef.current.shift();
    }

    setNotes(previous.notes);
    setWeekNotes(previous.weekNotes);
    setMonthNotes(previous.monthNotes);
    setDrawings(previous.drawings);
    setCircledDates(previous.circledDates || {});

    // For any entity restored by undo, ensure it's removed from tombstone sets
    for (const n of previous.notes) {
      deletedIdsRef.current.delete(n.id);
      storage.removeDeletedId(n.id);
    }
    for (const wn of previous.weekNotes) {
      deletedIdsRef.current.delete(wn.id);
      storage.removeDeletedId(wn.id);
    }
    for (const mn of previous.monthNotes) {
      deletedIdsRef.current.delete(mn.id);
      storage.removeDeletedId(mn.id);
    }
    for (const d of previous.drawings) {
      deletedIdsRef.current.delete(d.id);
      storage.removeDeletedId(d.id);
    }
    if (previous.circledDates) {
      for (const k of Object.keys(previous.circledDates)) {
        deletedCircleKeysRef.current.delete(k);
        storage.removeDeletedCircleKey(k);
      }
    }

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
      circledDates: currentStateRef.current.circledDates,
    });

    if (undoStackRef.current.length > MAX_HISTORY_SNAPSHOTS) {
      undoStackRef.current.shift();
    }

    setNotes(next.notes);
    setWeekNotes(next.weekNotes);
    setMonthNotes(next.monthNotes);
    setDrawings(next.drawings);
    setCircledDates(next.circledDates || {});

    // For any entity restored by redo, ensure it's removed from tombstone sets
    for (const n of next.notes) {
      deletedIdsRef.current.delete(n.id);
      storage.removeDeletedId(n.id);
    }
    for (const wn of next.weekNotes) {
      deletedIdsRef.current.delete(wn.id);
      storage.removeDeletedId(wn.id);
    }
    for (const mn of next.monthNotes) {
      deletedIdsRef.current.delete(mn.id);
      storage.removeDeletedId(mn.id);
    }
    for (const d of next.drawings) {
      deletedIdsRef.current.delete(d.id);
      storage.removeDeletedId(d.id);
    }
    if (next.circledDates) {
      for (const k of Object.keys(next.circledDates)) {
        deletedCircleKeysRef.current.delete(k);
        storage.removeDeletedCircleKey(k);
      }
    }

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
    storage.saveCircledDates(circledDates);
  }, [circledDates]);

  useEffect(() => {
    storage.saveSettings(settings);
  }, [settings]);

  // Perform remote sync with SQLite, with automatic exponential backoff on failure
  const performSync = useCallback(async (): Promise<boolean> => {
    if (!isHydratedRef.current) return false;

    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    setSyncStatus('syncing');
    const snapshot = currentStateRef.current;
    const payload = {
      notes: snapshot.notes,
      weekNotes: snapshot.weekNotes,
      monthNotes: snapshot.monthNotes,
      drawings: snapshot.drawings.filter((d) => d.type !== 'circle'),
      circledDates: snapshot.circledDates,
      settings: storage.loadSettings(),
    };

    const result = await saveRemoteCalendar(payload);
    if (result && result.ok) {
      retryAttemptRef.current = 0;
      deletedIdsRef.current.clear();
      deletedCircleKeysRef.current.clear();
      storage.clearDeletedCircleKeys();
      storage.clearDeletedIds();
      setSyncStatus('synced');
      setLastSyncedAt(result.syncedAt || new Date().toISOString());
      return true;
    } else {
      setSyncStatus('offline');
      // Automatic retry with exponential backoff: 2s, 4s, 8s, 16s, up to max 30s
      const delay = Math.min(2000 * Math.pow(1.5, retryAttemptRef.current), 30000);
      retryAttemptRef.current += 1;
      retryTimeoutRef.current = window.setTimeout(() => {
        retryTimeoutRef.current = null;
        performSync();
      }, delay);
      return false;
    }
  }, []);

  // Debounced auto-sync to SQLite database on state change
  useEffect(() => {
    if (!isHydratedRef.current) return;

    if (syncDebounceRef.current) {
      window.clearTimeout(syncDebounceRef.current);
    }
    // A fresh local edit supersedes any pending background retry timer
    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    setSyncStatus('syncing');
    syncDebounceRef.current = window.setTimeout(() => {
      syncDebounceRef.current = null;
      performSync();
    }, 400);

    return () => {
      if (syncDebounceRef.current) {
        window.clearTimeout(syncDebounceRef.current);
      }
    };
  }, [notes, weekNotes, monthNotes, drawings, circledDates, settings, performSync]);

  // Listen for device coming back online to immediately retry sync
  useEffect(() => {
    const handleOnline = () => {
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      retryAttemptRef.current = 0;
      performSync();
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [performSync]);

  // Flush any pending sync on page refresh, unload, or tab hiding
  useEffect(() => {
    const flushPendingSync = () => {
      if (syncDebounceRef.current) {
        window.clearTimeout(syncDebounceRef.current);
        syncDebounceRef.current = null;
        const payload = {
          notes: currentStateRef.current.notes,
          weekNotes: currentStateRef.current.weekNotes,
          monthNotes: currentStateRef.current.monthNotes,
          drawings: currentStateRef.current.drawings.filter((d) => d.type !== 'circle'),
          circledDates: currentStateRef.current.circledDates,
          settings: storage.loadSettings(),
        };
        try {
          fetch('/api/calendar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
            keepalive: true,
          }).catch(() => {});
        } catch {
          if (navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon('/api/calendar', blob);
          }
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingSync();
      }
    };

    window.addEventListener('beforeunload', flushPendingSync);
    window.addEventListener('pagehide', flushPendingSync);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', flushPendingSync);
      window.removeEventListener('pagehide', flushPendingSync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const forceSync = useCallback(async () => {
    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    retryAttemptRef.current = 0;
    return performSync();
  }, [performSync]);

  const clearCalendarState = useCallback(() => {
    if (syncDebounceRef.current) {
      window.clearTimeout(syncDebounceRef.current);
      syncDebounceRef.current = null;
    }
    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    retryAttemptRef.current = 0;
    storage.clearDeletedCircleKeys();
    storage.clearDeletedIds();
    setNotes([]);
    setWeekNotes([]);
    setMonthNotes([]);
    setDrawings([]);
    setCircledDates({});
    storage.saveNotes([]);
    storage.saveWeekNotes([]);
    storage.saveMonthNotes([]);
    storage.saveDrawings([]);
    storage.saveCircledDates({});
    try {
      localStorage.removeItem('chrono_ledger_recovery_snapshot_v1');
    } catch {
      // ignore
    }
    deletedIdsRef.current.clear();
    deletedCircleKeysRef.current.clear();
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setSyncStatus('offline');
    setLastSyncedAt(null);
  }, []);

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
    deletedIdsRef.current.delete(newNote.id);
    storage.removeDeletedId(newNote.id);
    setNotes((prev) => [...prev, newNote]);
    return newNote;
  }, [recordHistory]);

  const toggleStrikeNote = useCallback((noteId: string) => {
    recordHistory(true);
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, isStruck: !n.isStruck, updatedAt: new Date().toISOString() } : n))
    );
  }, [recordHistory]);

  const removeNote = useCallback((noteId: string) => {
    recordHistory(true);
    deletedIdsRef.current.add(noteId);
    storage.addDeletedId(noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, [recordHistory]);

  const updateNote = useCallback((
    noteId: string,
    newContent: string,
    newParentDates?: string[],
    newColorTag?: string
  ) => {
    const current = currentStateRef.current.notes.find((n) => n.id === noteId);
    if (!current) return;
    const trimmed = newContent.trim();
    const datesChanged = Boolean(newParentDates && JSON.stringify(newParentDates) !== JSON.stringify(current.parentDates));
    const colorChanged = newColorTag !== undefined && newColorTag !== (current.colorTag || undefined);
    if (current.content === trimmed && !datesChanged && !colorChanged) return;

    recordHistory(true);
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id === noteId) {
          return {
            ...n,
            originalContent: n.originalContent ?? n.content,
            content: trimmed,
            parentDates: newParentDates && newParentDates.length > 0 ? newParentDates : n.parentDates,
            colorTag: newColorTag !== undefined ? (newColorTag || undefined) : n.colorTag,
            updatedAt: new Date().toISOString(),
          };
        }
        return n;
      })
    );
  }, [recordHistory]);

  const acceptNoteRevision = useCallback((noteId: string) => {
    recordHistory(true);
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, originalContent: undefined, updatedAt: new Date().toISOString() } : n))
    );
    setWeekNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, originalContent: undefined, updatedAt: new Date().toISOString() } : n))
    );
    setMonthNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, originalContent: undefined, updatedAt: new Date().toISOString() } : n))
    );
  }, [recordHistory]);

  const reorderNotes = useCallback(
    (sourceNoteId: string, targetNoteId: string, position: 'before' | 'after', targetDate?: string) => {
      if (sourceNoteId === targetNoteId && !targetDate) return;

      recordHistory(true);
      setNotes((prev) => {
        const sourceIndex = prev.findIndex((n) => n.id === sourceNoteId);
        if (sourceIndex === -1) return prev;
        const sourceNote = prev[sourceIndex];

        let updatedSourceNote = sourceNote;
        if (targetDate && (!sourceNote.parentDates.includes(targetDate) || sourceNote.parentDates.length === 1)) {
          updatedSourceNote = {
            ...sourceNote,
            parentDates: [targetDate],
            updatedAt: new Date().toISOString(),
          };
        }

        const remaining = prev.filter((n) => n.id !== sourceNoteId);
        const targetIndex = remaining.findIndex((n) => n.id === targetNoteId);

        if (targetIndex === -1) {
          return [...remaining, updatedSourceNote];
        }

        const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
        const next = [...remaining];
        next.splice(insertIndex, 0, updatedSourceNote);
        return next;
      });
    },
    [recordHistory]
  );

  const moveNoteToDate = useCallback(
    (noteId: string, targetDate: string, position: 'start' | 'end' = 'end') => {
      recordHistory(true);
      setNotes((prev) => {
        const sourceIndex = prev.findIndex((n) => n.id === noteId);
        if (sourceIndex === -1) return prev;
        const sourceNote = prev[sourceIndex];

        const updatedSourceNote = {
          ...sourceNote,
          parentDates: [targetDate],
          updatedAt: new Date().toISOString(),
        };

        const remaining = prev.filter((n) => n.id !== noteId);
        const targetDateNotes = remaining.filter((n) => n.parentDates.includes(targetDate));

        if (targetDateNotes.length === 0) {
          return position === 'start'
            ? [updatedSourceNote, ...remaining]
            : [...remaining, updatedSourceNote];
        }

        if (position === 'start') {
          const firstIndex = remaining.findIndex((n) => n.id === targetDateNotes[0].id);
          const next = [...remaining];
          next.splice(firstIndex, 0, updatedSourceNote);
          return next;
        } else {
          const lastIndex = remaining.findIndex(
            (n) => n.id === targetDateNotes[targetDateNotes.length - 1].id
          );
          const next = [...remaining];
          next.splice(lastIndex + 1, 0, updatedSourceNote);
          return next;
        }
      });
    },
    [recordHistory]
  );

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
    deletedIdsRef.current.delete(newNote.id);
    storage.removeDeletedId(newNote.id);
    setWeekNotes((prev) => [...prev, newNote]);
    return newNote;
  }, [recordHistory]);

  const toggleStrikeWeekNote = useCallback((noteId: string) => {
    recordHistory(true);
    setWeekNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, isStruck: !n.isStruck, updatedAt: new Date().toISOString() } : n))
    );
  }, [recordHistory]);

  const removeWeekNote = useCallback((noteId: string) => {
    recordHistory(true);
    deletedIdsRef.current.add(noteId);
    storage.addDeletedId(noteId);
    setWeekNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, [recordHistory]);

  const updateWeekNote = useCallback((
    noteId: string,
    newContent: string,
    newParentWeeks?: string[],
    newColorTag?: string
  ) => {
    const current = currentStateRef.current.weekNotes.find((n) => n.id === noteId);
    if (!current) return;
    const trimmed = newContent.trim();
    const weeksChanged = Boolean(newParentWeeks && JSON.stringify(newParentWeeks) !== JSON.stringify(current.parentWeeks));
    const colorChanged = newColorTag !== undefined && newColorTag !== (current.colorTag || undefined);
    if (current.content === trimmed && !weeksChanged && !colorChanged) return;

    recordHistory(true);
    setWeekNotes((prev) =>
      prev.map((n) => {
        if (n.id === noteId) {
          return {
            ...n,
            originalContent: n.originalContent ?? n.content,
            content: trimmed,
            parentWeeks: newParentWeeks && newParentWeeks.length > 0 ? newParentWeeks : n.parentWeeks,
            colorTag: newColorTag !== undefined ? (newColorTag || undefined) : n.colorTag,
            updatedAt: new Date().toISOString(),
          };
        }
        return n;
      })
    );
  }, [recordHistory]);

  const reorderWeekNotes = useCallback(
    (sourceNoteId: string, targetNoteId: string, position: 'before' | 'after', targetWeek?: string) => {
      if (sourceNoteId === targetNoteId && !targetWeek) return;

      recordHistory(true);
      setWeekNotes((prev) => {
        const sourceIndex = prev.findIndex((n) => n.id === sourceNoteId);
        if (sourceIndex === -1) return prev;
        const sourceNote = prev[sourceIndex];

        let updatedSourceNote = sourceNote;
        if (targetWeek && (!sourceNote.parentWeeks.includes(targetWeek) || sourceNote.parentWeeks.length === 1)) {
          updatedSourceNote = {
            ...sourceNote,
            parentWeeks: [targetWeek],
            updatedAt: new Date().toISOString(),
          };
        }

        const remaining = prev.filter((n) => n.id !== sourceNoteId);
        const targetIndex = remaining.findIndex((n) => n.id === targetNoteId);

        if (targetIndex === -1) {
          return [...remaining, updatedSourceNote];
        }

        const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
        const next = [...remaining];
        next.splice(insertIndex, 0, updatedSourceNote);
        return next;
      });
    },
    [recordHistory]
  );

  const moveWeekNoteToWeek = useCallback(
    (noteId: string, targetWeek: string, position: 'start' | 'end' = 'end') => {
      recordHistory(true);
      setWeekNotes((prev) => {
        const sourceIndex = prev.findIndex((n) => n.id === noteId);
        if (sourceIndex === -1) return prev;
        const sourceNote = prev[sourceIndex];

        const updatedSourceNote = {
          ...sourceNote,
          parentWeeks: [targetWeek],
          updatedAt: new Date().toISOString(),
        };

        const remaining = prev.filter((n) => n.id !== noteId);
        const targetWeekNotes = remaining.filter((n) => n.parentWeeks.includes(targetWeek));

        if (targetWeekNotes.length === 0) {
          return position === 'start'
            ? [updatedSourceNote, ...remaining]
            : [...remaining, updatedSourceNote];
        }

        if (position === 'start') {
          const firstIndex = remaining.findIndex((n) => n.id === targetWeekNotes[0].id);
          const next = [...remaining];
          next.splice(firstIndex, 0, updatedSourceNote);
          return next;
        } else {
          const lastIndex = remaining.findIndex(
            (n) => n.id === targetWeekNotes[targetWeekNotes.length - 1].id
          );
          const next = [...remaining];
          next.splice(lastIndex + 1, 0, updatedSourceNote);
          return next;
        }
      });
    },
    [recordHistory]
  );

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
    deletedIdsRef.current.delete(newNote.id);
    storage.removeDeletedId(newNote.id);
    setMonthNotes((prev) => [...prev, newNote]);
    return newNote;
  }, [recordHistory]);

  const toggleStrikeMonthNote = useCallback((noteId: string) => {
    recordHistory(true);
    setMonthNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, isStruck: !n.isStruck, updatedAt: new Date().toISOString() } : n))
    );
  }, [recordHistory]);

  const removeMonthNote = useCallback((noteId: string) => {
    recordHistory(true);
    deletedIdsRef.current.add(noteId);
    storage.addDeletedId(noteId);
    setMonthNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, [recordHistory]);

  const updateMonthNote = useCallback((
    noteId: string,
    newContent: string,
    newParentMonths?: string[],
    newColorTag?: string
  ) => {
    const current = currentStateRef.current.monthNotes.find((n) => n.id === noteId);
    if (!current) return;
    const trimmed = newContent.trim();
    const monthsChanged = Boolean(newParentMonths && JSON.stringify(newParentMonths) !== JSON.stringify(current.parentMonths));
    const colorChanged = newColorTag !== undefined && newColorTag !== (current.colorTag || undefined);
    if (current.content === trimmed && !monthsChanged && !colorChanged) return;

    recordHistory(true);
    setMonthNotes((prev) =>
      prev.map((n) => {
        if (n.id === noteId) {
          return {
            ...n,
            originalContent: n.originalContent ?? n.content,
            content: trimmed,
            parentMonths: newParentMonths && newParentMonths.length > 0 ? newParentMonths : n.parentMonths,
            colorTag: newColorTag !== undefined ? (newColorTag || undefined) : n.colorTag,
            updatedAt: new Date().toISOString(),
          };
        }
        return n;
      })
    );
  }, [recordHistory]);

  const reorderMonthNotes = useCallback(
    (sourceNoteId: string, targetNoteId: string, position: 'before' | 'after', targetMonth?: string) => {
      if (sourceNoteId === targetNoteId && !targetMonth) return;

      recordHistory(true);
      setMonthNotes((prev) => {
        const sourceIndex = prev.findIndex((n) => n.id === sourceNoteId);
        if (sourceIndex === -1) return prev;
        const sourceNote = prev[sourceIndex];

        let updatedSourceNote = sourceNote;
        if (targetMonth && (!sourceNote.parentMonths.includes(targetMonth) || sourceNote.parentMonths.length === 1)) {
          updatedSourceNote = {
            ...sourceNote,
            parentMonths: [targetMonth],
            updatedAt: new Date().toISOString(),
          };
        }

        const remaining = prev.filter((n) => n.id !== sourceNoteId);
        const targetIndex = remaining.findIndex((n) => n.id === targetNoteId);

        if (targetIndex === -1) {
          return [...remaining, updatedSourceNote];
        }

        const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
        const next = [...remaining];
        next.splice(insertIndex, 0, updatedSourceNote);
        return next;
      });
    },
    [recordHistory]
  );

  const moveMonthNoteToMonth = useCallback(
    (noteId: string, targetMonth: string, position: 'start' | 'end' = 'end') => {
      recordHistory(true);
      setMonthNotes((prev) => {
        const sourceIndex = prev.findIndex((n) => n.id === noteId);
        if (sourceIndex === -1) return prev;
        const sourceNote = prev[sourceIndex];

        const updatedSourceNote = {
          ...sourceNote,
          parentMonths: [targetMonth],
          updatedAt: new Date().toISOString(),
        };

        const remaining = prev.filter((n) => n.id !== noteId);
        const targetMonthNotes = remaining.filter((n) => n.parentMonths.includes(targetMonth));

        if (targetMonthNotes.length === 0) {
          return position === 'start'
            ? [updatedSourceNote, ...remaining]
            : [...remaining, updatedSourceNote];
        }

        if (position === 'start') {
          const firstIndex = remaining.findIndex((n) => n.id === targetMonthNotes[0].id);
          const next = [...remaining];
          next.splice(firstIndex, 0, updatedSourceNote);
          return next;
        } else {
          const lastIndex = remaining.findIndex(
            (n) => n.id === targetMonthNotes[targetMonthNotes.length - 1].id
          );
          const next = [...remaining];
          next.splice(lastIndex + 1, 0, updatedSourceNote);
          return next;
        }
      });
    },
    [recordHistory]
  );

  // Drawings
  const addDrawing = useCallback((drawingData: Omit<DrawingElement, 'id' | 'createdAt'>) => {
    recordHistory(true);
    const newDrawing: DrawingElement = {
      ...drawingData,
      id: `draw-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: new Date().toISOString(),
    };
    deletedIdsRef.current.delete(newDrawing.id);
    storage.removeDeletedId(newDrawing.id);
    setDrawings((prev) => [...prev, newDrawing]);
    return newDrawing;
  }, [recordHistory]);

  const removeDrawing = useCallback((drawingId: string) => {
    recordHistory(false);
    deletedIdsRef.current.add(drawingId);
    storage.addDeletedId(drawingId);
    setDrawings((prev) => prev.filter((d) => d.id !== drawingId));
  }, [recordHistory]);

  const removeDrawings = useCallback((drawingIds: string[]) => {
    if (drawingIds.length === 0) return;
    recordHistory(false);
    for (const id of drawingIds) {
      deletedIdsRef.current.add(id);
      storage.addDeletedId(id);
    }
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
    const drawingIds = currentStateRef.current.drawings.map((d) => d.id);
    for (const id of drawingIds) {
      deletedIdsRef.current.add(id);
      storage.addDeletedId(id);
    }
    setDrawings([]);
  }, [recordHistory]);

  // First-class Circled Dates actions
  const toggleCircleDate = useCallback(
    (dateKey: string, color: string = CIRCLE_DATE_COLORS[0]) => {
      recordHistory();
      setCircledDates((prev) => {
        const next = { ...prev };
        if (next[dateKey]) {
          delete next[dateKey];
          deletedCircleKeysRef.current.add(dateKey);
          storage.addDeletedCircleKey(dateKey);
        } else {
          next[dateKey] = { color };
          deletedCircleKeysRef.current.delete(dateKey);
          storage.removeDeletedCircleKey(dateKey);
        }
        return next;
      });

      // Purge any lingering drawing elements matching this date from drawings state
      setDrawings((prev) => {
        const remaining = prev.filter((d) => !(d.type === 'circle' && d.anchorStartDate === dateKey));
        if (remaining.length !== prev.length) {
          storage.saveDrawings(remaining);
        }
        return remaining;
      });
    },
    [recordHistory]
  );

  const cycleCircleColor = useCallback(
    (dateKey: string) => {
      recordHistory();
      deletedCircleKeysRef.current.delete(dateKey);
      storage.removeDeletedCircleKey(dateKey);
      setCircledDates((prev) => {
        const existing = prev[dateKey];
        const currentColor = existing?.color || CIRCLE_DATE_COLORS[0];
        const currentIndex = (CIRCLE_DATE_COLORS as readonly string[]).indexOf(currentColor);
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % CIRCLE_DATE_COLORS.length;
        const nextColor = CIRCLE_DATE_COLORS[nextIndex];

        return {
          ...prev,
          [dateKey]: { color: nextColor },
        };
      });
    },
    [recordHistory]
  );

  const removeCircleDate = useCallback(
    (dateKey: string) => {
      recordHistory();
      deletedCircleKeysRef.current.add(dateKey);
      storage.addDeletedCircleKey(dateKey);

      setCircledDates((prev) => {
        if (!prev[dateKey]) return prev;
        const next = { ...prev };
        delete next[dateKey];
        return next;
      });

      // Purge any lingering drawing elements matching this date from drawings state
      setDrawings((prev) => {
        const remaining = prev.filter((d) => !(d.type === 'circle' && d.anchorStartDate === dateKey));
        if (remaining.length !== prev.length) {
          storage.saveDrawings(remaining);
        }
        return remaining;
      });
    },
    [recordHistory]
  );

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
      if (data.circledDates) {
        setCircledDates(data.circledDates);
      }
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
    circledDates,
    settings,
    addNote,
    toggleStrikeNote,
    removeNote,
    updateNote,
    acceptNoteRevision,
    reorderNotes,
    moveNoteToDate,
    addWeekNote,
    toggleStrikeWeekNote,
    removeWeekNote,
    updateWeekNote,
    reorderWeekNotes,
    moveWeekNoteToWeek,
    addMonthNote,
    toggleStrikeMonthNote,
    removeMonthNote,
    updateMonthNote,
    reorderMonthNotes,
    moveMonthNoteToMonth,
    addDrawing,
    removeDrawing,
    removeDrawings,
    updateDrawing,
    clearAllDrawings,
    toggleCircleDate,
    cycleCircleColor,
    removeCircleDate,
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
    rehydrateRemoteCalendar,
    clearCalendarState,
  };
}

