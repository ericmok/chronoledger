import React, { useState, useMemo } from 'react';
import { Strikethrough, Pencil, Trash2, Check, X, GripVertical } from 'lucide-react';
import { computeWordDiff } from '../../utils/diffUtils';

export interface NoteCardProps {
  id: string;
  content: string;
  originalContent?: string;
  isStruck: boolean;
  colorTag?: string;
  badge?: React.ReactNode;
  onToggleStrike: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate?: (id: string, newContent: string) => void;
  onStartEdit?: (id: string) => void;
  density?: 'comfortable' | 'compact';
  variant?: 'card' | 'minimal';
  className?: string;

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

export const NoteCard: React.FC<NoteCardProps> = ({
  id,
  content,
  originalContent,
  isStruck,
  colorTag,
  badge,
  onToggleStrike,
  onRemove,
  onUpdate,
  onStartEdit,
  density = 'comfortable',
  variant = 'card',
  className = '',
  isDraggable = true,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  isBeingDragged = false,
  dropIndicator,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(content || originalContent || '');
  const [canDrag, setCanDrag] = useState(false);
  const [isDraggingSelf, setIsDraggingSelf] = useState(false);
  const [localDropIndicator, setLocalDropIndicator] = useState<'before' | 'after' | null>(null);

  const activeDropIndicator = dropIndicator !== undefined ? dropIndicator : localDropIndicator;

  const isMinimal = variant === 'minimal';
  const isComfortable = density === 'comfortable';
  const hasEdits = Boolean(originalContent && originalContent !== content);

  const diffChunks = useMemo(() => {
    if (!hasEdits || !originalContent) return [];
    return computeWordDiff(originalContent, content);
  }, [hasEdits, originalContent, content]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onStartEdit) {
      onStartEdit(id);
      return;
    }
    setEditText(content || originalContent || '');
    setIsEditing(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const trimmed = editText.trim();
    if (onUpdate) {
      onUpdate(id, trimmed);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsEditing(false);
    setEditText(content || originalContent || '');
  };

  // Inline Editing Mode
  if (isEditing) {
    return (
      <form
        data-note-id={id}
        onSubmit={handleSaveEdit}
        onClick={(e) => e.stopPropagation()}
        className={`flex items-center gap-1.5 w-full my-1 p-1 bg-white border border-[#2B2C30] rounded-lg shadow-xs animate-in fade-in duration-100 ${className}`}
      >
        <input
          autoFocus
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') handleCancelEdit();
          }}
          className={`flex-1 bg-transparent border-0 text-[#2B2C30] focus:outline-hidden font-sans placeholder:text-[#A19D94] ${
            isComfortable ? 'px-3.5 py-2 text-sm' : 'px-2 py-1 text-xs'
          }`}
          placeholder="Edit note text... (Enter to save, Esc to cancel)"
        />
        <button
          type="submit"
          className={`bg-[#2B2C30] hover:bg-[#404147] text-[#FAF8F5] rounded-md font-medium shadow-2xs flex items-center gap-1 transition-colors shrink-0 ${
            isComfortable ? 'px-3 py-1.5 text-xs' : 'px-2 py-1 text-xs'
          }`}
          title="Save changes (Enter)"
        >
          <Check className={isComfortable ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
          <span className="hidden sm:inline">Save</span>
        </button>
        <button
          type="button"
          onClick={handleCancelEdit}
          className={`text-[#8E8F95] hover:text-[#2B2C30] hover:bg-[#EAE3D6]/50 rounded-md transition-colors shrink-0 ${
            isComfortable ? 'px-2 py-1.5 text-xs' : 'p-1 text-xs'
          }`}
          title="Cancel editing (Esc)"
        >
          <X className={isComfortable ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
        </button>
      </form>
    );
  }

  // Normal Display Mode
  return (
    <div
      data-note-id={id}
      onDoubleClick={handleStartEdit}
      draggable={isDraggable && canDrag}
      onDragStart={(e) => {
        setIsDraggingSelf(true);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(e, id);
      }}
      onDragEnd={(e) => {
        setIsDraggingSelf(false);
        setCanDrag(false);
        setLocalDropIndicator(null);
        onDragEnd?.(e);
      }}
      onDragOver={(e) => {
        if (!isDraggable) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        const rect = e.currentTarget.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const pos: 'before' | 'after' = e.clientY < midY ? 'before' : 'after';
        setLocalDropIndicator(pos);
        onDragOver?.(e, id, pos);
      }}
      onDragLeave={(e) => {
        if (!isDraggable) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (
          e.clientY < rect.top ||
          e.clientY >= rect.bottom ||
          e.clientX < rect.left ||
          e.clientX >= rect.right
        ) {
          setLocalDropIndicator(null);
          onDragLeave?.(e, id);
        }
      }}
      onDrop={(e) => {
        if (!isDraggable) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const pos: 'before' | 'after' = e.clientY < midY ? 'before' : 'after';
        setLocalDropIndicator(null);
        onDrop?.(e, id, pos);
      }}
      className={`group relative flex items-start gap-1.5 transition-all duration-150 cursor-pointer ${
        isMinimal
          ? 'py-1.5 px-0.5 text-xs border-b border-[#D5CDC0]'
          : isComfortable
          ? 'rounded-md py-1 px-2 text-sm'
          : 'rounded-md p-1 text-xs'
      } ${
        isBeingDragged || isDraggingSelf
          ? 'opacity-35 border border-dashed border-[#D23B38]/60 bg-[#FAF8F5]'
          : isStruck
          ? 'bg-transparent text-[#8E8F95]'
          : isMinimal
          ? 'text-[#2B2C30] hover:bg-[#F2EDE4]/40'
          : isComfortable
          ? 'hover:bg-[#F2EDE4]/70 text-[#2B2C30]'
          : 'text-[#2B2C30] bg-[#FAF8F5]/80 hover:bg-white shadow-2xs'
      } ${className}`}
      title="Double-click to edit note • Drag handle to reorder"
    >
      {/* Drop Target Indicator: Before */}
      {activeDropIndicator === 'before' && (
        <div
          className={`absolute -top-[1px] ${
            isMinimal ? 'left-0 right-0' : 'left-1 right-1'
          } h-[2px] bg-[#D23B38] z-30 pointer-events-none rounded-full flex items-center shadow-xs`}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-[#D23B38] -ml-0.5" />
        </div>
      )}

      {/* Drop Target Indicator: After */}
      {activeDropIndicator === 'after' && (
        <div
          className={`absolute -bottom-[1px] ${
            isMinimal ? 'left-0 right-0' : 'left-1 right-1'
          } h-[2px] bg-[#D23B38] z-30 pointer-events-none rounded-full flex items-center shadow-xs`}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-[#D23B38] -ml-0.5" />
        </div>
      )}

      {/* Reserved Left Slot: Holds Color Bullet at rest, Drag Handle on hover/drag */}
      <div
        className={`shrink-0 flex items-center justify-center ${
          isComfortable ? 'w-4 h-5 mt-0.5' : 'w-3.5 h-4 mt-0.5'
        }`}
      >
        {/* Drag Handle: Shown on hover or when dragging */}
        {isDraggable && (
          <div
            onMouseEnter={() => setCanDrag(true)}
            onMouseLeave={() => {
              if (!isDraggingSelf) setCanDrag(false);
            }}
            onPointerDown={() => setCanDrag(true)}
            onPointerUp={() => {
              if (!isDraggingSelf) setCanDrag(false);
            }}
            className={`cursor-grab active:cursor-grabbing text-[#A19D94] hover:text-[#2B2C30] items-center justify-center w-full h-full rounded transition-colors ${
              isBeingDragged || isDraggingSelf ? 'flex' : 'hidden group-hover:flex'
            }`}
            title="Drag to reorder note"
          >
            <GripVertical className={isComfortable ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
          </div>
        )}

        {/* Resting Indicator: Color tag dot or default subtle bullet dot (Hidden when hovered or dragging if draggable) */}
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 transition-opacity ${
            isStruck ? 'opacity-40' : ''
          } ${
            isBeingDragged || isDraggingSelf
              ? 'hidden'
              : isDraggable
              ? 'block group-hover:hidden'
              : 'block'
          }`}
          style={{ backgroundColor: colorTag || '#A19D94' }}
        />
      </div>

      {/* Note Content with Realistic Graphite Strike Line & Word-Level Diffs */}
      <div className="flex-1 min-w-0">
        <div className="relative inline font-sans leading-relaxed break-words">
          {isStruck ? (
            // Full note strike overrides inner diffs with graphite pencil strike
            <span className="line-through decoration-[#A19D94] decoration-2">
              {content || originalContent || '(empty note)'}
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
                return <span key={idx}>{chunk.value}</span>;
              })}
            </span>
          ) : (
            <span>{content || '(empty note)'}</span>
          )}

          {/* Audit Trail Badge */}
          {hasEdits && !isStruck && (
            <span
              className={`ml-1.5 text-[8px] font-mono px-1 py-0.2 rounded border uppercase tracking-wider ${
                content === ''
                  ? 'text-[#D23B38] bg-[#FDEDEC] border-[#FADBD8]'
                  : 'text-[#1E7B48] bg-[#E8F5E9] border-[#C8E6C9]'
              }`}
              title={
                content === ''
                  ? 'All text deleted (crossed out)'
                  : `Original: "${originalContent}"`
              }
            >
              {content === '' ? 'deleted' : 'edited'}
            </span>
          )}
        </div>

        {/* Optional Sub-badge (Multi-day span, multi-week tag, etc.) */}
        {badge}
      </div>

      {/* Note Action Cluster: Strikethrough, Edit & Delete (Hidden at rest, revealed on hover/interaction) */}
      <div
        className={`flex items-center gap-0.5 shrink-0 ml-1 transition-opacity ${
          isBeingDragged || isDraggingSelf ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {/* Strike Action Button (Analog Pencil Scratch) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStrike(id);
          }}
          className={`text-[#71727A] hover:text-[#2B2C30] hover:bg-[#EAE3D6] rounded transition-all ${
            isComfortable ? 'p-1' : 'p-0.5'
          } ${isStruck ? 'text-[#2B2C30]' : ''}`}
          title={isStruck ? 'Restore / Unstrike' : 'Cross out / Strike through'}
        >
          <Strikethrough className={isComfortable ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
        </button>

        {/* Edit Button */}
        <button
          type="button"
          onClick={handleStartEdit}
          className={`text-[#71727A] hover:text-[#2B2C30] hover:bg-[#EAE3D6] rounded transition-all ${
            isComfortable ? 'p-1' : 'p-0.5'
          }`}
          title="Edit note (or double-click text)"
        >
          <Pencil className={isComfortable ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
        </button>

        {/* Delete / Remove Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(id);
          }}
          className={`text-[#8E8F95] hover:text-[#D23B38] hover:bg-[#FDEDEC] rounded transition-all ${
            isComfortable ? 'p-1' : 'p-0.5'
          }`}
          title="Delete note permanently"
        >
          <Trash2 className={isComfortable ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
        </button>
      </div>
    </div>
  );
};
