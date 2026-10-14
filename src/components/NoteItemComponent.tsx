import React, { useState, useMemo } from 'react';
import { Strikethrough, Calendar, Link2, Trash2, Pencil, Check, X } from 'lucide-react';
import type { NoteItem } from '../types/calendar';
import { analyzeDateSpan } from '../utils/dateUtils';
import { computeWordDiff } from '../utils/diffUtils';

interface NoteItemComponentProps {
  note: NoteItem;
  currentDate: string;
  onToggleStrike: (noteId: string) => void;
  onRemoveNote: (noteId: string) => void;
  onUpdateNote?: (noteId: string, newContent: string) => void;
  onJumpToDate?: (dateKey: string) => void;
}

export const NoteItemComponent: React.FC<NoteItemComponentProps> = ({
  note,
  currentDate,
  onToggleStrike,
  onRemoveNote,
  onUpdateNote,
  onJumpToDate,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(note.content);

  const spanInfo = analyzeDateSpan(note.parentDates);
  const isMultiDate = note.parentDates.length > 1;
  const currentIndexInSpan = note.parentDates.indexOf(currentDate);

  const hasEdits = Boolean(note.originalContent && note.originalContent !== note.content);
  const diffChunks = useMemo(() => {
    if (!hasEdits || !note.originalContent) return [];
    return computeWordDiff(note.originalContent, note.content);
  }, [hasEdits, note.originalContent, note.content]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditText(note.content || note.originalContent || '');
    setIsEditing(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const trimmed = editText.trim();
    if (onUpdateNote) {
      onUpdateNote(note.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsEditing(false);
    setEditText(note.content);
  };

  // Inline editing mode with generous, comfortable padding
  if (isEditing) {
    return (
      <form
        onSubmit={handleSaveEdit}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-1.5 w-full my-1 p-1 bg-white border border-[#2B2C30] rounded-lg shadow-sm animate-in fade-in duration-100"
      >
        <input
          autoFocus
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') handleCancelEdit();
          }}
          className="flex-1 px-3.5 py-2 text-sm bg-transparent border-0 text-[#2B2C30] focus:outline-hidden font-sans placeholder:text-[#A19D94]"
          placeholder="Edit note text... (Enter to save, Esc to cancel)"
        />
        <button
          type="submit"
          className="px-3 py-1.5 text-xs bg-[#2B2C30] hover:bg-[#404147] text-[#FAF8F5] rounded-md font-medium shadow-2xs flex items-center gap-1 transition-colors"
          title="Save changes (Enter)"
        >
          <Check className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Save</span>
        </button>
        <button
          type="button"
          onClick={handleCancelEdit}
          className="px-2 py-1.5 text-xs text-[#8E8F95] hover:text-[#2B2C30] hover:bg-[#EAE3D6]/50 rounded-md transition-colors"
          title="Cancel editing (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </form>
    );
  }

  return (
    <div
      onDoubleClick={handleStartEdit}
      className={`group relative flex items-start gap-2 py-1 px-2 rounded-md transition-all duration-150 cursor-pointer ${
        note.isStruck
          ? 'bg-transparent text-[#8E8F95]'
          : 'hover:bg-[#F2EDE4]/70 text-[#2B2C30]'
      }`}
      title="Double-click to edit note"
    >
      {/* Color tag indicator if set */}
      {note.colorTag && (
        <span
          className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
          style={{ backgroundColor: note.colorTag }}
        />
      )}

      {/* Strike Action Button (Analog Pencil Scratch) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleStrike(note.id);
        }}
        className={`mt-0.5 p-1 rounded transition-colors ${
          note.isStruck
            ? 'text-[#A19D94] hover:text-[#2B2C30]'
            : 'text-[#BBB6AC] opacity-30 group-hover:opacity-100 hover:!opacity-100 hover:text-[#2B2C30] hover:bg-[#EAE3D6]'
        }`}
        title={note.isStruck ? 'Restore / Unstrike' : 'Cross out / Strike through'}
      >
        <Strikethrough className="w-3.5 h-3.5" />
      </button>

      {/* Note Content with Realistic Graphite Strike Line & Word-Level Diffs */}
      <div className="flex-1 min-w-0">
        <div className="relative inline font-sans text-sm leading-relaxed break-words">
          {note.isStruck ? (
            // Full note strike overrides inner diffs with graphite pencil strike
            <span className="line-through decoration-[#A19D94] decoration-2">
              {note.content || note.originalContent || '(empty note)'}
            </span>
          ) : hasEdits ? (
            // Render word-level diff: deleted words struck in red ink, added words in green ink
            <span className="inline whitespace-pre-wrap">
              {diffChunks.map((chunk, idx) => {
                if (chunk.type === 'deleted') {
                  return (
                    <span
                      key={idx}
                      className="inline line-through decoration-[#D23B38] decoration-[1.5px] text-[#D23B38] opacity-60 font-serif mr-1 selection:bg-[#D23B38]/20"
                      title="Deleted word"
                    >
                      {chunk.value}
                    </span>
                  );
                }
                if (chunk.type === 'added') {
                  return (
                    <span
                      key={idx}
                      className="inline text-[#1E7B48] font-medium bg-[#E8F5E9]/60 px-0.5 rounded-xs mr-0.5"
                      title="Added word"
                    >
                      {chunk.value}
                    </span>
                  );
                }
                return (
                  <span key={idx} className="text-[#2B2C30]">
                    {chunk.value}
                  </span>
                );
              })}
            </span>
          ) : (
            <span>{note.content || '(empty note)'}</span>
          )}

          {/* Struck Badge */}
          {note.isStruck && (
            <span className="ml-2 text-[10px] font-mono uppercase tracking-wider text-[#A19D94] bg-[#F2EDE4] px-1 py-0.2 rounded border border-[#E0D9CC]">
              struck
            </span>
          )}

          {/* Edited / Deleted Badge */}
          {hasEdits && !note.isStruck && (
            <span
              className={`ml-2 text-[9px] font-mono uppercase tracking-wider px-1 py-0.2 rounded border ${
                note.content === ''
                  ? 'text-[#D23B38] bg-[#FDEDEC] border-[#FADBD8]'
                  : 'text-[#1E7B48] bg-[#E8F5E9] border-[#C8E6C9]'
              }`}
              title={
                note.content === ''
                  ? 'All text deleted (crossed out)'
                  : `Original: "${note.originalContent}"`
              }
            >
              {note.content === '' ? 'deleted' : 'edited'}
            </span>
          )}
        </div>

        {/* Multi-date Span / Constellation Badges */}
        {isMultiDate && (
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
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onJumpToDate) onJumpToDate(d);
                    }}
                    className={`hover:underline ${d === currentDate ? 'font-bold text-[#2B2C30]' : 'text-[#7E7F85]'}`}
                  >
                    {d.slice(5)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Note Actions: Edit & Delete */}
      <div className="flex items-center gap-0.5 shrink-0 ml-1">
        {/* Edit Note Button */}
        <button
          onClick={handleStartEdit}
          className="opacity-40 group-hover:opacity-100 hover:!opacity-100 p-1 text-[#71727A] hover:text-[#2B2C30] hover:bg-[#EAE3D6] rounded transition-all"
          title="Edit note (or double-click text)"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>

        {/* Delete / Remove Note */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemoveNote(note.id);
          }}
          className="opacity-40 group-hover:opacity-100 hover:!opacity-100 p-1 text-[#8E8F95] hover:text-[#D23B38] hover:bg-[#FDEDEC] rounded transition-all"
          title="Delete note"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
