import React, { useEffect, useState, useMemo } from 'react';
import { SUGGESTED_TAGS, resolveAnnotation } from '../../utils/annotationUtils';
import type { QuickTagOption } from '../../utils/annotationUtils';

export interface AnnotationAutocompleteProps {
  isOpen: boolean;
  query: string;
  onSelectTag: (tag: string) => void;
  onClose: () => void;
  className?: string;
}

export const AnnotationAutocomplete: React.FC<AnnotationAutocompleteProps> = ({
  isOpen,
  query,
  onSelectTag,
  onClose,
  className = '',
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const cleanQuery = query.trim().toLowerCase();

  const filteredOptions: QuickTagOption[] = useMemo(() => {
    // If user types digits (e.g. "4", "10", "9:30"), suggest times
    if (/^\d/.test(cleanQuery)) {
      const timeSuggestions: QuickTagOption[] = [];

      if (!cleanQuery.includes(':')) {
        timeSuggestions.push(
          {
            tag: `${cleanQuery}:00pm`,
            label: `@${cleanQuery}:00pm`,
            description: `Schedule at ${cleanQuery}:00 PM`,
            color: '#8E8F95',
            type: 'time',
          },
          {
            tag: `${cleanQuery}:30pm`,
            label: `@${cleanQuery}:30pm`,
            description: `Schedule at ${cleanQuery}:30 PM`,
            color: '#8E8F95',
            type: 'time',
          },
          {
            tag: `${cleanQuery}:00am`,
            label: `@${cleanQuery}:00am`,
            description: `Schedule at ${cleanQuery}:00 AM`,
            color: '#8E8F95',
            type: 'time',
          }
        );
      } else {
        timeSuggestions.push(
          {
            tag: `${cleanQuery}pm`,
            label: `@${cleanQuery}pm`,
            description: `Schedule at ${cleanQuery} PM`,
            color: '#8E8F95',
            type: 'time',
          },
          {
            tag: `${cleanQuery}am`,
            label: `@${cleanQuery}am`,
            description: `Schedule at ${cleanQuery} AM`,
            color: '#8E8F95',
            type: 'time',
          }
        );
      }
      return timeSuggestions;
    }

    if (!cleanQuery) {
      return SUGGESTED_TAGS;
    }

    const matches = SUGGESTED_TAGS.filter(
      (opt) =>
        opt.tag.toLowerCase().includes(cleanQuery) ||
        opt.description.toLowerCase().includes(cleanQuery)
    );

    // If query does not exactly match an existing tag, allow creating custom tag
    if (cleanQuery.length > 0 && !matches.some((m) => m.tag.toLowerCase() === cleanQuery)) {
      const resolved = resolveAnnotation(cleanQuery);
      matches.push({
        tag: cleanQuery,
        label: `@${cleanQuery}`,
        description: resolved.type === 'custom' ? `Custom annotation @${cleanQuery}` : resolved.label,
        color: resolved.color,
        type: resolved.type,
      });
    }

    return matches;
  }, [cleanQuery]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [cleanQuery]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredOptions.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredOptions.length) % Math.max(1, filteredOptions.length));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredOptions.length > 0 && filteredOptions[selectedIndex]) {
          e.preventDefault();
          e.stopPropagation();
          onSelectTag(filteredOptions[selectedIndex].tag);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, filteredOptions, selectedIndex, onSelectTag, onClose]);

  if (!isOpen || filteredOptions.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Annotation suggestions"
      className={`absolute z-50 min-w-[240px] max-w-xs bg-[#FAF8F5] border border-[#DDD6C8] rounded-lg shadow-lg overflow-hidden py-1 text-xs animate-in fade-in zoom-in-95 duration-100 ${className}`}
      onMouseDown={(e) => e.preventDefault()} // Prevent textarea blur
    >
      <div className="px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider text-[#8E8F95] border-b border-[#EFECE6] flex items-center justify-between">
        <span>Note Annotations</span>
        <span>↑↓ to navigate • ↵ to select</span>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {filteredOptions.map((opt, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <button
              key={opt.tag}
              type="button"
              onClick={() => onSelectTag(opt.tag)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`w-full text-left px-2.5 py-1.5 flex items-center gap-2 cursor-pointer transition-colors ${
                isSelected ? 'bg-[#EAE3D6] text-[#2B2C30]' : 'text-[#55565B] hover:bg-[#F2EDE4]'
              }`}
            >
              {/* Dot color indicator */}
              <span
                className="w-2 h-2 rounded-full shrink-0 shadow-2xs"
                style={{ backgroundColor: opt.color }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-xs text-[#2B2C30]">
                    {opt.label}
                  </span>
                </div>
                <div className="text-[10px] text-[#7E7F85] truncate leading-tight">
                  {opt.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
