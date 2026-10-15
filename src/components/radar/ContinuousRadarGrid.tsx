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
  circleColor?: string;
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
  cellWidth: number;
  cellHeight: number;
  onSelectDate: (dateKey: string) => void;
  onToggleCircleDate?: (dateKey: string) => void;
  onCycleCircleColor?: (dateKey: string) => void;
  selectedDateKey?: string | null;
}

export const ContinuousRadarGrid: React.FC<ContinuousRadarGridProps> = ({
  weeks,
  svgBoundaries,
  totalWeeksHeight,
  cellWidth,
  cellHeight,
  onSelectDate,
  onToggleCircleDate,
  onCycleCircleColor,
  selectedDateKey,
}) => {
  const gridWidth = 7 * cellWidth;

  return (
    <div
      className="shrink-0 relative pr-2"
      style={{ width: `${gridWidth + 8}px`, height: `${totalWeeksHeight}px` }}
    >
      {/* Continuous Grid Weeks */}
      {weeks.map((week, rIdx) => {
        const isCurrentWeekRow = week.some((c) => c.isToday);

        return (
          <div
            key={rIdx}
            className="grid grid-cols-7 relative transition-colors"
            style={{ height: `${cellHeight}px`, width: `${gridWidth}px` }}
          >
            {/* Solid color rectangle highlighting the current week */}
            {isCurrentWeekRow && (
              <div
                className="absolute inset-0 bg-[#FCE7D2] pointer-events-none"
                style={{
                  width: `${gridWidth}px`,
                  height: `${cellHeight}px`,
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
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onToggleCircleDate?.(cell.dateKey);
                  }}
                  className={`relative flex flex-col items-center justify-center text-[11px] font-mono transition-transform hover:z-10 group cursor-pointer ${
                    isCurrentWeekRow
                      ? 'bg-transparent'
                      : cell.isToday
                      ? 'bg-[#FAF3EA]'
                      : isEvenMonth
                      ? 'bg-[#FAF8F5]'
                      : 'bg-[#F2ECE1]/65'
                  }`}
                  style={{
                    width: `${cellWidth}px`,
                    height: `${cellHeight}px`,
                    boxShadow: 'inset 0 0 0 0.5px rgba(229, 223, 213, 0.45)',
                  }}
                  title={`${cell.monthKey} - ${cell.dayNumber}${
                    cell.isCircled
                      ? ' (Circled - click circle to cycle color, double-click to remove)'
                      : ' (Double-click to circle)'
                  }`}
                >
                  {/* Day Number */}
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-all group-hover:scale-110 ${
                      cell.isToday
                        ? 'bg-[#D23B38] text-white font-black shadow-md ring-3 ring-[#D23B38]/35 scale-105'
                        : selectedDateKey === cell.dateKey
                        ? 'bg-[#2B2C30] text-white font-bold ring-2 ring-[#2B2C30]/40'
                        : isCurrentWeekRow
                        ? 'text-[#2B2C30] font-bold'
                        : cell.isOutsideTargetRange
                        ? 'text-[#B8B4AA] opacity-40'
                        : 'text-[#2B2C30]'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>

                  {/* Tactile Circled mark indicator - organic hand-drawn pen ring */}
                  {cell.isCircled && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCycleCircleColor?.(cell.dateKey);
                        onSelectDate(cell.dateKey);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onToggleCircleDate?.(cell.dateKey);
                      }}
                      className="absolute inset-[4px] rounded-full pointer-events-auto cursor-pointer hover:scale-110 transition-transform flex items-center justify-center z-10"
                      title="Click circle to cycle color (Red → Sage → Ochre) • Double-click to remove"
                    >
                      <svg className="w-full h-full overflow-visible" viewBox="0 0 32 38">
                        <ellipse
                          cx="16"
                          cy="19"
                          rx="13.5"
                          ry="15.5"
                          fill="none"
                          stroke={cell.circleColor || '#D23B38'}
                          strokeWidth="2.2"
                          strokeDasharray="90"
                          strokeDashoffset="2"
                          strokeLinecap="round"
                          className="transition-colors duration-150"
                          style={{
                            filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.12))',
                            transform: 'rotate(-10deg)',
                            transformOrigin: 'center',
                          }}
                        />
                      </svg>
                    </span>
                  )}

                  {/* Has Notes Pip */}
                  {cell.hasNotes && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E29578] mt-0.5" />
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
        style={{ width: `${gridWidth}px`, height: `${totalWeeksHeight}px` }}
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
