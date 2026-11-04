import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Tag as TagIcon, Sparkles, Filter, Calendar as CalendarIcon, ArrowRight, CornerDownLeft, RefreshCw } from 'lucide-react';
import type { NoteItem } from '../../types/calendar';
import { matchesSelector, parseClientSelector } from '../../utils/selectorMatcher.ts';
import { CORE_TAG_PROTOTYPES } from '../../utils/tagPrototypes';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: NoteItem[];
  activeFilter: string | null;
  onApplyFilter: (selector: string | null) => void;
  onJumpToDate?: (dateKey: string) => void;
  onOpenFolio?: (noteId: string) => void;
}

/**
 * Sorts notes descending so the most recent (by target date or creation timestamp)
 * appear first at the top of the search results.
 */
function sortNotesByRecency(notesList: NoteItem[]): NoteItem[] {
  return [...notesList].sort((a, b) => {
    const targetA = (a.parentDates && a.parentDates[0]) || (a.targets && a.targets[0]) || '';
    const targetB = (b.parentDates && b.parentDates[0]) || (b.targets && b.targets[0]) || '';

    const timeA = targetA || a.startAt || a.updatedAt || a.createdAt || '';
    const timeB = targetB || b.startAt || b.updatedAt || b.createdAt || '';

    if (timeA !== timeB) {
      return timeB.localeCompare(timeA); // Descending: most recent first
    }

    const createdA = a.updatedAt || a.createdAt || '';
    const createdB = b.updatedAt || b.createdAt || '';
    return createdB.localeCompare(createdA);
  });
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  notes,
  activeFilter,
  onApplyFilter,
  onJumpToDate,
  onOpenFolio,
}) => {
  const [query, setQuery] = useState(activeFilter || '');
  const [serverResults, setServerResults] = useState<NoteItem[] | null>(null);
  const [isSearchingServer, setIsSearchingServer] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync with activeFilter when opened
  useEffect(() => {
    if (isOpen) {
      setQuery(activeFilter || '');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, activeFilter]);

  // Autocomplete suggestions based on current cursor text
  const autocompleteSuggestions = useMemo(() => {
    if (!query) return [];

    const lastWord = query.split(/\s+/).pop() || '';

    // If typing '@...'
    if (lastWord.startsWith('@') && !lastWord.includes('[')) {
      const partialTag = lastWord.slice(1).toLowerCase();
      const tags = Object.values(CORE_TAG_PROTOTYPES);
      return tags
        .filter((t) => t.tag.toLowerCase().includes(partialTag))
        .map((t) => ({
          type: 'tag' as const,
          label: `@${t.tag}`,
          insertText: `@${t.tag}`,
          description: `Tag prototype (${t.defaultStatus ? `default: ${t.defaultStatus}` : 'stationery'})`,
          color: t.color,
        }));
    }

    // If typing inside '[...'
    if (lastWord.includes('[') && !lastWord.includes(']')) {
      const suggestions = [
        { label: 'status=wip', desc: 'In-progress status' },
        { label: 'status=done', desc: 'Completed status' },
        { label: 'status=open', desc: 'Open actionable' },
        { label: 'priority<=2', desc: 'High priority numerical filter' },
        { label: 'priority=1', desc: 'Priority level 1' },
        { label: 'ref=*', desc: 'Any relational backlink' },
        { label: 'notable=true', desc: 'Notable date gutter dot' },
      ];
      return suggestions.map((s) => ({
        type: 'attr' as const,
        label: s.label,
        insertText: s.label,
        description: s.desc,
        color: '#6F7880',
      }));
    }

    return [];
  }, [query]);

  // Server-backed full SQLite search with 150ms debounce
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setServerResults(null);
      return;
    }

    const { terms, plainText } = parseClientSelector(trimmed);
    const tagTerms = terms.map((t) => {
      let termStr = t.isNegated ? `!@${t.tag}` : `@${t.tag}`;
      if (t.conditions && t.conditions.length > 0) {
        const condStrs = t.conditions.map((c) => {
          if (c.isPositional) return String(c.val);
          if (c.isPresence) return `${c.key}=*`;
          return `${c.key}${c.op}${c.val}`;
        });
        termStr += `[${condStrs.join(', ')}]`;
      }
      return termStr;
    });

    const selectorStr = tagTerms.join(' AND ');
    const params = new URLSearchParams();
    if (selectorStr) params.set('selector', selectorStr);
    if (plainText) params.set('text', plainText);

    const timer = setTimeout(async () => {
      setIsSearchingServer(true);
      try {
        const res = await fetch(`/api/notes/search?${params.toString()}`, { credentials: 'same-origin' });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.notes)) {
            setServerResults(data.notes);
          }
        }
      } catch {
        // Fall back gracefully to local in-memory matches
      } finally {
        setIsSearchingServer(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  // Hybrid matching: instantaneous in-memory local results merged with full SQLite server results
  const matchedNotes = useMemo(() => {
    if (!query.trim()) return [];
    const local = notes.filter((n) => matchesSelector(n.content, n.isStruck, query));
    if (!serverResults) return sortNotesByRecency(local);

    const map = new Map<string, NoteItem>();
    for (const n of local) map.set(n.id, n);
    for (const n of serverResults) {
      if (!map.has(n.id)) {
        map.set(n.id, n);
      }
    }
    return sortNotesByRecency(Array.from(map.values()));
  }, [notes, query, serverResults]);

  if (!isOpen) return null;

  const handleApplyFilter = () => {
    const trimmed = query.trim();
    onApplyFilter(trimmed ? trimmed : null);
    onClose();
  };

  const handleClearFilter = () => {
    setQuery('');
    onApplyFilter(null);
    onClose();
  };

  const handleSelectSuggestion = (insertText: string) => {
    const words = query.split(/\s+/);
    words.pop();
    const prefix = words.length > 0 ? words.join(' ') + ' ' : '';

    if (insertText.startsWith('@')) {
      setQuery(prefix + insertText);
    } else {
      // Inside brackets
      const lastWord = query.split(/\s+/).pop() || '';
      const bracketIdx = lastWord.indexOf('[');
      if (bracketIdx !== -1) {
        const tagPart = lastWord.slice(0, bracketIdx + 1);
        setQuery(prefix + tagPart + insertText + ']');
      } else {
        setQuery(query + insertText);
      }
    }
    inputRef.current?.focus();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150 font-ui"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-canvas border-2 border-canvas-border-strong shadow-2xl rounded-box flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150 text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-canvas-border bg-canvas-subtle">
          {isSearchingServer ? (
            <RefreshCw className="w-4 h-4 text-accent animate-spin shrink-0" />
          ) : (
            <span className="font-mono font-bold text-accent text-sm select-none">&gt;</span>
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleApplyFilter();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Search notes or filter tags (@todo, @project, etc.)..."
            className="flex-1 bg-transparent border-0 text-xs sm:text-sm font-mono text-ink placeholder:text-ink-strike focus:outline-none"
          />

          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded-btn text-ink-secondary hover:text-ink hover:bg-canvas-subtle-hover"
              title="Clear input"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handleApplyFilter}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded-btn bg-accent text-accent-fg hover:bg-accent-hover transition-colors cursor-pointer shrink-0"
            title="Filter timeline view by this query (Enter)"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filter</span>
            <CornerDownLeft className="w-3 h-3 text-accent-fg/70" />
          </button>
        </div>

        {/* Autocomplete Dropdown Pills */}
        {autocompleteSuggestions.length > 0 && (
          <div className="px-4 py-2 border-b border-canvas-border bg-canvas-subtle/50 flex items-center gap-1.5 flex-wrap text-xs font-mono">
            <span className="text-[11px] font-mono text-ink-secondary flex items-center gap-1 mr-1">
              <Sparkles className="w-3 h-3 text-accent" /> suggestions:
            </span>
            {autocompleteSuggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectSuggestion(s.insertText)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-badge text-xs font-mono font-medium bg-canvas hover:bg-canvas-subtle text-ink border border-canvas-border hover:border-accent transition-all cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Filter State Banner */}
        {activeFilter && (
          <div className="px-4 py-2 bg-today border-b border-accent/40 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-1.5 text-ink">
              <span className="text-ink-secondary">Active Filter:</span>
              <span className="px-1.5 py-0.2 bg-canvas border border-accent/40 font-bold text-accent rounded-badge">
                {activeFilter}
              </span>
            </div>
            <button
              type="button"
              onClick={handleClearFilter}
              className="text-xs font-mono font-medium text-ink-secondary hover:text-accent cursor-pointer"
            >
              Clear Filter
            </button>
          </div>
        )}

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-[160px] max-h-[400px] font-mono">
          {query.trim() === '' ? (
            <div className="py-10 text-center space-y-2">
              <div className="w-8 h-8 rounded-box bg-canvas-subtle border border-canvas-border flex items-center justify-center text-accent mx-auto">
                <TagIcon className="w-4 h-4" />
              </div>
              <p className="text-xs font-mono font-bold text-ink">
                Search or filter with structured tag selectors
              </p>
              <div className="flex justify-center gap-2 text-[11px] font-mono text-ink-secondary flex-wrap max-w-md mx-auto">
                <span className="px-2 py-0.5 bg-canvas-subtle border border-canvas-border rounded-badge">@todo[status=wip]</span>
                <span className="px-2 py-0.5 bg-canvas-subtle border border-canvas-border rounded-badge">@project[apollo]</span>
                <span className="px-2 py-0.5 bg-canvas-subtle border border-canvas-border rounded-badge">@*[color="#51C391"]</span>
                <span className="px-2 py-0.5 bg-canvas-subtle border border-canvas-border rounded-badge">!@todo</span>
              </div>
            </div>
          ) : matchedNotes.length === 0 ? (
            <div className="py-10 text-center text-xs font-mono text-ink-strike">
              No entries match "{query}"
            </div>
          ) : (
            <>
              <div className="text-[11px] font-mono text-ink-secondary px-2 py-1">
                Matched {matchedNotes.length} entry(s):
              </div>
              {matchedNotes.map((note) => {
                const targetDate = note.parentDates?.[0] || note.targets?.[0] || '';
                return (
                  <div
                    key={note.id}
                    onClick={() => {
                      if (targetDate && onJumpToDate) {
                        onJumpToDate(targetDate);
                        onClose();
                      } else if (onOpenFolio) {
                        onOpenFolio(note.id);
                        onClose();
                      }
                    }}
                    className="p-2.5 rounded-btn border border-canvas-border bg-canvas hover:bg-canvas-subtle hover:border-canvas-border-strong transition-all cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-mono text-ink truncate">
                        {note.isStruck ? (
                          <span className="line-through text-ink-strike">{note.content}</span>
                        ) : (
                          note.content
                        )}
                      </div>
                      {targetDate && (
                        <div className="flex items-center gap-1 text-[10px] font-mono text-ink-secondary mt-0.5">
                          <CalendarIcon className="w-3 h-3 text-accent" />
                          <span>{targetDate}</span>
                        </div>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-canvas-border-strong group-hover:text-accent transition-colors shrink-0" />
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 border-t border-canvas-border bg-canvas-subtle flex items-center justify-between text-[11px] font-mono text-ink-secondary">
          <span>Enter to filter • Esc to close</span>
          {activeFilter && (
            <span className="text-accent font-bold">Filter Active</span>
          )}
        </div>
      </div>
    </div>
  );
};
