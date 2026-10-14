import { useEffect, useState, useMemo } from 'react';
import type React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { DateItem, NoteItem, WeekNote, DrawingElement, CalendarSettings } from '../types/calendar';
import { NoteItemComponent } from './NoteItemComponent';
import { DrawingOverlay } from './DrawingOverlay';
import { Plus, Strikethrough, Trash2, Link2 } from 'lucide-react';
import { analyzeDateSpan, groupDatesIntoWeeks } from '../utils/dateUtils';


interface VerticalCalendarProps {
  dates: DateItem[];
  notes: NoteItem[];
  weekNotes: WeekNote[];
  drawings: DrawingElement[];
  settings: CalendarSettings;
  onToggleStrike: (noteId: string) => void;
  onRemoveNote: (noteId: string) => void;
  onAddQuickNote: (dateString: string, content: string) => void;
  onAddWeekNote: (content: string, parentWeeks: string[], colorTag?: string) => void;
  onToggleStrikeWeekNote: (id: string) => void;
  onRemoveWeekNote: (id: string) => void;
  onAddDrawing: (drawing: Omit<DrawingElement, 'id' | 'createdAt'>) => void;
  onRemoveDrawing: (id: string) => void;
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
  onAddQuickNote,
  onAddWeekNote,
  onToggleStrikeWeekNote,
  onRemoveWeekNote,
  onAddDrawing,
  onRemoveDrawing,
  onJumpToDateRequested,
  scrollTargetDate,
  scrollRef,
}) => {
  const [quickInputDate, setQuickInputDate] = useState<string | null>(null);
  const [quickInputText, setQuickInputText] = useState('');
  const [quickInputWeek, setQuickInputWeek] = useState<string | null>(null);
  const [quickWeekText, setQuickWeekText] = useState('');

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
          containerHeight={virtualizer.getTotalSize()}
          getDateAtY={getDateAtY}
          getYForDate={getYForDate}
        />

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
              className="absolute left-0 top-0 w-full flex flex-col pb-4"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="flex items-stretch rounded-xl border border-[#E5DFD5]/60 bg-[#FAF8F5]/80 hover:border-[#DDD6C8] transition-colors overflow-hidden">
                {/* TIER 1: Daily Timeline (7 Days) */}
                <div className="flex-1 flex flex-col divide-y divide-[#EAE3D6]/50 min-w-0">
                  {weekBlock.days.map((dateItem) => {
                    const dayNotes = notesByDate.get(dateItem.dateString) || [];
                    const isQuickAdding = quickInputDate === dateItem.dateString;

                    const contiguousSpansStartingHere = dayNotes.filter((n) => {
                      const span = analyzeDateSpan(n.parentDates);
                      return span.isContiguous && span.startDate === dateItem.dateString && span.count > 1;
                    });

                    return (
                      <div
                        key={dateItem.dateString}
                        className={`flex items-start min-h-[46px] group/row py-1 transition-colors ${
                          dateItem.isToday ? 'bg-[#F2EDE4]/60' : 'hover:bg-[#F2EDE4]/30'
                        }`}
                      >
                        {/* Month Indicator */}
                        <div className="w-14 sm:w-18 shrink-0 text-right pr-3 pt-1">
                          {dateItem.isFirstDayOfMonth ? (
                            <span className="font-serif text-sm sm:text-base font-bold text-[#2B2C30] tracking-tight">
                              {dateItem.monthName}
                            </span>
                          ) : dateItem.dayOfMonth === 15 ? (
                            <span className="font-serif text-xs text-[#8E8F95] uppercase tracking-widest opacity-60">
                              {dateItem.monthName}
                            </span>
                          ) : null}
                        </div>

                        {/* Date & Day of Week (Sketch: "29 S", "30 M") */}
                        <div className="w-16 sm:w-20 shrink-0 flex items-center justify-start gap-1.5 pt-1 font-mono text-sm sm:text-base">
                          <span
                            className={`inline-block w-6 text-right font-medium ${
                              dateItem.isToday
                                ? 'text-[#FAF8F5] bg-[#2B2C30] rounded-sm px-0.5 font-bold shadow-xs'
                                : 'text-[#2B2C30]'
                            }`}
                          >
                            {dateItem.dayOfMonth}
                          </span>
                          <span
                            className={`font-semibold ${
                              dateItem.dayOfWeek === 0 || dateItem.dayOfWeek === 6
                                ? 'text-[#D23B38]'
                                : 'text-[#63666A]'
                            }`}
                          >
                            {dateItem.dayOfWeekLetter}
                          </span>
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
                                onJumpToDate={(targetDate) => {
                                  if (onJumpToDateRequested) onJumpToDateRequested(targetDate);
                                }}
                              />
                            ))}
                          </div>

                          {/* Quick note input */}
                          {isQuickAdding ? (
                            <form
                              onSubmit={(e) => handleQuickNoteSubmit(e, dateItem.dateString)}
                              className="mt-1 flex items-center gap-1.5"
                            >
                              <input
                                autoFocus
                                type="text"
                                value={quickInputText}
                                onChange={(e) => setQuickInputText(e.target.value)}
                                placeholder="Write a note... (Enter)"
                                onKeyDown={(e) => e.key === 'Escape' && setQuickInputDate(null)}
                                className="flex-1 px-2 py-0.5 text-xs bg-white border border-[#DDD6C8] rounded focus:outline-hidden"
                              />
                              <button
                                type="submit"
                                className="px-2 py-0.5 text-xs bg-[#2B2C30] text-[#FAF8F5] rounded"
                              >
                                Add
                              </button>
                            </form>
                          ) : (
                            <button
                              onClick={() => {
                                setQuickInputDate(dateItem.dateString);
                                setQuickInputText('');
                              }}
                              className="opacity-0 group-row:opacity-100 mt-0.5 text-[11px] font-mono text-[#A19D94] hover:text-[#2B2C30] flex items-center gap-1 transition-opacity py-0.5 px-1 rounded"
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
                <div className="w-64 sm:w-72 shrink-0 border-l border-[#E5DFD5] bg-[#F7F4EC]/40 p-3 flex flex-col justify-between group/weekpanel">
                  {/* Week Header */}
                  <div>
                    <div className="flex items-center justify-between border-b border-[#E5DFD5]/70 pb-1.5 mb-2">
                      <div>
                        <span className="font-serif text-xs font-bold text-[#2B2C30] block">
                          Week {weekBlock.weekNumber}
                        </span>
                        <span className="text-[10px] font-mono text-[#8E8F95]">
                          {weekBlock.startDate.monthName} {weekBlock.startDate.dayOfMonth} – {weekBlock.endDate.monthName} {weekBlock.endDate.dayOfMonth}
                        </span>
                      </div>
                      {weekBlock.containsToday && (
                        <span className="text-[9px] font-mono bg-[#2B2C30] text-[#FAF8F5] px-1 py-0.5 rounded font-bold uppercase">
                          Current
                        </span>
                      )}
                    </div>

                    {/* Week Notes List */}
                    <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                      {currentWeekNotes.map((wn) => {
                        const isMulti = wn.parentWeeks.length > 1;
                        return (
                          <div
                            key={wn.id}
                            className={`group/wnote relative flex items-start gap-1.5 p-1.5 rounded-md text-xs transition-colors ${
                              wn.isStruck ? 'text-[#8E8F95]' : 'text-[#2B2C30] bg-[#FAF8F5] hover:bg-white shadow-2xs'
                            }`}
                          >
                            <button
                              onClick={() => onToggleStrikeWeekNote(wn.id)}
                              className={`mt-0.5 p-0.5 rounded transition-colors ${
                                wn.isStruck
                                  ? 'text-[#A19D94]'
                                  : 'text-[#BBB6AC] opacity-0 group-wnote:opacity-100 hover:text-[#2B2C30]'
                              }`}
                              title={wn.isStruck ? 'Restore' : 'Strike through'}
                            >
                              <Strikethrough className="w-3 h-3" />
                            </button>

                            <div className="flex-1 min-w-0">
                              <span className={`break-words leading-tight ${wn.isStruck ? 'line-through text-[#8E8F95]' : ''}`}>
                                {wn.content}
                              </span>
                              {isMulti && (
                                <div className="flex items-center gap-1 mt-0.5 text-[9px] font-mono text-[#83C5BE]">
                                  <Link2 className="w-2.5 h-2.5" />
                                  <span>Multi-week ({wn.parentWeeks.join(', ')})</span>
                                </div>
                              )}
                            </div>

                            <button
                              onClick={() => onRemoveWeekNote(wn.id)}
                              className="opacity-0 group-wnote:opacity-100 p-0.5 text-[#BBB6AC] hover:text-[#D23B38] rounded"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Add Week Note Input */}
                  <div className="pt-2 border-t border-[#E5DFD5]/60 mt-2">
                    {isAddingWeekNote ? (
                      <form
                        onSubmit={(e) => handleQuickWeekNoteSubmit(e, weekBlock.weekKey)}
                        className="flex items-center gap-1"
                      >
                        <input
                          autoFocus
                          type="text"
                          value={quickWeekText}
                          onChange={(e) => setQuickWeekText(e.target.value)}
                          placeholder="Week goal/focus... (Enter)"
                          onKeyDown={(e) => e.key === 'Escape' && setQuickInputWeek(null)}
                          className="flex-1 px-1.5 py-0.5 text-xs bg-white border border-[#DDD6C8] rounded focus:outline-hidden"
                        />
                        <button type="submit" className="px-1.5 py-0.5 text-xs bg-[#2B2C30] text-[#FAF8F5] rounded">
                          Add
                        </button>
                      </form>
                    ) : (
                      <button
                        onClick={() => {
                          setQuickInputWeek(weekBlock.weekKey);
                          setQuickWeekText('');
                        }}
                        className="opacity-0 group-weekpanel:opacity-100 text-[10px] font-mono text-[#8E8F95] hover:text-[#2B2C30] flex items-center justify-center gap-1 w-full py-1 rounded hover:bg-[#EAE3D6]/60 transition-all"
                      >
                        <Plus className="w-3 h-3" />
                        <span>add weekly goal</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Dashed Week Separator Line (Matching User Sketch: "--------------------") */}
              <div className="flex items-center my-2 px-3">
                <div className="w-full border-t border-dashed border-[#A19D94]/70" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
