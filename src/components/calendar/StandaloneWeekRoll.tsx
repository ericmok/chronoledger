import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import type React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { DateItem, WeekNote, CalendarSettings } from '../../types/calendar';
import { groupDatesIntoWeeks } from '../../utils/dateUtils';
import { WeekFocusPanel } from './WeekFocusPanel';

export interface StandaloneWeekRollProps {
  dates: DateItem[];
  weekNotes: WeekNote[];
  settings: CalendarSettings;
  onAddWeekNote: (content: string, parentWeeks: string[], colorTag?: string) => void;
  onToggleStrikeWeekNote: (id: string) => void;
  onRemoveWeekNote: (id: string) => void;
  onUpdateWeekNote?: (id: string, newContent: string, parentWeeks?: string[], colorTag?: string) => void;
  onAcceptNoteRevision?: (noteId: string) => void;
  onReorderWeekNotes?: (sourceNoteId: string, targetNoteId: string, position: 'before' | 'after', targetWeek?: string) => void;
  onMoveWeekNoteToWeek?: (noteId: string, targetWeek: string, position?: 'start' | 'end') => void;
  onJumpToDateRequested?: (dateKey: string) => void;
  scrollTargetWeekKey?: string | null;
  onLoadEarlierWeeks?: () => void;
  onLoadLaterWeeks?: () => void;
}

export const StandaloneWeekRoll: React.FC<StandaloneWeekRollProps> = ({
  dates = [],
  weekNotes = [],
  settings,
  onAddWeekNote,
  onToggleStrikeWeekNote,
  onRemoveWeekNote,
  onUpdateWeekNote,
  onAcceptNoteRevision,
  onReorderWeekNotes,
  onMoveWeekNoteToWeek,
  onJumpToDateRequested,
  scrollTargetWeekKey,
  onLoadEarlierWeeks,
  onLoadLaterWeeks,
}) => {
  const [quickInputWeek, setQuickInputWeek] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Prepending & Appending scroll compensation refs
  const prevScrollHeightRef = useRef<number>(0);
  const prevScrollTopRef = useRef<number>(0);
  const isPrependingRef = useRef<boolean>(false);
  const isAppendingRef = useRef<boolean>(false);
  const prevWeekCountRef = useRef<number>(0);

  // Map week notes to their week key
  const weekNotesByWeek = useMemo(() => {
    const map = new Map<string, WeekNote[]>();
    for (const wn of weekNotes || []) {
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

  const virtualizer = useVirtualizer({
    count: weekBlocks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 180,
    overscan: 4,
    getItemKey: (index) => weekBlocks[index]?.weekKey ?? index,
    initialRect: typeof window !== 'undefined'
      ? { width: window.innerWidth, height: window.innerHeight }
      : { width: 1024, height: 768 },
    initialOffset: () => {
      if (todayWeekIndex === -1) return 0;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
      const itemHeight = 180;
      return Math.max(0, todayWeekIndex * itemHeight - (vh / 2) + (itemHeight / 2));
    },
  });

  const hasInitiallyScrolledRef = useRef<boolean>(false);
  const lastTargetWeekKeyRef = useRef<string | null>(null);

  // Instant initial centering on Today before first paint
  useLayoutEffect(() => {
    if (todayWeekIndex !== -1 && scrollRef.current && !hasInitiallyScrolledRef.current) {
      hasInitiallyScrolledRef.current = true;
      const vh = scrollRef.current.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 768);
      const itemHeight = 180;
      const targetOffset = Math.max(0, todayWeekIndex * itemHeight - (vh / 2) + (itemHeight / 2));

      scrollRef.current.scrollTop = targetOffset;
      virtualizer.scrollToOffset(targetOffset, { align: 'start', behavior: 'auto' });
    }
  }, [todayWeekIndex, virtualizer]);

  // Synchronously compensate scroll offset when earlier weeks are prepended
  useLayoutEffect(() => {
    if (isPrependingRef.current && scrollRef.current) {
      const newScrollHeight = scrollRef.current.scrollHeight;
      let heightDiff = newScrollHeight - prevScrollHeightRef.current;

      if (heightDiff <= 0 && weekBlocks.length > prevWeekCountRef.current) {
        const addedWeeks = weekBlocks.length - prevWeekCountRef.current;
        heightDiff = addedWeeks * 180;
      }

      if (heightDiff > 0) {
        const newScrollTop = scrollRef.current.scrollTop + heightDiff;
        scrollRef.current.scrollTop = newScrollTop;
        virtualizer.scrollToOffset(newScrollTop, { align: 'start', behavior: 'auto' });
      }
      isPrependingRef.current = false;
    }
    prevWeekCountRef.current = weekBlocks.length;
  }, [weekBlocks, virtualizer]);

  const handleLoadEarlier = useCallback(() => {
    if (isPrependingRef.current || !scrollRef.current || !hasInitiallyScrolledRef.current) return;
    isPrependingRef.current = true;
    prevScrollHeightRef.current = scrollRef.current.scrollHeight;
    prevScrollTopRef.current = scrollRef.current.scrollTop;
    onLoadEarlierWeeks?.();

    setTimeout(() => {
      if (isPrependingRef.current) {
        isPrependingRef.current = false;
      }
    }, 1000);
  }, [onLoadEarlierWeeks]);

  const handleLoadLater = useCallback(() => {
    if (isAppendingRef.current || !scrollRef.current || !hasInitiallyScrolledRef.current) return;
    isAppendingRef.current = true;
    onLoadLaterWeeks?.();
    setTimeout(() => {
      isAppendingRef.current = false;
    }, 200);
  }, [onLoadLaterWeeks]);

  // Handle targeting a specific week (only once per unique target week)
  useEffect(() => {
    if (!scrollTargetWeekKey || scrollTargetWeekKey === lastTargetWeekKeyRef.current || !scrollRef.current) return;
    lastTargetWeekKeyRef.current = scrollTargetWeekKey;

    const targetIdx = weekBlocks.findIndex((b) => b.weekKey === scrollTargetWeekKey);
    if (targetIdx !== -1) {
      virtualizer.scrollToIndex(targetIdx, { align: 'center', behavior: 'smooth' });
    }
  }, [scrollTargetWeekKey, weekBlocks, virtualizer]);

  // Infinite scroll listener
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      if (!hasInitiallyScrolledRef.current) return;
      if (isPrependingRef.current || isAppendingRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight) return;

      if (scrollTop < 600) {
        handleLoadEarlier();
      } else if (scrollTop + clientHeight > scrollHeight - 600) {
        handleLoadLater();
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [handleLoadEarlier, handleLoadLater]);

  return (
    <div
      ref={scrollRef}
      className="relative flex-1 overflow-y-auto paper-texture select-none h-full outline-hidden px-3 py-4"
      style={{ overflowAnchor: 'none' }}
    >
      <div className="max-w-[720px] mx-auto pb-16">
        <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-[#8E8F95] pb-2 border-b border-[#E5DFD5] mb-4">
          <span className="font-semibold text-[#2B2C30]">Weekly Scratch Pads</span>
          <span>7-Day Span Notes</span>
        </div>

        <div
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const weekBlock = weekBlocks[virtualRow.index];
            const currentWeekNotes = weekNotesByWeek.get(weekBlock.weekKey) || [];
            const isAddingWeekNote = quickInputWeek === weekBlock.weekKey;

            return (
              <div
                key={weekBlock.weekKey}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className="absolute left-0 top-0 w-full pb-3.5"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
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
                  onJumpToWeek={(wKey) => {
                    const targetBlock = weekBlocks.find((b) => b.weekKey === wKey);
                    if (targetBlock && onJumpToDateRequested) {
                      onJumpToDateRequested(targetBlock.startDate.dateString);
                    }
                  }}
                  isFullWidth={true}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
