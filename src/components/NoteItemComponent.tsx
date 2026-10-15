import React from 'react';
import { Calendar, Link2 } from 'lucide-react';
import type { NoteItem } from '../types/calendar';
import { analyzeDateSpan } from '../utils/dateUtils';
import { NoteCard } from './common/NoteCard';

export interface NoteItemComponentProps {
  note: NoteItem;
  currentDate: string;
  onToggleStrike: (noteId: string) => void;
  onRemoveNote: (noteId: string) => void;
  onUpdateNote?: (noteId: string, newContent: string) => void;
  onStartEdit?: (noteId: string) => void;
  onJumpToDate?: (dateKey: string) => void;

  // Drag and drop reordering
  isDraggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLElement>, id: string) => void;
  onDragOver?: (e: React.DragEvent<HTMLElement>, id: string, position: 'before' | 'after') => void;
  onDragLeave?: (e: React.DragEvent<HTMLElement>, id: string) => void;
  onDrop?: (e: React.DragEvent<HTMLElement>, id: string, position: 'before' | 'after') => void;
  onDragEnd?: (e: React.DragEvent<HTMLElement>) => void;
  isBeingDragged?: boolean;
  dropIndicator?: 'before' | 'after' | null;
}

export const NoteItemComponent: React.FC<NoteItemComponentProps> = ({
  note,
  currentDate,
  onToggleStrike,
  onRemoveNote,
  onUpdateNote,
  onStartEdit,
  onJumpToDate,
  isDraggable = true,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  isBeingDragged,
  dropIndicator,
}) => {
  const spanInfo = analyzeDateSpan(note.parentDates);
  const isMultiDate = note.parentDates.length > 1;
  const currentIndexInSpan = note.parentDates.indexOf(currentDate);

  const spanBadge = isMultiDate ? (
    <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] font-mono text-[#7E7F85]">
      {spanInfo.isContiguous ? (
        <span className="inline-flex items-center gap-1 bg-[#EBE5DA] px-1.5 py-0.5 rounded text-[10px] text-[#55565B]">
          <Calendar className="w-2.5 h-2.5 text-[#7E7F85]" />
          <span>{spanInfo.count}d span</span>
          <span className="text-[#8E8F95]">
            ({spanInfo.startDate.slice(5)} → {spanInfo.endDate.slice(5)})
          </span>
        </span>
      ) : (
        <div className="inline-flex items-center gap-1 bg-[#EBE5DA] px-1.5 py-0.5 rounded text-[10px] text-[#55565B]">
          <Link2 className="w-2.5 h-2.5 text-[#D23B38]" />
          <span>Linked ({currentIndexInSpan + 1}/{note.parentDates.length}):</span>
          {note.parentDates.map((d) => (
            <button
              key={d}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onJumpToDate) onJumpToDate(d);
              }}
              className={`hover:underline cursor-pointer ${
                d === currentDate ? 'font-bold text-[#2B2C30]' : 'text-[#7E7F85]'
              }`}
            >
              {d.slice(5)}
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;

  return (
    <NoteCard
      id={note.id}
      content={note.content}
      originalContent={note.originalContent}
      isStruck={note.isStruck}
      colorTag={note.colorTag}
      badge={spanBadge}
      density="comfortable"
      onToggleStrike={onToggleStrike}
      onRemove={onRemoveNote}
      onUpdate={onUpdateNote}
      onStartEdit={onStartEdit}
      isDraggable={isDraggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      isBeingDragged={isBeingDragged}
      dropIndicator={dropIndicator}
    />
  );
};
