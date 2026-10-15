import React from 'react';

export interface JigsawCell {
  date: Date;
  dateKey: string;
  dayNumber: number;
  monthIndex: number;
  year: number;
  monthKey: string;
  isToday: boolean;
  hasNotes: boolean;
  isCircled: boolean;
  isOutsideTargetRange?: boolean;
}

export interface SvgBoundary {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ContinuousRadarGridProps {
  weeks: JigsawCell[][];
  svgBoundaries: SvgBoundary[];
  totalWeeksHeight: number;
  cellSize: number;
  onSelectDate: (dateKey: string) => void;
}

export const ContinuousRadarGrid: React.FC<ContinuousRadarGridProps> = ({
  weeks,
  svgBoundaries,
  totalWeeksHeight,
  cellSize,
  onSelectDate,
}) => {
  return (
    <div className="w-[238px] shrink-0 relative pr-2" style={{ height: `${totalWeeksHeight}px` }}>
      {/* Continuous Grid Weeks */}
      {weeks.map((week, rIdx) => {
        const isCurrentWeekRow = week.some((c) => c.isToday);

        return (
          <div
            key={rIdx}
            className="grid grid-cols-7 relative transition-colors"
            style={{ height: `${cellSize}px` }}
          >
            {/* Solid color rectangle highlighting the current week */}
            {isCurrentWeekRow && (
              <div
                className="absolute inset-0 bg-[#FCE7D2] pointer-events-none"
                style={{
                  width: `${7 * cellSize}px`,
                  height: `${cellSize}px`,
                }}
                title="Current Week"
              />
            )}

            {week.map((cell) => {
              const isEvenMonth = cell.monthIndex % 2 === 0;

              return (
                <button
                  key={cell.dateKey}
                  type="button"
                  onClick={() => onSelectDate(cell.dateKey)}
                  className={`relative w-[34px] h-[34px] flex flex-col items-center justify-center text-[11px] font-mono transition-transform hover:z-10 group cursor-pointer ${
                    isCurrentWeekRow
                      ? 'bg-transparent'
                      : cell.isToday
                      ? 'bg-[#FAF3EA]'
                      : isEvenMonth
                      ? 'bg-[#FAF8F5]'
                      : 'bg-[#F2ECE1]/65'
                  }`}
                  style={{
                    boxShadow: 'inset 0 0 0 0.5px rgba(229, 223, 213, 0.45)',
                  }}
                  title={`${cell.monthKey} - ${cell.dayNumber}${cell.isToday ? ' (Today)' : isCurrentWeekRow ? ' (Current Week)' : ''}`}
                >
                  {/* Day Number */}
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full transition-transform group-hover:scale-110 ${
                      cell.isToday
                        ? 'bg-[#D23B38] text-white font-black shadow-xs ring-2 ring-[#D23B38]/30'
                        : isCurrentWeekRow
                        ? 'text-[#2B2C30] font-bold'
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
        style={{ width: `${7 * cellSize}px`, height: `${totalWeeksHeight}px` }}
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
  );
};
