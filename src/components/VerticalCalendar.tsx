import { useEffect, useState, useMemo } from 'react';
import type React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { DateItem, NoteItem, WeekNote, DrawingElement, CalendarSettings } from '../types/calendar';
import { DrawingOverlay } from './DrawingOverlay';
import { DayRow } from './calendar/DayRow';
import { WeekFocusPanel } from './calendar/WeekFocusPanel';
import { groupDatesIntoWeeks, formatDateKey } from '../utils/dateUtils';

interface VerticalCalendarProps {
  dates: DateItem[];
  notes: NoteItem[];
  weekNotes: WeekNote[];
  drawings: DrawingElement[];
  settings: CalendarSettings;
  onToggleStrike: (noteId: string) => void;
  onRemoveNote: (noteId: string) => void;
  onUpdateNote?: (noteId: string, newContent: string) => void;
  onReorderNotes?: (sourceNoteId: string, targetNoteId: string, position: 'before' | 'after', targetDate?: string) => void;
  onMoveNoteToDate?: (noteId: string, targetDate: string, position?: 'start' | 'end') => void;
  onAddQuickNote: (dateString: string, content: string) => void;
  onAddWeekNote: (content: string, parentWeeks: string[], colorTag?: string) => void;
  onToggleStrikeWeekNote: (id: string) => void;
  onRemoveWeekNote: (id: string) => void;
  onUpdateWeekNote?: (id: string, newContent: string) => void;
  onReorderWeekNotes?: (sourceNoteId: string, targetNoteId: string, position: 'before' | 'after', targetWeek?: string) => void;
  onMoveWeekNoteToWeek?: (noteId: string, targetWeek: string, position?: 'start' | 'end') => void;
  onAddDrawing: (drawing: Omit<DrawingElement, 'id' | 'createdAt'>) => void;
  onRemoveDrawing: (id: string) => void;
  onRemoveDrawings?: (ids: string[]) => void;
  onCloseTool?: () => void;
  onJumpToDateRequested?: (dateKey: string) => void;
  scrollTargetDate?: { dateString: string; key: number } | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export const VerticalCalendar: React.FC<VerticalCalendarProps> = ({
  dates = [],
  notes = [],
  weekNotes = [],
  drawings = [],
  settings,
  onToggleStrike,
  onRemoveNote,
  onUpdateNote,
  onReorderNotes,
  onMoveNoteToDate,
  onAddQuickNote,
  onAddWeekNote,
  onToggleStrikeWeekNote,
  onRemoveWeekNote,
  onUpdateWeekNote,
  onReorderWeekNotes,
  onMoveWeekNoteToWeek,
  onAddDrawing,
  onRemoveDrawing,
  onRemoveDrawings,
  onCloseTool,
  onJumpToDateRequested,
  scrollTargetDate,
  scrollRef,
}) => {
  const [quickInputDate, setQuickInputDate] = useState<string | null>(null);
  const [quickInputText, setQuickInputText] = useState('');
  const [quickInputWeek, setQuickInputWeek] = useState<string | null>(null);
  const [quickWeekText, setQuickWeekText] = useState('');

  const todayKey = useMemo(() => formatDateKey(new Date()), []);
  const currentMonthKey = useMemo(() => todayKey.slice(0, 7), [todayKey]);

  // Map notes to their dates
  const notesByDate = useMemo(() => {
    const map = new Map<string, NoteItem[]>();
    for (const note of (notes || [])) {
      if (!settings.showStruckItems && note.isStruck) continue;

      for (const d of note.parentDates) {
        const existing = map.get(d) || [];
        existing.push(note);
        map.set(d, existing);
      }
    }
    return map;
  }, [notes, settings.showStruckItems]);

  // Map week notes to their week key
  const weekNotesByWeek = useMemo(() => {
    const map = new Map<string, WeekNote[]>();
    for (const wn of (weekNotes || [])) {
      if (!settings.showStruckItems && wn.isStruck) continue;

      for (const wKey of wn.parentWeeks) {
        const existing = map.get(wKey) || [];
        if (!existing.some((x) => x.id === wn.id)) {
          existing.push(wn);
        }
        map.set(wKey, existing);
      }
    }
    return map;
  }, [weekNotes, settings.showStruckItems]);

  // Group dates into continuous 7-day weeks
  const weekBlocks = useMemo(() => {
    return groupDatesIntoWeeks(dates, settings.weekStartsOn);
  }, [dates, settings.weekStartsOn]);

  // TanStack Virtualizer
  const virtualizer = useVirtualizer({
    count: weekBlocks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 420,
    overscan: 4,
  });

  // Map each date to its week block index
  const dateToWeekIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    weekBlocks.forEach((block, wIdx) => {
      block.days.forEach((day) => map.set(day.dateString, wIdx));
    });
    return map;
  }, [weekBlocks]);

  const todayWeekIndex = useMemo(() => {
    return weekBlocks.findIndex((b) => b.containsToday);
  }, [weekBlocks]);

  // Jump to today initially
  useEffect(() => {
    if (todayWeekIndex !== -1 && scrollRef.current) {
      const timer = setTimeout(() => {
        virtualizer.scrollToIndex(todayWeekIndex, { align: 'center', behavior: 'auto' });
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [todayWeekIndex, virtualizer, scrollRef]);

  // Smooth scroll to targeted date
  useEffect(() => {
    if (!scrollTargetDate || !scrollRef.current) return;

    const wIdx = dateToWeekIndexMap.get(scrollTargetDate.dateString);
    if (wIdx !== undefined) {
      virtualizer.scrollToIndex(wIdx, {
        align: 'center',
        behavior: 'smooth',
      });
    }
  }, [scrollTargetDate, dateToWeekIndexMap, virtualizer, scrollRef]);

  // Coordinate mapping for Drawing Canvas
  const getDateAtY = (y: number) => {
    const virtualItems = virtualizer.getVirtualItems();
    for (const vItem of virtualItems) {
      if (y >= vItem.start && y <= vItem.start + vItem.size) {
        const block = weekBlocks[vItem.index];
        const relativeY = y - vItem.start;
        const dayHeight = vItem.size / block.days.length;
        const dayIdx = Math.min(Math.floor(relativeY / dayHeight), block.days.length - 1);
        const day = block.days[dayIdx];
        return {
          dateString: day.dateString,
          dateY: vItem.start + dayIdx * dayHeight,
          rowHeight: dayHeight,
        };
      }
    }
    return null;
  };

  const getYForDate = (dateString: string) => {
    const wIdx = dateToWeekIndexMap.get(dateString);
    if (wIdx === undefined) return null;
    const vItem = virtualizer.getVirtualItems().find((v) => v.index === wIdx);
    const block = weekBlocks[wIdx];
    const dayIdx = block.days.findIndex((d) => d.dateString === dateString);
    if (vItem && dayIdx !== -1) {
      const dayHeight = vItem.size / block.days.length;
      return vItem.start + dayIdx * dayHeight;
    }
    return wIdx * 360 + (dayIdx >= 0 ? dayIdx * 50 : 0);
  };

  // Quick note submit handlers
  const handleQuickNoteSubmit = (e: React.FormEvent, dateString: string) => {
    e.preventDefault();
    if (quickInputText.trim()) {
      onAddQuickNote(dateString, quickInputText.trim());
      setQuickInputText('');
      setQuickInputDate(null);
    }
  };

  const handleQuickWeekNoteSubmit = (e: React.FormEvent, weekKey: string) => {
    e.preventDefault();
    if (quickWeekText.trim()) {
      onAddWeekNote(quickWeekText.trim(), [weekKey]);
      setQuickWeekText('');
      setQuickInputWeek(null);
    }
  };

  return (
    <div
      ref={scrollRef}
      className="relative flex-1 overflow-y-auto paper-texture select-none h-full outline-hidden"
    >
      <div
        className="relative mx-auto max-w-5xl min-w-[340px] px-2 sm:px-4 md:px-8 py-6"
        style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%' }}
      >
        {/* Drawing Canvas Overlay */}
        <DrawingOverlay
          tool={settings.activeTool}
          inkColor={settings.inkColor}
          drawings={drawings}
          onAddDrawing={onAddDrawing}
          onRemoveDrawing={onRemoveDrawing}
          onRemoveDrawings={onRemoveDrawings}
          containerHeight={virtualizer.getTotalSize()}
          getDateAtY={getDateAtY}
          getYForDate={getYForDate}
        />

        {/* Active Drawing Tool Helper Pill */}
        {settings.activeTool !== 'select' && (
          <div className="sticky top-2 z-30 mx-auto max-w-fit mb-3 flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-[#2B2C30] text-[#FAF8F5] text-xs font-mono shadow-md backdrop-blur-xs animate-in fade-in duration-150">
            <span className="w-2 h-2 rounded-full bg-[#E29578] animate-pulse shrink-0" />
            <span className="text-xs">
              {settings.activeTool === 'eraser' && 'Painting Eraser: Click and drag/paint across pencil strokes to wipe them away'}
              {settings.activeTool === 'arrow' && 'Timeline Arrow: Click and drag from one date to another to link them with a curved arrow'}
              {settings.activeTool === 'circle' && 'Circle Date: Click and drag over any date number to hand-draw a ring'}
              {settings.activeTool === 'pencil' && 'Pencil Mode: Sketch freely in margins and notes'}
            </span>
            {onCloseTool && (
              <button
                type="button"
                onClick={onCloseTool}
                className="ml-1 px-1.5 py-0.5 rounded bg-[#404147] hover:bg-[#52535A] text-[#FAF8F5] text-[10px] uppercase font-bold transition-colors cursor-pointer"
                title="Exit drawing mode (V)"
              >
                Done (V)
              </button>
            )}
          </div>
        )}

        {/* Column Headers for 3-Tier Layout */}
        <div className="flex items-center text-[10px] font-mono uppercase tracking-wider text-[#8E8F95] pb-2 border-b border-[#E5DFD5] mb-2 px-2">
          <div className="w-14 sm:w-18 shrink-0 text-right pr-3 font-semibold">Month</div>
          <div className="w-16 sm:w-20 shrink-0 font-semibold pl-1">Date</div>
          <div className="flex-1 font-semibold pl-2">Daily Notes & Tasks</div>
          <div className="w-64 sm:w-72 shrink-0 font-semibold pl-4 border-l border-[#E5DFD5]">Weekly Focus & Objectives</div>
        </div>

        {/* Virtualized 7-Day Week Blocks */}
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const weekBlock = weekBlocks[virtualRow.index];
          const currentWeekNotes = weekNotesByWeek.get(weekBlock.weekKey) || [];
          const isAddingWeekNote = quickInputWeek === weekBlock.weekKey;

          return (
            <div
              key={weekBlock.weekKey}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute left-0 top-0 w-full flex flex-col"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {/* Top Colored Thick Border for Current Week */}
              {weekBlock.containsToday && (
                <div className="w-full h-[3.5px] bg-[#D23B38] shadow-xs z-30 shrink-0" />
              )}

              <div
                className={`flex items-stretch border-x border-[#E5DFD5] bg-[#FAF8F5] transition-colors ${
                  virtualRow.index === 0 && !weekBlock.containsToday ? 'border-t' : ''
                } ${
                  weekBlock.containsToday
                    ? 'border-l-[4px] border-l-[#D23B38] -ml-[3px]'
                    : ''
                }`}
              >
                {/* TIER 1: Daily Timeline (7 Days) */}
                <div className="flex-1 flex flex-col divide-y divide-[#EAE3D6]/60 min-w-0">
                  {weekBlock.days.map((dateItem, dayIdx) => (
                    <DayRow
                      key={dateItem.dateString}
                      dateItem={dateItem}
                      dayIdx={dayIdx}
                      dayNotes={notesByDate.get(dateItem.dateString) || []}
                      isMonthFocus={dateItem.dateString.slice(0, 7) === currentMonthKey}
                      isQuickAdding={quickInputDate === dateItem.dateString}
                      quickInputText={quickInputText}
                      onSetQuickInputText={setQuickInputText}
                      onStartQuickAdd={(d) => {
                        setQuickInputDate(d);
                        setQuickInputText('');
                      }}
                      onCancelQuickAdd={() => setQuickInputDate(null)}
                      onSubmitQuickAdd={handleQuickNoteSubmit}
                      onToggleStrike={onToggleStrike}
                      onRemoveNote={onRemoveNote}
                      onUpdateNote={onUpdateNote}
                      onJumpToDateRequested={onJumpToDateRequested}
                      onReorderNotes={onReorderNotes}
                      onMoveNoteToDate={onMoveNoteToDate}
                    />
                  ))}
                </div>

                {/* TIER 2: Week Notes (Spans the vertical height of the week) */}
                <WeekFocusPanel
                  weekBlock={weekBlock}
                  currentWeekNotes={currentWeekNotes}
                  isAddingWeekNote={isAddingWeekNote}
                  quickWeekText={quickWeekText}
                  onSetQuickWeekText={setQuickWeekText}
                  onStartAddWeekNote={(wKey) => {
                    setQuickInputWeek(wKey);
                    setQuickWeekText('');
                  }}
                  onCancelAddWeekNote={() => setQuickInputWeek(null)}
                  onSubmitQuickWeekNote={handleQuickWeekNoteSubmit}
                  onToggleStrikeWeekNote={onToggleStrikeWeekNote}
                  onRemoveWeekNote={onRemoveWeekNote}
                  onUpdateWeekNote={onUpdateWeekNote}
                  onReorderWeekNotes={onReorderWeekNotes}
                  onMoveWeekNoteToWeek={onMoveWeekNoteToWeek}
                />
              </div>

              {/* Bottom Colored Thick Border for Current Week */}
              {weekBlock.containsToday ? (
                <div className="w-full h-[3.5px] bg-[#D23B38] shadow-xs z-30 shrink-0" />
              ) : (
                /* Integrated Dashed Week Separator Line (Zero margin, continuous paper roll) */
                <div className="w-full border-b border-dashed border-[#A19D94]/70" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
