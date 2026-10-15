import React, { useState } from 'react';
import { Plus, Link2 } from 'lucide-react';
import type { WeekNote } from '../../types/calendar';
import type { WeekBlock } from '../../utils/dateUtils';
import { analyzeWeekSpan } from '../../utils/dateUtils';
import { NoteCard } from '../common/NoteCard';
import { WeekNoteInlineForm, type WeekOption } from './WeekNoteInlineForm';

export interface WeekFocusPanelProps {
  weekBlock: WeekBlock;
  currentWeekNotes: WeekNote[];
  isAddingWeekNote: boolean;
  availableWeeks?: WeekOption[];
  onStartAddWeekNote: (weekKey: string) => void;
  onCancelAddWeekNote: () => void;
  onAddWeekNote: (content: string, parentWeeks: string[], colorTag?: string) => void;
  onToggleStrikeWeekNote: (id: string) => void;
  onRemoveWeekNote: (id: string) => void;
  onUpdateWeekNote?: (id: string, newContent: string, parentWeeks?: string[], colorTag?: string) => void;
  onReorderWeekNotes?: (sourceNoteId: string, targetNoteId: string, position: 'before' | 'after', targetWeek?: string) => void;
  onMoveWeekNoteToWeek?: (noteId: string, targetWeek: string, position?: 'start' | 'end') => void;
  onJumpToWeek?: (weekKey: string) => void;
}

export const WeekFocusPanel: React.FC<WeekFocusPanelProps> = ({
  weekBlock,
  currentWeekNotes,
  isAddingWeekNote,
  availableWeeks = [],
  onStartAddWeekNote,
  onCancelAddWeekNote,
  onAddWeekNote,
  onToggleStrikeWeekNote,
  onRemoveWeekNote,
  onUpdateWeekNote,
  onReorderWeekNotes,
  onMoveWeekNoteToWeek,
  onJumpToWeek,
}) => {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPos, setDropPos] = useState<'before' | 'after' | null>(null);
  const [isWeekDragOver, setIsWeekDragOver] = useState(false);

  const handleWeekNoteDrop = (e: React.DragEvent<HTMLElement>, targetNoteId: string, position: 'before' | 'after') => {
    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.type === 'week-note' && data.id) {
        onReorderWeekNotes?.(data.id, targetNoteId, position, weekBlock.weekKey);
      }
    } catch (err) {
      console.error('Failed to parse drag drop data:', err);
    } finally {
      setDropTargetId(null);
      setDropPos(null);
      setActiveDragId(null);
      setIsWeekDragOver(false);
    }
  };

  return (
    <div
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, form, input, textarea, select')) return;
        onStartAddWeekNote(weekBlock.weekKey);
      }}
      title="Weekly notes — double-click to add note"
      className={`w-64 sm:w-72 shrink-0 border-l border-[#E5DFD5] p-3 flex flex-col justify-between group/weekpanel transition-colors cursor-pointer ${
        weekBlock.containsToday
          ? 'bg-[#F2ECE1]/90 ring-1 ring-inset ring-[#D23B38]/20'
          : 'bg-[#F7F4EC]/40 hover:bg-[#F2EDE4]/30'
      }`}
    >
      {/* Week Header & Notes Section (expands to utilize full vertical space of the week) */}
      <div className="flex-1 flex flex-col min-h-0">
        <div
          className={`flex items-center justify-between border-b pb-1.5 mb-2 shrink-0 ${
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

          {weekBlock.containsToday && (
            <span className="text-[9px] font-mono bg-[#D23B38] text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shadow-2xs">
              Active
            </span>
          )}
        </div>

        {/* Week Notes List */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setIsWeekDragOver(true);
          }}
          onDragLeave={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            if (
              e.clientY < rect.top ||
              e.clientY >= rect.bottom ||
              e.clientX < rect.left ||
              e.clientX >= rect.right
            ) {
              setIsWeekDragOver(false);
            }
          }}
          onDrop={(e) => {
            try {
              const raw = e.dataTransfer.getData('text/plain');
              if (!raw) return;
              const data = JSON.parse(raw);
              if (data.type === 'week-note' && data.id) {
                if (!dropTargetId) {
                  onMoveWeekNoteToWeek?.(data.id, weekBlock.weekKey, 'end');
                }
              }
            } catch (err) {
              console.error('Failed to parse drag drop data:', err);
            } finally {
              setIsWeekDragOver(false);
              setDropTargetId(null);
              setDropPos(null);
              setActiveDragId(null);
            }
          }}
          className={`flex-1 space-y-1.5 overflow-y-auto pr-1 rounded-lg transition-colors ${
            isWeekDragOver && !dropTargetId ? 'bg-[#FCE7D2]/40 ring-1 ring-[#D23B38]/30 p-1' : ''
          }`}
        >
          {currentWeekNotes.length === 0 && !isAddingWeekNote && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartAddWeekNote(weekBlock.weekKey);
              }}
              className="w-full h-full min-h-[90px] my-auto py-3 px-2 border border-dashed border-[#DDD6C8] hover:border-[#2B2C30]/50 rounded-lg flex flex-col items-center justify-center text-center bg-white/50 hover:bg-white/90 transition-all cursor-pointer group/placeholder"
              title="Click or double-click to add weekly note"
            >
              <div className="flex items-center gap-1 text-xs font-serif italic text-[#71727A] group-hover/placeholder:text-[#2B2C30]">
                <Plus className="w-3.5 h-3.5 text-[#D23B38]" />
                <span>Add weekly note</span>
              </div>
              <span className="text-[9px] font-mono text-[#A19D94] mt-0.5">
                or double-click panel
              </span>
            </button>
          )}

          {currentWeekNotes.map((wn) => {
            if (editingNoteId === wn.id) {
              return (
                <WeekNoteInlineForm
                  key={wn.id}
                  initialContent={wn.content}
                  initialWeeks={wn.parentWeeks}
                  initialColorTag={wn.colorTag}
                  currentWeekKey={weekBlock.weekKey}
                  availableWeeks={availableWeeks}
                  onSubmit={(content, parentWeeks, colorTag) => {
                    onUpdateWeekNote?.(wn.id, content, parentWeeks, colorTag);
                    setEditingNoteId(null);
                  }}
                  onCancel={() => setEditingNoteId(null)}
                  submitLabel="Save"
                />
              );
            }

            const isMulti = wn.parentWeeks.length > 1;
            const spanInfo = isMulti ? analyzeWeekSpan(wn.parentWeeks, availableWeeks) : null;
            const multiBadge = isMulti && spanInfo ? (
              <div className="flex flex-wrap items-center gap-1 mt-0.5 text-[9px] font-mono text-[#7E7F85]">
                {spanInfo.isContiguous ? (
                  <span className="inline-flex items-center gap-1 bg-[#EBE5DA] px-1.5 py-0.5 rounded text-[9px] text-[#55565B]">
                    <Link2 className="w-2.5 h-2.5 text-[#83C5BE]" />
                    <span>{spanInfo.count}w span</span>
                    <span className="text-[#8E8F95]">
                      ({spanInfo.startWeek.slice(5)} → {spanInfo.endWeek.slice(5)})
                    </span>
                  </span>
                ) : (
                  <div className="inline-flex flex-wrap items-center gap-1 bg-[#EBE5DA] px-1.5 py-0.5 rounded text-[9px] text-[#55565B]">
                    <Link2 className="w-2.5 h-2.5 text-[#D23B38]" />
                    <span>Linked:</span>
                    {wn.parentWeeks.map((wk) => (
                      <button
                        key={wk}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onJumpToWeek?.(wk);
                        }}
                        className={`hover:underline cursor-pointer ${
                          wk === weekBlock.weekKey ? 'font-bold text-[#2B2C30]' : 'text-[#7E7F85]'
                        }`}
                        title={`Jump to ${wk}`}
                      >
                        {wk.slice(5)}
                      </button>
                    ))}
                  </div>
                )}
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
                onStartEdit={() => setEditingNoteId(wn.id)}
                onUpdate={(id, text) => onUpdateWeekNote?.(id, text, wn.parentWeeks, wn.colorTag)}
                onDragStart={(e, id) => {
                  e.dataTransfer.setData(
                    'text/plain',
                    JSON.stringify({ type: 'week-note', id, sourceWeek: weekBlock.weekKey })
                  );
                  setActiveDragId(id);
                }}
                onDragOver={(_e, id, pos) => {
                  setDropTargetId(id);
                  setDropPos(pos);
                }}
                onDragLeave={(_e, id) => {
                  if (dropTargetId === id) {
                    setDropTargetId(null);
                    setDropPos(null);
                  }
                }}
                onDrop={(e, id, pos) => {
                  handleWeekNoteDrop(e, id, pos);
                }}
                onDragEnd={() => {
                  setActiveDragId(null);
                  setDropTargetId(null);
                  setDropPos(null);
                  setIsWeekDragOver(false);
                }}
                isBeingDragged={activeDragId === wn.id}
                dropIndicator={dropTargetId === wn.id ? dropPos : null}
              />
            );
          })}
        </div>
      </div>

      {/* Add Week Note Form / Button */}
      <div className="pt-2 border-t border-[#E5DFD5]/60 mt-2 shrink-0">
        {isAddingWeekNote ? (
          <WeekNoteInlineForm
            currentWeekKey={weekBlock.weekKey}
            availableWeeks={availableWeeks}
            onSubmit={(content, parentWeeks, colorTag) => {
              onAddWeekNote(content, parentWeeks, colorTag);
              onCancelAddWeekNote();
            }}
            onCancel={onCancelAddWeekNote}
            submitLabel="Add"
          />
        ) : currentWeekNotes.length > 0 ? (
          <button
            type="button"
            onClick={() => onStartAddWeekNote(weekBlock.weekKey)}
            className="text-[10px] font-mono text-[#71727A] hover:text-[#2B2C30] flex items-center justify-center gap-1 w-full py-1.5 rounded-md border border-dashed border-[#DDD6C8] hover:border-[#2B2C30]/40 bg-white/50 hover:bg-white transition-all shadow-2xs cursor-pointer"
            title="Add another weekly note"
          >
            <Plus className="w-3 h-3 text-[#D23B38]" />
            <span>Add weekly note</span>
          </button>
        ) : null}
      </div>
    </div>
  );
};
