import { useState, useMemo, useRef, useEffect, useCallback, useLayoutEffect, memo } from 'react';
import type React from 'react';
import { ChevronLeft, ChevronRight, Compass, Plus } from 'lucide-react';
import type { NoteItem, MonthNote, NoteScope, DrawingElement, WeekStartDay, CalendarSettings } from '../types/calendar';
import { formatDateKey, MONTH_NAMES, FULL_MONTH_NAMES } from '../utils/dateUtils';
import { getSeasonalColor } from '../utils/seasonalColors';
import { getGutterDotsForNotes } from '../utils/annotationUtils';
import { MonthNotesColumn, type MonthMeta } from './radar/MonthNotesColumn';
import { ContinuousRadarGrid, type JigsawCell, type SvgBoundary } from './radar/ContinuousRadarGrid';
import { VerticalMonthGutter } from './radar/VerticalMonthGutter';
import { RadarDrawingOverlay } from './radar/RadarDrawingOverlay';
import { NoteCard } from './common/NoteCard';
import { MonthNoteInlineForm } from './radar/MonthNoteInlineForm';

interface JigsawMonthGridProps {
  onSelectDate: (dateKey: string) => void;
  notes: NoteItem[];
  monthNotes: MonthNote[];
  drawings: DrawingElement[];
  circledDates?: Record<string, { color: string }>;
  weekStartsOn: WeekStartDay;
  onJumpToToday: () => void;
  onAddMonthNote: (content: string, parentMonths: string[], colorTag?: string) => void;
  onToggleStrikeMonthNote: (id: string) => void;
  onRemoveMonthNote: (id: string) => void;
  onUpdateMonthNote?: (id: string, newContent: string, parentMonths?: string[], colorTag?: string) => void;
  onAcceptNoteRevision?: (noteId: string) => void;
  onReorderMonthNotes?: (sourceNoteId: string, targetNoteId: string, position: 'before' | 'after', targetMonth?: string) => void;
  onMoveMonthNoteToMonth?: (noteId: string, targetMonth: string, position?: 'start' | 'end') => void;
  onMoveNoteScope?: (noteId: string, targetScope: NoteScope, targetTargets: string[], position?: 'start' | 'end') => boolean;
  scrollTargetDate?: { dateString: string; key: number } | null;
  onAddDrawing: (d: Omit<DrawingElement, 'id' | 'createdAt'>) => DrawingElement;
  onRemoveDrawing: (id: string) => void;
  onRemoveDrawings?: (ids: string[]) => void;
  onToggleCircleDate?: (dateKey: string) => void;
  onCycleCircleColor?: (dateKey: string) => void;
  settings?: CalendarSettings;
  isCompact?: boolean;
  compactView?: 'stacked' | 'grid' | 'reflections';
  onCompactViewChange?: (view: 'stacked' | 'grid' | 'reflections') => void;
  onOpenFolio?: (noteId: string) => void;
  className?: string;
}

// Squarish, slightly taller cells with generous vertical height for monthly notes
const CELL_WIDTH = 38; // 38px wide
const CELL_HEIGHT = 48; // 48px tall (+41% vertical space for monthly notes)

/**
 * JigsawMonthGrid Architecture:
 * 
 * 1. Hybrid DOM + SVG Layout:
 *    - Interactive elements (cells, day numbers, note pips, buttons) are standard HTML/DOM elements
 *      inside `ContinuousRadarGrid` for full native web accessibility, keyboard navigation, and event handling.
 *    - The interlocking stepped boundaries between adjacent months are drawn using an SVG overlay
 *      (`<svg>` with `<line>` elements) positioned directly over the HTML calendar grid.
 * 
 * 2. Continuous 3-Column Visual Flow:
 *    - Left: `VerticalMonthGutter` (Month Names) spans through the row containing the LAST day of the month.
 *      Its bottom black CSS border aligns horizontally with the bottom horizontal jigsaw line under the month.
 *    - Center: `ContinuousRadarGrid` (7-Day Grid) renders the calendar cells and the SVG boundary overlay.
 *      The boundary line steps vertically between the previous month's end and the new month's beginning.
 *    - Right: `MonthNotesColumn` (Monthly Notes) begins at the row containing the 1ST day of the month.
 *      Its top dividing line connects with the top horizontal jigsaw line above the new month.
 * 
 * 3. Subpixel Alignment Math:
 *    - CSS `border-bottom: 2.5px solid #2B2C30` with `box-sizing: border-box` is rendered INSIDE the element,
 *      occupying pixels [Y - 2.5, Y] with its center at Y - 1.25.
 *    - SVG `<line>` with `stroke-width="2.5"` centers its stroke ON the coordinate line [Y - 1.25, Y + 1.25].
 *    - Therefore, horizontal SVG boundary lines are offset by -1.25px (Y - 1.25) so that the SVG stroke
 *      and CSS borders share the exact same pixel band [Y - 2.5, Y], eliminating vertical misalignments.
 */
export const JigsawMonthGrid: React.FC<JigsawMonthGridProps> = memo(({
  onSelectDate,
  notes,
  monthNotes,
  drawings,
  circledDates = {},
  weekStartsOn,
  onJumpToToday,
  onAddMonthNote,
  onToggleStrikeMonthNote,
  onRemoveMonthNote,
  onUpdateMonthNote,
  onAcceptNoteRevision,
  onReorderMonthNotes,
  onMoveMonthNoteToMonth,
  onMoveNoteScope,
  scrollTargetDate,
  onAddDrawing,
  onRemoveDrawing,
  onRemoveDrawings,
  onToggleCircleDate,
  onCycleCircleColor,
  settings,
  isCompact = false,
  compactView = 'stacked',
  onCompactViewChange,
  onOpenFolio,
  className = '',
}) => {
  const baseMonth = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1), []);
  const [pastMonthsCount, setPastMonthsCount] = useState(12);
  const [futureMonthsCount, setFutureMonthsCount] = useState(24);
  const [quickInputMonth, setQuickInputMonth] = useState<string | null>(null);

  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const todayKey = useMemo(() => formatDateKey(new Date()), []);
  const [focusedMonthKey, setFocusedMonthKey] = useState<string>(() => formatDateKey(new Date()).slice(0, 7));
  const lastActiveDateRef = useRef<string>(todayKey);
  const monthSectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const notesAnchorMonthRef = useRef<{ monthKey: string; offsetTop: number } | null>(null);

  // Map day notes by dateKey
  const notesByDateMap = useMemo(() => {
    const map = new Map<string, NoteItem[]>();
    for (const n of notes) {
      for (const d of n.parentDates) {
        const list = map.get(d) || [];
        list.push(n);
        map.set(d, list);
      }
    }
    return map;
  }, [notes]);

  // Map of circled dates directly from first-class state
  const circledDatesMap = useMemo(() => {
    return circledDates || {};
  }, [circledDates]);

  // Group month notes by monthKey
  const monthNotesByMonth = useMemo(() => {
    const map = new Map<string, MonthNote[]>();
    for (const mn of monthNotes) {
      for (const mKey of mn.parentMonths) {
        const list = map.get(mKey) || [];
        if (!list.some((x) => x.id === mn.id)) {
          list.push(mn);
        }
        map.set(mKey, list);
      }
    }
    return map;
  }, [monthNotes]);

  // Infinitely expandable continuous months window
  const targetMonths = useMemo(() => {
    const list: Date[] = [];
    const baseYear = baseMonth.getFullYear();
    const baseM = baseMonth.getMonth();

    for (let offset = -pastMonthsCount; offset <= futureMonthsCount; offset++) {
      list.push(new Date(baseYear, baseM + offset, 1));
    }
    return list;
  }, [baseMonth, pastMonthsCount, futureMonthsCount]);

  // Max rendered months to cap DOM node growth
  const MAX_RENDERED_MONTHS = 48; // ~4 years

  // Scroll anchor reference to guarantee subpixel-perfect scroll compensation across additions and evictions
  const scrollAnchorRef = useRef<{ dateKey: string; offsetInRow: number } | null>(null);
  const isPrependingRef = useRef(false);
  const isAppendingRef = useRef(false);
  const weeksRef = useRef<JigsawCell[][]>([]);

  const handleLoadEarlierMonths = useCallback(() => {
    const currentWeeks = weeksRef.current;
    if (isPrependingRef.current || !gridContainerRef.current || currentWeeks.length === 0) return;
    isPrependingRef.current = true;

    if (isCompact && compactView === 'reflections') {
      const containerRect = gridContainerRef.current.getBoundingClientRect();
      const firstVisible = Array.from(monthSectionRefs.current.entries()).find(([, el]) => {
        return el.getBoundingClientRect().bottom > containerRect.top;
      });
      if (firstVisible) {
        notesAnchorMonthRef.current = {
          monthKey: firstVisible[0],
          offsetTop: firstVisible[1].getBoundingClientRect().top - containerRect.top,
        };
      }
    } else {
      // Anchor to the date currently at the top of the viewport
      const currentScrollTop = gridContainerRef.current.scrollTop;
      const focusRow = Math.min(currentWeeks.length - 1, Math.max(0, Math.floor(currentScrollTop / CELL_HEIGHT)));
      const anchorDateKey = currentWeeks[focusRow]?.[0]?.dateKey;

      if (anchorDateKey) {
        scrollAnchorRef.current = {
          dateKey: anchorDateKey,
          offsetInRow: currentScrollTop % CELL_HEIGHT,
        };
      }
    }

    setPastMonthsCount((prev) => prev + 12);
    // Sliding window eviction: cap future months if exceeding MAX_RENDERED_MONTHS
    setFutureMonthsCount((prev) => {
      const total = pastMonthsCount + 12 + prev;
      return total > MAX_RENDERED_MONTHS ? Math.max(12, prev - 12) : prev;
    });
  }, [pastMonthsCount, isCompact, compactView]);

  const handleLoadLaterMonths = useCallback(() => {
    const currentWeeks = weeksRef.current;
    if (isAppendingRef.current || !gridContainerRef.current || currentWeeks.length === 0) return;
    isAppendingRef.current = true;

    // If total exceeds MAX_RENDERED_MONTHS and pastMonthsCount > 12, evict from top
    if (pastMonthsCount + futureMonthsCount + 12 > MAX_RENDERED_MONTHS && pastMonthsCount > 12) {
      if (isCompact && compactView === 'reflections') {
        const containerRect = gridContainerRef.current.getBoundingClientRect();
        const firstVisible = Array.from(monthSectionRefs.current.entries()).find(([, el]) => {
          return el.getBoundingClientRect().bottom > containerRect.top;
        });
        if (firstVisible) {
          notesAnchorMonthRef.current = {
            monthKey: firstVisible[0],
            offsetTop: firstVisible[1].getBoundingClientRect().top - containerRect.top,
          };
        }
      } else {
        const currentScrollTop = gridContainerRef.current.scrollTop;
        const focusRow = Math.min(currentWeeks.length - 1, Math.max(0, Math.floor(currentScrollTop / CELL_HEIGHT)));
        const anchorDateKey = currentWeeks[focusRow]?.[0]?.dateKey;

        if (anchorDateKey) {
          scrollAnchorRef.current = {
            dateKey: anchorDateKey,
            offsetInRow: currentScrollTop % CELL_HEIGHT,
          };
        }
      }
      setPastMonthsCount((prev) => Math.max(12, prev - 12));
    }

    setFutureMonthsCount((prev) => prev + 12);
    setTimeout(() => {
      isAppendingRef.current = false;
    }, 150);
  }, [pastMonthsCount, futureMonthsCount, isCompact, compactView]);

  // Calculate grid range & cells
  const { weeks, gutterMonthMetas, notesMonthMetas, totalWeeksHeight, svgBoundaries } = useMemo(() => {
    const firstMonth = targetMonths[0];
    const lastMonth = targetMonths[targetMonths.length - 1];
    const lastDayOfLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);

    const startDate = new Date(firstMonth);
    let startDayOfWeek = startDate.getDay();
    if (weekStartsOn === 1) {
      startDayOfWeek = (startDayOfWeek + 6) % 7;
    }
    startDate.setDate(startDate.getDate() - startDayOfWeek);

    const endDate = new Date(lastDayOfLastMonth);
    let endDayOfWeek = endDate.getDay();
    if (weekStartsOn === 1) {
      endDayOfWeek = (endDayOfWeek + 6) % 7;
    }
    const daysToAdd = 6 - endDayOfWeek;
    endDate.setDate(endDate.getDate() + daysToAdd);

    const allCells: JigsawCell[] = [];
    const curr = new Date(startDate);
    const targetMinKey = `${firstMonth.getFullYear()}-${String(firstMonth.getMonth() + 1).padStart(2, '0')}`;
    const targetMaxKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

    while (curr <= endDate) {
      const dKey = formatDateKey(curr);
      const mIdx = curr.getMonth();
      const y = curr.getFullYear();
      const mKey = `${y}-${String(mIdx + 1).padStart(2, '0')}`;
      const isOutside = mKey < targetMinKey || mKey > targetMaxKey;

      const circleInfo = circledDatesMap[dKey];
      const cellNotes = notesByDateMap.get(dKey) || [];
      const cellDots = getGutterDotsForNotes(cellNotes).dots;

      allCells.push({
        date: new Date(curr),
        dateKey: dKey,
        dayNumber: curr.getDate(),
        monthIndex: mIdx,
        year: y,
        monthKey: mKey,
        isToday: dKey === todayKey,
        hasNotes: cellNotes.length > 0,
        noteCount: cellNotes.length,
        noteColors: cellDots.map((d) => d.color),
        noteDots: cellDots.map((d) => ({ color: d.color, isResolved: d.isResolved })),
        isCircled: Boolean(circleInfo),
        circleColor: circleInfo?.color,
        isOutsideTargetRange: isOutside,
      });

      curr.setDate(curr.getDate() + 1);
    }

    // Chunk into 7-day rows
    const weekRows: JigsawCell[][] = [];
    for (let i = 0; i < allCells.length; i += 7) {
      weekRows.push(allCells.slice(i, i + 7));
    }

    // 1. Map row indices where each month's 1st day and last day fall
    const firstDateKeyToRow = new Map<string, number>();
    const lastDateKeyToRow = new Map<string, number>();
    weekRows.forEach((row, rIdx) => {
      row.forEach((cell) => {
        if (cell.dayNumber === 1) {
          firstDateKeyToRow.set(cell.monthKey, rIdx);
        }
        lastDateKeyToRow.set(cell.monthKey, rIdx);
      });
    });

    // 2. Gutter Month Metas (Left Column):
    // Spans through the row containing the LAST day of the month,
    // so the gutter's bottom black line flows directly into the bottom horizontal jigsaw line on the left.
    const gutterMonthMetas: MonthMeta[] = [];
    targetMonths.forEach((tm, idx) => {
      const y = tm.getFullYear();
      const m = tm.getMonth();
      const mKey = `${y}-${String(m + 1).padStart(2, '0')}`;

      const startRow = idx === 0 ? 0 : gutterMonthMetas[idx - 1].endRow + 1;
      let endRow: number;
      if (idx < targetMonths.length - 1) {
        endRow = lastDateKeyToRow.get(mKey) ?? (weekRows.length - 1);
      } else {
        endRow = weekRows.length - 1;
      }

      if (endRow < startRow) {
        endRow = startRow;
      }

      const totalRows = endRow - startRow + 1;
      gutterMonthMetas.push({
        monthKey: mKey,
        monthIndex: m,
        year: y,
        name: MONTH_NAMES[m],
        fullName: FULL_MONTH_NAMES[m],
        startRow,
        endRow,
        totalRows,
        topPx: startRow * CELL_HEIGHT,
        heightPx: totalRows * CELL_HEIGHT,
      });
    });

    // 3. Notes Month Metas (Right Column):
    // Starts on the row containing the 1st of the month,
    // so the notes top border flows directly from the top horizontal jigsaw line on the right.
    const notesMonthMetas: MonthMeta[] = [];
    targetMonths.forEach((tm, idx) => {
      const y = tm.getFullYear();
      const m = tm.getMonth();
      const mKey = `${y}-${String(m + 1).padStart(2, '0')}`;

      let startRow = firstDateKeyToRow.get(mKey) ?? 0;
      if (idx === 0) {
        startRow = 0;
      }

      let endRow: number;
      if (idx < targetMonths.length - 1) {
        const nextTm = targetMonths[idx + 1];
        const nextMKey = `${nextTm.getFullYear()}-${String(nextTm.getMonth() + 1).padStart(2, '0')}`;
        const nextStartRow = firstDateKeyToRow.get(nextMKey);
        endRow = nextStartRow !== undefined ? nextStartRow - 1 : weekRows.length - 1;
      } else {
        endRow = weekRows.length - 1;
      }

      if (endRow < startRow) {
        endRow = startRow;
      }

      const totalRows = endRow - startRow + 1;
      notesMonthMetas.push({
        monthKey: mKey,
        monthIndex: m,
        year: y,
        name: MONTH_NAMES[m],
        fullName: FULL_MONTH_NAMES[m],
        startRow,
        endRow,
        totalRows,
        topPx: startRow * CELL_HEIGHT,
        heightPx: totalRows * CELL_HEIGHT,
      });
    });

    // Gapless interlocking SVG boundaries between adjacent months
    const boundaries: SvgBoundary[] = [];
    for (let r = 0; r < weekRows.length; r++) {
      for (let c = 0; c < 7; c++) {
        const currentCell = weekRows[r][c];

        // Horizontal boundary with cell below:
        // Offset Y by -1.25px (half of 2.5px strokeWidth) so the center-stroked SVG line
        // aligns with subpixel precision to the CSS border-bottom in VerticalMonthGutter and MonthNotesColumn.
        if (r < weekRows.length - 1) {
          const belowCell = weekRows[r + 1][c];
          if (currentCell.monthKey !== belowCell.monthKey) {
            boundaries.push({
              x1: c * CELL_WIDTH,
              y1: (r + 1) * CELL_HEIGHT - 1.25,
              x2: (c + 1) * CELL_WIDTH,
              y2: (r + 1) * CELL_HEIGHT - 1.25,
            });
          }
        }

        // Vertical boundary with cell to right
        if (c < 6) {
          const rightCell = weekRows[r][c + 1];
          if (currentCell.monthKey !== rightCell.monthKey) {
            boundaries.push({
              x1: (c + 1) * CELL_WIDTH,
              y1: r * CELL_HEIGHT - 1.25,
              x2: (c + 1) * CELL_WIDTH,
              y2: (r + 1) * CELL_HEIGHT - 1.25,
            });
          }
        }
      }
    }

    return {
      weeks: weekRows,
      gutterMonthMetas,
      notesMonthMetas,
      totalWeeksHeight: weekRows.length * CELL_HEIGHT,
      svgBoundaries: boundaries,
    };
  }, [targetMonths, weekStartsOn, todayKey, notesByDateMap, circledDatesMap]);

  weeksRef.current = weeks;

  // Synchronously adjust scrollTop after prepending or evicting months so content never jumps
  useLayoutEffect(() => {
    if (notesAnchorMonthRef.current && gridContainerRef.current) {
      const el = monthSectionRefs.current.get(notesAnchorMonthRef.current.monthKey);
      if (el) {
        const newOffset = el.getBoundingClientRect().top - gridContainerRef.current.getBoundingClientRect().top;
        gridContainerRef.current.scrollTop += (newOffset - notesAnchorMonthRef.current.offsetTop);
      }
      notesAnchorMonthRef.current = null;
      isPrependingRef.current = false;
      return;
    }

    if (scrollAnchorRef.current && gridContainerRef.current && weeks.length > 0) {
      const { dateKey, offsetInRow } = scrollAnchorRef.current;
      const newRowIndex = weeks.findIndex((row) => row.some((c) => c.dateKey === dateKey));
      if (newRowIndex !== -1) {
        gridContainerRef.current.scrollTop = newRowIndex * CELL_HEIGHT + offsetInRow;
      }
      scrollAnchorRef.current = null;
      isPrependingRef.current = false;
    }
  }, [weeks]);

  // Scroll to a specific date in the radar grid smoothly
  const scrollToDateInRadar = useCallback(
    (targetDateKey: string, smooth = true) => {
      if (!gridContainerRef.current) return;

      if (isCompact && compactView === 'reflections') {
        const targetMonthKey = targetDateKey.slice(0, 7);
        const el = monthSectionRefs.current.get(targetMonthKey);
        if (el && gridContainerRef.current) {
          const container = gridContainerRef.current;
          const diff = el.getBoundingClientRect().top - container.getBoundingClientRect().top;
          container.scrollTo({
            top: container.scrollTop + diff - 8,
            behavior: smooth ? 'smooth' : 'auto',
          });
          return;
        }
      }

      const targetRowIndex = weeks.findIndex((row) =>
        row.some((cell) => cell.dateKey === targetDateKey)
      );

      if (targetRowIndex !== -1) {
        const rowTop = targetRowIndex * CELL_HEIGHT;
        const containerHeight = gridContainerRef.current.clientHeight || 500;
        const targetScrollTop = Math.max(0, rowTop - containerHeight / 2 + CELL_HEIGHT / 2);

        gridContainerRef.current.scrollTo({
          top: targetScrollTop,
          behavior: smooth ? 'smooth' : 'auto',
        });
      } else {
        // Expand range if target date is outside current loaded range
        const parts = targetDateKey.split('-');
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const targetDate = new Date(y, m, 1);
          const monthDiff =
            (targetDate.getFullYear() - baseMonth.getFullYear()) * 12 +
            (targetDate.getMonth() - baseMonth.getMonth());

          if (monthDiff < -pastMonthsCount) {
            setPastMonthsCount(Math.abs(monthDiff) + 6);
          } else if (monthDiff > futureMonthsCount) {
            setFutureMonthsCount(monthDiff + 6);
          }
        }
      }
    },
    [isCompact, compactView, weeks, baseMonth, pastMonthsCount, futureMonthsCount]
  );

  // Scroll listener: updates currently visible/centered month and triggers infinite scroll loading
  const handleScroll = useCallback(() => {
    if (!gridContainerRef.current) return;
    const container = gridContainerRef.current;
    const scrollTop = container.scrollTop;

    // Detect currently centered month in the visible radar viewport
    const centerY = scrollTop + container.clientHeight / 2;
    const activeMeta = notesMonthMetas.find(
      (m) => m.topPx <= centerY && m.topPx + m.heightPx > centerY
    );
    if (activeMeta) {
      lastActiveDateRef.current = activeMeta.monthKey + '-15';
      setFocusedMonthKey((prev) => (prev !== activeMeta.monthKey ? activeMeta.monthKey : prev));
    }

    // Infinite scroll thresholds
    if (scrollTop < 350) {
      handleLoadEarlierMonths();
    } else if (scrollTop + container.clientHeight > container.scrollHeight - 350) {
      handleLoadLaterMonths();
    }
  }, [notesMonthMetas, handleLoadEarlierMonths, handleLoadLaterMonths]);

  // Scroll listener for compact reflections roll: updates focused month and triggers infinite loading
  const handleNotesRollScroll = useCallback(() => {
    if (!gridContainerRef.current) return;
    const container = gridContainerRef.current;
    const scrollTop = container.scrollTop;

    // Detect currently visible month among monthSectionRefs
    const containerRect = container.getBoundingClientRect();
    const midY = containerRect.top + containerRect.height / 3;
    for (const [monthKey, el] of monthSectionRefs.current.entries()) {
      const rect = el.getBoundingClientRect();
      if (rect.top <= midY && rect.bottom >= midY) {
        lastActiveDateRef.current = monthKey + '-15';
        setFocusedMonthKey((prev) => (prev !== monthKey ? monthKey : prev));
        break;
      }
    }

    // Infinite scroll thresholds
    if (scrollTop < 300) {
      handleLoadEarlierMonths();
    } else if (scrollTop + container.clientHeight > container.scrollHeight - 300) {
      handleLoadLaterMonths();
    }
  }, [handleLoadEarlierMonths, handleLoadLaterMonths]);

  // Navigate months: scroll smoothly to prev / next month and center it
  const handlePrevMonth = () => {
    if (!gridContainerRef.current) return;
    const currentMetaIndex = notesMonthMetas.findIndex(
      (m) => m.monthKey === focusedMonthKey
    );
    if (currentMetaIndex > 0) {
      const prevMeta = notesMonthMetas[currentMetaIndex - 1];
      setFocusedMonthKey(prevMeta.monthKey);
      lastActiveDateRef.current = prevMeta.monthKey + '-15';
      scrollToDateInRadar(prevMeta.monthKey + '-15', true);
    } else {
      handleLoadEarlierMonths();
      gridContainerRef.current.scrollBy({ top: -CELL_HEIGHT * 5, behavior: 'smooth' });
    }
  };

  const handleNextMonth = () => {
    if (!gridContainerRef.current) return;
    const currentMetaIndex = notesMonthMetas.findIndex(
      (m) => m.monthKey === focusedMonthKey
    );
    if (currentMetaIndex !== -1 && currentMetaIndex < notesMonthMetas.length - 1) {
      const nextMeta = notesMonthMetas[currentMetaIndex + 1];
      setFocusedMonthKey(nextMeta.monthKey);
      lastActiveDateRef.current = nextMeta.monthKey + '-15';
      scrollToDateInRadar(nextMeta.monthKey + '-15', true);
    } else {
      handleLoadLaterMonths();
      gridContainerRef.current.scrollBy({ top: CELL_HEIGHT * 5, behavior: 'smooth' });
    }
  };

  const handleResetToCurrent = () => {
    setFocusedMonthKey(todayKey.slice(0, 7));
    lastActiveDateRef.current = todayKey;
    onJumpToToday();
    scrollToDateInRadar(todayKey, true);
  };

  const handleCellClick = useCallback(
    (dateKey: string) => {
      const mKey = dateKey.slice(0, 7);
      setFocusedMonthKey(mKey);
      lastActiveDateRef.current = dateKey;
      onSelectDate(dateKey);
    },
    [onSelectDate]
  );

  const handleJumpToMonth = useCallback(
    (mKey: string) => {
      setFocusedMonthKey(mKey);
      lastActiveDateRef.current = mKey + '-15';
      scrollToDateInRadar(mKey + '-15', true);
    },
    [scrollToDateInRadar]
  );

  const lastTargetKeyRef = useRef<number | null>(null);

  // Focus radar when scrollTargetDate changes (e.g. "Today" button or date click)
  useEffect(() => {
    if (!scrollTargetDate || scrollTargetDate.key === lastTargetKeyRef.current) return;
    lastTargetKeyRef.current = scrollTargetDate.key;
    const mKey = scrollTargetDate.dateString.slice(0, 7);
    setFocusedMonthKey(mKey);
    lastActiveDateRef.current = scrollTargetDate.dateString;
    scrollToDateInRadar(scrollTargetDate.dateString, true);
  }, [scrollTargetDate, scrollToDateInRadar]);

  // Initial mount: auto-focus and center today in the monthly radar without animation
  const hasInitiallyCenteredRef = useRef(false);
  useEffect(() => {
    if (!hasInitiallyCenteredRef.current && weeks.length > 0 && gridContainerRef.current) {
      hasInitiallyCenteredRef.current = true;
      scrollToDateInRadar(todayKey, false);
    }
  }, [weeks, todayKey, scrollToDateInRadar]);

  // Re-center radar or reflections on the active date/month when switching compactView
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      if (gridContainerRef.current && lastActiveDateRef.current) {
        scrollToDateInRadar(lastActiveDateRef.current, false);
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [compactView, isCompact, scrollToDateInRadar]);


  // Double-click date: toggle circle
  const handleToggleCircleDate = useCallback(
    (dateKey: string) => {
      onToggleCircleDate?.(dateKey);
    },
    [onToggleCircleDate]
  );

  // Single-click circle ring: cycle through colors
  const handleCycleCircleColor = useCallback(
    (dateKey: string) => {
      onCycleCircleColor?.(dateKey);
    },
    [onCycleCircleColor]
  );

  // Day header names based on weekStartsOn
  const dayHeaders = weekStartsOn === 0
    ? ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
    : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  const gridWidth = 7 * CELL_WIDTH; // 266px
  const focusedMeta = useMemo(() => {
    return (
      notesMonthMetas.find((m) => m.monthKey === focusedMonthKey) ||
      notesMonthMetas.find((m) => m.monthKey === todayKey.slice(0, 7)) ||
      notesMonthMetas[0]
    );
  }, [notesMonthMetas, focusedMonthKey, todayKey]);

  const focusedSeasonal = getSeasonalColor(
    focusedMeta ? focusedMeta.monthIndex : new Date().getMonth()
  );
  const focusedMonthName = focusedMeta
    ? `${focusedMeta.fullName} ${focusedMeta.year}`
    : '';
  const focusedMonthNotes = monthNotesByMonth.get(focusedMonthKey) || [];

  const availableMonths = useMemo(() => {
    return targetMonths.map((d) => {
      const mIdx = d.getMonth();
      const yr = d.getFullYear();
      const mKey = `${yr}-${String(mIdx + 1).padStart(2, '0')}`;
      return {
        monthKey: mKey,
        label: `${FULL_MONTH_NAMES[mIdx]} ${yr}`,
      };
    });
  }, [targetMonths]);

  const asideClass = className
    ? className
    : isCompact
    ? 'w-[306px] shrink-0 border-l border-[#E5DFD5] bg-[#FAF8F5] flex flex-col h-full select-none relative z-20 shadow-xs'
    : 'w-[580px] shrink-0 border-l border-[#E5DFD5] bg-[#FAF8F5] flex flex-col h-full select-none relative z-20 shadow-xs';

  return (
    <aside className={asideClass}>
      {/* Top Header Bar */}
      <div className="h-11 border-b border-[#E5DFD5] px-2.5 flex items-center justify-between bg-[#FAF8F5]/90 shrink-0">
        {isCompact && onCompactViewChange ? (
          /* Compact View Switcher: Split | Grid | Notes */
          <div className="flex items-center bg-[#F2EDE4] p-0.5 rounded-md border border-[#DDD6C8] text-[11px] font-mono">
            <button
              type="button"
              onClick={() => onCompactViewChange('stacked')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                compactView === 'stacked'
                  ? 'bg-[#FAF8F5] text-[#2B2C30] font-bold shadow-2xs'
                  : 'text-[#71727A] hover:text-[#2B2C30]'
              }`}
              title="Split View: Continuous Radar Grid + Month Reflections"
            >
              Split
            </button>
            <button
              type="button"
              onClick={() => onCompactViewChange('grid')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                compactView === 'grid'
                  ? 'bg-[#FAF8F5] text-[#2B2C30] font-bold shadow-2xs'
                  : 'text-[#71727A] hover:text-[#2B2C30]'
              }`}
              title="Full Month Grid"
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => onCompactViewChange('reflections')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                compactView === 'reflections'
                  ? 'bg-[#FAF8F5] text-[#2B2C30] font-bold shadow-2xs'
                  : 'text-[#71727A] hover:text-[#2B2C30]'
              }`}
              title="Full Continuous Reflections Roll"
            >
              Notes
            </button>
          </div>
        ) : (
          /* Desktop / Mobile Title */
          <div className="flex items-center gap-1.5 font-serif font-bold text-xs text-[#2B2C30] tracking-tight">
            <span>Months</span>
          </div>
        )}

        {/* Right: Month Navigation (< >) & Today Button */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded hover:bg-[#EAE3D6] text-[#63666A] hover:text-[#2B2C30] transition-colors cursor-pointer"
              title="Scroll to previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded hover:bg-[#EAE3D6] text-[#63666A] hover:text-[#2B2C30] transition-colors cursor-pointer"
              title="Scroll to next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetToCurrent}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-[#71727A] hover:text-[#2B2C30] hover:bg-[#EAE3D6]/70 rounded transition-colors cursor-pointer border border-[#E5DFD5]"
            title="Jump calendar to today"
          >
            <Compass className="w-3 h-3 text-[#D23B38]" />
            <span>Today</span>
          </button>
        </div>
      </div>

      {/* Column Headers */}
      <div className="h-7 border-b border-[#E5DFD5] flex items-center bg-[#F7F4EC]/60 shrink-0">
        {(!isCompact || compactView !== 'reflections') && (
          <div className="w-10 shrink-0 text-[10px] font-mono uppercase tracking-wider text-[#8E8F95] font-semibold text-center border-r border-[#E5DFD5]">
            Mo
          </div>
        )}
        {(!isCompact || compactView !== 'reflections') && (
          <div
            className={`shrink-0 grid grid-cols-7 text-center text-[10px] font-mono font-medium text-[#7E7F85] ${
              !isCompact ? 'border-r border-[#E5DFD5]' : ''
            }`}
            style={{ width: `${gridWidth}px` }}
          >
            {dayHeaders.map((dh) => (
              <div key={dh}>{dh}</div>
            ))}
          </div>
        )}
        {(!isCompact || compactView === 'reflections') && (
          <div className="flex-1 text-[10px] font-mono uppercase tracking-wider text-[#8E8F95] font-semibold pl-3 truncate">
            Monthly Reflections
          </div>
        )}
      </div>

      {/* Main Content Areas */}
      {!isCompact || compactView !== 'reflections' ? (
        <>
          {/* Top/Main Pane: Continuous Radar Grid (shared DOM container between stacked, grid, and desktop) */}
          <div
            ref={gridContainerRef}
            onScroll={handleScroll}
            className={`overflow-y-auto relative flex scroll-smooth-focus ${
              isCompact && compactView === 'stacked'
                ? 'shrink-0 max-h-[50%] h-[350px] border-b border-[#E5DFD5]'
                : 'flex-1 h-full'
            }`}
            style={{ overflowAnchor: 'none' }}
          >
            {settings && (
              <RadarDrawingOverlay
                tool={settings.activeTool}
                inkColor={settings.inkColor}
                drawings={drawings}
                onAddDrawing={onAddDrawing}
                onRemoveDrawing={onRemoveDrawing}
                onRemoveDrawings={onRemoveDrawings}
                totalWeeksHeight={totalWeeksHeight}
                cellHeight={CELL_HEIGHT}
                weeks={weeks}
              />
            )}
            <VerticalMonthGutter
              monthMetas={gutterMonthMetas}
              totalWeeksHeight={totalWeeksHeight}
              todayKey={todayKey}
              onJumpToMonth={handleJumpToMonth}
            />
            <ContinuousRadarGrid
              weeks={weeks}
              svgBoundaries={svgBoundaries}
              totalWeeksHeight={totalWeeksHeight}
              cellWidth={CELL_WIDTH}
              cellHeight={CELL_HEIGHT}
              onSelectDate={handleCellClick}
              selectedDateKey={scrollTargetDate?.dateString}
              onToggleCircleDate={handleToggleCircleDate}
              onCycleCircleColor={handleCycleCircleColor}
            />
            {!isCompact && (
              <MonthNotesColumn
                monthMetas={notesMonthMetas}
                monthNotesByMonth={monthNotesByMonth}
                totalWeeksHeight={totalWeeksHeight}
                todayKey={todayKey}
                quickInputMonth={quickInputMonth}
                onStartQuickAddMonth={(mKey) => setQuickInputMonth(mKey)}
                onCancelQuickAddMonth={() => setQuickInputMonth(null)}
                onAddMonthNote={onAddMonthNote}
                onToggleStrikeMonthNote={onToggleStrikeMonthNote}
                onRemoveMonthNote={onRemoveMonthNote}
                onUpdateMonthNote={onUpdateMonthNote}
                onAcceptNoteRevision={onAcceptNoteRevision}
                onReorderMonthNotes={onReorderMonthNotes}
                onMoveMonthNoteToMonth={onMoveMonthNoteToMonth}
                onMoveNoteScope={onMoveNoteScope}
                onJumpToMonth={handleJumpToMonth}
                onOpenFolio={onOpenFolio}
              />
            )}
          </div>

          {/* Stacked Divider & Reflections Pane below radar grid */}
          {isCompact && compactView === 'stacked' && (
            <>
              {/* Stacked Divider: Active Focused Month Header */}
              <div
                className="border-t-2 border-[#2B2C30] px-3 py-1.5 flex items-center justify-between text-[11px] font-mono shrink-0 transition-colors shadow-2xs"
                style={{ backgroundColor: focusedSeasonal.notesBg }}
              >
                <div className="flex items-center gap-1.5 font-semibold text-[#2B2C30] truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                    style={{ backgroundColor: focusedSeasonal.accentTag }}
                  />
                  <span className="truncate">{focusedMonthName} Reflections</span>
                  {focusedMonthNotes.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-[#E5DFD5] text-[#2B2C30] text-[10px] font-bold">
                      {focusedMonthNotes.length}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setQuickInputMonth(focusedMonthKey)}
                  className="flex items-center gap-0.5 text-[#2B2C30] hover:text-[#D23B38] font-bold cursor-pointer text-[10px] uppercase tracking-wider"
                  title={`Add reflection for ${focusedMonthName}`}
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
              </div>

              {/* Bottom Pane: Active Month Reflections with Generous Vertical Space */}
              <div className="flex-1 min-h-0 overflow-y-auto p-2 bg-[#FAF8F5] flex flex-col gap-1.5">
                {quickInputMonth === focusedMonthKey && (
                  <div className="mb-2">
                    <MonthNoteInlineForm
                      currentMonthKey={focusedMonthKey}
                      availableMonths={availableMonths}
                      onSubmit={(content, parentMonths, colorTag) => {
                        onAddMonthNote(content, parentMonths, colorTag);
                        setQuickInputMonth(null);
                      }}
                      onCancel={() => setQuickInputMonth(null)}
                    />
                  </div>
                )}

                {focusedMonthNotes.length === 0 && quickInputMonth !== focusedMonthKey && (
                  <div
                    onDoubleClick={() => setQuickInputMonth(focusedMonthKey)}
                    className="text-xs text-[#A19D94] italic py-6 text-center cursor-pointer hover:text-[#7E7F85]"
                  >
                    No reflections recorded for {focusedMonthName}.
                    <br />
                    <span className="text-[10px] text-[#71727A] not-italic mt-1 inline-block">
                      Double-click or tap Add to record.
                    </span>
                  </div>
                )}

                {focusedMonthNotes.map((note) => (
                  <div key={note.id} className="relative">
                    <NoteCard
                      id={note.id}
                      content={note.content}
                      originalContent={note.originalContent}
                      isStruck={note.isStruck}
                      colorTag={note.colorTag}
                      density="compact"
                      variant="minimal"
                      onToggleStrike={onToggleStrikeMonthNote}
                      onRemove={onRemoveMonthNote}
                      onUpdate={(id, text) => {
                        onUpdateMonthNote?.(id, text, note.parentMonths, note.colorTag);
                      }}
                      onAcceptEdit={onAcceptNoteRevision}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        /* isCompact && compactView === 'reflections' */
        <div
          ref={gridContainerRef}
          onScroll={handleNotesRollScroll}
          className="flex-1 overflow-y-auto p-2.5 bg-[#FAF8F5] flex flex-col gap-3 select-none"
          style={{ overflowAnchor: 'none' }}
        >
          {notesMonthMetas.map((m) => {
            const notes = monthNotesByMonth.get(m.monthKey) || [];
            const isAdding = quickInputMonth === m.monthKey;
            const seasonal = getSeasonalColor(m.monthIndex);
            const isCurrent = m.monthKey === todayKey.slice(0, 7);

            return (
              <div
                key={m.monthKey}
                ref={(el) => {
                  if (el) monthSectionRefs.current.set(m.monthKey, el);
                  else monthSectionRefs.current.delete(m.monthKey);
                }}
                className={`rounded-lg border transition-colors ${
                  isCurrent
                    ? 'border-[#D23B38] bg-[#FAF7F2] shadow-xs'
                    : 'border-[#E5DFD5] bg-[#FAF8F5]'
                }`}
                style={{
                  borderLeftWidth: '3.5px',
                  borderLeftColor: seasonal.accentTag,
                }}
              >
                {/* Month Header on TOP of Notes */}
                <div
                  className="px-2.5 py-1.5 flex items-center justify-between border-b border-[#E5DFD5]/80 transition-colors rounded-t-lg"
                  style={{ backgroundColor: seasonal.notesBg }}
                >
                  <div className="flex items-center gap-1.5 font-serif font-bold text-xs text-[#2B2C30] truncate">
                    <span
                      className="w-2 h-2 rounded-full shrink-0 shadow-2xs"
                      style={{ backgroundColor: seasonal.accentTag }}
                    />
                    <span className="truncate">{m.fullName} {m.year}</span>
                    {isCurrent && (
                      <span className="text-[9px] font-mono uppercase bg-[#2B2C30] text-[#FAF8F5] px-1 py-0.2 rounded font-bold">
                        Today
                      </span>
                    )}
                    {notes.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-[#E5DFD5] text-[#2B2C30] text-[10px] font-mono font-bold">
                        {notes.length}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setQuickInputMonth(m.monthKey)}
                    className="flex items-center gap-0.5 text-[#2B2C30] hover:text-[#D23B38] font-bold cursor-pointer text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded hover:bg-black/5 transition-colors shrink-0"
                    title={`Add reflection for ${m.fullName}`}
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add</span>
                  </button>
                </div>

                {/* Notes Content */}
                <div className="p-2 flex flex-col gap-1.5">
                  {isAdding && (
                    <div className="mb-2">
                      <MonthNoteInlineForm
                        currentMonthKey={m.monthKey}
                        availableMonths={availableMonths}
                        onSubmit={(content, parentMonths, colorTag) => {
                          onAddMonthNote(content, parentMonths, colorTag);
                          setQuickInputMonth(null);
                        }}
                        onCancel={() => setQuickInputMonth(null)}
                      />
                    </div>
                  )}

                  {notes.length === 0 && !isAdding && (
                    <div
                      onDoubleClick={() => setQuickInputMonth(m.monthKey)}
                      className="text-xs text-[#A19D94] italic py-2.5 text-center cursor-pointer hover:text-[#7E7F85]"
                    >
                      No reflections for {m.name}. Tap Add to write.
                    </div>
                  )}

                  {notes.map((note) => (
                    <div key={note.id} className="relative">
                      <NoteCard
                        id={note.id}
                        content={note.content}
                        originalContent={note.originalContent}
                        isStruck={note.isStruck}
                        colorTag={note.colorTag}
                        density="compact"
                        variant="minimal"
                        onToggleStrike={onToggleStrikeMonthNote}
                        onRemove={onRemoveMonthNote}
                        onUpdate={(id, text) => {
                          onUpdateMonthNote?.(id, text, note.parentMonths, note.colorTag);
                        }}
                        onAcceptEdit={onAcceptNoteRevision}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
});
