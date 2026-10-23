import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { NoteItem, MonthNote, WeekNote, UnifiedNote, NoteScope, DrawingElement, CalendarSettings } from '../types/calendar';
import { CIRCLE_DATE_COLORS } from '../types/calendar';
import { formatDateKey } from '../utils/dateUtils';
import { 
  storage, 
  downloadJsonFile, 
  readJsonFile, 
  fetchRemoteCalendar, 
  fetchRemoteCalendarDelta,
  saveRemoteCalendar, 
  saveRemoteCalendarDelta,
  type CalendarDeltaPayload,
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

export interface DirtyQueue {
  notesUpsert: Map<string, NoteItem>;
  notesDelete: Set<string>;
  weekNotesUpsert: Map<string, WeekNote>;
  weekNotesDelete: Set<string>;
  monthNotesUpsert: Map<string, MonthNote>;
  monthNotesDelete: Set<string>;
  drawingsUpsert: Map<string, DrawingElement>;
  drawingsDelete: Set<string>;
  circledDatesUpsert: Record<string, { color: string }>;
  circledDatesDelete: Set<string>;
  settingsPartial: Partial<CalendarSettings> | null;
}

export const createEmptyDirtyQueue = (): DirtyQueue => ({
  notesUpsert: new Map(),
  notesDelete: new Set(),
  weekNotesUpsert: new Map(),
  weekNotesDelete: new Set(),
  monthNotesUpsert: new Map(),
  monthNotesDelete: new Set(),
  drawingsUpsert: new Map(),
  drawingsDelete: new Set(),
  circledDatesUpsert: {},
  circledDatesDelete: new Set(),
  settingsPartial: null,
});

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

  // In-memory dirty queue for row-level Incremental Log Sync (ILS)
  const dirtyQueueRef = useRef<DirtyQueue>(createEmptyDirtyQueue());
  const performSyncRef = useRef<(() => Promise<boolean>) | null>(null);

  // Staging helpers
  const stageNoteUpsert = useCallback((n: NoteItem) => {
    dirtyQueueRef.current.notesUpsert.set(n.id, n);
    dirtyQueueRef.current.notesDelete.delete(n.id);
    deletedIdsRef.current.delete(n.id);
    storage.removeDeletedId(n.id);
  }, []);

  const stageNoteDelete = useCallback((id: string) => {
    dirtyQueueRef.current.notesDelete.add(id);
    dirtyQueueRef.current.notesUpsert.delete(id);
    deletedIdsRef.current.add(id);
    storage.addDeletedId(id);
  }, []);

  const stageWeekNoteUpsert = useCallback((wn: WeekNote) => {
    dirtyQueueRef.current.weekNotesUpsert.set(wn.id, wn);
    dirtyQueueRef.current.weekNotesDelete.delete(wn.id);
    deletedIdsRef.current.delete(wn.id);
    storage.removeDeletedId(wn.id);
  }, []);

  const stageWeekNoteDelete = useCallback((id: string) => {
    dirtyQueueRef.current.weekNotesDelete.add(id);
    dirtyQueueRef.current.weekNotesUpsert.delete(id);
    deletedIdsRef.current.add(id);
    storage.addDeletedId(id);
  }, []);

  const stageMonthNoteUpsert = useCallback((mn: MonthNote) => {
    dirtyQueueRef.current.monthNotesUpsert.set(mn.id, mn);
    dirtyQueueRef.current.monthNotesDelete.delete(mn.id);
    deletedIdsRef.current.delete(mn.id);
    storage.removeDeletedId(mn.id);
  }, []);

  const stageMonthNoteDelete = useCallback((id: string) => {
    dirtyQueueRef.current.monthNotesDelete.add(id);
    dirtyQueueRef.current.monthNotesUpsert.delete(id);
    deletedIdsRef.current.add(id);
    storage.addDeletedId(id);
  }, []);

  const stageDrawingUpsert = useCallback((d: DrawingElement) => {
    if (d.type === 'circle') return;
    dirtyQueueRef.current.drawingsUpsert.set(d.id, d);
    dirtyQueueRef.current.drawingsDelete.delete(d.id);
    deletedIdsRef.current.delete(d.id);
    storage.removeDeletedId(d.id);
  }, []);

  const stageDrawingDelete = useCallback((id: string) => {
    dirtyQueueRef.current.drawingsDelete.add(id);
    dirtyQueueRef.current.drawingsUpsert.delete(id);
    deletedIdsRef.current.add(id);
    storage.addDeletedId(id);
  }, []);

  const stageCircleUpsert = useCallback((dateKey: string, color: string) => {
    dirtyQueueRef.current.circledDatesUpsert[dateKey] = { color };
    dirtyQueueRef.current.circledDatesDelete.delete(dateKey);
    deletedCircleKeysRef.current.delete(dateKey);
    storage.removeDeletedCircleKey(dateKey);
  }, []);

  const stageCircleDelete = useCallback((dateKey: string) => {
    dirtyQueueRef.current.circledDatesDelete.add(dateKey);
    delete dirtyQueueRef.current.circledDatesUpsert[dateKey];
    deletedCircleKeysRef.current.add(dateKey);
    storage.addDeletedCircleKey(dateKey);
  }, []);

  const stageSettingsPartial = useCallback((partial: Partial<CalendarSettings>) => {
    dirtyQueueRef.current.settingsPartial = {
      ...(dirtyQueueRef.current.settingsPartial || {}),
      ...partial,
    };
  }, []);

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

    // 2. Try fast incremental delta pull if we have a valid synced revision watermark
    const lastRev = storage.loadLastSyncedRevision();
    if (lastRev > 0) {
      try {
        const delta = await fetchRemoteCalendarDelta(lastRev);
        if (delta && delta.ok && !delta.requiresFullSync) {
          // Apply remote deletes locally
          if (delta.notes.delete.length > 0) {
            const delSet = new Set(delta.notes.delete);
            setNotes((prev) => prev.filter((n) => !delSet.has(n.id)));
          }
          if (delta.weekNotes.delete.length > 0) {
            const delSet = new Set(delta.weekNotes.delete);
            setWeekNotes((prev) => prev.filter((wn) => !delSet.has(wn.id)));
          }
          if (delta.monthNotes.delete.length > 0) {
            const delSet = new Set(delta.monthNotes.delete);
            setMonthNotes((prev) => prev.filter((mn) => !delSet.has(mn.id)));
          }
          if (delta.drawings.delete.length > 0) {
            const delSet = new Set(delta.drawings.delete);
            setDrawings((prev) => prev.filter((d) => !delSet.has(d.id)));
          }
          if (delta.circledDates.delete.length > 0) {
            const delSet = new Set(delta.circledDates.delete);
            setCircledDates((prev) => {
              const next = { ...prev };
              for (const k of delSet) delete next[k];
              return next;
            });
          }

          // Apply remote upserts locally with cross-horizon move deduplication
          const upsertedWeekIds = new Set(delta.weekNotes.upsert.map((w) => w.id));
          const upsertedMonthIds = new Set(delta.monthNotes.upsert.map((m) => m.id));
          const upsertedDayIds = new Set(delta.notes.upsert.map((d) => d.id));

          if (delta.notes.upsert.length > 0) {
            setNotes((prev) => safeMerge(prev, delta.notes.upsert));
            setWeekNotes((prev) => prev.filter((wn) => !upsertedDayIds.has(wn.id)));
            setMonthNotes((prev) => prev.filter((mn) => !upsertedDayIds.has(mn.id)));
          }
          if (delta.weekNotes.upsert.length > 0) {
            setWeekNotes((prev) => safeMerge(prev, delta.weekNotes.upsert));
            setNotes((prev) => prev.filter((n) => !upsertedWeekIds.has(n.id)));
            setMonthNotes((prev) => prev.filter((mn) => !upsertedWeekIds.has(mn.id)));
          }
          if (delta.monthNotes.upsert.length > 0) {
            setMonthNotes((prev) => safeMerge(prev, delta.monthNotes.upsert));
            setNotes((prev) => prev.filter((n) => !upsertedMonthIds.has(n.id)));
            setWeekNotes((prev) => prev.filter((wn) => !upsertedMonthIds.has(wn.id)));
          }
          if (delta.drawings.upsert.length > 0) {
            setDrawings((prev) => safeMerge(prev, delta.drawings.upsert).filter((d) => d.type !== 'circle'));
          }
          if (Object.keys(delta.circledDates.upsert).length > 0) {
            setCircledDates((prev) => ({ ...prev, ...delta.circledDates.upsert }));
          }

          storage.saveLastSyncedRevision(delta.currentRevision);
          setLastSyncedAt(delta.syncedAt || new Date().toISOString());
          setSyncStatus('synced');
          isHydratedRef.current = true;
          return true;
        }
      } catch (err) {
        console.debug('Incremental delta sync fallback to full rehydrate:', err);
      }
    }

    // 3. Full baseline reconciliation (on first boot, long offline gaps, or forced rebase)
    try {
      const remote = await fetchRemoteCalendar();
      if (!remote) {
        setSyncStatus('offline');
        return false;
      }

      if (remote.hasData) {
        // Collect server tombstones from remote.deletedRecords
        const serverDeletedIds = new Set<string>();
        const serverDeletedCircles = new Set<string>();
        if (Array.isArray(remote.deletedRecords)) {
          for (const rec of remote.deletedRecords) {
            if (rec.entityType === 'circle') {
              serverDeletedCircles.add(rec.id);
            } else {
              serverDeletedIds.add(rec.id);
            }
          }
        }

        // Filter local entities against server tombstones so phone deletions NEVER resurrect
        const activeLocalNotes = filterAndPromoteGuestNotes(currentStateRef.current.notes, 'note')
          .filter((n) => !serverDeletedIds.has(n.id) && !deletedIdsRef.current.has(n.id));
        const activeLocalWeekNotes = filterAndPromoteGuestNotes(currentStateRef.current.weekNotes, 'wnote')
          .filter((wn) => !serverDeletedIds.has(wn.id) && !deletedIdsRef.current.has(wn.id));
        const activeLocalMonthNotes = filterAndPromoteGuestNotes(currentStateRef.current.monthNotes, 'mnote')
          .filter((mn) => !serverDeletedIds.has(mn.id) && !deletedIdsRef.current.has(mn.id));
        const activeLocalDrawings = currentStateRef.current.drawings
          .filter((d) => !serverDeletedIds.has(d.id) && !deletedIdsRef.current.has(d.id));
        const activeLocalCircledDates = Object.fromEntries(
          Object.entries(currentStateRef.current.circledDates).filter(
            ([k]) => !serverDeletedCircles.has(k) && !deletedCircleKeysRef.current.has(k)
          )
        );

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

        const finalWeekIds = new Set(mergedWeekNotes.map((w) => w.id));
        const finalMonthIds = new Set(mergedMonthNotes.map((m) => m.id));
        const cleanMergedNotes = mergedNotes.filter(
          (n) => !finalWeekIds.has(n.id) && !finalMonthIds.has(n.id)
        );
        const cleanMergedWeekNotes = mergedWeekNotes.filter((w) => !finalMonthIds.has(w.id));

        setNotes(cleanMergedNotes);
        setWeekNotes(cleanMergedWeekNotes);
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

        if (remote.currentRevision) {
          storage.saveLastSyncedRevision(remote.currentRevision);
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
          if (result.revision) {
            storage.saveLastSyncedRevision(result.revision);
          }
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

  const syncDirtyQueueFromDiff = useCallback(
    (
      before: HistorySnapshot,
      after: HistorySnapshot
    ) => {
      // Notes diff
      const beforeNoteMap = new Map(before.notes.map((n) => [n.id, n]));
      const afterNoteMap = new Map(after.notes.map((n) => [n.id, n]));
      for (const [id, note] of afterNoteMap) {
        const prev = beforeNoteMap.get(id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(note)) {
          stageNoteUpsert(note);
        }
      }
      for (const id of beforeNoteMap.keys()) {
        if (!afterNoteMap.has(id)) {
          stageNoteDelete(id);
        }
      }

      // Week Notes diff
      const beforeWeekMap = new Map(before.weekNotes.map((wn) => [wn.id, wn]));
      const afterWeekMap = new Map(after.weekNotes.map((wn) => [wn.id, wn]));
      for (const [id, wn] of afterWeekMap) {
        const prev = beforeWeekMap.get(id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(wn)) {
          stageWeekNoteUpsert(wn);
        }
      }
      for (const id of beforeWeekMap.keys()) {
        if (!afterWeekMap.has(id)) {
          stageWeekNoteDelete(id);
        }
      }

      // Month Notes diff
      const beforeMonthMap = new Map(before.monthNotes.map((mn) => [mn.id, mn]));
      const afterMonthMap = new Map(after.monthNotes.map((mn) => [mn.id, mn]));
      for (const [id, mn] of afterMonthMap) {
        const prev = beforeMonthMap.get(id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(mn)) {
          stageMonthNoteUpsert(mn);
        }
      }
      for (const id of beforeMonthMap.keys()) {
        if (!afterMonthMap.has(id)) {
          stageMonthNoteDelete(id);
        }
      }

      // Drawings diff
      const beforeDrawMap = new Map(before.drawings.filter((d) => d.type !== 'circle').map((d) => [d.id, d]));
      const afterDrawMap = new Map(after.drawings.filter((d) => d.type !== 'circle').map((d) => [d.id, d]));
      for (const [id, d] of afterDrawMap) {
        const prev = beforeDrawMap.get(id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(d)) {
          stageDrawingUpsert(d);
        }
      }
      for (const id of beforeDrawMap.keys()) {
        if (!afterDrawMap.has(id)) {
          stageDrawingDelete(id);
        }
      }

      // Circled Dates diff
      const beforeCircles = before.circledDates || {};
      const afterCircles = after.circledDates || {};
      for (const [k, v] of Object.entries(afterCircles)) {
        if (!beforeCircles[k] || beforeCircles[k].color !== v.color) {
          stageCircleUpsert(k, v.color);
        }
      }
      for (const k of Object.keys(beforeCircles)) {
        if (!afterCircles[k]) {
          stageCircleDelete(k);
        }
      }
    },
    [
      stageNoteUpsert,
      stageNoteDelete,
      stageWeekNoteUpsert,
      stageWeekNoteDelete,
      stageMonthNoteUpsert,
      stageMonthNoteDelete,
      stageDrawingUpsert,
      stageDrawingDelete,
      stageCircleUpsert,
      stageCircleDelete,
    ]
  );

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const previous = undoStackRef.current.pop()!;
    const currentSnapshot: HistorySnapshot = {
      notes: currentStateRef.current.notes,
      weekNotes: currentStateRef.current.weekNotes,
      monthNotes: currentStateRef.current.monthNotes,
      drawings: currentStateRef.current.drawings,
      circledDates: currentStateRef.current.circledDates,
    };

    redoStackRef.current.push(currentSnapshot);

    if (redoStackRef.current.length > MAX_HISTORY_SNAPSHOTS) {
      redoStackRef.current.shift();
    }

    setNotes(previous.notes);
    setWeekNotes(previous.weekNotes);
    setMonthNotes(previous.monthNotes);
    setDrawings(previous.drawings);
    setCircledDates(previous.circledDates || {});

    syncDirtyQueueFromDiff(currentSnapshot, previous);

    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
  }, [syncDirtyQueueFromDiff]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop()!;
    const currentSnapshot: HistorySnapshot = {
      notes: currentStateRef.current.notes,
      weekNotes: currentStateRef.current.weekNotes,
      monthNotes: currentStateRef.current.monthNotes,
      drawings: currentStateRef.current.drawings,
      circledDates: currentStateRef.current.circledDates,
    };

    undoStackRef.current.push(currentSnapshot);

    if (undoStackRef.current.length > MAX_HISTORY_SNAPSHOTS) {
      undoStackRef.current.shift();
    }

    setNotes(next.notes);
    setWeekNotes(next.weekNotes);
    setMonthNotes(next.monthNotes);
    setDrawings(next.drawings);
    setCircledDates(next.circledDates || {});

    syncDirtyQueueFromDiff(currentSnapshot, next);

    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
  }, [syncDirtyQueueFromDiff]);

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

    const dirty = dirtyQueueRef.current;
    const hasNotesUpsert = dirty.notesUpsert.size > 0;
    const hasNotesDelete = dirty.notesDelete.size > 0;
    const hasWeekUpsert = dirty.weekNotesUpsert.size > 0;
    const hasWeekDelete = dirty.weekNotesDelete.size > 0;
    const hasMonthUpsert = dirty.monthNotesUpsert.size > 0;
    const hasMonthDelete = dirty.monthNotesDelete.size > 0;
    const hasDrawUpsert = dirty.drawingsUpsert.size > 0;
    const hasDrawDelete = dirty.drawingsDelete.size > 0;
    const hasCircleUpsert = Object.keys(dirty.circledDatesUpsert).length > 0;
    const hasCircleDelete = dirty.circledDatesDelete.size > 0;
    const hasSettings = dirty.settingsPartial !== null && Object.keys(dirty.settingsPartial).length > 0;

    const hasDirtyChanges =
      hasNotesUpsert ||
      hasNotesDelete ||
      hasWeekUpsert ||
      hasWeekDelete ||
      hasMonthUpsert ||
      hasMonthDelete ||
      hasDrawUpsert ||
      hasDrawDelete ||
      hasCircleUpsert ||
      hasCircleDelete ||
      hasSettings;

    const currentRevision = storage.loadLastSyncedRevision();

    // If there are no pending mutations and we already have a synced baseline revision, mark synced and exit
    if (!hasDirtyChanges && currentRevision > 0) {
      setSyncStatus('synced');
      return true;
    }

    setSyncStatus('syncing');

    // 1. Baseline Full Sync: if client has never synced (watermark === 0), do a baseline snapshot sync
    if (currentRevision === 0) {
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
        dirtyQueueRef.current = createEmptyDirtyQueue();
        deletedIdsRef.current.clear();
        deletedCircleKeysRef.current.clear();
        storage.clearDeletedCircleKeys();
        storage.clearDeletedIds();
        if (result.revision) {
          storage.saveLastSyncedRevision(result.revision);
        }
        setSyncStatus('synced');
        setLastSyncedAt(result.syncedAt || new Date().toISOString());
        return true;
      } else {
        setSyncStatus('offline');
        const delay = Math.min(2000 * Math.pow(1.5, retryAttemptRef.current), 30000);
        retryAttemptRef.current += 1;
        retryTimeoutRef.current = window.setTimeout(() => {
          retryTimeoutRef.current = null;
          performSyncRef.current?.();
        }, delay);
        return false;
      }
    }

    // 2. Incremental Log Sync (ILS): transmit row-level deltas to POST /api/calendar/delta
    const inFlightUpsertNotes = Array.from(dirty.notesUpsert.values());
    const inFlightDeleteNotes = Array.from(dirty.notesDelete);
    const inFlightUpsertWeek = Array.from(dirty.weekNotesUpsert.values());
    const inFlightDeleteWeek = Array.from(dirty.weekNotesDelete);
    const inFlightUpsertMonth = Array.from(dirty.monthNotesUpsert.values());
    const inFlightDeleteMonth = Array.from(dirty.monthNotesDelete);
    const inFlightUpsertDrawings = Array.from(dirty.drawingsUpsert.values());
    const inFlightDeleteDrawings = Array.from(dirty.drawingsDelete);
    const inFlightUpsertCircles = { ...dirty.circledDatesUpsert };
    const inFlightDeleteCircles = Array.from(dirty.circledDatesDelete);
    const inFlightSettings = dirty.settingsPartial ? { ...dirty.settingsPartial } : undefined;

    const deltaPayload: CalendarDeltaPayload = {};
    if (inFlightUpsertNotes.length > 0 || inFlightDeleteNotes.length > 0) {
      deltaPayload.notes = {
        upsert: inFlightUpsertNotes.length > 0 ? inFlightUpsertNotes : undefined,
        delete: inFlightDeleteNotes.length > 0 ? inFlightDeleteNotes : undefined,
      };
    }
    if (inFlightUpsertWeek.length > 0 || inFlightDeleteWeek.length > 0) {
      deltaPayload.weekNotes = {
        upsert: inFlightUpsertWeek.length > 0 ? inFlightUpsertWeek : undefined,
        delete: inFlightDeleteWeek.length > 0 ? inFlightDeleteWeek : undefined,
      };
    }
    if (inFlightUpsertMonth.length > 0 || inFlightDeleteMonth.length > 0) {
      deltaPayload.monthNotes = {
        upsert: inFlightUpsertMonth.length > 0 ? inFlightUpsertMonth : undefined,
        delete: inFlightDeleteMonth.length > 0 ? inFlightDeleteMonth : undefined,
      };
    }
    if (inFlightUpsertDrawings.length > 0 || inFlightDeleteDrawings.length > 0) {
      deltaPayload.drawings = {
        upsert: inFlightUpsertDrawings.length > 0 ? inFlightUpsertDrawings : undefined,
        delete: inFlightDeleteDrawings.length > 0 ? inFlightDeleteDrawings : undefined,
      };
    }
    if (Object.keys(inFlightUpsertCircles).length > 0 || inFlightDeleteCircles.length > 0) {
      deltaPayload.circledDates = {
        upsert: Object.keys(inFlightUpsertCircles).length > 0 ? inFlightUpsertCircles : undefined,
        delete: inFlightDeleteCircles.length > 0 ? inFlightDeleteCircles : undefined,
      };
    }
    if (inFlightSettings) {
      deltaPayload.settings = inFlightSettings;
    }

    const result = await saveRemoteCalendarDelta(deltaPayload);
    if (result && result.ok) {
      retryAttemptRef.current = 0;

      // Delta eviction: Remove only successfully committed items from dirty queue
      // (Preserves newer local edits that arrived while sync was in flight)
      for (const item of inFlightUpsertNotes) {
        if (dirtyQueueRef.current.notesUpsert.get(item.id)?.updatedAt === item.updatedAt) {
          dirtyQueueRef.current.notesUpsert.delete(item.id);
        }
      }
      for (const id of inFlightDeleteNotes) {
        dirtyQueueRef.current.notesDelete.delete(id);
        deletedIdsRef.current.delete(id);
        storage.removeDeletedId(id);
      }

      for (const item of inFlightUpsertWeek) {
        if (dirtyQueueRef.current.weekNotesUpsert.get(item.id)?.updatedAt === item.updatedAt) {
          dirtyQueueRef.current.weekNotesUpsert.delete(item.id);
        }
      }
      for (const id of inFlightDeleteWeek) {
        dirtyQueueRef.current.weekNotesDelete.delete(id);
        deletedIdsRef.current.delete(id);
        storage.removeDeletedId(id);
      }

      for (const item of inFlightUpsertMonth) {
        if (dirtyQueueRef.current.monthNotesUpsert.get(item.id)?.updatedAt === item.updatedAt) {
          dirtyQueueRef.current.monthNotesUpsert.delete(item.id);
        }
      }
      for (const id of inFlightDeleteMonth) {
        dirtyQueueRef.current.monthNotesDelete.delete(id);
        deletedIdsRef.current.delete(id);
        storage.removeDeletedId(id);
      }

      for (const item of inFlightUpsertDrawings) {
        dirtyQueueRef.current.drawingsUpsert.delete(item.id);
      }
      for (const id of inFlightDeleteDrawings) {
        dirtyQueueRef.current.drawingsDelete.delete(id);
        deletedIdsRef.current.delete(id);
        storage.removeDeletedId(id);
      }

      for (const dateKey of Object.keys(inFlightUpsertCircles)) {
        if (dirtyQueueRef.current.circledDatesUpsert[dateKey]?.color === inFlightUpsertCircles[dateKey]?.color) {
          delete dirtyQueueRef.current.circledDatesUpsert[dateKey];
        }
      }
      for (const dateKey of inFlightDeleteCircles) {
        dirtyQueueRef.current.circledDatesDelete.delete(dateKey);
        deletedCircleKeysRef.current.delete(dateKey);
        storage.removeDeletedCircleKey(dateKey);
      }

      if (dirtyQueueRef.current.settingsPartial) {
        dirtyQueueRef.current.settingsPartial = null;
      }

      if (result.revision) {
        storage.saveLastSyncedRevision(result.revision);
      }
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
        performSyncRef.current?.();
      }, delay);
      return false;
    }
  }, []);

  useEffect(() => {
    performSyncRef.current = performSync;
  }, [performSync]);

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

        const dirty = dirtyQueueRef.current;
        const lastRev = storage.loadLastSyncedRevision();

        if (lastRev > 0) {
          const inFlightUpsertNotes = Array.from(dirty.notesUpsert.values());
          const inFlightDeleteNotes = Array.from(dirty.notesDelete);
          const inFlightUpsertWeek = Array.from(dirty.weekNotesUpsert.values());
          const inFlightDeleteWeek = Array.from(dirty.weekNotesDelete);
          const inFlightUpsertMonth = Array.from(dirty.monthNotesUpsert.values());
          const inFlightDeleteMonth = Array.from(dirty.monthNotesDelete);
          const inFlightUpsertDrawings = Array.from(dirty.drawingsUpsert.values());
          const inFlightDeleteDrawings = Array.from(dirty.drawingsDelete);
          const inFlightUpsertCircles = { ...dirty.circledDatesUpsert };
          const inFlightDeleteCircles = Array.from(dirty.circledDatesDelete);

          const deltaPayload: CalendarDeltaPayload = {};
          let hasChanges = false;

          if (inFlightUpsertNotes.length > 0 || inFlightDeleteNotes.length > 0) {
            deltaPayload.notes = {
              upsert: inFlightUpsertNotes.length > 0 ? inFlightUpsertNotes : undefined,
              delete: inFlightDeleteNotes.length > 0 ? inFlightDeleteNotes : undefined,
            };
            hasChanges = true;
          }
          if (inFlightUpsertWeek.length > 0 || inFlightDeleteWeek.length > 0) {
            deltaPayload.weekNotes = {
              upsert: inFlightUpsertWeek.length > 0 ? inFlightUpsertWeek : undefined,
              delete: inFlightDeleteWeek.length > 0 ? inFlightDeleteWeek : undefined,
            };
            hasChanges = true;
          }
          if (inFlightUpsertMonth.length > 0 || inFlightDeleteMonth.length > 0) {
            deltaPayload.monthNotes = {
              upsert: inFlightUpsertMonth.length > 0 ? inFlightUpsertMonth : undefined,
              delete: inFlightDeleteMonth.length > 0 ? inFlightDeleteMonth : undefined,
            };
            hasChanges = true;
          }
          if (inFlightUpsertDrawings.length > 0 || inFlightDeleteDrawings.length > 0) {
            deltaPayload.drawings = {
              upsert: inFlightUpsertDrawings.length > 0 ? inFlightUpsertDrawings : undefined,
              delete: inFlightDeleteDrawings.length > 0 ? inFlightDeleteDrawings : undefined,
            };
            hasChanges = true;
          }
          if (Object.keys(inFlightUpsertCircles).length > 0 || inFlightDeleteCircles.length > 0) {
            deltaPayload.circledDates = {
              upsert: Object.keys(inFlightUpsertCircles).length > 0 ? inFlightUpsertCircles : undefined,
              delete: inFlightDeleteCircles.length > 0 ? inFlightDeleteCircles : undefined,
            };
            hasChanges = true;
          }
          if (dirty.settingsPartial) {
            deltaPayload.settings = dirty.settingsPartial;
            hasChanges = true;
          }

          if (hasChanges) {
            try {
              fetch('/api/calendar/delta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(deltaPayload),
                keepalive: true,
              }).catch(() => {});
            } catch {
              if (navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(deltaPayload)], { type: 'application/json' });
                navigator.sendBeacon('/api/calendar/delta', blob);
              }
            }
          }
        } else {
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
    dirtyQueueRef.current = createEmptyDirtyQueue();
    storage.saveLastSyncedRevision(0);
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
    const targets = parentDates.length > 0 ? parentDates : [formatDateKey(new Date())];
    const newNote: NoteItem = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      content: content.trim(),
      scope: 'day',
      targets,
      parentDates: targets,
      isStruck: false,
      colorTag,
      createdAt: new Date().toISOString(),
    };
    stageNoteUpsert(newNote);
    setNotes((prev) => [...prev, newNote]);
    return newNote;
  }, [recordHistory, stageNoteUpsert]);

  const toggleStrikeNote = useCallback((noteId: string) => {
    recordHistory(true);
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id === noteId) {
          const updated = { ...n, isStruck: !n.isStruck, updatedAt: new Date().toISOString() };
          stageNoteUpsert(updated);
          return updated;
        }
        return n;
      })
    );
  }, [recordHistory, stageNoteUpsert]);

  const removeNote = useCallback((noteId: string) => {
    recordHistory(true);
    stageNoteDelete(noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, [recordHistory, stageNoteDelete]);

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
          const updated = {
            ...n,
            originalContent: n.originalContent ?? n.content,
            content: trimmed,
            parentDates: newParentDates && newParentDates.length > 0 ? newParentDates : n.parentDates,
            colorTag: newColorTag !== undefined ? (newColorTag || undefined) : n.colorTag,
            updatedAt: new Date().toISOString(),
          };
          stageNoteUpsert(updated);
          return updated;
        }
        return n;
      })
    );
  }, [recordHistory, stageNoteUpsert]);

  const acceptNoteRevision = useCallback((noteId: string) => {
    recordHistory(true);
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id === noteId) {
          const updated = { ...n, originalContent: undefined, updatedAt: new Date().toISOString() };
          stageNoteUpsert(updated);
          return updated;
        }
        return n;
      })
    );
    setWeekNotes((prev) =>
      prev.map((wn) => {
        if (wn.id === noteId) {
          const updated = { ...wn, originalContent: undefined, updatedAt: new Date().toISOString() };
          stageWeekNoteUpsert(updated);
          return updated;
        }
        return wn;
      })
    );
    setMonthNotes((prev) =>
      prev.map((mn) => {
        if (mn.id === noteId) {
          const updated = { ...mn, originalContent: undefined, updatedAt: new Date().toISOString() };
          stageMonthNoteUpsert(updated);
          return updated;
        }
        return mn;
      })
    );
  }, [recordHistory, stageNoteUpsert, stageWeekNoteUpsert, stageMonthNoteUpsert]);

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
          stageNoteUpsert(updatedSourceNote);
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
    [recordHistory, stageNoteUpsert]
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
        stageNoteUpsert(updatedSourceNote);

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
    [recordHistory, stageNoteUpsert]
  );

  // Week notes
  const addWeekNote = useCallback((content: string, parentWeeks: string[], colorTag?: string) => {
    recordHistory(true);
    const newNote: WeekNote = {
      id: `wnote-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      content: content.trim(),
      scope: 'week',
      targets: parentWeeks,
      parentWeeks,
      isStruck: false,
      colorTag,
      createdAt: new Date().toISOString(),
    };
    stageWeekNoteUpsert(newNote);
    setWeekNotes((prev) => [...prev, newNote]);
    return newNote;
  }, [recordHistory, stageWeekNoteUpsert]);

  const toggleStrikeWeekNote = useCallback((noteId: string) => {
    recordHistory(true);
    setWeekNotes((prev) =>
      prev.map((wn) => {
        if (wn.id === noteId) {
          const updated = { ...wn, isStruck: !wn.isStruck, updatedAt: new Date().toISOString() };
          stageWeekNoteUpsert(updated);
          return updated;
        }
        return wn;
      })
    );
  }, [recordHistory, stageWeekNoteUpsert]);

  const removeWeekNote = useCallback((noteId: string) => {
    recordHistory(true);
    stageWeekNoteDelete(noteId);
    setWeekNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, [recordHistory, stageWeekNoteDelete]);

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
          const updated = {
            ...n,
            originalContent: n.originalContent ?? n.content,
            content: trimmed,
            parentWeeks: newParentWeeks && newParentWeeks.length > 0 ? newParentWeeks : n.parentWeeks,
            colorTag: newColorTag !== undefined ? (newColorTag || undefined) : n.colorTag,
            updatedAt: new Date().toISOString(),
          };
          stageWeekNoteUpsert(updated);
          return updated;
        }
        return n;
      })
    );
  }, [recordHistory, stageWeekNoteUpsert]);

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
          stageWeekNoteUpsert(updatedSourceNote);
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
    [recordHistory, stageWeekNoteUpsert]
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
        stageWeekNoteUpsert(updatedSourceNote);

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
    [recordHistory, stageWeekNoteUpsert]
  );

  // Month notes
  const addMonthNote = useCallback((content: string, parentMonths: string[], colorTag?: string) => {
    recordHistory(true);
    const newNote: MonthNote = {
      id: `mnote-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      content: content.trim(),
      scope: 'month',
      targets: parentMonths,
      parentMonths,
      isStruck: false,
      colorTag,
      createdAt: new Date().toISOString(),
    };
    stageMonthNoteUpsert(newNote);
    setMonthNotes((prev) => [...prev, newNote]);
    return newNote;
  }, [recordHistory, stageMonthNoteUpsert]);

  const toggleStrikeMonthNote = useCallback((noteId: string) => {
    recordHistory(true);
    setMonthNotes((prev) =>
      prev.map((mn) => {
        if (mn.id === noteId) {
          const updated = { ...mn, isStruck: !mn.isStruck, updatedAt: new Date().toISOString() };
          stageMonthNoteUpsert(updated);
          return updated;
        }
        return mn;
      })
    );
  }, [recordHistory, stageMonthNoteUpsert]);

  const removeMonthNote = useCallback((noteId: string) => {
    recordHistory(true);
    stageMonthNoteDelete(noteId);
    setMonthNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, [recordHistory, stageMonthNoteDelete]);

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
          const updated = {
            ...n,
            originalContent: n.originalContent ?? n.content,
            content: trimmed,
            parentMonths: newParentMonths && newParentMonths.length > 0 ? newParentMonths : n.parentMonths,
            colorTag: newColorTag !== undefined ? (newColorTag || undefined) : n.colorTag,
            updatedAt: new Date().toISOString(),
          };
          stageMonthNoteUpsert(updated);
          return updated;
        }
        return n;
      })
    );
  }, [recordHistory, stageMonthNoteUpsert]);

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
          stageMonthNoteUpsert(updatedSourceNote);
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
    [recordHistory, stageMonthNoteUpsert]
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
        stageMonthNoteUpsert(updatedSourceNote);

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
    [recordHistory, stageMonthNoteUpsert]
  );

  /**
   * Unified cross-horizon note move (Day <-> Week <-> Month)
   * Moves a note to a different scope and target keys in place without generating tombstones.
   */
  const moveNoteScope = useCallback(
    (
      noteId: string,
      targetScope: NoteScope,
      targetTargets: string[],
      position: 'start' | 'end' = 'end'
    ) => {
      recordHistory(true);
      const current = currentStateRef.current;
      const foundInNotes = current.notes.find((n) => n.id === noteId);
      const foundInWeek = current.weekNotes.find((wn) => wn.id === noteId);
      const foundInMonth = current.monthNotes.find((mn) => mn.id === noteId);
      const sourceNote = foundInNotes || foundInWeek || foundInMonth;

      if (!sourceNote) {
        console.warn(`[moveNoteScope] Note not found with id: ${noteId}`);
        return false;
      }

      // If scope and targets haven't changed, no-op
      const currentScope: NoteScope = foundInNotes ? 'day' : foundInWeek ? 'week' : 'month';
      const currentTargets = foundInNotes
        ? foundInNotes.parentDates
        : foundInWeek
        ? foundInWeek.parentWeeks
        : foundInMonth?.parentMonths || [];
      if (
        currentScope === targetScope &&
        currentTargets.length === targetTargets.length &&
        currentTargets.every((t, i) => t === targetTargets[i])
      ) {
        return true;
      }

      // 1. Remove from all collections
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      setWeekNotes((prev) => prev.filter((wn) => wn.id !== noteId));
      setMonthNotes((prev) => prev.filter((mn) => mn.id !== noteId));

      // 2. Build updated unified note (preserving originalContent, isStruck, strikeStyle, colorTag)
      const now = new Date().toISOString();
      const updatedNote: UnifiedNote = {
        ...sourceNote,
        scope: targetScope,
        targets: targetTargets,
        parentDates: targetScope === 'day' || targetScope === 'time' ? targetTargets : undefined,
        parentWeeks: targetScope === 'week' ? targetTargets : undefined,
        parentMonths: targetScope === 'month' ? targetTargets : undefined,
        updatedAt: now,
      };

      // 3. Insert into target collection and stage upsert
      if (targetScope === 'day' || targetScope === 'time') {
        const item = updatedNote as NoteItem;
        item.parentDates = targetTargets;
        setNotes((prev) => (position === 'start' ? [item, ...prev] : [...prev, item]));
        stageNoteUpsert(item);
      } else if (targetScope === 'week') {
        const item = updatedNote as WeekNote;
        item.parentWeeks = targetTargets;
        setWeekNotes((prev) => (position === 'start' ? [item, ...prev] : [...prev, item]));
        stageWeekNoteUpsert(item);
      } else if (targetScope === 'month') {
        const item = updatedNote as MonthNote;
        item.parentMonths = targetTargets;
        setMonthNotes((prev) => (position === 'start' ? [item, ...prev] : [...prev, item]));
        stageMonthNoteUpsert(item);
      }

      return true;
    },
    [recordHistory, stageNoteUpsert, stageWeekNoteUpsert, stageMonthNoteUpsert]
  );

  // Drawings
  const addDrawing = useCallback((drawingData: Omit<DrawingElement, 'id' | 'createdAt'>) => {
    recordHistory(true);
    const newDrawing: DrawingElement = {
      ...drawingData,
      id: `draw-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: new Date().toISOString(),
    };
    stageDrawingUpsert(newDrawing);
    setDrawings((prev) => [...prev, newDrawing]);
    return newDrawing;
  }, [recordHistory, stageDrawingUpsert]);

  const removeDrawing = useCallback((drawingId: string) => {
    recordHistory(false);
    stageDrawingDelete(drawingId);
    setDrawings((prev) => prev.filter((d) => d.id !== drawingId));
  }, [recordHistory, stageDrawingDelete]);

  const removeDrawings = useCallback((drawingIds: string[]) => {
    if (drawingIds.length === 0) return;
    recordHistory(false);
    for (const id of drawingIds) {
      stageDrawingDelete(id);
    }
    const idSet = new Set(drawingIds);
    setDrawings((prev) => prev.filter((d) => !idSet.has(d.id)));
  }, [recordHistory, stageDrawingDelete]);

  const updateDrawing = useCallback((drawingId: string, partial: Partial<DrawingElement>) => {
    recordHistory(true);
    setDrawings((prev) =>
      prev.map((d) => {
        if (d.id === drawingId) {
          const updated = { ...d, ...partial };
          stageDrawingUpsert(updated);
          return updated;
        }
        return d;
      })
    );
  }, [recordHistory, stageDrawingUpsert]);

  const clearAllDrawings = useCallback(() => {
    recordHistory(true);
    const drawingIds = currentStateRef.current.drawings.map((d) => d.id);
    for (const id of drawingIds) {
      stageDrawingDelete(id);
    }
    setDrawings([]);
  }, [recordHistory, stageDrawingDelete]);

  // First-class Circled Dates actions
  const toggleCircleDate = useCallback(
    (dateKey: string, color: string = CIRCLE_DATE_COLORS[0]) => {
      recordHistory();
      setCircledDates((prev) => {
        const next = { ...prev };
        if (next[dateKey]) {
          delete next[dateKey];
          stageCircleDelete(dateKey);
        } else {
          next[dateKey] = { color };
          stageCircleUpsert(dateKey, color);
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
    [recordHistory, stageCircleDelete, stageCircleUpsert]
  );

  const cycleCircleColor = useCallback(
    (dateKey: string) => {
      recordHistory();
      setCircledDates((prev) => {
        const existing = prev[dateKey];
        const currentColor = existing?.color || CIRCLE_DATE_COLORS[0];
        const currentIndex = (CIRCLE_DATE_COLORS as readonly string[]).indexOf(currentColor);
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % CIRCLE_DATE_COLORS.length;
        const nextColor = CIRCLE_DATE_COLORS[nextIndex];
        stageCircleUpsert(dateKey, nextColor);

        return {
          ...prev,
          [dateKey]: { color: nextColor },
        };
      });
    },
    [recordHistory, stageCircleUpsert]
  );

  const removeCircleDate = useCallback(
    (dateKey: string) => {
      recordHistory();
      stageCircleDelete(dateKey);

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
    [recordHistory, stageCircleDelete]
  );

  const updateSettings = useCallback((partial: Partial<CalendarSettings>) => {
    stageSettingsPartial(partial);
    setSettings((prev) => ({ ...prev, ...partial }));
  }, [stageSettingsPartial]);

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
      dirtyQueueRef.current = createEmptyDirtyQueue();
      setNotes(data.notes);
      setWeekNotes(data.weekNotes);
      setMonthNotes(data.monthNotes);
      setDrawings(data.drawings);
      if (data.circledDates) {
        setCircledDates(data.circledDates);
      }
      setSettings(data.settings);

      // Persist directly to backend SQLite to rebase server ledger
      const result = await saveRemoteCalendar({
        notes: data.notes,
        weekNotes: data.weekNotes,
        monthNotes: data.monthNotes,
        drawings: data.drawings.filter((d) => d.type !== 'circle'),
        circledDates: data.circledDates,
        settings: data.settings,
      });
      if (result && result.ok) {
        deletedIdsRef.current.clear();
        deletedCircleKeysRef.current.clear();
        storage.clearDeletedCircleKeys();
        storage.clearDeletedIds();
        if (result.revision) {
          storage.saveLastSyncedRevision(result.revision);
        }
        setLastSyncedAt(result.syncedAt || new Date().toISOString());
        setSyncStatus('synced');
      }
      return true;
    } catch (err) {
      console.error('Failed to import backup:', err);
      return false;
    }
  }, [recordHistory]);

  const allNotes = useMemo<UnifiedNote[]>(() => [
    ...notes.map((n) => ({ ...n, scope: (n.scope || 'day') as NoteScope, targets: n.targets || n.parentDates || [] })),
    ...weekNotes.map((wn) => ({ ...wn, scope: (wn.scope || 'week') as NoteScope, targets: wn.targets || wn.parentWeeks || [] })),
    ...monthNotes.map((mn) => ({ ...mn, scope: (mn.scope || 'month') as NoteScope, targets: mn.targets || mn.parentMonths || [] })),
  ], [notes, weekNotes, monthNotes]);

  return {
    notes,
    weekNotes,
    monthNotes,
    allNotes,
    moveNoteScope,
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

