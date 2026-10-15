import React from 'react';
import type { MonthMeta } from './MonthNotesColumn';
import { getSeasonalColor } from '../../utils/seasonalColors';

export interface VerticalMonthGutterProps {
  monthMetas: MonthMeta[];
  totalWeeksHeight: number;
  todayKey: string;
  onJumpToMonth?: (monthKey: string) => void;
}

export const VerticalMonthGutter: React.FC<VerticalMonthGutterProps> = ({
  monthMetas,
  totalWeeksHeight,
  todayKey,
  onJumpToMonth,
}) => {
  return (
    <div
      className="w-10 shrink-0 border-l border-r border-[#E5DFD5] relative bg-[#F7F4EC]/40"
      style={{ height: `${totalWeeksHeight}px` }}
    >
      {monthMetas.map((meta) => {
        const isCurrentMonth = meta.monthKey === todayKey.slice(0, 7);
        const seasonalColor = getSeasonalColor(meta.monthIndex);

        return (
          <div
            key={`vmonth-${meta.monthKey}`}
            onClick={() => onJumpToMonth?.(meta.monthKey)}
            className="absolute left-0 w-full flex items-center justify-center border-b-[2.5px] border-b-[#2B2C30] select-none overflow-hidden py-1 transition-colors hover:brightness-[0.98] cursor-pointer"
            style={{
              top: `${meta.topPx}px`,
              height: `${meta.heightPx}px`,
              backgroundColor: isCurrentMonth ? seasonalColor.accentTag : seasonalColor.gutterBg,
              borderBottom: '2.5px solid #2B2C30',
            }}
            title={`${meta.fullName} ${meta.year} (${seasonalColor.season}) — click to jump`}
          >
            <div
              className={`font-serif text-[11px] font-bold tracking-widest uppercase flex items-center gap-1.5 select-none ${
                isCurrentMonth ? 'text-white' : 'text-[#2B2C30]'
              }`}
              style={{
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
              }}
            >
              <span
                className="font-extrabold tracking-wider"
                style={
                  !isCurrentMonth
                    ? {
                        color: seasonalColor.accentTag,
                      }
                    : undefined
                }
              >
                {meta.name}
              </span>
              <span
                className={`text-[9px] font-mono font-bold ${
                  isCurrentMonth ? 'text-white/85' : 'text-[#7E7F85]'
                }`}
              >
                '{String(meta.year).slice(2)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
