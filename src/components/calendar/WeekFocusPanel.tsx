import React from 'react';
import { Plus, Link2 } from 'lucide-react';
import type { WeekNote } from '../../types/calendar';
import type { WeekBlock } from '../../utils/dateUtils';
import { NoteCard } from '../common/NoteCard';

export interface WeekFocusPanelProps {
  weekBlock: WeekBlock;
  currentWeekNotes: WeekNote[];
  isAddingWeekNote: boolean;
  quickWeekText: string;
  onSetQuickWeekText: (text: string) => void;
  onStartAddWeekNote: (weekKey: string) => void;
  onCancelAddWeekNote: () => void;
  onSubmitQuickWeekNote: (e: React.FormEvent, weekKey: string) => void;
  onToggleStrikeWeekNote: (id: string) => void;
  onRemoveWeekNote: (id: string) => void;
  onUpdateWeekNote?: (id: string, newContent: string) => void;
}

export const WeekFocusPanel: React.FC<WeekFocusPanelProps> = ({
  weekBlock,
  currentWeekNotes,
  isAddingWeekNote,
  quickWeekText,
  onSetQuickWeekText,
  onStartAddWeekNote,
  onCancelAddWeekNote,
  onSubmitQuickWeekNote,
  onToggleStrikeWeekNote,
  onRemoveWeekNote,
  onUpdateWeekNote,
}) => {
  return (
    <div
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, form, input')) return;
        onStartAddWeekNote(weekBlock.weekKey);
      }}
      title="Week focus panel — double-click to add note"
      className={`w-64 sm:w-72 shrink-0 border-l border-[#E5DFD5] p-3 flex flex-col justify-between group/weekpanel transition-colors cursor-pointer ${
        weekBlock.containsToday
          ? 'bg-[#F2ECE1]/90 ring-1 ring-inset ring-[#D23B38]/20'
          : 'bg-[#F7F4EC]/40 hover:bg-[#F2EDE4]/30'
      }`}
    >
      {/* Week Header */}
      <div>
        <div
          className={`flex items-center justify-between border-b pb-1.5 mb-2 ${
            weekBlock.containsToday ? 'border-[#D9CDBC]' : 'border-[#E5DFD5]/70'
          }`}
        >
          <div>
            <span className="font-serif text-xs font-bold text-[#2B2C30] flex items-center gap-1.5">
              Week {weekBlock.weekNumber}
              {weekBlock.containsToday && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#D23B38] animate-pulse" />
              )}
            </span>
            <span className="text-[10px] font-mono text-[#8E8F95]">
              {weekBlock.startDate.monthName} {weekBlock.startDate.dayOfMonth} – {weekBlock.endDate.monthName} {weekBlock.endDate.dayOfMonth}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {weekBlock.containsToday && (
              <span className="text-[9px] font-mono bg-[#D23B38] text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shadow-2xs">
                Active
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartAddWeekNote(weekBlock.weekKey);
              }}
              className="flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded border border-[#DDD6C8] bg-white text-[#2B2C30] hover:bg-[#F2ECE1] hover:border-[#2B2C30] transition-colors shadow-2xs cursor-pointer"
              title="Add weekly note / objective (or double-click panel)"
            >
              <Plus className="w-3 h-3 text-[#D23B38]" />
              <span>+ Note</span>
            </button>
          </div>
        </div>

        {/* Week Notes List */}
        <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
          {currentWeekNotes.length === 0 && !isAddingWeekNote && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartAddWeekNote(weekBlock.weekKey);
              }}
              className="w-full my-1 py-3 px-2 border border-dashed border-[#DDD6C8] hover:border-[#2B2C30]/50 rounded-lg flex flex-col items-center justify-center text-center bg-white/50 hover:bg-white/90 transition-all cursor-pointer group/placeholder"
              title="Click or double-click to add weekly note"
            >
              <div className="flex items-center gap-1 text-xs font-serif italic text-[#71727A] group-hover/placeholder:text-[#2B2C30]">
                <Plus className="w-3.5 h-3.5 text-[#D23B38]" />
                <span>Add week focus / objective</span>
              </div>
              <span className="text-[9px] font-mono text-[#A19D94] mt-0.5">
                or double-click panel
              </span>
            </button>
          )}

          {currentWeekNotes.map((wn) => {
            const isMulti = wn.parentWeeks.length > 1;
            const multiBadge = isMulti ? (
              <div className="flex items-center gap-1 mt-0.5 text-[9px] font-mono text-[#83C5BE]">
                <Link2 className="w-2.5 h-2.5" />
                <span>Multi-week ({wn.parentWeeks.join(', ')})</span>
              </div>
            ) : null;

            return (
              <NoteCard
                key={wn.id}
                id={wn.id}
                content={wn.content}
                originalContent={wn.originalContent}
                isStruck={wn.isStruck}
                colorTag={wn.colorTag}
                badge={multiBadge}
                density="compact"
                onToggleStrike={onToggleStrikeWeekNote}
                onRemove={onRemoveWeekNote}
                onUpdate={onUpdateWeekNote}
              />
            );
          })}
        </div>
      </div>

      {/* Add Week Note Input with comfortable padding */}
      <div className="pt-2 border-t border-[#E5DFD5]/60 mt-2">
        {isAddingWeekNote ? (
          <form
            onSubmit={(e) => onSubmitQuickWeekNote(e, weekBlock.weekKey)}
            className="flex items-center gap-1.5 p-1 bg-white border border-[#DDD6C8] rounded-lg shadow-xs"
          >
            <input
              autoFocus
              type="text"
              value={quickWeekText}
              onChange={(e) => onSetQuickWeekText(e.target.value)}
              placeholder="Week goal/focus... (Enter to save)"
              onKeyDown={(e) => e.key === 'Escape' && onCancelAddWeekNote()}
              className="flex-1 px-3 py-1.5 text-xs bg-transparent border-0 text-[#2B2C30] placeholder:text-[#A19D94] focus:outline-hidden"
            />
            <button type="submit" className="px-2.5 py-1.5 text-xs bg-[#2B2C30] text-[#FAF8F5] rounded-md font-medium shrink-0 cursor-pointer">
              Add
            </button>
            <button
              type="button"
              onClick={onCancelAddWeekNote}
              className="px-1.5 py-1.5 text-xs text-[#8E8F95] hover:text-[#2B2C30] shrink-0 cursor-pointer"
            >
              Esc
            </button>
          </form>
        ) : currentWeekNotes.length > 0 ? (
          <button
            type="button"
            onClick={() => onStartAddWeekNote(weekBlock.weekKey)}
            className="text-[10px] font-mono text-[#71727A] hover:text-[#2B2C30] flex items-center justify-center gap-1 w-full py-1.5 rounded-md border border-dashed border-[#DDD6C8] hover:border-[#2B2C30]/40 bg-white/50 hover:bg-white transition-all shadow-2xs cursor-pointer"
            title="Add another weekly goal"
          >
            <Plus className="w-3 h-3 text-[#D23B38]" />
            <span>Add weekly goal</span>
          </button>
        ) : null}
      </div>
    </div>
  );
};
