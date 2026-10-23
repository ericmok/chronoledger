import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { DateItem, NoteItem, NoteScope, DrawingTool, CircleDateColor } from '../../types/calendar';
import { CIRCLE_DATE_COLOR_NAMES } from '../../types/calendar';
import { analyzeDateSpan, DAY_NAMES_SHORT, FULL_MONTH_NAMES } from '../../utils/dateUtils';
import { getSeasonalColor } from '../../utils/seasonalColors';
import { getGutterDotsForNotes } from '../../utils/annotationUtils';
import { NoteItemComponent } from '../NoteItemComponent';
import { DayNoteInlineForm } from './DayNoteInlineForm';
import { RoughCircledRing } from '../common/RoughCircledRing';
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
  onAcceptNoteRevision?: (noteId: string) => void;
  onJumpToDateRequested?: (dateKey: string) => void;
  onReorderNotes?: (sourceNoteId: string, targetNoteId: string, position: 'before' | 'after', targetDate?: string) => void;
  onMoveNoteToDate?: (noteId: string, targetDate: string, position?: 'start' | 'end') => void;
  onMoveNoteScope?: (noteId: string, targetScope: NoteScope, targetTargets: string[], position?: 'start' | 'end') => boolean;
  onSizeChange?: () => void;
  onOpenFolio?: (noteId: string) => void;
}

export const DayRow: React.FC<DayRowProps> = ({
  dateItem,
  dayIdx: _dayIdx,
  dayNotes,
  isMonthFocus: _isMonthFocus,
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
  onAcceptNoteRevision,
  onJumpToDateRequested,
  onReorderNotes,
  onMoveNoteToDate,
  onMoveNoteScope,
  onSizeChange,
  onOpenFolio,
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
      if (data.id) {
        // Cross-horizon move: if dragged from week or month, transition scope in-place
        if (data.scope && data.scope !== 'day') {
          onMoveNoteScope?.(data.id, 'day', [dateItem.dateString], position === 'before' ? 'start' : 'end');
        } else if (data.type === 'daily-note') {
          onReorderNotes?.(data.id, targetNoteId, position, dateItem.dateString);
        } else if (data.type === 'week-note' || data.type === 'month-note') {
          onMoveNoteScope?.(data.id, 'day', [dateItem.dateString], position === 'before' ? 'start' : 'end');
        }
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

  const circleColorName = circleColor
    ? CIRCLE_DATE_COLOR_NAMES[circleColor as CircleDateColor] || 'Circled'
    : 'Circled';

  const dayOfWeekShort =
    dateItem.dayOfWeekShort ||
    (dateItem.dayOfWeek !== undefined ? DAY_NAMES_SHORT[dateItem.dayOfWeek] : dateItem.dayOfWeekLetter);

  const seasonalColor = useMemo(
    () => (dateItem.isFirstDayOfMonth ? getSeasonalColor(dateItem.monthIndex) : null),
    [dateItem.isFirstDayOfMonth, dateItem.monthIndex]
  );
  const fullMonthName = FULL_MONTH_NAMES[dateItem.monthIndex] || dateItem.monthName;

  const circleClickTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (circleClickTimeoutRef.current) {
        window.clearTimeout(circleClickTimeoutRef.current);
      }
    };
  }, []);

  const handleDateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeTool === 'eraser' && isCircled) {
      if (circleClickTimeoutRef.current) {
        window.clearTimeout(circleClickTimeoutRef.current);
        circleClickTimeoutRef.current = null;
      }
      onToggleCircleDate?.(dateItem.dateString);
      return;
    }
    if (isCircled) {
      // If a double-click is occurring (click 2 has e.detail > 1), abort single-click cycling
      if (e.detail > 1) {
        if (circleClickTimeoutRef.current) {
          window.clearTimeout(circleClickTimeoutRef.current);
          circleClickTimeoutRef.current = null;
        }
        return;
      }
      if (circleClickTimeoutRef.current) {
        window.clearTimeout(circleClickTimeoutRef.current);
      }
      circleClickTimeoutRef.current = window.setTimeout(() => {
        onCycleCircleColor?.(dateItem.dateString);
        circleClickTimeoutRef.current = null;
      }, 220);
    }
  };

  const handleDateDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (circleClickTimeoutRef.current) {
      window.clearTimeout(circleClickTimeoutRef.current);
      circleClickTimeoutRef.current = null;
    }
    onToggleCircleDate?.(dateItem.dateString);
  };

  return (
    <div
      data-day-row="true"
      data-date-string={dateItem.dateString}
      className="flex flex-col flex-1 w-full group/row"
    >
      {/* Month Milestone Ribbon on 1st of month:
          Rendered inside DayRow to preserve 7-day WeekBlock virtualization,
          Weekly Scratch Pad geometry, and DrawingOverlay coordinate mappings. */}
      {dateItem.isFirstDayOfMonth && seasonalColor && (
        <div
          data-month-ribbon="true"
          /* pt-1.5 (6px) and pb-[5px] (5px + 1px border = 6px) symmetrically balance vertical space */
          className="w-full flex items-center pr-3 pt-1.5 pb-[5px] border-b select-none transition-colors"
          style={{
            backgroundColor: seasonalColor.gutterBg,
            borderColor: seasonalColor.notesBorder || '#E5DFD5',
          }}
          title={`${fullMonthName} ${dateItem.year}`}
        >
          {/* w-8 spacer matches the Mo rail column width so month text begins at exact date-column alignment */}
          <div className="w-8 shrink-0 border-r border-[#E5DFD5]/40 self-stretch" />

          {/* Month & Year typography with font-metric optical center compensation */}
          <div className="flex items-center gap-2.5 pl-3 shrink-0">
            {/* Serif uppercase month name: shifted 1px down to offset empty descender space */}
            <span
              className="font-serif text-xs sm:text-[13px] font-bold tracking-[0.22em] uppercase translate-y-[1px]"
              style={{ color: seasonalColor.accentTag }}
            >
              {fullMonthName}
            </span>
            {/* Monospace 4-digit year: shifted 0.5px down for optical midline alignment with serif text */}
            <span className="font-mono text-[10.5px] font-semibold text-[#7E7F85] tracking-wider translate-y-[0.5px]">
              {dateItem.year}
            </span>
          </div>

          {/* In-stream horizontal accent rule extending to the right margin */}
          <div
            className="flex-1 h-px opacity-40 ml-3"
            style={{ backgroundColor: seasonalColor.accentTag }}
          />
        </div>
      )}

      {/* Main Day Content */}
      <div
        onDoubleClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('button, input, form, textarea, select')) return;
          onStartQuickAdd(dateItem.dateString);
        }}
        title={`${dateItem.monthName} ${dateItem.dayOfMonth}, ${dateItem.year} — double-click to write note`}
        className={`flex items-start flex-1 min-h-[48px] py-1 transition-colors w-full ${
          dateItem.isToday
            ? 'bg-[#FAF0E4]/90 hover:bg-[#F5E8D6] relative z-10'
            : 'hover:bg-[#F2EDE4]/30'
        }`}
      >
        {/* Month Rail Guide */}
        <div className="w-8 shrink-0 flex flex-col items-center justify-start pt-2 select-none relative border-r border-[#E5DFD5]/40" />

      {/* Date & Day of Week */}
      <div
        data-date-gutter="true"
        className="w-12 shrink-0 flex flex-col items-center justify-start pt-1 font-mono select-none"
      >
        {dateItem.isToday ? (
          /* Fused Today Unit: Date Number + Day of Week + TODAY badge */
          <div
            className="relative flex flex-col items-center justify-center bg-[#2B2C30] text-[#FAF8F5] rounded-md px-1.5 py-1 shadow-xs min-w-[36px] cursor-pointer hover:brightness-110 transition-all leading-none"
            title={
              isCircled
                ? `Today (${circleColorName} - click to cycle color, double-click to remove)`
                : 'Today (Double-click to circle)'
            }
            onDoubleClick={handleDateDoubleClick}
            onClick={handleDateClick}
          >
            <span className="text-base sm:text-[17px] font-bold text-[#FAF8F5] leading-none">
              {dateItem.dayOfMonth}
            </span>
            <span className="text-[8.5px] sm:text-[9px] font-mono uppercase tracking-tight text-[#FAF8F5] opacity-50 leading-none mt-0.5 select-none">
              {dayOfWeekShort}
            </span>
            <span className="text-[6.5px] font-mono font-black uppercase tracking-wider text-[#FAF8F5]/80 leading-none mt-1">
              TODAY
            </span>

            {/* Tactile Hand-Drawn Ring around Today badge */}
            {isCircled && (
              <span
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[54px] h-[52px] pointer-events-none flex items-center justify-center z-10"
                aria-hidden="true"
              >
                <RoughCircledRing
                  dateKey={dateItem.dateString}
                  color={circleColor || '#9CA3AF'}
                  variant="today"
                />
              </span>
            )}
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center leading-none cursor-pointer group/date"
            title={
              isCircled
                ? `${dateItem.monthName} ${dateItem.dayOfMonth} (${circleColorName} - click to cycle color, double-click to remove)`
                : `${dateItem.monthName} ${dateItem.dayOfMonth} (Double-click to circle)`
            }
            onDoubleClick={handleDateDoubleClick}
            onClick={handleDateClick}
          >
            <span
              className="relative inline-flex items-center justify-center min-w-[22px] h-6 px-0.5 rounded text-base sm:text-[17px] font-bold text-[#2B2C30] group-hover/date:bg-black/5 transition-colors leading-none"
            >
              {dateItem.dayOfMonth}

              {/* Tactile Hand-Drawn Pen Ring around day number */}
              {isCircled && (
                <span
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[46px] h-[40px] pointer-events-none flex items-center justify-center z-10"
                  aria-hidden="true"
                >
                  <RoughCircledRing
                    dateKey={dateItem.dateString}
                    color={circleColor || '#9CA3AF'}
                    variant="day"
                  />
                </span>
              )}
            </span>
            <span
              className={`font-mono text-[8.5px] sm:text-[9px] uppercase tracking-tight leading-none mt-0.5 select-none ${
                dateItem.dayOfWeek === 0 || dateItem.dayOfWeek === 6
                  ? 'text-[#D23B38] opacity-35'
                  : 'text-[#2B2C30] opacity-30'
              }`}
            >
              {dayOfWeekShort}
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
            if (data.id) {
              if (data.scope && data.scope !== 'day') {
                onMoveNoteScope?.(data.id, 'day', [dateItem.dateString], 'end');
              } else if (data.type === 'daily-note') {
                if (!dropTargetId) {
                  onMoveNoteToDate?.(data.id, dateItem.dateString, 'end');
                }
              } else if (data.type === 'week-note' || data.type === 'month-note') {
                onMoveNoteScope?.(data.id, 'day', [dateItem.dateString], 'end');
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
                onAcceptNoteRevision={onAcceptNoteRevision}
                onSizeChange={onSizeChange}
                onOpenFolio={onOpenFolio}
                onJumpToDate={(targetDate) => {
                  if (onJumpToDateRequested) onJumpToDateRequested(targetDate);
                }}
                onDragStart={(e, id) => {
                  e.dataTransfer.setData(
                    'text/plain',
                    JSON.stringify({ type: 'daily-note', scope: 'day', noteType: 'chrono-note', id, sourceDate: dateItem.dateString })
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
  </div>
);
};
