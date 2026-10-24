import { useEffect, useState, useMemo, useRef, useLayoutEffect, useCallback, memo } from 'react';
import type React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { DateItem, NoteItem, WeekNote, NoteScope, DrawingElement, CalendarSettings } from '../types/calendar';
import { DrawingOverlay } from './DrawingOverlay';
import { DayRow } from './calendar/DayRow';
import { WeekFocusPanel } from './calendar/WeekFocusPanel';
import { StickyMonthRail } from './calendar/StickyMonthRail';
import { groupDatesIntoWeeks, formatDateKey } from '../utils/dateUtils';

interface VerticalCalendarProps {
  dates: DateItem[];
  notes: NoteItem[];
  weekNotes: WeekNote[];
  drawings: DrawingElement[];
  circledDates?: Record<string, { color: string }>;
  settings: CalendarSettings;
  onLoadEarlierWeeks?: () => void;
  onLoadLaterWeeks?: () => void;
  onToggleStrike: (noteId: string) => void;
  onRemoveNote: (noteId: string) => void;
  onUpdateNote?: (noteId: string, newContent: string, parentDates?: string[], colorTag?: string) => void;
  onAcceptNoteRevision?: (noteId: string) => void;
  onReorderNotes?: (sourceNoteId: string, targetNoteId: string, position: 'before' | 'after', targetDate?: string) => void;
  onMoveNoteToDate?: (noteId: string, targetDate: string, position?: 'start' | 'end') => void;
  onMoveNoteScope?: (noteId: string, targetScope: NoteScope, targetTargets: string[], position?: 'start' | 'end') => boolean;
  onAddQuickNote: (dateString: string, content: string, parentDates?: string[], colorTag?: string) => void;
  onAddWeekNote: (content: string, parentWeeks: string[], colorTag?: string) => void;
  onToggleStrikeWeekNote: (id: string) => void;
  onRemoveWeekNote: (id: string) => void;
  onUpdateWeekNote?: (id: string, newContent: string, parentWeeks?: string[], colorTag?: string) => void;
  onReorderWeekNotes?: (sourceNoteId: string, targetNoteId: string, position: 'before' | 'after', targetWeek?: string) => void;
  onMoveWeekNoteToWeek?: (noteId: string, targetWeek: string, position?: 'start' | 'end') => void;
  onAddDrawing: (drawing: Omit<DrawingElement, 'id' | 'createdAt'>) => void;
  onRemoveDrawing: (id: string) => void;
  onRemoveDrawings?: (ids: string[]) => void;
  onToggleCircleDate?: (dateKey: string) => void;
  onCycleCircleColor?: (dateKey: string) => void;
  onCloseTool?: () => void;
  onJumpToDateRequested?: (dateKey: string) => void;
  scrollTargetDate?: { dateString: string; key: number } | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  hideWeekPanel?: boolean;
  onOpenWeekScratchPad?: (weekKey: string) => void;
  onOpenFolio?: (noteId: string) => void;
}

export const VerticalCalendar: React.FC<VerticalCalendarProps> = memo(({
  dates = [],
  notes = [],
  weekNotes = [],
  drawings = [],
  circledDates = {},
  settings,
  onLoadEarlierWeeks,
  onLoadLaterWeeks,
  onToggleStrike,
  onRemoveNote,
  onUpdateNote,
  onAcceptNoteRevision,
  onReorderNotes,
  onMoveNoteToDate,
  onMoveNoteScope,
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
  onToggleCircleDate,
  onCycleCircleColor,
  onCloseTool,
  onJumpToDateRequested,
  scrollTargetDate,
  scrollRef,
  hideWeekPanel = false,
  onOpenWeekScratchPad,
  onOpenFolio,
}) => {
  const [quickInputDate, setQuickInputDate] = useState<string | null>(null);
  const [quickInputWeek, setQuickInputWeek] = useState<string | null>(null);

  const currentMonthKey = useMemo(() => formatDateKey(new Date()).slice(0, 7), []);

  // Prepending & Appending scroll compensation refs
  const prevScrollHeightRef = useRef<number>(0);
  const prevScrollTopRef = useRef<number>(0);
  const isPrependingRef = useRef<boolean>(false);
  const isAppendingRef = useRef<boolean>(false);
  const prevWeekCountRef = useRef<number>(0);

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

  const availableWeeks = useMemo(() => {
    return weekBlocks.map((b) => ({ weekKey: b.weekKey, label: b.label }));
  }, [weekBlocks]);

  const todayWeekIndex = useMemo(() => {
    return weekBlocks.findIndex((b) => b.containsToday);
  }, [weekBlocks]);

  // TanStack Virtualizer with stable key indexing and instant initial centering
  const virtualizer = useVirtualizer({
    count: weekBlocks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (hideWeekPanel ? 360 : 420),
    overscan: 4,
    getItemKey: (index) => weekBlocks[index]?.weekKey ?? index,
    initialRect: typeof window !== 'undefined'
      ? { width: window.innerWidth, height: window.innerHeight }
      : { width: 1024, height: 768 },
    initialOffset: () => {
      if (todayWeekIndex === -1) return 0;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
      const itemHeight = hideWeekPanel ? 360 : 420;
      return Math.max(0, todayWeekIndex * itemHeight - (vh / 2) + (itemHeight / 2));
    },
  });

  // Map each date to its week block index
  const dateToWeekIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    weekBlocks.forEach((block, wIdx) => {
      block.days.forEach((day) => map.set(day.dateString, wIdx));
    });
    return map;
  }, [weekBlocks]);

  // Initial scroll to today flag
  const hasInitiallyScrolledRef = useRef<boolean>(false);
  const lastTargetKeyRef = useRef<number | null>(null);

  // Prepend and append infinite scroll handlers
  const handleLoadEarlier = useCallback(() => {
    if (isPrependingRef.current || !scrollRef.current || !hasInitiallyScrolledRef.current) return;
    isPrependingRef.current = true;
    prevScrollHeightRef.current = scrollRef.current.scrollHeight;
    prevScrollTopRef.current = scrollRef.current.scrollTop;
    onLoadEarlierWeeks?.();

    // Safety fallback: ensure prepending flag resets even if re-render was skipped
    setTimeout(() => {
      if (isPrependingRef.current) {
        isPrependingRef.current = false;
      }
    }, 1000);
  }, [onLoadEarlierWeeks, scrollRef]);

  const handleLoadLater = useCallback(() => {
    if (isAppendingRef.current || !scrollRef.current || !hasInitiallyScrolledRef.current) return;
    isAppendingRef.current = true;
    onLoadLaterWeeks?.();
    setTimeout(() => {
      isAppendingRef.current = false;
    }, 200);
  }, [onLoadLaterWeeks, scrollRef]);

  // Synchronously compensate scroll offset when earlier weeks are prepended
  useLayoutEffect(() => {
    if (isPrependingRef.current && scrollRef.current) {
      const newScrollHeight = scrollRef.current.scrollHeight;
      let heightDiff = newScrollHeight - prevScrollHeightRef.current;

      // Fallback if DOM scrollHeight didn't change synchronously
      if (heightDiff <= 0 && weekBlocks.length > prevWeekCountRef.current) {
        const addedWeeks = weekBlocks.length - prevWeekCountRef.current;
        const itemHeight = hideWeekPanel ? 360 : 420;
        heightDiff = addedWeeks * itemHeight;
      }

      if (heightDiff > 0) {
        const newScrollTop = scrollRef.current.scrollTop + heightDiff;
        scrollRef.current.scrollTop = newScrollTop;
        virtualizer.scrollToOffset(newScrollTop, { align: 'start', behavior: 'auto' });
      }
      isPrependingRef.current = false;
    }
    prevWeekCountRef.current = weekBlocks.length;
  }, [weekBlocks, scrollRef, virtualizer, hideWeekPanel]);

  // Listen to scroll events to trigger bidirectional loading near boundaries
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      if (!hasInitiallyScrolledRef.current) return;
      if (isPrependingRef.current || isAppendingRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight) return;

      // Generous 800px threshold (~2 weeks buffer) for smooth seamless loading
      if (scrollTop < 800) {
        handleLoadEarlier();
      } else if (scrollTop + clientHeight > scrollHeight - 800) {
        handleLoadLater();
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [handleLoadEarlier, handleLoadLater, scrollRef]);

  // Instant initial centering on Today before first paint
  useLayoutEffect(() => {
    if (todayWeekIndex !== -1 && scrollRef.current && !hasInitiallyScrolledRef.current) {
      hasInitiallyScrolledRef.current = true;
      const vh = scrollRef.current.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 768);
      const itemHeight = hideWeekPanel ? 360 : 420;
      const targetOffset = Math.max(0, todayWeekIndex * itemHeight - (vh / 2) + (itemHeight / 2));

      scrollRef.current.scrollTop = targetOffset;
      virtualizer.scrollToOffset(targetOffset, { align: 'start', behavior: 'auto' });
    }
  }, [todayWeekIndex, hideWeekPanel, virtualizer, scrollRef]);

  // Smooth scroll to targeted date: only trigger on fresh user-requested target keys
  useEffect(() => {
    if (!scrollTargetDate || scrollTargetDate.key === lastTargetKeyRef.current || !scrollRef.current) return;
    lastTargetKeyRef.current = scrollTargetDate.key;

    const wIdx = dateToWeekIndexMap.get(scrollTargetDate.dateString);
    if (wIdx !== undefined) {
      virtualizer.scrollToIndex(wIdx, {
        align: 'center',
        behavior: 'smooth',
      });
    }
  }, [scrollTargetDate, dateToWeekIndexMap, virtualizer, scrollRef]);

  // Visible date range with a 2-week buffer for Drawing Frustum Culling
  const visibleDateRange = useMemo(() => {
    const virtualItems = virtualizer.getVirtualItems();
    if (virtualItems.length === 0 || weekBlocks.length === 0) return null;

    const firstIndex = Math.max(0, virtualItems[0].index - 2);
    const lastIndex = Math.min(weekBlocks.length - 1, virtualItems[virtualItems.length - 1].index + 2);

    const minDate = weekBlocks[firstIndex]?.startDate?.dateString || '';
    const maxDate = weekBlocks[lastIndex]?.endDate?.dateString || '';

    return { minDate, maxDate };
  }, [virtualizer, weekBlocks]);

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
    // Continuous offset fallback via virtualizer index offset rather than arbitrary hardcoded multiplier
    const rawOffset = virtualizer.getOffsetForIndex?.(wIdx);
    const offset = typeof rawOffset === 'number' ? rawOffset : Array.isArray(rawOffset) ? rawOffset[0] : wIdx * 420;
    const dayHeight = 60; // 420 / 7
    return offset + (dayIdx >= 0 ? dayIdx * dayHeight : 0);
  };

  return (
    <div
      ref={scrollRef}
      className="relative flex-1 overflow-y-auto paper-texture select-none h-full outline-hidden"
      style={{ overflowAnchor: 'none' }}
    >
      <div
        className="relative mx-auto max-w-[1600px] min-w-[340px] px-2 sm:px-4 md:px-8 py-6"
        style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%' }}
      >
        {/* Drawing Canvas Overlay with Viewport Frustum Culling */}
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
          visibleDateRange={visibleDateRange}
        />

        {/* Active Drawing Tool Helper Pill */}
        {settings.activeTool !== 'select' && (
          <div className="sticky top-2 z-30 mx-auto max-w-fit mb-3 flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-[#2B2C30] text-[#FAF8F5] text-xs font-mono shadow-md backdrop-blur-xs animate-in fade-in duration-150">
            <span className="w-2 h-2 rounded-full bg-[#E29578] animate-pulse shrink-0" />
            <span className="text-xs">
              {settings.activeTool === 'eraser' && 'Painting Eraser: Click and drag/paint across pencil strokes to wipe them away'}
              {settings.activeTool === 'arrow' && 'Timeline Arrow: Click and drag from one date to another to link them with a curved arrow'}
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
        <div className="flex items-center text-[10px] font-mono uppercase tracking-wider text-[#8E8F95] pb-2 border-b border-[#E5DFD5] mb-2">
          <div className="w-8 shrink-0 font-semibold text-center">Mo</div>
          <div className="w-12 shrink-0 font-semibold text-center">Date</div>
          <div className="flex-1 font-semibold pl-1.5">Daily Notes & Tasks</div>
          {!hideWeekPanel && (
            <div className="w-64 sm:w-72 lg:w-80 xl:w-96 shrink-0 font-semibold pl-2.5 border-l border-[#E5DFD5]">Weekly Scratch Pad</div>
          )}
        </div>

        {/* Sticky Month Rail (Fixed vertically at 50% screen height) */}
        <StickyMonthRail
          scrollRef={scrollRef}
          dates={dates}
          weekBlocks={weekBlocks}
          virtualizer={virtualizer}
          currentMonthKey={currentMonthKey}
          onJumpToDateRequested={onJumpToDateRequested}
        />

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
              {/* Top Week Divider for First Row (if not current week) */}
              {virtualRow.index === 0 && !weekBlock.containsToday ? (
                <div className="w-full h-[2px] bg-[#8E8F95] shrink-0" />
              ) : null}

              <div
                className={`flex items-stretch transition-colors ${
                  weekBlock.containsToday
                    ? 'border-2 border-[#D23B38] bg-[#FAF7F2] shadow-xs relative z-20'
                    : 'border-x border-[#E5DFD5] bg-[#FAF8F5]'
                }`}
              >
                {/* TIER 1: Daily Timeline (7 Days) */}
                <div className="flex-1 flex flex-col divide-y divide-[#D5CDC0] min-w-0">
                  {weekBlock.days.map((dateItem, dayIdx) => (
                    <DayRow
                      key={dateItem.dateString}
                      dateItem={dateItem}
                      dayIdx={dayIdx}
                      dayNotes={notesByDate.get(dateItem.dateString) || []}
                      isMonthFocus={dateItem.dateString.slice(0, 7) === currentMonthKey}
                      isQuickAdding={quickInputDate === dateItem.dateString}
                      isCircled={Boolean(circledDates[dateItem.dateString])}
                      circleColor={circledDates[dateItem.dateString]?.color}
                      onToggleCircleDate={onToggleCircleDate}
                      onCycleCircleColor={onCycleCircleColor}
                      activeTool={settings.activeTool}
                      onStartQuickAdd={(d) => setQuickInputDate(d)}
                      onCancelQuickAdd={() => setQuickInputDate(null)}
                      onAddNote={(content, parentDates, colorTag) => {
                        onAddQuickNote(dateItem.dateString, content, parentDates, colorTag);
                      }}
                      onToggleStrike={onToggleStrike}
                      onRemoveNote={onRemoveNote}
                      onUpdateNote={onUpdateNote}
                      onAcceptNoteRevision={onAcceptNoteRevision}
                      onJumpToDateRequested={onJumpToDateRequested}
                      onReorderNotes={onReorderNotes}
                      onMoveNoteToDate={onMoveNoteToDate}
                      onMoveNoteScope={onMoveNoteScope}
                      onSizeChange={() => virtualizer.measure()}
                      onOpenFolio={onOpenFolio}
                    />
                  ))}
                  {/* Mobile In-Stream Week Scratch Pad Bridge */}
                  {hideWeekPanel && onOpenWeekScratchPad && (
                    <div className="px-3 py-1.5 bg-[#FAF3EA]/80 flex items-center justify-between text-[11px] font-mono select-none border-t border-[#E5DFD5]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[#2B2C30]">Week {weekBlock.weekNumber}</span>
                        <span className="text-[#8E8F95] text-[10px]">
                          {weekBlock.startDate.monthName} {weekBlock.startDate.dayOfMonth} – {weekBlock.endDate.monthName} {weekBlock.endDate.dayOfMonth}
                        </span>
                        {currentWeekNotes.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-[#E5DFD5] text-[#2B2C30] text-[10px] font-bold">
                            {currentWeekNotes.length} note{currentWeekNotes.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenWeekScratchPad(weekBlock.weekKey)}
                        className="flex items-center gap-1 text-[#2B2C30] hover:text-[#D23B38] font-medium transition-colors cursor-pointer text-xs"
                        title="Open Week Scratch Pad"
                      >
                        <span>Scratch Pad</span>
                        <span>→</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* TIER 2: Week Notes (Spans the vertical height of the week) */}
                {!hideWeekPanel && (
                  <WeekFocusPanel
                    weekBlock={weekBlock}
                    currentWeekNotes={currentWeekNotes}
                    isAddingWeekNote={isAddingWeekNote}
                    availableWeeks={availableWeeks}
                    onStartAddWeekNote={(wKey) => setQuickInputWeek(wKey)}
                    onCancelAddWeekNote={() => setQuickInputWeek(null)}
                    onAddWeekNote={onAddWeekNote}
                    onToggleStrikeWeekNote={onToggleStrikeWeekNote}
                    onRemoveWeekNote={onRemoveWeekNote}
                    onUpdateWeekNote={onUpdateWeekNote}
                    onAcceptNoteRevision={onAcceptNoteRevision}
                    onReorderWeekNotes={onReorderWeekNotes}
                    onMoveWeekNoteToWeek={onMoveWeekNoteToWeek}
                    onMoveNoteScope={onMoveNoteScope}
                    onJumpToWeek={(wKey) => {
                      const targetBlock = weekBlocks.find((b) => b.weekKey === wKey);
                      if (targetBlock && onJumpToDateRequested) {
                        onJumpToDateRequested(targetBlock.startDate.dateString);
                      }
                    }}
                    onSizeChange={() => virtualizer.measure()}
                    onOpenFolio={onOpenFolio}
                  />
                )}
              </div>

              {/* Integrated Solid Week Separator Line: rendered between normal weeks, omitted when adjacent to current week frame */}
              {!weekBlock.containsToday && !weekBlocks[virtualRow.index + 1]?.containsToday && (
                <div className="w-full h-[2px] bg-[#8E8F95] shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
