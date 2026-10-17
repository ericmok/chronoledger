import React, { useState, useMemo } from 'react';
import { Strikethrough, Pencil, Trash2, Check, X, GripVertical } from 'lucide-react';
import { computeWordDiff } from '../../utils/diffUtils';
import { parseNoteContent, getNoteBulletColor, toggleAnnotationResolution } from '../../utils/annotationUtils';
import { useAnnotationInput } from '../../hooks/useAnnotationInput';
import { AnnotationAutocomplete } from './AnnotationAutocomplete';

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

  const parsedNote = useMemo(
    () => parseNoteContent(content || originalContent || ''),
    [content, originalContent]
  );

  const bulletColor = useMemo(
    () => getNoteBulletColor(content || originalContent || '', colorTag),
    [content, originalContent, colorTag]
  );

  const isBulletResolved = useMemo(
    () =>
      Boolean(
        isStruck ||
          (parsedNote.leadingAnnotation
            ? parsedNote.leadingAnnotation.isResolved
            : parsedNote.annotations.length > 0 &&
              parsedNote.annotations.every((a) => a.isResolved))
      ),
    [isStruck, parsedNote]
  );

  // Strip leading annotation tag from note body so text starts flush and aligned
  const displayedContent = useMemo(() => {
    const raw = content || originalContent || '';
    if (!parsedNote.leadingAnnotation) return raw;
    const regex = /^\s*(?:~~)?@[a-zA-Z0-9]+(?:[:.-][a-zA-Z0-9]+)*(?:[ap]m)?(?:~~)?\s*/i;
    return raw.replace(regex, '');
  }, [content, originalContent, parsedNote.leadingAnnotation]);

  const annotationInput = useAnnotationInput(editText, setEditText);

  const diffChunks = useMemo(() => {
    if (!hasEdits || !originalContent) return [];
    const origRegex = /^\s*(?:~~)?@[a-zA-Z0-9]+(?:[:.-][a-zA-Z0-9]+)*(?:[ap]m)?(?:~~)?\s*/i;
    const cleanOrig = parsedNote.leadingAnnotation
      ? originalContent.replace(origRegex, '')
      : originalContent;
    return computeWordDiff(cleanOrig, displayedContent);
  }, [hasEdits, originalContent, displayedContent, parsedNote.leadingAnnotation]);

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
        className={`relative flex items-center gap-1.5 w-full my-1 p-1 bg-white border border-[#2B2C30] rounded-lg shadow-xs animate-in fade-in duration-100 ${className}`}
      >
        <input
          autoFocus
          type="text"
          value={editText}
          onChange={(e) => {
            setEditText(e.target.value);
            annotationInput.updateCursor(e.target.value, e.target.selectionStart || 0);
          }}
          onKeyUp={(e) => {
            annotationInput.updateCursor(editText, (e.target as HTMLInputElement).selectionStart || 0);
          }}
          onClick={(e) => {
            annotationInput.updateCursor(editText, (e.target as HTMLInputElement).selectionStart || 0);
          }}
          onKeyDown={(e) => {
            if (annotationInput.isOpen && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
              return; // Handled by AnnotationAutocomplete
            }
            if (e.key === 'Escape') handleCancelEdit();
          }}
          className={`flex-1 bg-transparent border-0 text-[#2B2C30] focus:outline-hidden font-sans placeholder:text-[#A19D94] ${
            isComfortable ? 'px-3.5 py-2 text-sm' : 'px-2 py-1 text-xs'
          }`}
          placeholder="Edit note... (type @ for tags, Enter to save, Esc to cancel)"
        />

        <AnnotationAutocomplete
          isOpen={annotationInput.isOpen}
          query={annotationInput.query}
          onSelectTag={annotationInput.selectTag}
          onClose={annotationInput.close}
          className="top-full left-0 mt-1"
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

  /**
   * Renders note body text by parsing micro-badges and clean plain text.
   * - Escaped tags (e.g. `\@todo`) have their escaping backslash stripped here for clean reading.
   * - In edit mode, the raw stored text (with backslash) is loaded in the input field.
   * - Inline / middle-of-note badges render with an indicator dot on the left.
   * - Badges can be clicked to toggle their markdown resolution state (`@tag` <-> `~~@tag~~`).
   * - Badges marked `isDeleted` in a word diff cannot be clicked to prevent state corruption.
   */
  const renderAnnotatedText = (
    text: string,
    isDeleted = false,
    isAdded = false
  ) => {
    const { segments } = parseNoteContent(text);
    return segments.map((seg, idx) => {
      if (seg.type === 'badge' && seg.annotation) {
        const badge = seg.annotation;
        const isResolved = Boolean(isStruck || badge.isResolved);

        return (
          <button
            key={idx}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isDeleted) return;
              if (onUpdate) {
                const current = content || originalContent || '';
                const newContent = toggleAnnotationResolution(current, badge.raw);
                onUpdate(id, newContent);
              }
            }}
            className={`inline-flex items-center gap-1 px-1.5 py-0.2 mx-0.5 rounded text-[10px] font-mono font-medium tracking-tight border select-none transition-all align-baseline ${
              isDeleted ? 'cursor-default' : 'cursor-pointer hover:scale-105 active:scale-95'
            } ${
              isResolved
                ? 'line-through opacity-70 bg-[#F4F1EA]/80 border-[#DDD6C8]'
                : isDeleted
                ? 'line-through opacity-50'
                : isAdded
                ? 'ring-1 ring-[#1E7B48]/30 shadow-2xs'
                : 'shadow-2xs'
            }`}
            style={{
              backgroundColor: isResolved ? undefined : badge.bgColor,
              color: isResolved ? '#7E7F85' : badge.textColor,
              borderColor: isResolved ? undefined : badge.borderColor,
            }}
            title={
              isDeleted
                ? `${badge.label} (Deleted)`
                : `${badge.label} (${isResolved ? 'Resolved' : 'Active'}): Click to toggle`
            }
          >
            {/* Inline / Middle Badge: Indicator dot on the left */}
            <svg className="w-2 h-2 shrink-0 overflow-visible" viewBox="0 0 8 8">
              <circle
                cx="4"
                cy="4"
                r="3"
                fill={badge.color}
                opacity={isResolved ? 0.6 : 1}
              />
              {isResolved && (
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
            <span>{badge.tag}</span>
          </button>
        );
      }

      if (isDeleted) {
        return (
          <span
            key={idx}
            className="inline line-through decoration-[#D23B38] decoration-[1.5px] text-[#D23B38] opacity-60 font-serif mr-1 selection:bg-[#D23B38]/20"
            title="Deleted word"
          >
            {seg.text}
          </span>
        );
      }

      if (isAdded) {
        return (
          <span
            key={idx}
            className="inline text-[#1E7B48] font-medium bg-[#E8F5E9]/60 px-0.5 rounded-xs mr-0.5"
            title="Added word"
          >
            {seg.text}
          </span>
        );
      }

      return <span key={idx}>{seg.text}</span>;
    });
  };

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
      className={`group relative flex items-start ${
        isMinimal ? 'gap-1' : 'gap-1.5'
      } transition-all duration-150 cursor-pointer ${
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

      {/* Reserved Left Slot: Holds Color Bullet at rest, Leading Badge if present, Drag Handle on hover/drag */}
      <div
        className={`shrink-0 flex items-center justify-end relative ${
          isComfortable ? 'w-4 h-5 mt-0.5' : 'w-3.5 h-4 mt-0.5'
        }`}
      >
        {parsedNote.leadingAnnotation ? (
          <div className="relative flex items-center justify-end w-full h-full">
            {/* Drag Handle: Shown on hover or when dragging, positioned to the left of the badge */}
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
                className={`cursor-grab active:cursor-grabbing text-[#A19D94] hover:text-[#2B2C30] items-center justify-center rounded transition-colors absolute right-full mr-1 h-5 ${
                  isBeingDragged || isDraggingSelf ? 'flex' : 'hidden group-hover:flex'
                }`}
                title="Drag to reorder note"
              >
                <GripVertical className={isComfortable ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
              </div>
            )}

            {/* Leading Badge: Replaces resting dot, right-aligned, dot on the right side */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onUpdate) {
                  const current = content || originalContent || '';
                  const newContent = toggleAnnotationResolution(current, parsedNote.leadingAnnotation!.raw);
                  onUpdate(id, newContent);
                }
              }}
              className={`absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded text-[10px] font-mono font-medium tracking-tight border select-none transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-2xs z-10 whitespace-nowrap ${
                isBulletResolved
                  ? 'line-through opacity-70 bg-[#F4F1EA]/80 border-[#DDD6C8]'
                  : 'shadow-2xs'
              }`}
              style={{
                backgroundColor: isBulletResolved ? undefined : parsedNote.leadingAnnotation.bgColor,
                color: isBulletResolved ? '#7E7F85' : parsedNote.leadingAnnotation.textColor,
                borderColor: isBulletResolved ? undefined : parsedNote.leadingAnnotation.borderColor,
              }}
              title={`${parsedNote.leadingAnnotation.label} (${isBulletResolved ? 'Resolved' : 'Active'}): Click to toggle`}
            >
              <span className="leading-none">{parsedNote.leadingAnnotation.tag}</span>
              {/* Dot on the right side of the badge */}
              <svg className="w-2 h-2 shrink-0 overflow-visible" viewBox="0 0 8 8">
                <circle
                  cx="4"
                  cy="4"
                  r="3.2"
                  fill={parsedNote.leadingAnnotation.color}
                  opacity={isBulletResolved ? 0.6 : 1}
                />
                {isBulletResolved && (
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
            </button>
          </div>
        ) : (
          /* Normal Note: Drag Handle on hover, Resting Bullet at rest */
          <>
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

            <svg
              className={`w-2 h-2 shrink-0 overflow-visible transition-opacity ${
                isBeingDragged || isDraggingSelf
                  ? 'hidden'
                  : isDraggable
                  ? 'block group-hover:hidden'
                  : 'block'
              }`}
              viewBox="0 0 8 8"
            >
              <circle
                cx="4"
                cy="4"
                r="3.2"
                fill={bulletColor}
                opacity={isBulletResolved ? 0.6 : 1}
              />
              {isBulletResolved && (
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
          </>
        )}
      </div>

      {/* Note Content with Realistic Graphite Strike Line & Micro-badges */}
      <div className="flex-1 min-w-0">
        <div className="relative inline font-sans leading-relaxed break-words">
          {isStruck ? (
            // Full note strike overrides inner diffs with graphite pencil strike
            <span className="line-through decoration-[#A19D94] decoration-2">
              {displayedContent || (parsedNote.hasLeadingAnnotation ? '' : '(empty note)')}
            </span>
          ) : hasEdits ? (
            // Render word-level diff with micro-badges recognized
            <span
              className={`inline whitespace-pre-wrap ${
                parsedNote.isImportant ? 'font-bold text-[#1C1D20]' : ''
              }`}
            >
              {diffChunks.map((chunk, idx) => (
                <React.Fragment key={idx}>
                  {renderAnnotatedText(
                    chunk.value,
                    chunk.type === 'deleted',
                    chunk.type === 'added'
                  )}
                </React.Fragment>
              ))}
            </span>
          ) : (
            <span
              className={`inline ${
                parsedNote.isImportant ? 'font-bold text-[#1C1D20]' : ''
              }`}
            >
              {renderAnnotatedText(
                displayedContent || (parsedNote.hasLeadingAnnotation ? '' : '(empty note)')
              )}
            </span>
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
