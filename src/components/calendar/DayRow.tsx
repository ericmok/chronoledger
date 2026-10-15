import React from 'react';
import type { DateItem, NoteItem } from '../../types/calendar';
import { analyzeDateSpan } from '../../utils/dateUtils';
import { NoteItemComponent } from '../NoteItemComponent';
import { Plus } from 'lucide-react';

export interface DayRowProps {
  dateItem: DateItem;
  dayIdx: number;
  dayNotes: NoteItem[];
  isMonthFocus: boolean;
  isQuickAdding: boolean;
  quickInputText: string;
  onSetQuickInputText: (text: string) => void;
  onStartQuickAdd: (dateString: string) => void;
  onCancelQuickAdd: () => void;
  onSubmitQuickAdd: (e: React.FormEvent, dateString: string) => void;
  onToggleStrike: (noteId: string) => void;
  onRemoveNote: (noteId: string) => void;
  onUpdateNote?: (noteId: string, newContent: string) => void;
  onJumpToDateRequested?: (dateKey: string) => void;
}

export const DayRow: React.FC<DayRowProps> = ({
  dateItem,
  dayIdx,
  dayNotes,
  isMonthFocus,
  isQuickAdding,
  quickInputText,
  onSetQuickInputText,
  onStartQuickAdd,
  onCancelQuickAdd,
  onSubmitQuickAdd,
  onToggleStrike,
  onRemoveNote,
  onUpdateNote,
  onJumpToDateRequested,
}) => {
  const contiguousSpansStartingHere = dayNotes.filter((n) => {
    const span = analyzeDateSpan(n.parentDates);
    return span.isContiguous && span.startDate === dateItem.dateString && span.count > 1;
  });

  return (
    <div
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, input, form')) return;
        onStartQuickAdd(dateItem.dateString);
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

      {/* Date & Day of Week */}
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

        {/* Small Dot Indicator if day has notes */}
        {dayNotes.length > 0 && !dateItem.isToday && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#E29578] ml-0.5" />
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

        {/* Quick note input form */}
        {isQuickAdding ? (
          <form
            onSubmit={(e) => onSubmitQuickAdd(e, dateItem.dateString)}
            onClick={(e) => e.stopPropagation()}
            className="mt-1.5 flex items-center gap-2 p-1.5 bg-white border border-[#DDD6C8] rounded-xl shadow-xs animate-in fade-in duration-100"
          >
            <input
              autoFocus
              type="text"
              value={quickInputText}
              onChange={(e) => onSetQuickInputText(e.target.value)}
              placeholder="Write a note for this day... (Enter to save, Esc to cancel)"
              onKeyDown={(e) => e.key === 'Escape' && onCancelQuickAdd()}
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
              onClick={onCancelQuickAdd}
              className="px-2.5 py-1.5 text-xs text-[#8E8F95] hover:text-[#2B2C30] hover:bg-[#EAE3D6]/50 rounded-lg transition-colors shrink-0"
              title="Cancel (Esc)"
            >
              Esc
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => onStartQuickAdd(dateItem.dateString)}
            className="opacity-0 group-row:opacity-100 mt-0.5 text-[11px] font-mono text-[#A19D94] hover:text-[#2B2C30] flex items-center gap-1 transition-opacity py-0.5 px-1 rounded cursor-pointer"
            title="Write note (or double-click day)"
          >
            <Plus className="w-3 h-3" />
            <span>write note</span>
          </button>
        )}
      </div>
    </div>
  );
};
