import type React from 'react';
import { Strikethrough, Calendar, Link2, Trash2 } from 'lucide-react';
import type { NoteItem } from '../types/calendar';
import { analyzeDateSpan } from '../utils/dateUtils';

interface NoteItemComponentProps {
  note: NoteItem;
  currentDate: string;
  onToggleStrike: (noteId: string) => void;
  onRemoveNote: (noteId: string) => void;
  onJumpToDate?: (dateKey: string) => void;
}

export const NoteItemComponent: React.FC<NoteItemComponentProps> = ({
  note,
  currentDate,
  onToggleStrike,
  onRemoveNote,
  onJumpToDate,
}) => {
  const spanInfo = analyzeDateSpan(note.parentDates);
  const isMultiDate = note.parentDates.length > 1;

  const currentIndexInSpan = note.parentDates.indexOf(currentDate);


  return (
    <div
      className={`group relative flex items-start gap-2 py-1 px-2 rounded-md transition-all duration-150 ${
        note.isStruck
          ? 'bg-transparent text-[#8E8F95]'
          : 'hover:bg-[#F2EDE4]/70 text-[#2B2C30]'
      }`}
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
        onClick={() => onToggleStrike(note.id)}
        className={`mt-0.5 p-1 rounded transition-colors ${
          note.isStruck
            ? 'text-[#A19D94] hover:text-[#2B2C30]'
            : 'text-[#BBB6AC] opacity-0 group-hover:opacity-100 hover:text-[#2B2C30] hover:bg-[#EAE3D6]'
        }`}
        title={note.isStruck ? 'Restore / Unstrike' : 'Cross out / Strike through'}
      >
        <Strikethrough className="w-3.5 h-3.5" />
      </button>

      {/* Note Content with Realistic Graphite Strike Line */}
      <div className="flex-1 min-w-0">
        <div className="relative inline-block font-sans text-sm leading-relaxed break-words">
          <span className={note.isStruck ? 'line-through decoration-[#A19D94] decoration-2' : ''}>
            {note.content}
          </span>
          {note.isStruck && (
            <span className="ml-2 text-[10px] font-mono uppercase tracking-wider text-[#A19D94] bg-[#F2EDE4] px-1 py-0.2 rounded border border-[#E0D9CC]">
              struck
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
                    onClick={() => onJumpToDate && onJumpToDate(d)}
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

      {/* Delete / Remove Note (Hover) */}
      <button
        onClick={() => onRemoveNote(note.id)}
        className="opacity-0 group-hover:opacity-100 p-1 text-[#BBB6AC] hover:text-[#D23B38] rounded transition-all"
        title="Remove permanently"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
