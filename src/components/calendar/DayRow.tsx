import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { DateItem, NoteItem, NoteScope, DrawingTool, CircleDateColor } from '../../types/calendar';
import { CIRCLE_DATE_COLOR_NAMES } from '../../types/calendar';
import { analyzeDateSpan, DAY_NAMES_SHORT, FULL_MONTH_NAMES } from '../../utils/dateUtils';
import { getSeasonalColor } from '../../utils/seasonalColors';
import { getGutterDotsForNotes } from '../../utils/annotationUtils';
import { matchesSelector } from '../../utils/selectorMatcher';
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
  activeFilter?: string | null;
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
  themeMode?: string;
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
  activeFilter,
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
  themeMode,
}) => {
  const isLupine =
    themeMode === 'lupine' ||
    (themeMode !== 'paper' &&
      typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-theme') !== 'paper');
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

  const hasFilterMatch = useMemo(
    () => Boolean(activeFilter && dayNotes.some((n) => matchesSelector(n.content, n.isStruck, activeFilter))),
    [activeFilter, dayNotes]
  );

  const circleColorName = circleColor
    ? CIRCLE_DATE_COLOR_NAMES[circleColor as CircleDateColor] || 'Circled'
    : 'Circled';

  const dayOfWeekShort =
    dateItem.dayOfWeekShort ||
    (dateItem.dayOfWeek !== undefined ? DAY_NAMES_SHORT[dateItem.dayOfWeek] : dateItem.dayOfWeekLetter);

  const seasonalColor = useMemo(
    () => (dateItem.isFirstDayOfMonth ? getSeasonalColor(dateItem.monthIndex, isLupine ? 'lupine' : 'paper') : null),
    [dateItem.isFirstDayOfMonth, dateItem.monthIndex, isLupine]
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
      {/* Month Milestone Ribbon on 1st of month (Console section break) */}
      {dateItem.isFirstDayOfMonth && seasonalColor && (
        <div
          data-month-ribbon="true"
          className="w-full flex items-center pr-3 py-1 border-b border-[#CBD5E1] bg-[#F2F2F4] select-none font-mono text-xs transition-colors"
          title={`${fullMonthName} ${dateItem.year}`}
        >
          {/* Section glyph marker */}
          <div className="w-8 shrink-0 border-r border-[#CBD5E1] self-stretch flex items-center justify-center text-[10px] text-[#757575] font-bold">
            //
          </div>

          {/* Month & Year in console typography */}
          <div className="flex items-center gap-2 pl-3 shrink-0">
            <span className="font-bold text-xs tracking-wider uppercase text-[#3264EB]">
              {fullMonthName}
            </span>
            <span className="text-[11px] font-mono text-[#757575]">
              {dateItem.year}
            </span>
          </div>

          {/* Console dashed rule */}
          <div className="flex-1 border-t border-dashed border-[#CBD5E1] ml-3" />
          <span className="text-[10px] font-mono text-[#757575] pl-2 uppercase tracking-widest opacity-70">
            [buffer]
          </span>
        </div>
      )}

      {/* Main Day Content (Console buffer line) */}
      <div
        onDoubleClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('button, input, form, textarea, select')) return;
          onStartQuickAdd(dateItem.dateString);
        }}
        title={`${dateItem.monthName} ${dateItem.dayOfMonth}, ${dateItem.year} — double-click to write note`}
        className={`flex items-start flex-1 min-h-[44px] py-1 transition-colors w-full ${
          dateItem.isToday
            ? 'border-l-[3px] border-l-[#3264EB] bg-[#EFF6FF] relative z-10'
            : 'border-l-[3px] border-l-transparent hover:bg-[#F8FAFC]'
        }`}
      >
        {/* Month Rail Guide */}
        <div className="w-8 shrink-0 flex flex-col items-center justify-start pt-2 select-none relative border-r border-[#E2E8F0]" />

      {/* Date Gutter (Terminal Line Numbers Style) */}
      <div
        data-date-gutter="true"
        className="w-14 shrink-0 flex flex-col items-center justify-start pt-0.5 font-mono select-none"
      >
        {dateItem.isToday ? (
          /* Fused Today Unit: Terminal Cursor Pill */
          <div
            className="relative flex items-center justify-center bg-[#3264EB] text-white rounded-none px-1.5 py-0.5 shadow-xs min-w-[38px] cursor-pointer hover:bg-[#2552D0] transition-all font-mono leading-none gap-1"
            title={
              isCircled
                ? `Today (${circleColorName} - click to cycle color, double-click to remove)`
                : 'Today (Double-click to circle)'
            }
            onDoubleClick={handleDateDoubleClick}
            onClick={handleDateClick}
          >
            <span className="text-[13px] font-bold font-mono leading-none">
              {String(dateItem.dayOfMonth).padStart(2, '0')}
            </span>
            <span className="text-[8.5px] font-mono uppercase font-semibold text-white/80 leading-none">
              {dayOfWeekShort}
            </span>

            {/* Radar Filter Match Indicator */}
            {hasFilterMatch && (
              <span
                className="absolute -top-1 -right-1 w-2 h-2 rounded-none bg-[#5E49B0] ring-1 ring-white animate-pulse"
                title="Date contains notes matching active radar filter"
              />
            )}

            {/* Circled Ring around Today badge */}
            {isCircled && (
              <span
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[54px] h-[52px] pointer-events-none flex items-center justify-center z-10"
                aria-hidden="true"
              >
                <RoughCircledRing
                  dateKey={dateItem.dateString}
                  color={circleColor || '#3264EB'}
                  variant="today"
                />
              </span>
            )}
          </div>
        ) : (
          <div
            className="flex items-center justify-center leading-none cursor-pointer group/date gap-1 py-0.5 px-1 hover:bg-[#E2E8F0] font-mono"
            title={
              isCircled
                ? `${dateItem.monthName} ${dateItem.dayOfMonth} (${circleColorName} - click to cycle color, double-click to remove)`
                : `${dateItem.monthName} ${dateItem.dayOfMonth} (Double-click to circle)`
            }
            onDoubleClick={handleDateDoubleClick}
            onClick={handleDateClick}
          >
            <span
              className={`relative inline-flex items-center justify-center text-[13px] font-mono font-bold transition-colors leading-none ${
                hasFilterMatch
                  ? 'ring-1 ring-[#3264EB] bg-[#EFF6FF] px-0.5 text-[#3264EB]'
                  : 'text-[#212121]'
              }`}
            >
              {String(dateItem.dayOfMonth).padStart(2, '0')}

              {hasFilterMatch && (
                <span
                  className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-none bg-[#3264EB] animate-pulse"
                  title="Date contains notes matching active radar filter"
                />
              )}

              {/* Circled Ring around day number */}
              {isCircled && (
                <span
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[46px] h-[40px] pointer-events-none flex items-center justify-center z-10"
                  aria-hidden="true"
                >
                  <RoughCircledRing
                    dateKey={dateItem.dateString}
                    color={circleColor || '#3264EB'}
                    variant="day"
                  />
                </span>
              )}
            </span>
            <span
              className={`font-mono text-[9px] uppercase font-semibold leading-none ${
                dateItem.dayOfWeek === 0 || dateItem.dayOfWeek === 6
                  ? 'text-[#3264EB]'
                  : 'text-[#757575]'
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

            const isMatch = !activeFilter || matchesSelector(note.content, note.isStruck, activeFilter);

            return (
              <NoteItemComponent
                key={note.id}
                note={note}
                className={!isMatch ? 'opacity-25 grayscale-[60%] blur-[0.2px] hover:opacity-100 transition-all' : ''}
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
