import React from 'react';
import type { MonthMeta } from './MonthNotesColumn';
import { getSeasonalColor } from '../../utils/seasonalColors';

export interface VerticalMonthGutterProps {
  monthMetas: MonthMeta[];
  totalWeeksHeight: number;
  todayKey: string;
}

export const VerticalMonthGutter: React.FC<VerticalMonthGutterProps> = ({
  monthMetas,
  totalWeeksHeight,
  todayKey,
}) => {
  return (
    <div
      className="w-10 shrink-0 border-l border-[#E5DFD5] relative bg-[#F7F4EC]/40"
      style={{ height: `${totalWeeksHeight}px` }}
    >
      {monthMetas.map((meta) => {
        const isCurrentMonth = meta.monthKey === todayKey.slice(0, 7);
        const seasonalColor = getSeasonalColor(meta.monthIndex);

        return (
          <div
            key={`vmonth-${meta.monthKey}`}
            className={`absolute left-0 w-full flex items-center justify-center border-b select-none overflow-hidden py-1 transition-colors hover:brightness-[0.98] ${
              isCurrentMonth ? 'border-l-2 border-l-[#D23B38]' : ''
            }`}
            style={{
              top: `${meta.topPx}px`,
              height: `${meta.heightPx}px`,
              backgroundColor: seasonalColor.gutterBg,
              borderBottomColor: seasonalColor.notesBorder,
            }}
            title={`${meta.fullName} ${meta.year} (${seasonalColor.season})`}
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
                    : 'font-extrabold tracking-wider'
                }
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
  );
};
