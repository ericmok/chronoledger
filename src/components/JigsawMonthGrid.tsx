import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type React from 'react';
import { ChevronLeft, ChevronRight, Compass, Plus } from 'lucide-react';
import type { NoteItem, MonthNote, DrawingElement, WeekStartDay, CalendarSettings } from '../types/calendar';
import { formatDateKey, MONTH_NAMES, FULL_MONTH_NAMES } from '../utils/dateUtils';
import { MonthNotesColumn, type MonthMeta } from './radar/MonthNotesColumn';
import { ContinuousRadarGrid, type JigsawCell, type SvgBoundary } from './radar/ContinuousRadarGrid';
import { VerticalMonthGutter } from './radar/VerticalMonthGutter';
import { MultiMonthNoteModal } from './radar/MultiMonthNoteModal';
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
  onUpdateMonthNote?: (id: string, newContent: string) => void;
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
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [quickInputMonth, setQuickInputMonth] = useState<string | null>(null);
  const [quickInputText, setQuickInputText] = useState('');
  const [isMultiMonthModalOpen, setIsMultiMonthModalOpen] = useState(false);

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

  // Navigate months
  const handlePrevMonth = () => {
    setAnchorDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setAnchorDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleResetToCurrent = () => {
    setAnchorDate(new Date());
    onJumpToToday();
  };

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

  // 6 months window: past month, current month, and next 4 months (fills viewport without awkward gap)
  const targetMonths = useMemo(() => {
    const y = anchorDate.getFullYear();
    const m = anchorDate.getMonth();
    return [
      new Date(y, m - 1, 1),
      new Date(y, m, 1),
      new Date(y, m + 1, 1),
      new Date(y, m + 2, 1),
      new Date(y, m + 3, 1),
      new Date(y, m + 4, 1),
    ];
  }, [anchorDate]);

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

    // Compute month metas with expanded vertical heights
    const metas: MonthMeta[] = [];
    targetMonths.forEach((tm) => {
      const y = tm.getFullYear();
      const m = tm.getMonth();
      const mKey = `${y}-${String(m + 1).padStart(2, '0')}`;

      let startRow = -1;
      let endRow = -1;

      weekRows.forEach((row, rIdx) => {
        const containsMonth = row.some((c) => c.monthKey === mKey);
        if (containsMonth) {
          if (startRow === -1) startRow = rIdx;
          endRow = rIdx;
        }
      });

      if (startRow !== -1 && endRow !== -1) {
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
      }
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
      }
    },
    [weeks]
  );

  const lastTargetKeyRef = useRef<number | null>(null);

  // Focus radar when scrollTargetDate changes (e.g. "Today" button or date click)
  useEffect(() => {
    if (!scrollTargetDate || scrollTargetDate.key === lastTargetKeyRef.current) return;
    lastTargetKeyRef.current = scrollTargetDate.key;

    const parts = scrollTargetDate.dateString.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;

      // If outside current anchor month, align anchorDate
      setAnchorDate((prev) => {
        if (prev.getFullYear() !== y || prev.getMonth() !== m) {
          return new Date(y, m, 1);
        }
        return prev;
      });

      const timer = setTimeout(() => {
        scrollToDateInRadar(scrollTargetDate.dateString, true);
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [scrollTargetDate, scrollToDateInRadar]);

  // Initial mount: auto-focus and center today in the monthly radar
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToDateInRadar(todayKey, false);
    }, 120);
    return () => clearTimeout(timer);
  }, [scrollToDateInRadar, todayKey]);

  // Quick month note submit
  const handleQuickMonthNoteSubmit = (e: React.FormEvent, monthKey: string) => {
    e.preventDefault();
    if (quickInputText.trim()) {
      onAddMonthNote(quickInputText.trim(), [monthKey]);
      setQuickInputText('');
      setQuickInputMonth(null);
    }
  };

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
          <span className="font-serif font-bold text-xs text-[#2B2C30] tracking-tight">
            {FULL_MONTH_NAMES[anchorDate.getMonth()]} {anchorDate.getFullYear()}
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
            onClick={() => setIsMultiMonthModalOpen(true)}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-[#71727A] hover:text-[#2B2C30] hover:bg-[#EAE3D6]/70 rounded transition-colors cursor-pointer"
            title="Add multi-month span goal"
          >
            <Plus className="w-3 h-3 text-[#D23B38]" />
            <span>Span</span>
          </button>

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
        <div className="flex-1 text-[10px] font-mono uppercase tracking-wider text-[#8E8F95] font-semibold pl-3">
          Monthly Focus & Goals
        </div>
        <div
          className="shrink-0 grid grid-cols-7 pr-2 text-center text-[10px] font-mono font-medium text-[#7E7F85]"
          style={{ width: `${gridWidth + 8}px` }}
        >
          {dayHeaders.map((dh) => (
            <div key={dh}>{dh}</div>
          ))}
        </div>
        <div className="w-10 shrink-0 text-[10px] font-mono uppercase tracking-wider text-[#8E8F95] font-semibold text-center border-l border-[#E5DFD5]">
          Mo
        </div>
      </div>

      {/* Main Continuous Jigsaw Canvas (Left: Month Notes, Center: 7-Day Grid, Right: Vertical Month Gutter) */}
      <div ref={gridContainerRef} className="flex-1 overflow-y-auto relative flex">
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

        {/* 1. Left Column: Month Notes */}
        <MonthNotesColumn
          monthMetas={monthMetas}
          monthNotesByMonth={monthNotesByMonth}
          totalWeeksHeight={totalWeeksHeight}
          todayKey={todayKey}
          quickInputMonth={quickInputMonth}
          quickInputText={quickInputText}
          onSetQuickInputText={setQuickInputText}
          onStartQuickAddMonth={(mKey) => {
            setQuickInputMonth(mKey);
            setQuickInputText('');
          }}
          onCancelQuickAddMonth={() => setQuickInputMonth(null)}
          onSubmitQuickMonthNote={handleQuickMonthNoteSubmit}
          onToggleStrikeMonthNote={onToggleStrikeMonthNote}
          onRemoveMonthNote={onRemoveMonthNote}
          onUpdateMonthNote={onUpdateMonthNote}
          onReorderMonthNotes={onReorderMonthNotes}
          onMoveMonthNoteToMonth={onMoveMonthNoteToMonth}
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

        {/* 3. Right Column: Vertical Month Name Gutter */}
        <VerticalMonthGutter
          monthMetas={monthMetas}
          totalWeeksHeight={totalWeeksHeight}
          todayKey={todayKey}
        />
      </div>

      {/* Multi-Month Note Modal */}
      {isMultiMonthModalOpen && (
        <MultiMonthNoteModal
          isOpen={isMultiMonthModalOpen}
          monthMetas={monthMetas}
          onClose={() => setIsMultiMonthModalOpen(false)}
          onSave={(content, targetMonths, colorTag) => {
            onAddMonthNote(content, targetMonths, colorTag);
            setIsMultiMonthModalOpen(false);
          }}
        />
      )}
    </aside>
  );
};
