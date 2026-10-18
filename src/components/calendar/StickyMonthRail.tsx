import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { DateItem } from '../../types/calendar';
import type { WeekBlock } from '../../utils/dateUtils';
import { FULL_MONTH_NAMES } from '../../utils/dateUtils';
import { getSeasonalColor, type MonthSeasonalColor } from '../../utils/seasonalColors';

export interface StickyMonthRailProps {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  dates: DateItem[];
  weekBlocks: WeekBlock[];
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  currentMonthKey: string;
  onJumpToDateRequested?: (dateKey: string) => void;
}

interface MonthDisplayInfo {
  name: string; // 'OCT'
  fullName: string; // 'October'
  year: number;
  monthIndex: number;
  monthKey: string; // '2026-10'
  firstDateString: string;
  isCurrentMonth: boolean;
  seasonalColor: MonthSeasonalColor;
}

export const StickyMonthRail: React.FC<StickyMonthRailProps> = ({
  scrollRef,
  dates,
  weekBlocks,
  virtualizer,
  currentMonthKey,
  onJumpToDateRequested,
}) => {
  const [activeMonth, setActiveMonth] = useState<MonthDisplayInfo | null>(null);
  const [transitionNextMonth, setTransitionNextMonth] = useState<MonthDisplayInfo | null>(null);
  const [transitionProgress, setTransitionProgress] = useState(0); // 0 to 1

  // Pre-index first date of each month for rapid lookup
  const monthFirstDates = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of dates) {
      if (d.dayOfMonth === 1) {
        const mKey = `${d.year}-${String(d.monthIndex + 1).padStart(2, '0')}`;
        map.set(mKey, d.dateString);
      }
    }
    return map;
  }, [dates]);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el || weekBlocks.length === 0) return;

    const scrollTop = el.scrollTop;
    const clientHeight = el.clientHeight;
    const centerY = scrollTop + clientHeight / 2;

    const virtualItems = virtualizer.getVirtualItems();
    if (virtualItems.length === 0) return;

    // 1. Locate the day currently in the vertical center of the viewport
    let centerDay: DateItem | null = null;
    for (const vItem of virtualItems) {
      if (centerY >= vItem.start && centerY <= vItem.start + vItem.size) {
        const block = weekBlocks[vItem.index];
        if (block && block.days.length > 0) {
          const relativeY = centerY - vItem.start;
          const dayHeight = vItem.size / block.days.length;
          const dayIdx = Math.min(Math.max(0, Math.floor(relativeY / dayHeight)), block.days.length - 1);
          centerDay = block.days[dayIdx];
        }
        break;
      }
    }

    // Fallback to middle virtual item if not found precisely
    if (!centerDay && virtualItems.length > 0) {
      const midVItem = virtualItems[Math.floor(virtualItems.length / 2)];
      const block = weekBlocks[midVItem.index];
      if (block && block.days.length > 0) {
        centerDay = block.days[Math.floor(block.days.length / 2)];
      }
    }

    if (!centerDay) return;

    const mIdx = centerDay.monthIndex;
    const year = centerDay.year;
    const mKey = `${year}-${String(mIdx + 1).padStart(2, '0')}`;
    const firstDateString = monthFirstDates.get(mKey) || centerDay.dateString;

    const currentInfo: MonthDisplayInfo = {
      name: centerDay.monthName.toUpperCase(),
      fullName: FULL_MONTH_NAMES[mIdx] || centerDay.monthName,
      year,
      monthIndex: mIdx,
      monthKey: mKey,
      firstDateString,
      isCurrentMonth: mKey === currentMonthKey,
      seasonalColor: getSeasonalColor(mIdx),
    };

    // 2. Check for month boundary near the center for a tactile tumbler transition
    let nextMonthBoundary: { day: DateItem; delta: number } | null = null;
    const TRANSITION_THRESHOLD = 44; // pixels around the center

    for (const vItem of virtualItems) {
      const block = weekBlocks[vItem.index];
      if (!block) continue;
      const dayHeight = vItem.size / block.days.length;

      for (let dayIdx = 0; dayIdx < block.days.length; dayIdx++) {
        const day = block.days[dayIdx];
        if (day.dayOfMonth === 1) {
          const boundaryY = vItem.start + dayIdx * dayHeight;
          const delta = boundaryY - centerY;
          if (Math.abs(delta) <= TRANSITION_THRESHOLD) {
            nextMonthBoundary = { day, delta };
            break;
          }
        }
      }
      if (nextMonthBoundary) break;
    }

    if (nextMonthBoundary) {
      const { day, delta } = nextMonthBoundary;
      // Progress from 0 (boundary at threshold below center) to 1 (boundary at threshold above center)
      const progress = (TRANSITION_THRESHOLD - delta) / (TRANSITION_THRESHOLD * 2);

      const targetMIdx = day.monthIndex;
      const targetYear = day.year;
      const targetMKey = `${targetYear}-${String(targetMIdx + 1).padStart(2, '0')}`;
      const targetFirstDate = monthFirstDates.get(targetMKey) || day.dateString;

      const targetInfo: MonthDisplayInfo = {
        name: day.monthName.toUpperCase(),
        fullName: FULL_MONTH_NAMES[targetMIdx] || day.monthName,
        year: targetYear,
        monthIndex: targetMIdx,
        monthKey: targetMKey,
        firstDateString: targetFirstDate,
        isCurrentMonth: targetMKey === currentMonthKey,
        seasonalColor: getSeasonalColor(targetMIdx),
      };

      if (delta > 0) {
        // Boundary is coming from below: active is currentInfo, next is targetInfo
        setActiveMonth(currentInfo);
        setTransitionNextMonth(targetInfo);
        setTransitionProgress(progress);
      } else {
        // Boundary just crossed above center: active is targetInfo, prev is currentInfo
        setActiveMonth(targetInfo);
        setTransitionNextMonth(null);
        setTransitionProgress(0);
      }
    } else {
      setActiveMonth(currentInfo);
      setTransitionNextMonth(null);
      setTransitionProgress(0);
    }
  }, [scrollRef, weekBlocks, virtualizer, monthFirstDates, currentMonthKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      update();
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    // Initial update
    update();
    const t1 = setTimeout(update, 50);
    const t2 = setTimeout(update, 200);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [scrollRef, update]);

  // Keep in sync when virtualizer items change
  useEffect(() => {
    update();
  }, [virtualizer.scrollOffset, update]);

  if (!activeMonth) return null;

  const isTransitioning = Boolean(transitionNextMonth && transitionProgress > 0 && transitionProgress < 1);
  const PILL_TRAVEL_HEIGHT = 48;

  return (
    <aside
      className="fixed left-0 top-1/2 -translate-y-1/2 z-30 pointer-events-none select-none flex flex-col items-start"
      aria-label="Current Month Indicator"
    >
      <div className="relative flex flex-col items-start justify-center">
        {/* Outgoing Month Pill (if transitioning) */}
        {isTransitioning && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onJumpToDateRequested?.(activeMonth.firstDateString)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onJumpToDateRequested?.(activeMonth.firstDateString);
              }
            }}
            title={`${activeMonth.fullName} ${activeMonth.year} — click to jump to start of month`}
            className="absolute left-0 pointer-events-auto cursor-pointer group/railpill flex flex-col items-start transition-transform"
            style={{
              transform: `translateY(${-transitionProgress * PILL_TRAVEL_HEIGHT}px)`,
              opacity: Math.max(0.1, 1 - transitionProgress * 0.9),
            }}
          >
            <MonthPill month={activeMonth} />
          </div>
        )}

        {/* Primary / Incoming Month Pill */}
        {isTransitioning && transitionNextMonth ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onJumpToDateRequested?.(transitionNextMonth.firstDateString)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onJumpToDateRequested?.(transitionNextMonth.firstDateString);
              }
            }}
            title={`${transitionNextMonth.fullName} ${transitionNextMonth.year} — click to jump to start of month`}
            className="absolute left-0 pointer-events-auto cursor-pointer group/railpill flex flex-col items-start transition-transform"
            style={{
              transform: `translateY(${(1 - transitionProgress) * PILL_TRAVEL_HEIGHT}px)`,
              opacity: Math.max(0.15, transitionProgress),
            }}
          >
            <MonthPill month={transitionNextMonth} />
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onJumpToDateRequested?.(activeMonth.firstDateString)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onJumpToDateRequested?.(activeMonth.firstDateString);
              }
            }}
            title={`${activeMonth.fullName} ${activeMonth.year} — click to jump to start of month`}
            className="pointer-events-auto cursor-pointer group/railpill flex flex-col items-start"
          >
            <MonthPill month={activeMonth} />
          </div>
        )}
      </div>
    </aside>
  );
};

interface MonthPillProps {
  month: MonthDisplayInfo;
}

const MonthPill: React.FC<MonthPillProps> = ({ month }) => {
  return (
    <div
      className={`pl-1 pr-1.5 py-2.5 rounded-r-md flex flex-col items-center justify-center transition-all select-none shadow-sm border-r border-y ${
        month.isCurrentMonth
          ? 'bg-[#2B2C30] text-[#FAF8F5] border-[#2B2C30] hover:brightness-110'
          : 'bg-[#FAF8F5] text-[#2B2C30] border-[#E5DFD5] hover:border-[#D23B38]'
      }`}
    >
      <div
        className={`font-serif text-[10px] font-bold tracking-widest uppercase flex items-center gap-1 select-none ${
          month.isCurrentMonth ? 'text-[#FAF8F5]' : 'text-[#2B2C30]'
        }`}
        style={{
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
        }}
      >
        <span
          className="font-extrabold tracking-wider"
          style={
            !month.isCurrentMonth && month.seasonalColor
              ? { color: month.seasonalColor.accentTag }
              : undefined
          }
        >
          {month.name}
        </span>
        <span
          className={`text-[9px] font-mono font-bold ${
            month.isCurrentMonth ? 'text-[#FAF8F5]/80' : 'text-[#7E7F85]'
          }`}
        >
          '{String(month.year).slice(2)}
        </span>
      </div>
    </div>
  );
};
