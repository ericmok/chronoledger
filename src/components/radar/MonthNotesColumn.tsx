import React, { useState } from 'react';
import { Plus, Link2, X } from 'lucide-react';
import type { MonthNote } from '../../types/calendar';
import { NoteCard } from '../common/NoteCard';

export interface MonthMeta {
  monthKey: string;
  monthIndex: number;
  year: number;
  name: string;
  fullName: string;
  startRow: number;
  endRow: number;
  totalRows: number;
  topPx: number;
  heightPx: number;
}

export interface MonthNotesColumnProps {
  monthMetas: MonthMeta[];
  monthNotesByMonth: Map<string, MonthNote[]>;
  totalWeeksHeight: number;
  todayKey: string;
  quickInputMonth: string | null;
  quickInputText: string;
  onSetQuickInputText: (text: string) => void;
  onStartQuickAddMonth: (monthKey: string) => void;
  onCancelQuickAddMonth: () => void;
  onSubmitQuickMonthNote: (e: React.FormEvent, monthKey: string) => void;
  onToggleStrikeMonthNote: (id: string) => void;
  onRemoveMonthNote: (id: string) => void;
  onUpdateMonthNote?: (id: string, newContent: string) => void;
  onReorderMonthNotes?: (sourceNoteId: string, targetNoteId: string, position: 'before' | 'after', targetMonth?: string) => void;
  onMoveMonthNoteToMonth?: (noteId: string, targetMonth: string, position?: 'start' | 'end') => void;
}

export const MonthNotesColumn: React.FC<MonthNotesColumnProps> = ({
  monthMetas,
  monthNotesByMonth,
  totalWeeksHeight,
  todayKey,
  quickInputMonth,
  quickInputText,
  onSetQuickInputText,
  onStartQuickAddMonth,
  onCancelQuickAddMonth,
  onSubmitQuickMonthNote,
  onToggleStrikeMonthNote,
  onRemoveMonthNote,
  onUpdateMonthNote,
  onReorderMonthNotes,
  onMoveMonthNoteToMonth,
}) => {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPos, setDropPos] = useState<'before' | 'after' | null>(null);
  const [dragOverMonthKey, setDragOverMonthKey] = useState<string | null>(null);

  const handleMonthNoteDrop = (
    e: React.DragEvent<HTMLElement>,
    targetNoteId: string,
    position: 'before' | 'after',
    targetMonthKey: string
  ) => {
    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.type === 'month-note' && data.id) {
        onReorderMonthNotes?.(data.id, targetNoteId, position, targetMonthKey);
      }
    } catch (err) {
      console.error('Failed to parse month note drag data:', err);
    } finally {
      setDropTargetId(null);
      setDropPos(null);
      setActiveDragId(null);
      setDragOverMonthKey(null);
    }
  };
  return (
    <div className="flex-1 border-r border-[#E5DFD5] relative min-w-0" style={{ height: `${totalWeeksHeight}px` }}>
      {monthMetas.map((meta) => {
        const currentMonthNotes = monthNotesByMonth.get(meta.monthKey) || [];
        const isAdding = quickInputMonth === meta.monthKey;
        const isCurrentMonth = meta.monthKey === todayKey.slice(0, 7);

        return (
          <div
            key={meta.monthKey}
            onDoubleClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('button, form, input')) return;
              onStartQuickAddMonth(meta.monthKey);
            }}
            title={`${meta.fullName} notes — double-click to add`}
            className={`absolute left-0 w-full border-b border-[#E5DFD5]/80 flex flex-col justify-between p-2 group/month transition-colors cursor-pointer ${
              isCurrentMonth
                ? 'bg-[#FAF5ED]/95 border-l-[3.5px] border-l-[#D23B38] -ml-[3.5px]'
                : 'hover:bg-[#F2EDE4]/30'
            }`}
            style={{
              top: `${meta.topPx}px`,
              height: `${meta.heightPx}px`,
            }}
          >
            {/* Month Notes Header */}
            <div className="flex items-center justify-between pb-1 mb-1 border-b border-[#EAE3D6]/70">
              <span
                className={`text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border flex items-center gap-1.5 ${
                  isCurrentMonth
                    ? 'bg-[#D23B38] text-white border-[#D23B38] shadow-2xs'
                    : 'text-[#2B2C30] bg-[#FAF8F5] border-[#E0D9CC]'
                }`}
              >
                <span>{meta.name} Notes</span>
                {isCurrentMonth && <span className="text-[8px] uppercase bg-white/20 px-1 rounded">Focus</span>}
              </span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartQuickAddMonth(meta.monthKey);
                }}
                className="flex items-center gap-0.5 text-[9px] font-mono font-medium px-1.5 py-0.5 rounded border border-[#DDD6C8] bg-white text-[#2B2C30] hover:bg-[#F2ECE1] hover:border-[#2B2C30] transition-colors shadow-2xs cursor-pointer shrink-0"
                title={`Add ${meta.name} note (or double-click card)`}
              >
                <Plus className="w-2.5 h-2.5 text-[#D23B38]" />
                <span>+ Note</span>
              </button>
            </div>

            {/* Notes List for this month */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverMonthKey(meta.monthKey);
              }}
              onDragLeave={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                if (
                  e.clientY < rect.top ||
                  e.clientY >= rect.bottom ||
                  e.clientX < rect.left ||
                  e.clientX >= rect.right
                ) {
                  if (dragOverMonthKey === meta.monthKey) {
                    setDragOverMonthKey(null);
                  }
                }
              }}
              onDrop={(e) => {
                try {
                  const raw = e.dataTransfer.getData('text/plain');
                  if (!raw) return;
                  const data = JSON.parse(raw);
                  if (data.type === 'month-note' && data.id) {
                    if (!dropTargetId) {
                      onMoveMonthNoteToMonth?.(data.id, meta.monthKey, 'end');
                    }
                  }
                } catch (err) {
                  console.error('Failed to parse month note drag data:', err);
                } finally {
                  setDragOverMonthKey(null);
                  setDropTargetId(null);
                  setDropPos(null);
                  setActiveDragId(null);
                }
              }}
              className={`flex-1 overflow-y-auto space-y-1 py-1 pr-1 flex flex-col justify-start rounded-md transition-colors ${
                dragOverMonthKey === meta.monthKey && !dropTargetId
                  ? 'bg-[#FCE7D2]/40 ring-1 ring-[#D23B38]/30 p-1'
                  : ''
              }`}
            >
              {currentMonthNotes.length === 0 && !isAdding && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartQuickAddMonth(meta.monthKey);
                  }}
                  className="w-full my-auto py-2.5 px-1 border border-dashed border-[#DDD6C8] hover:border-[#2B2C30]/50 rounded flex flex-col items-center justify-center text-center bg-white/40 hover:bg-white/80 transition-all cursor-pointer group/placeholder"
                  title={`Add ${meta.name} note or double-click`}
                >
                  <div className="flex items-center gap-1 text-[11px] font-serif italic text-[#71727A] group-hover/placeholder:text-[#2B2C30]">
                    <Plus className="w-3 h-3 text-[#D23B38]" />
                    <span>Add {meta.name} note</span>
                  </div>
                  <span className="text-[8px] font-mono text-[#A19D94] mt-0.5">
                    or double-click card
                  </span>
                </button>
              )}

              {currentMonthNotes.map((mn) => {
                const isMulti = mn.parentMonths.length > 1;
                const multiBadge = isMulti ? (
                  <div className="flex items-center gap-1 mt-0.5 text-[9px] font-mono text-[#D23B38]">
                    <Link2 className="w-2.5 h-2.5" />
                    <span>
                      Spans {mn.parentMonths.length} mos ({mn.parentMonths[0]} → {mn.parentMonths[mn.parentMonths.length - 1]})
                    </span>
                  </div>
                ) : null;

                return (
                  <NoteCard
                    key={mn.id}
                    id={mn.id}
                    content={mn.content}
                    originalContent={mn.originalContent}
                    isStruck={mn.isStruck}
                    colorTag={mn.colorTag}
                    badge={multiBadge}
                    density="compact"
                    onToggleStrike={onToggleStrikeMonthNote}
                    onRemove={onRemoveMonthNote}
                    onUpdate={onUpdateMonthNote}
                    onDragStart={(e, id) => {
                      e.dataTransfer.setData(
                        'text/plain',
                        JSON.stringify({ type: 'month-note', id, sourceMonth: meta.monthKey })
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
                      handleMonthNoteDrop(e, id, pos, meta.monthKey);
                    }}
                    onDragEnd={() => {
                      setActiveDragId(null);
                      setDropTargetId(null);
                      setDropPos(null);
                      setDragOverMonthKey(null);
                    }}
                    isBeingDragged={activeDragId === mn.id}
                    dropIndicator={dropTargetId === mn.id ? dropPos : null}
                  />
                );
              })}
            </div>

            {/* Quick Add Note on Month */}
            {isAdding ? (
              <form
                onSubmit={(e) => onSubmitQuickMonthNote(e, meta.monthKey)}
                className="flex items-center gap-1 mt-1 p-0.5 bg-white border border-[#DDD6C8] rounded-md shadow-2xs"
              >
                <input
                  autoFocus
                  type="text"
                  value={quickInputText}
                  onChange={(e) => onSetQuickInputText(e.target.value)}
                  placeholder={`${meta.name} note... (Enter)`}
                  onKeyDown={(e) => e.key === 'Escape' && onCancelQuickAddMonth()}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-transparent border-0 text-[#2B2C30] placeholder:text-[#A19D94] focus:outline-hidden"
                />
                <button type="submit" className="px-2 py-1 text-xs bg-[#2B2C30] text-[#FAF8F5] rounded shrink-0 cursor-pointer">
                  Add
                </button>
                <button
                  type="button"
                  onClick={onCancelQuickAddMonth}
                  className="p-1 text-xs text-[#8E8F95] hover:text-[#2B2C30] shrink-0 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </form>
            ) : currentMonthNotes.length > 0 ? (
              <button
                type="button"
                onClick={() => onStartQuickAddMonth(meta.monthKey)}
                className="text-[10px] font-mono text-[#71727A] hover:text-[#2B2C30] flex items-center justify-center gap-1 w-full py-1 rounded border border-dashed border-[#DDD6C8] hover:border-[#2B2C30]/40 bg-white/50 hover:bg-white transition-all shadow-2xs mt-1 cursor-pointer"
                title={`Add another ${meta.name} note`}
              >
                <Plus className="w-2.5 h-2.5 text-[#D23B38]" />
                <span>Add note</span>
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
