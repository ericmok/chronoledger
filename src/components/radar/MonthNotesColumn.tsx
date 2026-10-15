import React, { useState, useMemo } from 'react';
import { Plus, Link2 } from 'lucide-react';
import type { MonthNote } from '../../types/calendar';
import { analyzeMonthSpan } from '../../utils/dateUtils';
import { NoteCard } from '../common/NoteCard';
import { getSeasonalColor } from '../../utils/seasonalColors';
import { MonthNoteInlineForm } from './MonthNoteInlineForm';

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
  todayKey?: string;
  quickInputMonth: string | null;
  onStartQuickAddMonth: (monthKey: string) => void;
  onCancelQuickAddMonth: () => void;
  onAddMonthNote: (content: string, parentMonths: string[], colorTag?: string) => void;
  onToggleStrikeMonthNote: (id: string) => void;
  onRemoveMonthNote: (id: string) => void;
  onUpdateMonthNote?: (id: string, newContent: string, parentMonths?: string[], colorTag?: string) => void;
  onReorderMonthNotes?: (sourceNoteId: string, targetNoteId: string, position: 'before' | 'after', targetMonth?: string) => void;
  onMoveMonthNoteToMonth?: (noteId: string, targetMonth: string, position?: 'start' | 'end') => void;
  onJumpToMonth?: (monthKey: string) => void;
}

export const MonthNotesColumn: React.FC<MonthNotesColumnProps> = ({
  monthMetas,
  monthNotesByMonth,
  totalWeeksHeight,
  todayKey: _todayKey,
  quickInputMonth,
  onStartQuickAddMonth,
  onCancelQuickAddMonth,
  onAddMonthNote,
  onToggleStrikeMonthNote,
  onRemoveMonthNote,
  onUpdateMonthNote,
  onReorderMonthNotes,
  onMoveMonthNoteToMonth,
  onJumpToMonth,
}) => {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPos, setDropPos] = useState<'before' | 'after' | null>(null);
  const [dragOverMonthKey, setDragOverMonthKey] = useState<string | null>(null);

  const availableMonths = useMemo(() => {
    return monthMetas.map((m) => ({
      monthKey: m.monthKey,
      label: `${m.fullName} ${m.year}`,
    }));
  }, [monthMetas]);

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
        const seasonalColor = getSeasonalColor(meta.monthIndex);

        return (
          <div
            key={meta.monthKey}
            onDoubleClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('button, form, input, textarea, select')) return;
              onStartQuickAddMonth(meta.monthKey);
            }}
            title={`${meta.fullName} notes — double-click to add`}
            className="absolute left-0 w-full border-b flex flex-col justify-between p-2 group/month transition-colors cursor-pointer hover:brightness-[0.98]"
            style={{
              top: `${meta.topPx}px`,
              height: `${meta.heightPx}px`,
              backgroundColor: seasonalColor.notesBg,
              borderBottomColor: seasonalColor.notesBorder,
            }}
          >
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
                if (editingNoteId === mn.id) {
                  return (
                    <MonthNoteInlineForm
                      key={mn.id}
                      initialContent={mn.content}
                      initialMonths={mn.parentMonths}
                      initialColorTag={mn.colorTag}
                      currentMonthKey={meta.monthKey}
                      availableMonths={availableMonths}
                      onSubmit={(content, parentMonths, colorTag) => {
                        onUpdateMonthNote?.(mn.id, content, parentMonths, colorTag);
                        setEditingNoteId(null);
                      }}
                      onCancel={() => setEditingNoteId(null)}
                      submitLabel="Save"
                    />
                  );
                }

                const isMulti = mn.parentMonths.length > 1;
                const spanInfo = isMulti ? analyzeMonthSpan(mn.parentMonths) : null;
                const multiBadge = isMulti && spanInfo ? (
                  <div className="flex flex-wrap items-center gap-1 mt-0.5 text-[9px] font-mono text-[#7E7F85]">
                    {spanInfo.isContiguous ? (
                      <span className="inline-flex items-center gap-1 bg-[#EBE5DA] px-1.5 py-0.5 rounded text-[9px] text-[#55565B]">
                        <Link2 className="w-2.5 h-2.5 text-[#D23B38]" />
                        <span>{spanInfo.count}m span</span>
                        <span className="text-[#8E8F95]">
                          ({spanInfo.startMonth} → {spanInfo.endMonth})
                        </span>
                      </span>
                    ) : (
                      <div className="inline-flex flex-wrap items-center gap-1 bg-[#EBE5DA] px-1.5 py-0.5 rounded text-[9px] text-[#55565B]">
                        <Link2 className="w-2.5 h-2.5 text-[#D23B38]" />
                        <span>Linked:</span>
                        {mn.parentMonths.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onJumpToMonth?.(m);
                            }}
                            className={`hover:underline cursor-pointer ${
                              m === meta.monthKey ? 'font-bold text-[#2B2C30]' : 'text-[#7E7F85]'
                            }`}
                            title={`Jump to ${m}`}
                          >
                            {m.slice(5)}
                          </button>
                        ))}
                      </div>
                    )}
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
                    onStartEdit={() => setEditingNoteId(mn.id)}
                    onUpdate={(id, text) => onUpdateMonthNote?.(id, text, mn.parentMonths, mn.colorTag)}
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
              <div className="mt-1">
                <MonthNoteInlineForm
                  currentMonthKey={meta.monthKey}
                  availableMonths={availableMonths}
                  onSubmit={(content, parentMonths, colorTag) => {
                    onAddMonthNote(content, parentMonths, colorTag);
                    onCancelQuickAddMonth();
                  }}
                  onCancel={onCancelQuickAddMonth}
                  submitLabel="Add"
                />
              </div>
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
