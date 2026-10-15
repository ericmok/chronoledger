import { useState, useMemo, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import type React from 'react';
import { ChevronLeft, ChevronRight, Compass } from 'lucide-react';
import type { NoteItem, MonthNote, DrawingElement, WeekStartDay, CalendarSettings } from '../types/calendar';
import { formatDateKey, MONTH_NAMES, FULL_MONTH_NAMES } from '../utils/dateUtils';
import { getSeasonalColor } from '../utils/seasonalColors';
import { MonthNotesColumn, type MonthMeta } from './radar/MonthNotesColumn';
import { ContinuousRadarGrid, type JigsawCell, type SvgBoundary } from './radar/ContinuousRadarGrid';
import { VerticalMonthGutter } from './radar/VerticalMonthGutter';
import { RadarDrawingOverlay } from './radar/RadarDrawingOverlay';

interface JigsawMonthGridProps {
  onSelectDate: (dateKey: string) => void;
  notes: NoteItem[];
  monthNotes: MonthNote[];
  drawings: DrawingElement[];
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
  onUpdateDrawing?: (id: string, partial: Partial<DrawingElement>) => void;
  settings?: CalendarSettings;
}

const RADAR_CIRCLE_COLORS = [
  '#D23B38', // 1. Red Pencil (Deadlines / Milestones)
  '#2A9D8F', // 2. Pine / Sage (Completed / Events)
  '#E9C46A', // 3. Warm Ochre (Special dates / Highlights)
];

// Squarish, slightly taller cells with generous vertical height for monthly notes
const CELL_WIDTH = 38; // 38px wide
const CELL_HEIGHT = 48; // 48px tall (+41% vertical space for monthly notes)

export const JigsawMonthGrid: React.FC<JigsawMonthGridProps> = ({
  onSelectDate,
  notes,
  monthNotes,
  drawings,
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
  onUpdateDrawing,
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

  // Map day notes count
  const notesCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notes) {
      for (const d of n.parentDates) {
        map.set(d, (map.get(d) || 0) + 1);
      }
    }
    return map;
  }, [notes]);

  // Map of circled dates with their drawing ID and color
  const circledDatesMap = useMemo(() => {
    const map = new Map<string, { id: string; color: string }>();
    for (const d of drawings) {
      if (d.type === 'circle' && d.anchorStartDate) {
        map.set(d.anchorStartDate, { id: d.id, color: d.color });
      }
    }
    return map;
  }, [drawings]);

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
  const { weeks, monthMetas, totalWeeksHeight, svgBoundaries } = useMemo(() => {
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

      const circleInfo = circledDatesMap.get(dKey);

      allCells.push({
        date: new Date(curr),
        dateKey: dKey,
        dayNumber: curr.getDate(),
        monthIndex: mIdx,
        year: y,
        monthKey: mKey,
        isToday: dKey === todayKey,
        hasNotes: (notesCountMap.get(dKey) || 0) > 0,
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

    // Map the week row index where each month's 1st day falls
    const firstDateKeyToRow = new Map<string, number>();
    weekRows.forEach((row, rIdx) => {
      row.forEach((cell) => {
        if (cell.dayNumber === 1) {
          firstDateKeyToRow.set(cell.monthKey, rIdx);
        }
      });
    });

    // Compute month metas aligned strictly to start on the 1st
    const metas: MonthMeta[] = [];
    targetMonths.forEach((tm, idx) => {
      const y = tm.getFullYear();
      const m = tm.getMonth();
      const mKey = `${y}-${String(m + 1).padStart(2, '0')}`;

      // Start row: starts on the row containing the 1st of this month
      // For the first buffer month (idx === 0), anchor to row 0 so there is no gap at the top
      let startRow = firstDateKeyToRow.get(mKey) ?? 0;
      if (idx === 0) {
        startRow = 0;
      }

      // End row: ends right before the next month's 1st begins
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
      metas.push({
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

        // Horizontal boundary with cell below
        if (r < weekRows.length - 1) {
          const belowCell = weekRows[r + 1][c];
          if (currentCell.monthKey !== belowCell.monthKey) {
            boundaries.push({
              x1: c * CELL_WIDTH,
              y1: (r + 1) * CELL_HEIGHT,
              x2: (c + 1) * CELL_WIDTH,
              y2: (r + 1) * CELL_HEIGHT,
            });
          }
        }

        // Vertical boundary with cell to right
        if (c < 6) {
          const rightCell = weekRows[r][c + 1];
          if (currentCell.monthKey !== rightCell.monthKey) {
            boundaries.push({
              x1: (c + 1) * CELL_WIDTH,
              y1: r * CELL_HEIGHT,
              x2: (c + 1) * CELL_WIDTH,
              y2: (r + 1) * CELL_HEIGHT,
            });
          }
        }
      }
    }

    return {
      weeks: weekRows,
      monthMetas: metas,
      totalWeeksHeight: weekRows.length * CELL_HEIGHT,
      svgBoundaries: boundaries,
    };
  }, [targetMonths, weekStartsOn, todayKey, notesCountMap, circledDatesMap]);

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
    const activeMeta = monthMetas.find(
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
  }, [monthMetas, handleLoadEarlierMonths, handleLoadLaterMonths]);

  // Navigate months: scroll smoothly to prev / next month
  const handlePrevMonth = () => {
    if (!gridContainerRef.current) return;
    const currentScrollTop = gridContainerRef.current.scrollTop;
    const focusY = currentScrollTop + 80;
    const currentMetaIndex = monthMetas.findIndex(
      (m) => m.topPx <= focusY && m.topPx + m.heightPx > focusY
    );
    if (currentMetaIndex > 0) {
      const prevMeta = monthMetas[currentMetaIndex - 1];
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
    const currentMetaIndex = monthMetas.findIndex(
      (m) => m.topPx <= focusY && m.topPx + m.heightPx > focusY
    );
    if (currentMetaIndex !== -1 && currentMetaIndex < monthMetas.length - 1) {
      const nextMeta = monthMetas[currentMetaIndex + 1];
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
      const existing = circledDatesMap.get(dateKey);
      if (existing) {
        onRemoveDrawing(existing.id);
      } else {
        onAddDrawing({
          type: 'circle',
          color: RADAR_CIRCLE_COLORS[0],
          strokeWidth: 2,
          anchorStartDate: dateKey,
          startOffset: { x: 95, y: 18 },
          points: [[18, 18]],
        });
      }
    },
    [circledDatesMap, onAddDrawing, onRemoveDrawing]
  );

  // Single-click circle ring: cycle through 3 colors
  const handleCycleCircleColor = useCallback(
    (dateKey: string) => {
      const existing = circledDatesMap.get(dateKey);
      if (existing) {
        const currentIndex = RADAR_CIRCLE_COLORS.indexOf(existing.color);
        const nextIndex = (currentIndex + 1) % RADAR_CIRCLE_COLORS.length;
        const nextColor = RADAR_CIRCLE_COLORS[nextIndex];
        if (onUpdateDrawing) {
          onUpdateDrawing(existing.id, { color: nextColor });
        } else {
          onRemoveDrawing(existing.id);
          onAddDrawing({
            type: 'circle',
            color: nextColor,
            strokeWidth: 2,
            anchorStartDate: dateKey,
            startOffset: { x: 95, y: 18 },
            points: [[18, 18]],
          });
        }
      } else {
        handleToggleCircleDate(dateKey);
      }
    },
    [circledDatesMap, onUpdateDrawing, onRemoveDrawing, onAddDrawing, handleToggleCircleDate]
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
        <div className="flex-1 text-[10px] font-mono uppercase tracking-wider text-[#8E8F95] font-semibold pl-3 border-r border-[#E5DFD5]">
          Monthly Notes
        </div>
        <div
          className="shrink-0 grid grid-cols-7 pr-2 text-center text-[10px] font-mono font-medium text-[#7E7F85]"
          style={{ width: `${gridWidth + 8}px` }}
        >
          {dayHeaders.map((dh) => (
            <div key={dh}>{dh}</div>
          ))}
        </div>
      </div>

      {/* Main Continuous Jigsaw Canvas (Left: Vertical Month Gutter, Center: Month Notes, Right: 7-Day Grid) */}
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
          monthMetas={monthMetas}
          totalWeeksHeight={totalWeeksHeight}
          todayKey={todayKey}
          onJumpToMonth={(mKey) => scrollToDateInRadar(mKey + '-01', true)}
        />

        {/* 2. Center Column: Month Notes */}
        <MonthNotesColumn
          monthMetas={monthMetas}
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

        {/* 3. Right Column: 7-Day Continuous Radar Grid */}
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
      </div>
    </aside>
  );
};
