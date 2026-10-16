import { useState, useMemo, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import type React from 'react';
import { ChevronLeft, ChevronRight, Compass } from 'lucide-react';
import type { NoteItem, MonthNote, DrawingElement, WeekStartDay, CalendarSettings } from '../types/calendar';
import { formatDateKey, MONTH_NAMES, FULL_MONTH_NAMES } from '../utils/dateUtils';
import { getSeasonalColor } from '../utils/seasonalColors';
import { getGutterDotsForNotes } from '../utils/annotationUtils';
import { MonthNotesColumn, type MonthMeta } from './radar/MonthNotesColumn';
import { ContinuousRadarGrid, type JigsawCell, type SvgBoundary } from './radar/ContinuousRadarGrid';
import { VerticalMonthGutter } from './radar/VerticalMonthGutter';
import { RadarDrawingOverlay } from './radar/RadarDrawingOverlay';

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
  onReorderMonthNotes?: (sourceNoteId: string, targetNoteId: string, position: 'before' | 'after', targetMonth?: string) => void;
  onMoveMonthNoteToMonth?: (noteId: string, targetMonth: string, position?: 'start' | 'end') => void;
  scrollTargetDate?: { dateString: string; key: number } | null;
  onAddDrawing: (d: Omit<DrawingElement, 'id' | 'createdAt'>) => DrawingElement;
  onRemoveDrawing: (id: string) => void;
  onRemoveDrawings?: (ids: string[]) => void;
  onToggleCircleDate?: (dateKey: string) => void;
  onCycleCircleColor?: (dateKey: string) => void;
  settings?: CalendarSettings;
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
export const JigsawMonthGrid: React.FC<JigsawMonthGridProps> = ({
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
  onReorderMonthNotes,
  onMoveMonthNoteToMonth,
  scrollTargetDate,
  onAddDrawing,
  onRemoveDrawing,
  onRemoveDrawings,
  onToggleCircleDate,
  onCycleCircleColor,
  settings,
}) => {
  const baseMonth = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1), []);
  const [pastMonthsCount, setPastMonthsCount] = useState(12);
  const [futureMonthsCount, setFutureMonthsCount] = useState(24);

  const [visibleMonth, setVisibleMonth] = useState<{
    name: string;
    fullName: string;
    year: number;
    monthIndex: number;
  }>(() => {
    const now = new Date();
    const m = now.getMonth();
    return {
      name: MONTH_NAMES[m],
      fullName: FULL_MONTH_NAMES[m],
      year: now.getFullYear(),
      monthIndex: m,
    };
  });

  const [quickInputMonth, setQuickInputMonth] = useState<string | null>(null);

  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const todayKey = useMemo(() => formatDateKey(new Date()), []);

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

  // Scroll compensation refs for seamless bi-directional prepending
  const prependScrollAdjustRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(null);
  const isPrependingRef = useRef(false);
  const isAppendingRef = useRef(false);

  const handleLoadEarlierMonths = useCallback(() => {
    if (isPrependingRef.current || !gridContainerRef.current) return;
    isPrependingRef.current = true;
    prependScrollAdjustRef.current = {
      prevScrollHeight: gridContainerRef.current.scrollHeight,
      prevScrollTop: gridContainerRef.current.scrollTop,
    };
    setPastMonthsCount((prev) => prev + 12);
  }, []);

  const handleLoadLaterMonths = useCallback(() => {
    if (isAppendingRef.current) return;
    isAppendingRef.current = true;
    setFutureMonthsCount((prev) => prev + 12);
    setTimeout(() => {
      isAppendingRef.current = false;
    }, 150);
  }, []);

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

  // Synchronously adjust scrollTop after prepending earlier months so content never jumps
  useLayoutEffect(() => {
    if (prependScrollAdjustRef.current && gridContainerRef.current) {
      const { prevScrollHeight, prevScrollTop } = prependScrollAdjustRef.current;
      const newScrollHeight = gridContainerRef.current.scrollHeight;
      const heightDiff = newScrollHeight - prevScrollHeight;
      if (heightDiff > 0) {
        gridContainerRef.current.scrollTop = prevScrollTop + heightDiff;
      }
      prependScrollAdjustRef.current = null;
      isPrependingRef.current = false;
    }
  }, [weeks]);

  // Scroll to a specific date in the radar grid smoothly
  const scrollToDateInRadar = useCallback(
    (targetDateKey: string, smooth = true) => {
      if (!gridContainerRef.current) return;

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
    [weeks, baseMonth, pastMonthsCount, futureMonthsCount]
  );

  // Scroll listener: updates currently visible month in header and triggers infinite scroll loading
  const handleScroll = useCallback(() => {
    if (!gridContainerRef.current) return;
    const container = gridContainerRef.current;
    const scrollTop = container.scrollTop;

    // Detect currently visible month
    const focusY = scrollTop + 80;
    const activeMeta = notesMonthMetas.find(
      (m) => m.topPx <= focusY && m.topPx + m.heightPx > focusY
    );
    if (activeMeta) {
      setVisibleMonth((prev) => {
        if (prev.monthIndex !== activeMeta.monthIndex || prev.year !== activeMeta.year) {
          return {
            name: activeMeta.name,
            fullName: activeMeta.fullName,
            year: activeMeta.year,
            monthIndex: activeMeta.monthIndex,
          };
        }
        return prev;
      });
    }

    // Infinite scroll thresholds
    if (scrollTop < 350) {
      handleLoadEarlierMonths();
    } else if (scrollTop + container.clientHeight > container.scrollHeight - 350) {
      handleLoadLaterMonths();
    }
  }, [notesMonthMetas, handleLoadEarlierMonths, handleLoadLaterMonths]);

  // Navigate months: scroll smoothly to prev / next month
  const handlePrevMonth = () => {
    if (!gridContainerRef.current) return;
    const currentScrollTop = gridContainerRef.current.scrollTop;
    const focusY = currentScrollTop + 80;
    const currentMetaIndex = notesMonthMetas.findIndex(
      (m) => m.topPx <= focusY && m.topPx + m.heightPx > focusY
    );
    if (currentMetaIndex > 0) {
      const prevMeta = notesMonthMetas[currentMetaIndex - 1];
      gridContainerRef.current.scrollTo({
        top: prevMeta.topPx,
        behavior: 'smooth',
      });
    } else {
      handleLoadEarlierMonths();
      gridContainerRef.current.scrollBy({ top: -CELL_HEIGHT * 5, behavior: 'smooth' });
    }
  };

  const handleNextMonth = () => {
    if (!gridContainerRef.current) return;
    const currentScrollTop = gridContainerRef.current.scrollTop;
    const focusY = currentScrollTop + 80;
    const currentMetaIndex = notesMonthMetas.findIndex(
      (m) => m.topPx <= focusY && m.topPx + m.heightPx > focusY
    );
    if (currentMetaIndex !== -1 && currentMetaIndex < notesMonthMetas.length - 1) {
      const nextMeta = notesMonthMetas[currentMetaIndex + 1];
      gridContainerRef.current.scrollTo({
        top: nextMeta.topPx,
        behavior: 'smooth',
      });
    } else {
      handleLoadLaterMonths();
      gridContainerRef.current.scrollBy({ top: CELL_HEIGHT * 5, behavior: 'smooth' });
    }
  };

  const handleResetToCurrent = () => {
    onJumpToToday();
    scrollToDateInRadar(todayKey, true);
  };

  const lastTargetKeyRef = useRef<number | null>(null);

  // Focus radar when scrollTargetDate changes (e.g. "Today" button or date click)
  useEffect(() => {
    if (!scrollTargetDate || scrollTargetDate.key === lastTargetKeyRef.current) return;
    lastTargetKeyRef.current = scrollTargetDate.key;

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
  const visibleSeasonal = getSeasonalColor(visibleMonth.monthIndex);

  return (
    <aside className="w-[580px] shrink-0 border-l border-[#E5DFD5] bg-[#FAF8F5] flex flex-col h-full select-none relative z-20 shadow-xs">
      {/* Top Header Bar */}
      <div className="h-11 border-b border-[#E5DFD5] px-3 flex items-center justify-between bg-[#FAF8F5]/90 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1 rounded hover:bg-[#EAE3D6] text-[#63666A] hover:text-[#2B2C30] transition-colors cursor-pointer"
            title="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-serif font-bold text-xs text-[#2B2C30] tracking-tight min-w-[125px] text-center flex items-center justify-center gap-1.5 px-2 py-0.5 rounded border border-[#E5DFD5]/70 bg-white/70 shadow-2xs">
            <span
              className="w-2 h-2 rounded-full shrink-0 shadow-2xs"
              style={{ backgroundColor: visibleSeasonal.accentTag }}
              title={`${visibleMonth.fullName} (${visibleSeasonal.season})`}
            />
            <span>{visibleMonth.fullName} {visibleMonth.year}</span>
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1 rounded hover:bg-[#EAE3D6] text-[#63666A] hover:text-[#2B2C30] transition-colors cursor-pointer"
            title="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleResetToCurrent}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-[#71727A] hover:text-[#2B2C30] hover:bg-[#EAE3D6]/70 rounded transition-colors cursor-pointer"
            title="Jump radar to today"
          >
            <Compass className="w-3 h-3 text-[#D23B38]" />
            <span>Today</span>
          </button>
        </div>
      </div>

      {/* Column Headers */}
      <div className="h-7 border-b border-[#E5DFD5] flex items-center bg-[#F7F4EC]/60 shrink-0">
        <div className="w-10 shrink-0 text-[10px] font-mono uppercase tracking-wider text-[#8E8F95] font-semibold text-center border-r border-[#E5DFD5]">
          Mo
        </div>
        <div
          className="shrink-0 grid grid-cols-7 text-center text-[10px] font-mono font-medium text-[#7E7F85] border-r border-[#E5DFD5]"
          style={{ width: `${gridWidth}px` }}
        >
          {dayHeaders.map((dh) => (
            <div key={dh}>{dh}</div>
          ))}
        </div>
        <div className="flex-1 text-[10px] font-mono uppercase tracking-wider text-[#8E8F95] font-semibold pl-3">
          Monthly Notes
        </div>
      </div>

      {/* Main Continuous Jigsaw Canvas (Left: Vertical Month Gutter, Center: 7-Day Grid, Right: Month Notes) */}
      <div
        ref={gridContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto relative flex scroll-smooth-focus"
      >
        {/* Interactive Radar Drawing Overlay for Pencil, Arrow, Eraser */}
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

        {/* 1. Left Column: Vertical Month Name Gutter */}
        <VerticalMonthGutter
          monthMetas={gutterMonthMetas}
          totalWeeksHeight={totalWeeksHeight}
          todayKey={todayKey}
          onJumpToMonth={(mKey) => scrollToDateInRadar(mKey + '-01', true)}
        />

        {/* 2. Center Column: 7-Day Continuous Radar Grid */}
        <ContinuousRadarGrid
          weeks={weeks}
          svgBoundaries={svgBoundaries}
          totalWeeksHeight={totalWeeksHeight}
          cellWidth={CELL_WIDTH}
          cellHeight={CELL_HEIGHT}
          onSelectDate={onSelectDate}
          selectedDateKey={scrollTargetDate?.dateString}
          onToggleCircleDate={handleToggleCircleDate}
          onCycleCircleColor={handleCycleCircleColor}
        />

        {/* 3. Right Column: Month Notes */}
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
          onReorderMonthNotes={onReorderMonthNotes}
          onMoveMonthNoteToMonth={onMoveMonthNoteToMonth}
          onJumpToMonth={(mKey) => scrollToDateInRadar(mKey + '-01', true)}
        />
      </div>
    </aside>
  );
};
