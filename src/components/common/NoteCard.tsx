import React, { useState, useMemo } from 'react';
import { Strikethrough, Pencil, Trash2, Check, X, GripVertical, Eraser } from 'lucide-react';
import { computeWordDiff } from '../../utils/diffUtils';
import {
  parseNoteContent,
  splitNoteAnchorAndBody,
  toggleAnnotationResolution,
  type ParsedAnnotation,
  type BadgeTheme,
  DEFAULT_BADGE_THEME,
} from '../../utils/annotationUtils';
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
  onAcceptEdit?: (id: string) => void;
  onStartEdit?: (id: string) => void;
  density?: 'comfortable' | 'compact';
  variant?: 'card' | 'minimal';
  badgeTheme?: BadgeTheme;
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
  onAcceptEdit,
  onStartEdit,
  density = 'comfortable',
  variant = 'card',
  badgeTheme = DEFAULT_BADGE_THEME,
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

  // Split note into leading Anchor Tag (if present) and Prose Body
  const currentSplit = useMemo(
    () => splitNoteAnchorAndBody(content || originalContent || '', isStruck, badgeTheme),
    [content, originalContent, isStruck, badgeTheme]
  );

  const originalSplit = useMemo(
    () => (originalContent ? splitNoteAnchorAndBody(originalContent, isStruck, badgeTheme) : null),
    [originalContent, isStruck, badgeTheme]
  );

  // Body diff engine: strictly compares prose body after the leading anchor
  const bodyDiffChunks = useMemo(() => {
    if (!originalSplit) return [];
    return computeWordDiff(originalSplit.bodyText, currentSplit.bodyText);
  }, [originalSplit, currentSplit]);

  // Track if the anchor itself was replaced, added, or removed
  const anchorReplaced = Boolean(
    originalSplit?.anchor &&
      (!currentSplit.anchor || originalSplit.anchor.tag !== currentSplit.anchor.tag)
  );

  const anchorAdded = Boolean(
    originalSplit && !originalSplit.anchor && currentSplit.anchor
  );

  const hasBodyEdits = bodyDiffChunks.some(
    (c) => c.type === 'added' || c.type === 'deleted'
  );

  const hasEdits = Boolean(
    originalSplit && (hasBodyEdits || anchorReplaced || anchorAdded)
  );

  const parsedNote = useMemo(
    () => parseNoteContent(content || originalContent || '', isStruck, badgeTheme),
    [content, originalContent, isStruck, badgeTheme]
  );

  const isBulletResolved = useMemo(
    () =>
      Boolean(
        isStruck ||
          (currentSplit.anchor
            ? currentSplit.anchor.isResolved
            : parsedNote.annotations.length > 0 &&
              parsedNote.annotations.every((a) => a.isResolved))
      ),
    [isStruck, currentSplit.anchor, parsedNote]
  );

  const bulletColor = useMemo(() => {
    if (currentSplit.anchor) {
      return isBulletResolved && currentSplit.anchor.resolvedColor
        ? currentSplit.anchor.resolvedColor
        : currentSplit.anchor.color;
    }
    if (parsedNote.primaryAnnotation) {
      return isBulletResolved && parsedNote.primaryAnnotation.resolvedColor
        ? parsedNote.primaryAnnotation.resolvedColor
        : parsedNote.primaryAnnotation.color;
    }
    return colorTag || '#A19D94';
  }, [currentSplit.anchor, parsedNote.primaryAnnotation, isBulletResolved, colorTag]);

  const annotationInput = useAnnotationInput(editText, setEditText);

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
  /**
   * Renders the note's Anchor Badge (fused with the bullet dot at x = 0).
   * Exclusively handles the leading tag at the start of the note.
   */
  const renderAnchorBadge = (anchor: ParsedAnnotation, isAdded = false) => {
    const isResolved = Boolean(isStruck || anchor.isResolved);
    const bgColor = isResolved ? anchor.resolvedBgColor : anchor.bgColor;
    const textColor = isResolved ? anchor.resolvedTextColor : anchor.textColor;
    const bulletColor = isResolved
      ? (anchor.resolvedBulletColor || anchor.resolvedColor)
      : (anchor.bulletColor || anchor.color);

    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (onUpdate) {
            const current = content || originalContent || '';
            const newContent = toggleAnnotationResolution(current, anchor.raw);
            onUpdate(id, newContent);
          }
        }}
        onMouseEnter={() => {
          if (isDraggable) setCanDrag(true);
        }}
        onMouseLeave={() => {
          if (!isDraggingSelf) setCanDrag(false);
        }}
        onPointerDown={() => {
          if (isDraggable) setCanDrag(true);
        }}
        onPointerUp={() => {
          if (!isDraggingSelf) setCanDrag(false);
        }}
        className={`inline-flex items-center gap-1 ${
          isComfortable
            ? '-ml-5 mr-1.5 pl-1.5 pr-2 py-[3.5px]'
            : '-ml-4 mr-1.5 pl-1 pr-1.5 py-[2.5px]'
        } rounded text-[11px] font-sans font-semibold select-none transition-all align-baseline leading-none border-none outline-none ring-0 focus:outline-none focus:ring-0 ${
          isAdded ? '-rotate-[3deg] origin-[20%_50%]' : ''
        } ${
          isDraggable
            ? 'cursor-grab active:cursor-grabbing hover:brightness-105'
            : 'cursor-pointer hover:scale-105 active:scale-95'
        } ${
          isResolved ? 'line-through opacity-75' : ''
        }`}
        style={{
          backgroundColor: bgColor,
          color: textColor,
          border: 'none',
          outline: 'none',
          boxShadow: 'none',
          transformOrigin: isAdded ? '20% 50%' : undefined,
        }}
        title={`${anchor.label} (${isResolved ? 'Resolved' : 'Active'}): Click to toggle • Drag to reorder`}
      >
        <span className="w-2.5 h-2.5 flex items-center justify-center shrink-0">
          {isDraggable && (
            <GripVertical
              className={`w-2.5 h-2.5 ${
                isBeingDragged || isDraggingSelf ? 'block' : 'hidden group-hover:block'
              }`}
              style={{ color: textColor }}
            />
          )}
          <svg
            className={`w-2 h-2 overflow-visible ${
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
              opacity={isResolved ? 0.65 : 1}
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
        </span>
        <span className="leading-none">{anchor.tag}</span>
      </button>
    );
  };

  /**
   * Renders an Inline Tag Badge inside the sentence prose.
   * Never receives negative margins, bullet dots, or drag handles.
   * If deleted in a diff, renders in category badge color with lower opacity and strikethrough, without a `-` prefix.
   */
  const renderInlineBadge = (
    badge: ParsedAnnotation,
    key: string | number,
    isDeleted = false,
    isAdded = false
  ) => {
    const isResolved = Boolean(isStruck || badge.isResolved);
    const bgColor = isResolved ? badge.resolvedBgColor : badge.bgColor;
    const textColor = isResolved ? badge.resolvedTextColor : badge.textColor;
    const bulletColor = isResolved
      ? (badge.resolvedBulletColor || badge.resolvedColor)
      : (badge.bulletColor || badge.color);

    return (
      <button
        key={key}
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
        className={`inline-flex items-center gap-1 ${
          isComfortable ? 'mx-0.5 pl-1.5 pr-2 py-[3.5px]' : 'mx-0.5 pl-1 pr-1.5 py-[2.5px]'
        } rounded text-[11px] font-sans font-semibold select-none transition-all align-baseline leading-none border-none outline-none ring-0 focus:outline-none focus:ring-0 ${
          isAdded ? '-rotate-[3deg] origin-[20%_50%]' : ''
        } ${
          isDeleted
            ? 'cursor-default line-through decoration-[#2B2C30] decoration-[1.5px] opacity-50'
            : isResolved
            ? 'cursor-pointer hover:scale-105 active:scale-95 line-through opacity-75'
            : 'cursor-pointer hover:scale-105 active:scale-95'
        }`}
        style={{
          backgroundColor: bgColor,
          color: textColor,
          border: 'none',
          outline: 'none',
          boxShadow: 'none',
          transformOrigin: isAdded ? '20% 50%' : undefined,
        }}
        title={
          isDeleted
            ? `${badge.label} (Deleted tag)`
            : isAdded
            ? `${badge.label} (Newly added tag): Click to toggle`
            : `${badge.label} (${isResolved ? 'Resolved' : 'Active'}): Click to toggle`
        }
      >
        <span className="w-2.5 h-2.5 flex items-center justify-center shrink-0">
          <svg className="w-2 h-2 overflow-visible" viewBox="0 0 8 8">
            <circle
              cx="4"
              cy="4"
              r="3.2"
              fill={bulletColor}
              opacity={isResolved ? 0.65 : 1}
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
        </span>
        <span className="leading-none">{badge.tag}</span>
      </button>
    );
  };

  /**
   * Renders body text and inline micro-badges.
   */
  const renderAnnotatedText = (
    text: string,
    isDeleted = false,
    isAdded = false
  ) => {
    const { segments } = parseNoteContent(text);
    return segments.map((seg, idx) => {
      if (seg.type === 'badge' && seg.annotation) {
        return renderInlineBadge(seg.annotation, idx, isDeleted, isAdded);
      }

      if (seg.type === 'text') {
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
      }

      return null;
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
      className={`group relative flex items-start transition-all duration-150 cursor-pointer ${
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

      {/* Standalone Left Slot: Rendered ONLY when note has NO leading anchor badge */}
      {!currentSplit.anchor && (
        <div
          className={`absolute ${
            isComfortable
              ? 'left-2 top-1 w-5 h-5.5'
              : isMinimal
              ? 'left-0.5 top-1.5 w-4 h-5'
              : 'left-1 top-1 w-4 h-5'
          } flex items-center justify-center shrink-0 pointer-events-auto`}
        >
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
        </div>
      )}

      {/* Note Content */}
      <div className={`flex-1 min-w-0 ${isComfortable ? 'pl-5' : 'pl-4'}`}>
        <div className="relative inline font-sans leading-relaxed break-words">
          {/* 1. Leading Anchor Badge: Rendered as first inline element with -ml-5 to anchor at x=0 */}
          {currentSplit.anchor &&
            renderAnchorBadge(
              currentSplit.anchor,
              Boolean(hasEdits && (anchorAdded || anchorReplaced))
            )}

          {/* 2. Body Content (or Body Diff) */}
          {isStruck ? (
            // Full note strike overrides inner diffs with graphite pencil strike
            <span className="line-through decoration-[#A19D94] decoration-2">
              {renderAnnotatedText(
                currentSplit.bodyText || (!currentSplit.anchor ? '(empty note)' : '')
              )}
            </span>
          ) : hasEdits ? (
            // Render word-level diff of the body
            <span
              className={`inline whitespace-pre-wrap ${
                parsedNote.isImportant ? 'font-bold text-[#1C1D20]' : ''
              }`}
            >
              {/* If an old leading anchor was replaced or removed, render it as a struck deleted badge at start of body */}
              {anchorReplaced && originalSplit?.anchor && (
                <>
                  {renderInlineBadge(originalSplit.anchor, 'deleted-anchor', true, false)}
                  {' '}
                </>
              )}
              {bodyDiffChunks.map((chunk, idx) => (
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
                currentSplit.bodyText || (!currentSplit.anchor ? '(empty note)' : '')
              )}
            </span>
          )}

          {/* Clean Revisions Action (Eraser Icon) - Revealed on hover / focus */}
          {hasEdits && !isStruck && (
            <span className="inline-flex items-center gap-1 ml-1.5 align-middle select-none">
              {content === '' && (
                <span
                  className="text-[8px] font-mono px-1 py-0.2 rounded border uppercase tracking-wider text-[#D23B38] bg-[#FDEDEC] border-[#FADBD8]"
                  title="All text deleted (crossed out)"
                >
                  deleted
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onAcceptEdit) {
                    onAcceptEdit(id);
                  } else if (onUpdate) {
                    onUpdate(id, content || '');
                  }
                }}
                className="p-1 rounded bg-[#EAE3D6]/70 hover:bg-[#D5CDC0] text-[#71727A] hover:text-[#2B2C30] cursor-pointer transition-opacity opacity-0 group-hover:opacity-100 focus:opacity-100 group-focus-within:opacity-100 shadow-2xs inline-flex items-center justify-center align-middle"
                title="Clean revision scribbles"
                aria-label="Clean revision scribbles"
              >
                <Eraser className="w-2.5 h-2.5" />
              </button>
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
