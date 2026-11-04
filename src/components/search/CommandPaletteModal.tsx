import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, Tag as TagIcon, Sparkles, Filter, Calendar as CalendarIcon, ArrowRight, CornerDownLeft, RefreshCw } from 'lucide-react';
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
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#FAF8F5] border border-[#DDD6C8] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#E5DFD5] bg-white/70">
          {isSearchingServer ? (
            <RefreshCw className="w-5 h-5 text-[#D97706] animate-spin shrink-0" />
          ) : (
            <Search className="w-5 h-5 text-[#8C827A] shrink-0" />
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
            placeholder="Search notes or filter tags (@todo[status=wip], @project[apollo], !@memo)..."
            className="flex-1 bg-transparent border-0 text-sm font-mono text-[#2B2C30] placeholder:text-[#A19D94] focus:outline-none"
          />

          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded text-[#8C827A] hover:text-[#2B2C30] hover:bg-[#F2EDE4]"
              title="Clear input"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handleApplyFilter}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-[#2B2C30] text-[#FAF8F5] hover:bg-[#404147] transition-colors cursor-pointer shrink-0"
            title="Filter timeline view by this query (Enter)"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filter</span>
            <CornerDownLeft className="w-3 h-3 text-[#A19D94]" />
          </button>
        </div>

        {/* Autocomplete Dropdown Pills */}
        {autocompleteSuggestions.length > 0 && (
          <div className="px-4 py-2 border-b border-[#E5DFD5] bg-[#F2EDE4]/60 flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-[11px] font-mono text-[#7E7F85] flex items-center gap-1 mr-1">
              <Sparkles className="w-3 h-3 text-[#D97706]" /> Suggestions:
            </span>
            {autocompleteSuggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectSuggestion(s.insertText)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-white hover:bg-[#FAF8F5] text-[#2B2C30] border border-[#DDD6C8] hover:border-[#2B2C30] transition-all cursor-pointer shadow-2xs"
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Filter State Banner */}
        {activeFilter && (
          <div className="px-4 py-2 bg-[#F2EDE4] border-b border-[#E5DFD5] flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-mono text-[#2B2C30]">
              <span className="text-[#7E7F85]">Timeline Active Filter:</span>
              <span className="px-1.5 py-0.5 bg-white rounded border border-[#DDD6C8] font-semibold text-[#D23B38]">
                {activeFilter}
              </span>
            </div>
            <button
              type="button"
              onClick={handleClearFilter}
              className="text-xs font-medium text-[#8C827A] hover:text-[#D23B38] cursor-pointer"
            >
              Clear Timeline Filter
            </button>
          </div>
        )}

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-[160px] max-h-[400px]">
          {query.trim() === '' ? (
            <div className="py-10 text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-[#F2EDE4] flex items-center justify-center text-[#7E7F85] mx-auto">
                <TagIcon className="w-5 h-5" />
              </div>
              <p className="text-xs font-serif font-medium text-[#2B2C30]">
                Search or filter with structured tag selectors
              </p>
              <div className="flex justify-center gap-2 text-[11px] font-mono text-[#7E7F85] flex-wrap max-w-md mx-auto">
                <span className="px-2 py-0.5 bg-[#F2EDE4] rounded border border-[#E5DFD5]">@todo[status=wip]</span>
                <span className="px-2 py-0.5 bg-[#F2EDE4] rounded border border-[#E5DFD5]">@project[apollo]</span>
                <span className="px-2 py-0.5 bg-[#F2EDE4] rounded border border-[#E5DFD5]">@*[color="#51C391"]</span>
                <span className="px-2 py-0.5 bg-[#F2EDE4] rounded border border-[#E5DFD5]">!@todo</span>
              </div>
            </div>
          ) : matchedNotes.length === 0 ? (
            <div className="py-10 text-center text-xs font-mono text-[#A19D94]">
              No notes match "{query}"
            </div>
          ) : (
            <>
              <div className="text-[11px] font-mono text-[#7E7F85] px-2 py-1">
                Found {matchedNotes.length} matching note(s):
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
                    className="p-2.5 rounded-xl border border-[#E5DFD5] bg-white hover:bg-[#F2EDE4]/50 hover:border-[#2B2C30]/40 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-sans text-[#2B2C30] truncate">
                        {note.isStruck ? (
                          <span className="line-through text-[#8C827A]">{note.content}</span>
                        ) : (
                          note.content
                        )}
                      </div>
                      {targetDate && (
                        <div className="flex items-center gap-1 text-[10px] font-mono text-[#8C827A] mt-0.5">
                          <CalendarIcon className="w-3 h-3" />
                          <span>{targetDate}</span>
                        </div>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#A19D94] group-hover:text-[#2B2C30] transition-colors shrink-0" />
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 border-t border-[#E5DFD5] bg-[#F2EDE4]/60 flex items-center justify-between text-[11px] font-mono text-[#7E7F85]">
          <span>Tip: Press Enter to lock timeline filter • Esc to close</span>
          {activeFilter && (
            <span className="text-[#D23B38] font-semibold">Filter Mode Active</span>
          )}
        </div>
      </div>
    </div>
  );
};
