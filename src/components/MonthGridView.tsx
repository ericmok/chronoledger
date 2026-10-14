import { useState } from 'react';
import type React from 'react';
import { X, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import type { NoteItem, DrawingElement, WeekStartDay } from '../types/calendar';
import { FULL_MONTH_NAMES, formatDateKey } from '../utils/dateUtils';


interface MonthGridViewProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDate: (dateKey: string) => void;
  notes: NoteItem[];
  drawings: DrawingElement[];
  weekStartsOn: WeekStartDay;
}

export const MonthGridView: React.FC<MonthGridViewProps> = ({
  isOpen,
  onClose,
  onSelectDate,
  notes,
  drawings,
  weekStartsOn,
}) => {
  const [currentMonthDate, setCurrentMonthDate] = useState(() => new Date());

  if (!isOpen) return null;

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();

  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
  };

  // Day headers
  const dayHeaders = weekStartsOn === 0 
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Calculate calendar days for grid
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  // Offset based on weekStartsOn
  let startingDayOfWeek = firstDayOfMonth.getDay();
  if (weekStartsOn === 1) {
    startingDayOfWeek = (startingDayOfWeek + 6) % 7;
  }

  const daysInMonth = lastDayOfMonth.getDate();
  const totalSlots = Math.ceil((startingDayOfWeek + daysInMonth) / 7) * 7;

  // Map notes by date
  const notesCountMap = new Map<string, number>();
  for (const n of notes) {
    for (const d of n.parentDates) {
      notesCountMap.set(d, (notesCountMap.get(d) || 0) + 1);
    }
  }

  // Circled dates set
  const circledDates = new Set(
    drawings.filter((d) => d.type === 'circle').map((d) => d.anchorStartDate)
  );

  const todayKey = formatDateKey(new Date());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg bg-[#FAF8F5] border border-[#DDD6C8] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5DFD5]">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-[#2B2C30]" />
            <h2 className="font-serif text-xl font-bold text-[#2B2C30]">
              {FULL_MONTH_NAMES[month]} {year}
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-md hover:bg-[#F2EDE4] text-[#6B6C72] hover:text-[#2B2C30] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-md hover:bg-[#F2EDE4] text-[#6B6C72] hover:text-[#2B2C30] transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-[#F2EDE4] text-[#6B6C72] hover:text-[#2B2C30] transition-colors ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="p-6">
          {/* Day Headers */}
          <div className="grid grid-cols-7 mb-2 text-center text-xs font-mono font-semibold text-[#8E8F95]">
            {dayHeaders.map((dh, i) => (
              <div
                key={dh}
                className={
                  (weekStartsOn === 0 && (i === 0 || i === 6)) ||
                  (weekStartsOn === 1 && (i === 5 || i === 6))
                    ? 'text-[#D23B38]'
                    : ''
                }
              >
                {dh}
              </div>
            ))}
          </div>

          {/* Grid Cells */}
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: totalSlots }).map((_, slotIdx) => {
              const dayNumber = slotIdx - startingDayOfWeek + 1;
              const isCurrentMonth = dayNumber > 0 && dayNumber <= daysInMonth;

              if (!isCurrentMonth) {
                return <div key={slotIdx} className="h-14 rounded-lg bg-[#F5F2EA]/40" />;
              }

              const cellDate = new Date(year, month, dayNumber);
              const cellDateKey = formatDateKey(cellDate);
              const isToday = cellDateKey === todayKey;
              const noteCount = notesCountMap.get(cellDateKey) || 0;
              const isCircled = circledDates.has(cellDateKey);

              return (
                <button
                  key={cellDateKey}
                  onClick={() => {
                    onSelectDate(cellDateKey);
                    onClose();
                  }}
                  className={`h-14 p-1.5 flex flex-col justify-between items-start rounded-lg border transition-all text-left relative group ${
                    isToday
                      ? 'border-[#2B2C30] bg-[#F2EDE4] shadow-xs'
                      : 'border-[#EAE3D6] hover:border-[#BBB6AC] hover:bg-white bg-[#FAF8F5]'
                  }`}
                >
                  {/* Date Number with optional circle */}
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`text-xs font-mono font-medium ${
                        isToday
                          ? 'bg-[#2B2C30] text-[#FAF8F5] px-1 rounded-sm font-bold'
                          : 'text-[#2B2C30]'
                      }`}
                    >
                      {dayNumber}
                    </span>

                    {/* Hand-drawn circle badge indicator */}
                    {isCircled && (
                      <span className="w-2 h-2 rounded-full border-2 border-[#D23B38]" title="Circled date" />
                    )}
                  </div>

                  {/* Notes badge */}
                  {noteCount > 0 && (
                    <div className="w-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#E29578]" />
                      <span className="text-[10px] font-mono text-[#7E7F85]">
                        {noteCount} {noteCount === 1 ? 'note' : 'notes'}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-[#F2EDE4]/60 border-t border-[#E5DFD5] text-xs font-mono text-[#7E7F85] flex items-center justify-between">
          <span>Click any date to scroll vertical calendar</span>
          <span>{notes.length} total entries</span>
        </div>
      </div>
    </div>
  );
};
