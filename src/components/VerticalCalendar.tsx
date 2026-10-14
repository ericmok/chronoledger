import { useEffect, useState, useMemo } from 'react';
import type React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { DateItem, NoteItem, WeekNote, DrawingElement, CalendarSettings } from '../types/calendar';
import { NoteItemComponent } from './NoteItemComponent';
import { DrawingOverlay } from './DrawingOverlay';
import { Plus, Strikethrough, Trash2, Link2, Pencil, Check, X } from 'lucide-react';
import { analyzeDateSpan, groupDatesIntoWeeks, formatDateKey } from '../utils/dateUtils';
import { computeWordDiff } from '../utils/diffUtils';

interface VerticalCalendarProps {
  dates: DateItem[];
  notes: NoteItem[];
  weekNotes: WeekNote[];
  drawings: DrawingElement[];
  settings: CalendarSettings;
  onToggleStrike: (noteId: string) => void;
  onRemoveNote: (noteId: string) => void;
  onUpdateNote?: (noteId: string, newContent: string) => void;
  onAddQuickNote: (dateString: string, content: string) => void;
  onAddWeekNote: (content: string, parentWeeks: string[], colorTag?: string) => void;
  onToggleStrikeWeekNote: (id: string) => void;
  onRemoveWeekNote: (id: string) => void;
  onUpdateWeekNote?: (id: string, newContent: string) => void;
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
  onAddQuickNote,
  onAddWeekNote,
  onToggleStrikeWeekNote,
  onRemoveWeekNote,
  onUpdateWeekNote,
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
  const [editingWeekNoteId, setEditingWeekNoteId] = useState<string | null>(null);
  const [editingWeekNoteText, setEditingWeekNoteText] = useState('');

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

  // Map each date to its week block index
  const dateToWeekIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    weekBlocks.forEach((block, wIdx) => {
      block.days.forEach((day) => map.set(day.dateString, wIdx));
    });
    return map;
  }, [weekBlocks]);

  // Today week index
  const todayWeekIndex = useMemo(() => {
    return weekBlocks.findIndex((b) => b.containsToday);
  }, [weekBlocks]);

  // Virtualizer over 7-day week blocks
  const virtualizer = useVirtualizer({
    count: weekBlocks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 360, // Estimated baseline height per 7-day week
    overscan: 6,
  });

  // Jump to target date
  useEffect(() => {
    if (scrollTargetDate && scrollTargetDate.dateString) {
      const wIdx = dateToWeekIndexMap.get(scrollTargetDate.dateString);
      if (wIdx !== undefined) {
        virtualizer.scrollToIndex(wIdx, { align: 'center', behavior: 'smooth' });
      }
    }
  }, [scrollTargetDate, dateToWeekIndexMap, virtualizer]);

  // Jump to today initially
  useEffect(() => {
    if (todayWeekIndex !== -1 && scrollRef.current) {
      const timer = setTimeout(() => {
        virtualizer.scrollToIndex(todayWeekIndex, { align: 'center', behavior: 'auto' });
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [todayWeekIndex, virtualizer, scrollRef]);

  // Quick daily note submit
  const handleQuickNoteSubmit = (e: React.FormEvent, dateString: string) => {
    e.preventDefault();
    if (quickInputText.trim()) {
      onAddQuickNote(dateString, quickInputText);
      setQuickInputText('');
      setQuickInputDate(null);
    }
  };

  // Quick weekly note submit
  const handleQuickWeekNoteSubmit = (e: React.FormEvent, weekKey: string) => {
    e.preventDefault();
    if (quickWeekText.trim()) {
      onAddWeekNote(quickWeekText, [weekKey]);
      setQuickWeekText('');
      setQuickInputWeek(null);
    }
  };

  // Helper for drawing overlay coordinate mapping
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
                onClick={onCloseTool}
                className="ml-1 px-1.5 py-0.5 rounded bg-[#404147] hover:bg-[#52535A] text-[#FAF8F5] text-[10px] uppercase font-bold transition-colors"
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
                  {weekBlock.days.map((dateItem, dayIdx) => {
                    const dayNotes = notesByDate.get(dateItem.dateString) || [];
                    const isQuickAdding = quickInputDate === dateItem.dateString;
                    const isMonthFocus = dateItem.dateString.slice(0, 7) === currentMonthKey;

                    const contiguousSpansStartingHere = dayNotes.filter((n) => {
                      const span = analyzeDateSpan(n.parentDates);
                      return span.isContiguous && span.startDate === dateItem.dateString && span.count > 1;
                    });

                    return (
                      <div
                        key={dateItem.dateString}
                        onDoubleClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest('button') || target.closest('input') || target.closest('form')) {
                            return;
                          }
                          setQuickInputDate(dateItem.dateString);
                          setQuickInputText('');
                        }}
                        className={`flex items-start min-h-[48px] group/row py-1 transition-colors ${
                          dateItem.isToday
                            ? 'bg-[#FAF3EA] border-l-[4px] border-l-[#D23B38] -ml-[4px] shadow-xs relative z-10'
                            : 'hover:bg-[#F2EDE4]/30'
                        }`}
                        title="Double-click day to write note"
                      >
                        {/* Month Indicator */}
                        <div className="w-14 sm:w-18 shrink-0 text-right pr-3 pt-1">
                          {dateItem.isFirstDayOfMonth ? (
                            <div className="flex flex-col items-end">
                              <span
                                className={`font-serif text-sm sm:text-base font-bold tracking-tight ${
                                  isMonthFocus ? 'text-[#D23B38] font-black' : 'text-[#2B2C30]'
                                }`}
                              >
                                {dateItem.monthName}
                              </span>
                              {isMonthFocus && (
                                <span className="text-[8px] font-mono text-[#D23B38] uppercase font-bold tracking-widest bg-[#D23B38]/10 px-1 rounded mt-0.5">
                                  Current
                                </span>
                              )}
                            </div>
                          ) : dateItem.dayOfMonth === 15 ? (
                            <div className="flex flex-col items-end">
                              <span
                                className={`font-serif text-xs uppercase tracking-widest ${
                                  isMonthFocus ? 'text-[#D23B38] font-bold opacity-90' : 'text-[#8E8F95] opacity-60'
                                }`}
                              >
                                {dateItem.monthName}
                              </span>
                            </div>
                          ) : dayIdx === 0 ? (
                            <div className="flex flex-col items-end">
                              <span
                                className={`font-serif text-[11px] uppercase tracking-wider ${
                                  isMonthFocus ? 'text-[#D23B38] font-bold opacity-80' : 'text-[#A19D94] opacity-45'
                                }`}
                              >
                                {dateItem.monthName}
                              </span>
                            </div>
                          ) : null}
                        </div>

                        {/* Date & Day of Week (Sketch: "29 S", "30 M") */}
                        <div className="w-16 sm:w-22 shrink-0 flex items-center justify-start gap-1.5 pt-1 font-mono text-sm sm:text-base">
                          <span
                            className={`inline-flex items-center justify-center min-w-6 px-1 h-6 rounded-md text-xs sm:text-sm font-medium ${
                              dateItem.isToday
                                ? 'text-[#FAF8F5] bg-[#2B2C30] font-bold shadow-xs'
                                : 'text-[#2B2C30]'
                            }`}
                          >
                            {dateItem.dayOfMonth}
                          </span>
                          <span
                            className={`font-semibold text-xs sm:text-sm ${
                              dateItem.isToday
                                ? 'text-[#D23B38] font-bold'
                                : dateItem.dayOfWeek === 0 || dateItem.dayOfWeek === 6
                                ? 'text-[#D23B38]'
                                : 'text-[#63666A]'
                            }`}
                          >
                            {dateItem.dayOfWeekLetter}
                          </span>
                          {dateItem.isToday && (
                            <span className="text-[8px] font-mono font-black uppercase tracking-wider bg-[#D23B38] text-white px-1 py-0.5 rounded shadow-2xs">
                              TODAY
                            </span>
                          )}
                        </div>

                        {/* Spanning Rail */}
                        <div className="w-3 shrink-0 flex justify-center pt-2">
                          {contiguousSpansStartingHere.length > 0 && (
                            <div
                              className="w-1 h-3 rounded-full"
                              style={{ backgroundColor: contiguousSpansStartingHere[0].colorTag || '#83C5BE' }}
                              title="Starts contiguous span"
                            />
                          )}
                        </div>

                        {/* Daily Notes Area */}
                        <div className="flex-1 min-w-0 pr-3">
                          <div className="space-y-0.5">
                            {dayNotes.map((note) => (
                              <NoteItemComponent
                                key={note.id}
                                note={note}
                                currentDate={dateItem.dateString}
                                onToggleStrike={onToggleStrike}
                                onRemoveNote={onRemoveNote}
                                onUpdateNote={onUpdateNote}
                                onJumpToDate={(targetDate) => {
                                  if (onJumpToDateRequested) onJumpToDateRequested(targetDate);
                                }}
                              />
                            ))}
                          </div>

                          {/* Quick note input with increased, comfortable padding */}
                          {isQuickAdding ? (
                            <form
                              onSubmit={(e) => handleQuickNoteSubmit(e, dateItem.dateString)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-1.5 flex items-center gap-2 p-1.5 bg-white border border-[#DDD6C8] rounded-xl shadow-xs animate-in fade-in duration-100"
                            >
                              <input
                                autoFocus
                                type="text"
                                value={quickInputText}
                                onChange={(e) => setQuickInputText(e.target.value)}
                                placeholder="Write a note for this day... (Enter to save, Esc to cancel)"
                                onKeyDown={(e) => e.key === 'Escape' && setQuickInputDate(null)}
                                className="flex-1 px-3.5 py-2 text-sm bg-transparent border-0 text-[#2B2C30] placeholder:text-[#A19D94] focus:outline-hidden font-sans"
                              />
                              <button
                                type="submit"
                                className="px-3.5 py-1.5 text-xs bg-[#2B2C30] hover:bg-[#404147] text-[#FAF8F5] rounded-lg font-medium shadow-2xs transition-colors shrink-0"
                              >
                                Add
                              </button>
                              <button
                                type="button"
                                onClick={() => setQuickInputDate(null)}
                                className="px-2.5 py-1.5 text-xs text-[#8E8F95] hover:text-[#2B2C30] hover:bg-[#EAE3D6]/50 rounded-lg transition-colors shrink-0"
                                title="Cancel (Esc)"
                              >
                                Esc
                              </button>
                            </form>
                          ) : (
                            <button
                              onClick={() => {
                                setQuickInputDate(dateItem.dateString);
                                setQuickInputText('');
                              }}
                              className="opacity-0 group-row:opacity-100 mt-0.5 text-[11px] font-mono text-[#A19D94] hover:text-[#2B2C30] flex items-center gap-1 transition-opacity py-0.5 px-1 rounded"
                              title="Write note (or double-click day)"
                            >
                              <Plus className="w-3 h-3" />
                              <span>write note</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* TIER 2: Week Notes (Spans the vertical height of the week!) */}
                <div
                  onDoubleClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('button, form, input, .group\\/wnote')) return;
                    setQuickInputWeek(weekBlock.weekKey);
                    setQuickWeekText('');
                  }}
                  title="Week focus panel — double-click to add note"
                  className={`w-64 sm:w-72 shrink-0 border-l border-[#E5DFD5] p-3 flex flex-col justify-between group/weekpanel transition-colors cursor-pointer ${
                    weekBlock.containsToday
                      ? 'bg-[#F2ECE1]/90 ring-1 ring-inset ring-[#D23B38]/20'
                      : 'bg-[#F7F4EC]/40 hover:bg-[#F2EDE4]/30'
                  }`}
                >
                  {/* Week Header */}
                  <div>
                    <div
                      className={`flex items-center justify-between border-b pb-1.5 mb-2 ${
                        weekBlock.containsToday ? 'border-[#D9CDBC]' : 'border-[#E5DFD5]/70'
                      }`}
                    >
                      <div>
                        <span className="font-serif text-xs font-bold text-[#2B2C30] flex items-center gap-1.5">
                          Week {weekBlock.weekNumber}
                          {weekBlock.containsToday && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#D23B38] animate-pulse" />
                          )}
                        </span>
                        <span className="text-[10px] font-mono text-[#8E8F95]">
                          {weekBlock.startDate.monthName} {weekBlock.startDate.dayOfMonth} – {weekBlock.endDate.monthName} {weekBlock.endDate.dayOfMonth}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {weekBlock.containsToday && (
                          <span className="text-[9px] font-mono bg-[#D23B38] text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shadow-2xs">
                            Active
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setQuickInputWeek(weekBlock.weekKey);
                            setQuickWeekText('');
                          }}
                          className="flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded border border-[#DDD6C8] bg-white text-[#2B2C30] hover:bg-[#F2ECE1] hover:border-[#2B2C30] transition-colors shadow-2xs cursor-pointer"
                          title="Add weekly note / objective (or double-click panel)"
                        >
                          <Plus className="w-3 h-3 text-[#D23B38]" />
                          <span>+ Note</span>
                        </button>
                      </div>
                    </div>

                    {/* Week Notes List */}
                    <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                      {currentWeekNotes.length === 0 && !isAddingWeekNote && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setQuickInputWeek(weekBlock.weekKey);
                            setQuickWeekText('');
                          }}
                          className="w-full my-1 py-3 px-2 border border-dashed border-[#DDD6C8] hover:border-[#2B2C30]/50 rounded-lg flex flex-col items-center justify-center text-center bg-white/50 hover:bg-white/90 transition-all cursor-pointer group/placeholder"
                          title="Click or double-click to add weekly note"
                        >
                          <div className="flex items-center gap-1 text-xs font-serif italic text-[#71727A] group-hover/placeholder:text-[#2B2C30]">
                            <Plus className="w-3.5 h-3.5 text-[#D23B38]" />
                            <span>Add week focus / objective</span>
                          </div>
                          <span className="text-[9px] font-mono text-[#A19D94] mt-0.5">
                            or double-click panel
                          </span>
                        </button>
                      )}
                      {currentWeekNotes.map((wn) => {
                        const isMulti = wn.parentWeeks.length > 1;
                        const isEditingThis = editingWeekNoteId === wn.id;
                        const hasEdits = Boolean(wn.originalContent && wn.originalContent !== wn.content);
                        const diffChunks = hasEdits && wn.originalContent ? computeWordDiff(wn.originalContent, wn.content) : [];

                        if (isEditingThis) {
                          return (
                            <form
                              key={wn.id}
                              onSubmit={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const trimmed = editingWeekNoteText.trim();
                                if (onUpdateWeekNote) {
                                  onUpdateWeekNote(wn.id, trimmed);
                                }
                                setEditingWeekNoteId(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1.5 w-full my-0.5 p-1 bg-white border border-[#2B2C30] rounded-lg shadow-2xs"
                            >
                              <input
                                autoFocus
                                type="text"
                                value={editingWeekNoteText}
                                onChange={(e) => setEditingWeekNoteText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') setEditingWeekNoteId(null);
                                }}
                                className="flex-1 px-2.5 py-1 text-xs bg-transparent border-0 text-[#2B2C30] focus:outline-hidden"
                                placeholder="Edit week note..."
                              />
                              <button
                                type="submit"
                                className="px-2 py-1 text-xs bg-[#2B2C30] text-white rounded font-medium flex items-center gap-1"
                                title="Save (Enter)"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingWeekNoteId(null)}
                                className="p-1 text-[#8E8F95] hover:text-[#2B2C30]"
                                title="Cancel (Esc)"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </form>
                          );
                        }

                        return (
                          <div
                            key={wn.id}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingWeekNoteId(wn.id);
                              setEditingWeekNoteText(wn.content || wn.originalContent || '');
                            }}
                            className={`group/wnote relative flex items-start gap-1.5 p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                              wn.isStruck ? 'text-[#8E8F95]' : 'text-[#2B2C30] bg-[#FAF8F5] hover:bg-white shadow-2xs'
                            }`}
                            title="Double-click to edit week note"
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleStrikeWeekNote(wn.id);
                              }}
                              className={`mt-0.5 p-0.5 rounded transition-opacity ${
                                wn.isStruck
                                  ? 'text-[#A19D94]'
                                  : 'text-[#BBB6AC] opacity-30 group-wnote:opacity-100 hover:!opacity-100 hover:text-[#2B2C30]'
                              }`}
                              title={wn.isStruck ? 'Restore note' : 'Cross out note'}
                            >
                              <Strikethrough className="w-3 h-3" />
                            </button>

                            <div className="flex-1 min-w-0">
                              <span className="break-words leading-tight">
                                {wn.isStruck ? (
                                  <span className="line-through text-[#8E8F95]">
                                    {wn.content || wn.originalContent || '(empty note)'}
                                  </span>
                                ) : hasEdits ? (
                                  <span>
                                    {diffChunks.map((chunk, cIdx) => {
                                      if (chunk.type === 'deleted') {
                                        return (
                                          <span
                                            key={cIdx}
                                            className="line-through decoration-[#D23B38] text-[#D23B38] opacity-60 font-serif mr-1"
                                            title="Deleted word"
                                          >
                                            {chunk.value}
                                          </span>
                                        );
                                      }
                                      if (chunk.type === 'added') {
                                        return (
                                          <span
                                            key={cIdx}
                                            className="text-[#1E7B48] font-medium bg-[#E8F5E9]/60 px-0.5 rounded-xs mr-0.5"
                                            title="Added word"
                                          >
                                            {chunk.value}
                                          </span>
                                        );
                                      }
                                      return <span key={cIdx}>{chunk.value}</span>;
                                    })}
                                  </span>
                                ) : (
                                  wn.content || '(empty note)'
                                )}
                              </span>

                              {hasEdits && !wn.isStruck && (
                                <span
                                  className={`ml-1.5 text-[8px] font-mono px-1 py-0.2 rounded border ${
                                    wn.content === ''
                                      ? 'text-[#D23B38] bg-[#FDEDEC] border-[#FADBD8]'
                                      : 'text-[#1E7B48] bg-[#E8F5E9] border-[#C8E6C9]'
                                  }`}
                                  title={
                                    wn.content === ''
                                      ? 'All text deleted (crossed out)'
                                      : `Original: "${wn.originalContent}"`
                                  }
                                >
                                  {wn.content === '' ? 'deleted' : 'edited'}
                                </span>
                              )}

                              {isMulti && (
                                <div className="flex items-center gap-1 mt-0.5 text-[9px] font-mono text-[#83C5BE]">
                                  <Link2 className="w-2.5 h-2.5" />
                                  <span>Multi-week ({wn.parentWeeks.join(', ')})</span>
                                </div>
                              )}
                            </div>

                            {/* Edit Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingWeekNoteId(wn.id);
                                setEditingWeekNoteText(wn.content || wn.originalContent || '');
                              }}
                              className="opacity-40 group-wnote:opacity-100 hover:!opacity-100 p-0.5 text-[#71727A] hover:text-[#2B2C30] rounded transition-opacity"
                              title="Edit note (or double-click text)"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveWeekNote(wn.id);
                              }}
                              className="opacity-0 group-wnote:opacity-100 p-0.5 text-[#BBB6AC] hover:text-[#D23B38] rounded transition-opacity"
                              title="Delete note"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Add Week Note Input with comfortable padding */}
                  <div className="pt-2 border-t border-[#E5DFD5]/60 mt-2">
                    {isAddingWeekNote ? (
                      <form
                        onSubmit={(e) => handleQuickWeekNoteSubmit(e, weekBlock.weekKey)}
                        className="flex items-center gap-1.5 p-1 bg-white border border-[#DDD6C8] rounded-lg shadow-xs"
                      >
                        <input
                          autoFocus
                          type="text"
                          value={quickWeekText}
                          onChange={(e) => setQuickWeekText(e.target.value)}
                          placeholder="Week goal/focus... (Enter to save)"
                          onKeyDown={(e) => e.key === 'Escape' && setQuickInputWeek(null)}
                          className="flex-1 px-3 py-1.5 text-xs bg-transparent border-0 text-[#2B2C30] placeholder:text-[#A19D94] focus:outline-hidden"
                        />
                        <button type="submit" className="px-2.5 py-1.5 text-xs bg-[#2B2C30] text-[#FAF8F5] rounded-md font-medium shrink-0">
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuickInputWeek(null)}
                          className="px-1.5 py-1.5 text-xs text-[#8E8F95] hover:text-[#2B2C30] shrink-0"
                        >
                          Esc
                        </button>
                      </form>
                    ) : currentWeekNotes.length > 0 ? (
                      <button
                        onClick={() => {
                          setQuickInputWeek(weekBlock.weekKey);
                          setQuickWeekText('');
                        }}
                        className="text-[10px] font-mono text-[#71727A] hover:text-[#2B2C30] flex items-center justify-center gap-1 w-full py-1.5 rounded-md border border-dashed border-[#DDD6C8] hover:border-[#2B2C30]/40 bg-white/50 hover:bg-white transition-all shadow-2xs"
                        title="Add another weekly goal"
                      >
                        <Plus className="w-3 h-3 text-[#D23B38]" />
                        <span>Add weekly goal</span>
                      </button>
                    ) : null}
                  </div>
                </div>
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
