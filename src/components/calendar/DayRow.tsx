import React, { useState, useMemo } from 'react';
import type { DateItem, NoteItem, DrawingTool } from '../../types/calendar';
import { analyzeDateSpan } from '../../utils/dateUtils';
import { getGutterDotsForNotes } from '../../utils/annotationUtils';
import { NoteItemComponent } from '../NoteItemComponent';
import { DayNoteInlineForm } from './DayNoteInlineForm';
import { Plus } from 'lucide-react';

export interface DayRowProps {
  dateItem: DateItem;
  dayIdx?: number;
  dayNotes: NoteItem[];
  isMonthFocus?: boolean;
  isQuickAdding: boolean;
  isCircled?: boolean;
  circleColor?: string;
  onToggleCircleDate?: (dateKey: string) => void;
  onCycleCircleColor?: (dateKey: string) => void;
  activeTool?: DrawingTool;
  onStartQuickAdd: (dateString: string) => void;
  onCancelQuickAdd: () => void;
  onAddNote: (content: string, parentDates: string[], colorTag?: string) => void;
  onToggleStrike: (noteId: string) => void;
  onRemoveNote: (noteId: string) => void;
  onUpdateNote?: (noteId: string, newContent: string, parentDates?: string[], colorTag?: string) => void;
  onJumpToDateRequested?: (dateKey: string) => void;
  onReorderNotes?: (sourceNoteId: string, targetNoteId: string, position: 'before' | 'after', targetDate?: string) => void;
  onMoveNoteToDate?: (noteId: string, targetDate: string, position?: 'start' | 'end') => void;
}

export const DayRow: React.FC<DayRowProps> = ({
  dateItem,
  dayIdx,
  dayNotes,
  isMonthFocus,
  isQuickAdding,
  isCircled = false,
  circleColor,
  onToggleCircleDate,
  onCycleCircleColor,
  activeTool,
  onStartQuickAdd,
  onCancelQuickAdd,
  onAddNote,
  onToggleStrike,
  onRemoveNote,
  onUpdateNote,
  onJumpToDateRequested,
  onReorderNotes,
  onMoveNoteToDate,
}) => {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPos, setDropPos] = useState<'before' | 'after' | null>(null);
  const [isDayDragOver, setIsDayDragOver] = useState(false);

  const handleNoteDrop = (e: React.DragEvent<HTMLElement>, targetNoteId: string, position: 'before' | 'after') => {
    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.type === 'daily-note' && data.id) {
        onReorderNotes?.(data.id, targetNoteId, position, dateItem.dateString);
      }
    } catch (err) {
      console.error('Failed to parse drag drop data:', err);
    } finally {
      setDropTargetId(null);
      setDropPos(null);
      setActiveDragId(null);
      setIsDayDragOver(false);
    }
  };

  const contiguousSpansStartingHere = dayNotes.filter((n) => {
    const span = analyzeDateSpan(n.parentDates);
    return span.isContiguous && span.startDate === dateItem.dateString && span.count > 1;
  });

  const { dots: gutterDots, title: gutterDotsTitle } = useMemo(
    () => getGutterDotsForNotes(dayNotes),
    [dayNotes]
  );

  return (
    <div
      data-day-row="true"
      data-date-string={dateItem.dateString}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, input, form, textarea, select')) return;
        onStartQuickAdd(dateItem.dateString);
      }}
      title={`${dateItem.monthName} ${dateItem.dayOfMonth}, ${dateItem.year} — double-click to write note`}
      className={`flex items-start min-h-[48px] group/row py-1 transition-colors ${
        dateItem.isToday
          ? 'bg-[#FAF0E4]/90 hover:bg-[#F5E8D6] relative z-10'
          : 'hover:bg-[#F2EDE4]/30'
      }`}
    >
      {/* Month Indicator (Compact) */}
      <div className="w-9 sm:w-10 shrink-0 text-right pr-1.5 pt-1 select-none">
        {dateItem.isFirstDayOfMonth ? (
          <span
            className={`font-serif text-xs font-bold tracking-tight ${
              isMonthFocus ? 'text-[#D23B38]' : 'text-[#2B2C30]'
            }`}
          >
            {dateItem.monthName}
          </span>
        ) : dayIdx === 0 ? (
          <span
            className={`font-serif text-[10px] uppercase tracking-wider ${
              isMonthFocus ? 'text-[#D23B38]/80 font-semibold' : 'text-[#A19D94]/50'
            }`}
          >
            {dateItem.monthName}
          </span>
        ) : null}
      </div>

      {/* Date & Day of Week */}
      <div
        data-date-gutter="true"
        className="w-12 shrink-0 flex flex-col items-center justify-start pt-1 font-mono select-none"
      >
        {dateItem.isToday ? (
          /* Fused Today Unit: Date Number + Day of Week + TODAY badge */
          <div
            className="relative flex flex-col items-center justify-center bg-[#2B2C30] text-[#FAF8F5] rounded-md px-1.5 py-1 shadow-xs min-w-[36px] cursor-pointer hover:brightness-110 transition-all"
            title={
              isCircled
                ? 'Today (Circled - click to cycle color, double-click to remove)'
                : 'Today (Double-click to circle)'
            }
            onDoubleClick={(e) => {
              e.stopPropagation();
              onToggleCircleDate?.(dateItem.dateString);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (activeTool === 'eraser' && isCircled) {
                onToggleCircleDate?.(dateItem.dateString);
                return;
              }
              if (isCircled) {
                onCycleCircleColor?.(dateItem.dateString);
              }
            }}
          >
            <div className="flex items-center justify-center gap-1 leading-none">
              <span className="text-xs sm:text-sm font-bold text-[#FAF8F5]">
                {dateItem.dayOfMonth}
              </span>
              <span className="text-xs sm:text-sm font-bold text-[#FAF8F5]">
                {dateItem.dayOfWeekLetter}
              </span>
            </div>
            <span className="text-[7px] font-mono font-black uppercase tracking-wider text-[#FAF8F5]/80 leading-none mt-1">
              TODAY
            </span>

            {/* Tactile Hand-Drawn Ring around Today badge */}
            {isCircled && (
              <span
                className="absolute -inset-[3.5px] pointer-events-none flex items-center justify-center z-10"
                aria-hidden="true"
              >
                <svg className="w-full h-full overflow-visible" viewBox="0 0 44 38">
                  <rect
                    x="1.5"
                    y="1.5"
                    width="41"
                    height="35"
                    rx="8"
                    fill="none"
                    stroke={circleColor || '#E29578'}
                    strokeWidth="2.2"
                    strokeDasharray="145"
                    strokeDashoffset="2"
                    strokeLinecap="round"
                    className="transition-colors duration-150"
                    style={{
                      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
                    }}
                  />
                </svg>
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1 leading-none">
            <span
              className="relative inline-flex items-center justify-center min-w-[20px] h-5 px-0.5 rounded text-xs sm:text-sm font-medium text-[#2B2C30] cursor-pointer hover:bg-black/5 transition-colors"
              title={
                isCircled
                  ? `${dateItem.monthName} ${dateItem.dayOfMonth} (Circled - click to cycle color, double-click to remove)`
                  : `${dateItem.monthName} ${dateItem.dayOfMonth} (Double-click to circle)`
              }
              onDoubleClick={(e) => {
                e.stopPropagation();
                onToggleCircleDate?.(dateItem.dateString);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (activeTool === 'eraser' && isCircled) {
                  onToggleCircleDate?.(dateItem.dateString);
                  return;
                }
                if (isCircled) {
                  onCycleCircleColor?.(dateItem.dateString);
                }
              }}
            >
              {dateItem.dayOfMonth}

              {/* Tactile Hand-Drawn Pen Ring around day number */}
              {isCircled && (
                <span
                  className="absolute -inset-[3px] pointer-events-none flex items-center justify-center z-10"
                  aria-hidden="true"
                >
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 28 28">
                    <ellipse
                      cx="14"
                      cy="14"
                      rx="12"
                      ry="11"
                      fill="none"
                      stroke={circleColor || '#D23B38'}
                      strokeWidth="2"
                      strokeDasharray="75"
                      strokeDashoffset="1.5"
                      strokeLinecap="round"
                      className="transition-colors duration-150"
                      style={{
                        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.12))',
                        transform: 'rotate(-8deg)',
                      }}
                    />
                  </svg>
                </span>
              )}
            </span>
            <span
              className={`font-semibold text-xs sm:text-sm ${
                dateItem.dayOfWeek === 0 || dateItem.dayOfWeek === 6
                  ? 'text-[#D23B38]'
                  : 'text-[#63666A]'
              }`}
            >
              {dateItem.dayOfWeekLetter}
            </span>
          </div>
        )}

        {/* Horizontal Notable Dots: Tracks annotation counts, with diagonal slash for resolved items */}
        {gutterDots.length > 0 && (
          <div
            className="flex items-center justify-center gap-1 mt-1 flex-wrap max-w-[36px]"
            title={gutterDotsTitle}
          >
            {gutterDots.map((dot, idx) => (
              <span
                key={`${dot.id}-${idx}`}
                className="w-2 h-2 shrink-0 flex items-center justify-center"
                title={`${dot.label}${dot.isResolved ? ' (resolved)' : ''}`}
              >
                <svg
                  className="w-2 h-2 shrink-0 overflow-visible transition-all"
                  viewBox="0 0 8 8"
                >
                  {/* Colored circle dot */}
                  <circle
                    cx="4"
                    cy="4"
                    r="3.2"
                    fill={dot.color}
                    opacity={dot.isResolved ? 0.6 : 1}
                  />
                  {/* Tactile diagonal graphite pencil slash when resolved */}
                  {dot.isResolved && (
                    <line
                      x1="1"
                      y1="7"
                      x2="7"
                      y2="1"
                      stroke="#2B2C30"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                    />
                  )}
                </svg>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Spanning Rail (only takes space when there is a spanning note) */}
      {contiguousSpansStartingHere.length > 0 && (
        <div className="w-1.5 shrink-0 flex justify-center pt-2 -ml-0.5 mr-0.5">
          <div
            className="w-1 h-3 rounded-full"
            style={{ backgroundColor: contiguousSpansStartingHere[0].colorTag || '#83C5BE' }}
            title="Starts contiguous span"
          />
        </div>
      )}

      {/* Daily Notes Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setIsDayDragOver(true);
        }}
        onDragLeave={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientY < rect.top ||
            e.clientY >= rect.bottom ||
            e.clientX < rect.left ||
            e.clientX >= rect.right
          ) {
            setIsDayDragOver(false);
          }
        }}
        onDrop={(e) => {
          try {
            const raw = e.dataTransfer.getData('text/plain');
            if (!raw) return;
            const data = JSON.parse(raw);
            if (data.type === 'daily-note' && data.id) {
              if (!dropTargetId) {
                onMoveNoteToDate?.(data.id, dateItem.dateString, 'end');
              }
            }
          } catch (err) {
            console.error('Failed to parse drag drop data:', err);
          } finally {
            setIsDayDragOver(false);
            setDropTargetId(null);
            setDropPos(null);
            setActiveDragId(null);
          }
        }}
        className={`flex-1 min-w-0 pr-3 rounded-lg transition-colors ${
          isDayDragOver && !dropTargetId ? 'bg-[#FCE7D2]/40 ring-1 ring-[#D23B38]/30 p-1' : ''
        }`}
        data-notes-column="true"
      >
        <div className="space-y-0.5">
          {dayNotes.map((note) => {
            if (editingNoteId === note.id) {
              return (
                <DayNoteInlineForm
                  key={note.id}
                  initialContent={note.content}
                  initialDates={note.parentDates}
                  initialColorTag={note.colorTag}
                  currentDate={dateItem.dateString}
                  onSubmit={(content, parentDates, colorTag) => {
                    onUpdateNote?.(note.id, content, parentDates, colorTag);
                    setEditingNoteId(null);
                  }}
                  onCancel={() => setEditingNoteId(null)}
                  submitLabel="Save"
                />
              );
            }

            return (
              <NoteItemComponent
                key={note.id}
                note={note}
                currentDate={dateItem.dateString}
                onToggleStrike={onToggleStrike}
                onRemoveNote={onRemoveNote}
                onStartEdit={() => setEditingNoteId(note.id)}
                onUpdateNote={(id, text) => onUpdateNote?.(id, text, note.parentDates, note.colorTag)}
                onJumpToDate={(targetDate) => {
                  if (onJumpToDateRequested) onJumpToDateRequested(targetDate);
                }}
                onDragStart={(e, id) => {
                  e.dataTransfer.setData(
                    'text/plain',
                    JSON.stringify({ type: 'daily-note', id, sourceDate: dateItem.dateString })
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
                  handleNoteDrop(e, id, pos);
                }}
                onDragEnd={() => {
                  setActiveDragId(null);
                  setDropTargetId(null);
                  setDropPos(null);
                  setIsDayDragOver(false);
                }}
                isBeingDragged={activeDragId === note.id}
                dropIndicator={dropTargetId === note.id ? dropPos : null}
              />
            );
          })}
        </div>

        {/* Quick note input form */}
        {isQuickAdding ? (
          <div className="mt-1.5">
            <DayNoteInlineForm
              currentDate={dateItem.dateString}
              onSubmit={(content, parentDates, colorTag) => {
                onAddNote(content, parentDates, colorTag);
                onCancelQuickAdd();
              }}
              onCancel={onCancelQuickAdd}
              submitLabel="Add"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onStartQuickAdd(dateItem.dateString)}
            className="opacity-0 group-hover/row:opacity-100 mt-0.5 text-[11px] font-mono text-[#A19D94] hover:text-[#2B2C30] flex items-center gap-1 transition-opacity py-0.5 px-1 rounded cursor-pointer"
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
