import { useState, useMemo, useRef } from 'react';
import type React from 'react';
import { ChevronLeft, ChevronRight, Compass, Plus, Strikethrough, Trash2, Link2 } from 'lucide-react';

import type { NoteItem, MonthNote, DrawingElement, WeekStartDay } from '../types/calendar';
import { formatDateKey, MONTH_NAMES, FULL_MONTH_NAMES } from '../utils/dateUtils';

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
}

interface JigsawCell {
  date: Date;
  dateKey: string;
  dayNumber: number;
  monthIndex: number;
  year: number;
  monthKey: string; // "YYYY-MM"
  isToday: boolean;
  hasNotes: boolean;
  isCircled: boolean;
  isOutsideTargetRange?: boolean;
}

interface MonthMeta {
  monthKey: string; // "YYYY-MM"
  monthIndex: number;
  year: number;
  name: string;
  fullName: string;
  startRow: number;
  endRow: number;
  totalRows: number;
  topPx: number;
  heightPx: number;
}

const CELL_SIZE = 34; // Square 34x34px cells

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
}) => {
  // Current anchor date (defaults to current month)
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

  // Circled dates set
  const circledDates = useMemo(() => {
    return new Set(
      drawings.filter((d) => d.type === 'circle').map((d) => d.anchorStartDate)
    );
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

  // Generate continuous weeks starting from Previous Month (Month - 1)
  // Shows 6 continuous months to fill vertical space generously!
  const { weeks, monthMetas, totalWeeksHeight, svgBoundaries } = useMemo(() => {
    const anchorYear = anchorDate.getFullYear();
    const anchorMonth = anchorDate.getMonth();

    // The 6 continuous target months starting strictly from Previous Month (anchorMonth - 1)
    const NUM_MONTHS = 6;
    const targetMonths: { monthIndex: number; year: number; monthKey: string; firstDateKey: string }[] = [];
    for (let m = 0; m < NUM_MONTHS; m++) {
      const d = new Date(anchorYear, anchorMonth - 1 + m, 1);
      const mIdx = d.getMonth();
      const y = d.getFullYear();
      targetMonths.push({
        monthIndex: mIdx,
        year: y,
        monthKey: `${y}-${String(mIdx + 1).padStart(2, '0')}`,
        firstDateKey: `${y}-${String(mIdx + 1).padStart(2, '0')}-01`,
      });
    }

    const startMonthDate = new Date(anchorYear, anchorMonth - 1, 1);
    const endMonthDate = new Date(anchorYear, anchorMonth - 1 + NUM_MONTHS, 0);

    // Align start to beginning of week
    const calendarStart = new Date(startMonthDate);
    let startDiff = calendarStart.getDay() - weekStartsOn;
    if (startDiff < 0) startDiff += 7;
    calendarStart.setDate(calendarStart.getDate() - startDiff);

    // Align end to end of week
    const calendarEnd = new Date(endMonthDate);
    let endDiff = (6 - calendarEnd.getDay() + weekStartsOn) % 7;
    calendarEnd.setDate(calendarEnd.getDate() + endDiff);

    const generatedWeeks: JigsawCell[][] = [];
    const dateKeyToRow = new Map<string, number>();
    const targetMonthKeys = new Set(targetMonths.map((t) => t.monthKey));

    const curr = new Date(calendarStart);
    let rowIndex = 0;

    while (curr <= calendarEnd) {
      const week: JigsawCell[] = [];

      for (let i = 0; i < 7; i++) {
        const cellDate = new Date(curr);
        const dateKey = formatDateKey(cellDate);
        const mIdx = cellDate.getMonth();
        const y = cellDate.getFullYear();
        const monthKey = `${y}-${String(mIdx + 1).padStart(2, '0')}`;

        dateKeyToRow.set(dateKey, rowIndex);

        week.push({
          date: cellDate,
          dateKey,
          dayNumber: cellDate.getDate(),
          monthIndex: mIdx,
          year: y,
          monthKey,
          isToday: dateKey === todayKey,
          hasNotes: (notesCountMap.get(dateKey) || 0) > 0,
          isCircled: circledDates.has(dateKey),
          isOutsideTargetRange: !targetMonthKeys.has(monthKey),
        });

        curr.setDate(curr.getDate() + 1);
      }

      generatedWeeks.push(week);
      rowIndex++;
    }

    // Convert target months to strictly non-overlapping, contiguous layout metadata
    const metas: MonthMeta[] = [];
    for (let i = 0; i < targetMonths.length; i++) {
      const tm = targetMonths[i];
      const startRow = i === 0 ? 0 : (dateKeyToRow.get(tm.firstDateKey) ?? 0);
      const endRow = i < targetMonths.length - 1
        ? (dateKeyToRow.get(targetMonths[i + 1].firstDateKey) ?? generatedWeeks.length)
        : generatedWeeks.length;
      const totalRows = Math.max(endRow - startRow, 1);

      metas.push({
        monthKey: tm.monthKey,
        monthIndex: tm.monthIndex,
        year: tm.year,
        name: MONTH_NAMES[tm.monthIndex],
        fullName: FULL_MONTH_NAMES[tm.monthIndex],
        startRow,
        endRow,
        totalRows,
        topPx: startRow * CELL_SIZE,
        heightPx: totalRows * CELL_SIZE,
      });
    }

    // Generate GAPLESS, CONTINUOUS SVG jigsaw boundary line segments!
    const boundaries: { x1: number; y1: number; x2: number; y2: number }[] = [];

    generatedWeeks.forEach((week, r) => {
      week.forEach((cell, c) => {
        // Vertical step: between cell (r, c) and right neighbor (r, c+1)
        if (c < 6 && week[c + 1].monthKey !== cell.monthKey) {
          const x = (c + 1) * CELL_SIZE;
          const y1 = r * CELL_SIZE;
          const y2 = (r + 1) * CELL_SIZE;
          boundaries.push({ x1: x, y1, x2: x, y2 });
        }
        // Horizontal step: between cell (r, c) and bottom neighbor (r+1, c)
        if (r < generatedWeeks.length - 1 && generatedWeeks[r + 1][c].monthKey !== cell.monthKey) {
          const x1 = c * CELL_SIZE;
          const x2 = (c + 1) * CELL_SIZE;
          const y = (r + 1) * CELL_SIZE;
          boundaries.push({ x1, y1: y, x2, y2: y });
        }
      });
    });

    return {
      weeks: generatedWeeks,
      monthMetas: metas,
      totalWeeksHeight: generatedWeeks.length * CELL_SIZE,
      svgBoundaries: boundaries,
    };
  }, [anchorDate, weekStartsOn, todayKey, notesCountMap, circledDates]);

  // Day header abbreviations
  const dayHeaders = weekStartsOn === 0 
    ? ['S', 'M', 'T', 'W', 'Th', 'F', 'Sa']
    : ['M', 'T', 'W', 'Th', 'F', 'Sa', 'S'];

  // Handle quick month note submission
  const handleQuickMonthNoteSubmit = (e: React.FormEvent, monthKey: string) => {
    e.preventDefault();
    if (quickInputText.trim()) {
      onAddMonthNote(quickInputText, [monthKey]);
      setQuickInputText('');
      setQuickInputMonth(null);
    }
  };

  // Group month notes by primary month
  const monthNotesByMonth = useMemo(() => {
    const map = new Map<string, MonthNote[]>();
    for (const mn of monthNotes) {
      for (const mKey of mn.parentMonths) {
        const list = map.get(mKey) || [];
        if (!list.some((existing) => existing.id === mn.id)) {
          list.push(mn);
        }
        map.set(mKey, list);
      }
    }
    return map;
  }, [monthNotes]);

  return (
    <aside className="w-[460px] lg:w-[495px] shrink-0 border-l border-[#E5DFD5] bg-[#FAF8F5] flex flex-col h-full select-none text-[#2B2C30]">
      {/* Top Sidebar Header */}
      <div className="px-4 py-2.5 border-b border-[#E5DFD5] flex items-center justify-between bg-[#F7F4EC]/90">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#7E7F85] block">Continuous Jigsaw Radar</span>
          <h3 className="font-serif text-sm font-bold text-[#2B2C30]">
            {monthMetas[0]?.name} {monthMetas[0]?.year} – {monthMetas[monthMetas.length - 1]?.name} {monthMetas[monthMetas.length - 1]?.year}
          </h3>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsMultiMonthModalOpen(true)}
            className="flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-medium rounded bg-[#EBE5DA] hover:bg-[#DDD6C8] text-[#2B2C30] transition-colors"
            title="Create a note spanning multiple months"
          >
            <Plus className="w-3 h-3" />
            <span>Multi-Month</span>
          </button>

          <button
            onClick={handlePrevMonth}
            className="p-1 rounded hover:bg-[#EAE3D6] text-[#6B6C72] transition-colors"
            title="Shift backward"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetToCurrent}
            className="p-1 rounded hover:bg-[#EAE3D6] text-[#D23B38] transition-colors"
            title="Reset to current month"
          >
            <Compass className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleNextMonth}
            className="p-1 rounded hover:bg-[#EAE3D6] text-[#6B6C72] transition-colors"
            title="Shift forward"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Grid Day Headers Bar */}
      <div className="flex items-center border-b border-[#E5DFD5] bg-[#F7F4EC]/50 text-center py-1">
        {/* Left: Month Notes Column Header */}
        <div className="flex-1 text-[10px] font-mono uppercase tracking-wider text-[#8E8F95] font-semibold text-center pl-2">
          Month Goals & Notes
        </div>
        {/* Center: 7-Day Week Columns Header */}
        <div className="w-[238px] shrink-0 grid grid-cols-7">
          {dayHeaders.map((dh, i) => (
            <div
              key={i}
              className={`text-[10px] font-mono font-bold text-center ${
                (weekStartsOn === 0 && (i === 0 || i === 6)) ||
                (weekStartsOn === 1 && (i === 5 || i === 6))
                  ? 'text-[#D23B38]'
                  : 'text-[#63666A]'
              }`}
            >
              {dh}
            </div>
          ))}
        </div>
        {/* Right: Vertical Month Header */}
        <div className="w-10 shrink-0 text-[10px] font-mono uppercase tracking-wider text-[#8E8F95] font-semibold text-center border-l border-[#E5DFD5]">
          Mo
        </div>
      </div>

      {/* Main Continuous Jigsaw Canvas (Left: Month Notes, Center: 7-Day Grid, Right: Vertical Month Gutter) */}
      <div ref={gridContainerRef} className="flex-1 overflow-y-auto relative flex">
        {/* 1. Left Column: Month Notes */}
        <div className="flex-1 border-r border-[#E5DFD5] relative min-w-0" style={{ height: `${totalWeeksHeight}px` }}>
          {monthMetas.map((meta) => {
            const currentMonthNotes = monthNotesByMonth.get(meta.monthKey) || [];
            const isAdding = quickInputMonth === meta.monthKey;
            const isCurrentMonth = meta.monthKey === todayKey.slice(0, 7);

            return (
              <div
                key={meta.monthKey}
                className={`absolute left-0 w-full border-b border-[#E5DFD5]/80 flex flex-col justify-between p-2 group/month transition-colors ${
                  isCurrentMonth
                    ? 'bg-[#FAF5ED]/95 border-l-[3.5px] border-l-[#D23B38] -ml-[3.5px]'
                    : 'hover:bg-[#F2EDE4]/30'
                }`}
                style={{
                  top: `${meta.topPx}px`,
                  height: `${meta.heightPx}px`,
                }}
              >
                {/* Month Goals Header */}
                <div className="flex items-center justify-between pb-1 mb-1 border-b border-[#EAE3D6]/70">
                  <span
                    className={`text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border flex items-center gap-1.5 ${
                      isCurrentMonth
                        ? 'bg-[#D23B38] text-white border-[#D23B38] shadow-2xs'
                        : 'text-[#2B2C30] bg-[#FAF8F5] border-[#E0D9CC]'
                    }`}
                  >
                    <span>{meta.name} Goals</span>
                    {isCurrentMonth && <span className="text-[8px] uppercase bg-white/20 px-1 rounded">Focus</span>}
                  </span>
                </div>


                {/* Notes List for this month */}
                <div className="flex-1 overflow-y-auto space-y-1 py-1 pr-1">
                  {currentMonthNotes.map((mn) => {
                    const isMulti = mn.parentMonths.length > 1;
                    return (
                      <div
                        key={mn.id}
                        className={`group/mnote relative flex items-start gap-1.5 p-1 rounded text-xs transition-colors ${
                          mn.isStruck ? 'text-[#8E8F95]' : 'text-[#2B2C30] bg-[#FAF8F5]/80 hover:bg-white shadow-2xs'
                        }`}
                      >
                        {/* Strikethrough Action */}
                        <button
                          onClick={() => onToggleStrikeMonthNote(mn.id)}
                          className={`mt-0.5 p-0.5 rounded transition-colors ${
                            mn.isStruck
                              ? 'text-[#A19D94]'
                              : 'text-[#BBB6AC] opacity-0 group-hover/mnote:opacity-100 hover:text-[#2B2C30]'
                          }`}
                          title={mn.isStruck ? 'Restore note' : 'Cross out'}
                        >
                          <Strikethrough className="w-3 h-3" />
                        </button>

                        <div className="flex-1 min-w-0">
                          <span className={`break-words leading-tight ${mn.isStruck ? 'line-through text-[#8E8F95]' : ''}`}>
                            {mn.content}
                          </span>
                          {/* Multi-month span badge */}
                          {isMulti && (
                            <div className="flex items-center gap-1 mt-0.5 text-[9px] font-mono text-[#D23B38]">
                              <Link2 className="w-2.5 h-2.5" />
                              <span>
                                Spans {mn.parentMonths.length} mos ({mn.parentMonths[0]} → {mn.parentMonths[mn.parentMonths.length - 1]})
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Delete note */}
                        <button
                          onClick={() => onRemoveMonthNote(mn.id)}
                          className="opacity-0 group-hover/mnote:opacity-100 p-0.5 text-[#BBB6AC] hover:text-[#D23B38] rounded"
                          title="Delete note"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Quick Add Note on Month */}
                {isAdding ? (
                  <form onSubmit={(e) => handleQuickMonthNoteSubmit(e, meta.monthKey)} className="flex items-center gap-1 mt-1">
                    <input
                      autoFocus
                      type="text"
                      value={quickInputText}
                      onChange={(e) => setQuickInputText(e.target.value)}
                      placeholder="Month focus/goal... (Enter)"
                      onKeyDown={(e) => e.key === 'Escape' && setQuickInputMonth(null)}
                      className="flex-1 px-1.5 py-0.5 text-xs bg-white border border-[#DDD6C8] rounded focus:outline-hidden"
                    />
                    <button type="submit" className="px-1.5 py-0.5 text-xs bg-[#2B2C30] text-[#FAF8F5] rounded">
                      Add
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={() => {
                      setQuickInputMonth(meta.monthKey);
                      setQuickInputText('');
                    }}
                    className="opacity-0 group-month:opacity-100 text-[10px] font-mono text-[#8E8F95] hover:text-[#2B2C30] flex items-center justify-center gap-1 py-0.5 rounded transition-opacity"
                  >
                    <Plus className="w-3 h-3" />
                    <span>note</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* 2. Right Column: 7-Day Square Continuous Grid with GAPLESS SVG Jigsaw Border */}
        <div className="w-[238px] shrink-0 relative pr-2" style={{ height: `${totalWeeksHeight}px` }}>
          {/* Continuous Grid Weeks */}
          {weeks.map((week, rIdx) => {
            const isCurrentWeekRow = week.some((c) => c.isToday);

            return (
              <div
                key={rIdx}
                className={`grid grid-cols-7 relative transition-colors ${
                  isCurrentWeekRow ? 'bg-[#FAF3EA]/80 ring-1 ring-inset ring-[#D23B38]/30' : ''
                }`}
                style={{ height: `${CELL_SIZE}px` }}
              >
                {week.map((cell) => {
                  const isEvenMonth = cell.monthIndex % 2 === 0;

                  return (
                    <button
                      key={cell.dateKey}
                      onClick={() => onSelectDate(cell.dateKey)}
                      className={`relative w-[34px] h-[34px] flex flex-col items-center justify-center text-[11px] font-mono transition-transform hover:z-10 group ${
                        cell.isToday
                          ? 'bg-[#FAF3EA]'
                          : isEvenMonth
                          ? 'bg-[#FAF8F5]'
                          : 'bg-[#F2ECE1]/65'
                      }`}
                      style={{
                        // Subtle interior paper rules
                        boxShadow: 'inset 0 0 0 0.5px rgba(229, 223, 213, 0.45)',
                      }}
                      title={`${cell.monthKey} - ${cell.dayNumber}${cell.isToday ? ' (Today)' : ''}`}
                    >
                      {/* Day Number */}
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded-full transition-transform group-hover:scale-110 ${
                          cell.isToday
                            ? 'bg-[#D23B38] text-white font-black shadow-xs ring-2 ring-[#D23B38]/30'
                            : cell.isOutsideTargetRange
                            ? 'text-[#B8B4AA] opacity-40'
                            : 'text-[#2B2C30]'
                        }`}
                      >
                        {cell.dayNumber}
                      </span>

                      {/* Circled mark indicator */}
                      {cell.isCircled && (
                        <span className="absolute inset-1 rounded-full border-2 border-[#D23B38] pointer-events-none opacity-85" />
                      )}

                      {/* Has Notes Pip */}
                      {cell.hasNotes && (
                        <span className="w-1 h-1 rounded-full bg-[#E29578] mt-[-2px]" />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* GAPLESS CONTINUOUS SVG JIGSAW BOUNDARIES */}
          <svg
            className="absolute inset-0 pointer-events-none z-10"
            style={{ width: `${7 * CELL_SIZE}px`, height: `${totalWeeksHeight}px` }}
          >
            {svgBoundaries.map((b, idx) => (
              <line
                key={idx}
                x1={b.x1}
                y1={b.y1}
                x2={b.x2}
                y2={b.y2}
                stroke="#2B2C30"
                strokeWidth="2.5"
                strokeLinecap="square"
              />
            ))}
          </svg>
        </div>

        {/* 3. Right Column: Vertical Month Name Gutter (Centered for each month, on the right side of calendar!) */}
        <div
          className="w-10 shrink-0 border-l border-[#E5DFD5] relative bg-[#F7F4EC]/40"
          style={{ height: `${totalWeeksHeight}px` }}
        >
          {monthMetas.map((meta) => {
            const isCurrentMonth = meta.monthKey === todayKey.slice(0, 7);

            return (
              <div
                key={`vmonth-${meta.monthKey}`}
                className={`absolute left-0 w-full flex items-center justify-center border-b border-[#E5DFD5]/80 select-none overflow-hidden py-1 transition-colors ${
                  isCurrentMonth ? 'bg-[#F4ECE1] border-l-2 border-l-[#D23B38]' : ''
                }`}
                style={{
                  top: `${meta.topPx}px`,
                  height: `${meta.heightPx}px`,
                }}
                title={`${meta.fullName} ${meta.year}`}
              >
                <div
                  className="font-serif text-[11px] font-bold tracking-widest uppercase flex items-center gap-1.5 opacity-90 hover:opacity-100 transition-opacity select-none text-[#2B2C30]"
                  style={{
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                  }}
                >
                  <span
                    className={
                      isCurrentMonth
                        ? 'bg-[#D23B38] text-white px-1.5 py-0.5 rounded-xs font-black shadow-2xs'
                        : ''
                    }
                  >
                    {meta.name}
                  </span>
                  <span
                    className={`text-[9px] font-mono font-bold ${
                      isCurrentMonth ? 'text-[#D23B38]' : 'text-[#7E7F85]'
                    }`}
                  >
                    '{String(meta.year).slice(2)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>


      {/* Multi-Month Note Modal */}
      {isMultiMonthModalOpen && (
        <MultiMonthNoteModal
          isOpen={isMultiMonthModalOpen}
          monthMetas={monthMetas}
          onClose={() => setIsMultiMonthModalOpen(false)}
          onSave={(content, parentMonths, colorTag) => {
            onAddMonthNote(content, parentMonths, colorTag);
            setIsMultiMonthModalOpen(false);
          }}
        />
      )}
    </aside>
  );
};

// Subcomponent for adding multi-month spanning notes
interface MultiMonthNoteModalProps {
  isOpen: boolean;
  monthMetas: MonthMeta[];
  onClose: () => void;
  onSave: (content: string, parentMonths: string[], colorTag?: string) => void;
}

const MultiMonthNoteModal: React.FC<MultiMonthNoteModalProps> = ({
  isOpen,
  monthMetas,
  onClose,
  onSave,
}) => {
  const [content, setContent] = useState('');
  const [startMonth, setStartMonth] = useState(monthMetas[1]?.monthKey || monthMetas[0]?.monthKey);
  const [endMonth, setEndMonth] = useState(monthMetas[3]?.monthKey || monthMetas[0]?.monthKey);
  const [colorTag] = useState('#83C5BE');


  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    // Build contiguous list of spanned months
    const allKeys = monthMetas.map((m) => m.monthKey);
    const sIdx = allKeys.indexOf(startMonth);
    const eIdx = allKeys.indexOf(endMonth);

    const minIdx = Math.min(sIdx, eIdx);
    const maxIdx = Math.max(sIdx, eIdx);
    const targetMonths = allKeys.slice(minIdx, maxIdx + 1);

    onSave(content, targetMonths, colorTag);
    setContent('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-sm bg-[#FAF8F5] border border-[#DDD6C8] rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-4 py-3 border-b border-[#E5DFD5] flex items-center justify-between">
          <h4 className="font-serif font-bold text-base text-[#2B2C30]">Multi-Month Note</h4>
          <button onClick={onClose} className="text-[#8E8F95] hover:text-[#2B2C30] text-sm">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-mono text-[#7E7F85] uppercase mb-1">
              Note / Objective
            </label>
            <input
              autoFocus
              type="text"
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g. Q4 Growth Sprint, Hiring Initiative..."
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#DDD6C8] rounded focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-mono text-[#7E7F85] uppercase mb-0.5">
                From Month
              </label>
              <select
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="w-full px-2 py-1 text-xs bg-white border border-[#DDD6C8] rounded"
              >
                {monthMetas.map((m) => (
                  <option key={m.monthKey} value={m.monthKey}>
                    {m.fullName} {m.year}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-[#7E7F85] uppercase mb-0.5">
                To Month
              </label>
              <select
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                className="w-full px-2 py-1 text-xs bg-white border border-[#DDD6C8] rounded"
              >
                {monthMetas.map((m) => (
                  <option key={m.monthKey} value={m.monthKey}>
                    {m.fullName} {m.year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5DFD5]">
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1 text-xs text-[#7E7F85] hover:text-[#2B2C30]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 text-xs font-medium bg-[#2B2C30] hover:bg-[#404147] text-[#FAF8F5] rounded shadow-xs"
            >
              Save Spanning Note
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
