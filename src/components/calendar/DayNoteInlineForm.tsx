import React, { useState, useMemo, useRef } from 'react';
import { Check, Plus } from 'lucide-react';
import { analyzeDateSpan, parseDateKey, formatDateKey } from '../../utils/dateUtils';
import { NOTE_ACCENT_COLORS } from '../../types/calendar';
import { useAnnotationInput } from '../../hooks/useAnnotationInput';
import { AnnotationAutocomplete } from '../common/AnnotationAutocomplete';
import { handleSmartMarkdownKeyDown, autoResizeTextarea } from '../../utils/editorUtils';

export interface DayNoteInlineFormProps {
  initialContent?: string;
  initialDates?: string[];
  initialColorTag?: string;
  currentDate: string;
  onSubmit: (content: string, parentDates: string[], colorTag?: string) => void;
  onCancel: () => void;
  submitLabel?: string;
}

export const DayNoteInlineForm: React.FC<DayNoteInlineFormProps> = ({
  initialContent = '',
  initialDates = [],
  initialColorTag,
  currentDate,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
}) => {
  const [content, setContent] = useState(initialContent);
  const [colorTag, setColorTag] = useState<string | undefined>(initialColorTag);

  const initialSpan = useMemo(() => {
    const dates = initialDates.length > 0 ? initialDates : [currentDate];
    return analyzeDateSpan(dates);
  }, [initialDates, currentDate]);

  const [mode, setMode] = useState<'single' | 'span' | 'multi'>(() => {
    if (initialDates.length > 1) {
      return initialSpan.isContiguous ? 'span' : 'multi';
    }
    return 'single';
  });

  const [startDate, setStartDate] = useState(initialSpan.startDate || currentDate);
  const [endDate, setEndDate] = useState(initialSpan.endDate || currentDate);
  const [customDates, setCustomDates] = useState<string[]>(
    initialDates.length > 0 ? initialDates : [currentDate]
  );
  const [newDateInput, setNewDateInput] = useState('');

  const spannedDates = useMemo(() => {
    if (mode !== 'span') return [];
    const d1 = parseDateKey(startDate);
    const d2 = parseDateKey(endDate);
    const start = d1 < d2 ? d1 : d2;
    const end = d1 < d2 ? d2 : d1;

    const list: string[] = [];
    const curr = new Date(start);
    while (curr <= end) {
      list.push(formatDateKey(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return list;
  }, [mode, startDate, endDate]);

  const handleAddCustomDate = () => {
    if (newDateInput && !customDates.includes(newDateInput)) {
      setCustomDates([...customDates, newDateInput].sort());
      setNewDateInput('');
    }
  };

  const handleRemoveCustomDate = (dateToRemove: string) => {
    if (customDates.length > 1) {
      setCustomDates(customDates.filter((d) => d !== dateToRemove));
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    let targetDates: string[];
    if (mode === 'single') {
      targetDates = [currentDate];
    } else if (mode === 'span') {
      targetDates = spannedDates.length > 0 ? spannedDates : [currentDate];
    } else {
      targetDates = customDates.length > 0 ? customDates : [currentDate];
    }

    onSubmit(trimmed, targetDates, colorTag);
  };

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const annotationInput = useAnnotationInput(content, setContent);

  return (
    <form
      onSubmit={handleSubmit}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="p-2.5 bg-white border border-[#2B2C30]/80 rounded-xl shadow-sm space-y-2.5 text-xs font-sans animate-in fade-in duration-100"
    >
      {/* Content Textarea with Autocomplete */}
      <div className="relative">
        <textarea
          autoFocus
          ref={(el) => {
            textareaRef.current = el;
            autoResizeTextarea(el, 85, 360);
          }}
          rows={3}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            autoResizeTextarea(e.target, 85, 360);
            annotationInput.updateCursor(e.target.value, e.target.selectionStart || 0);
          }}
          onKeyUp={(e) => {
            annotationInput.updateCursor(content, (e.target as HTMLTextAreaElement).selectionStart || 0);
          }}
          onClick={(e) => {
            annotationInput.updateCursor(content, (e.target as HTMLTextAreaElement).selectionStart || 0);
          }}
          onKeyDown={(e) => {
            handleSmartMarkdownKeyDown(
              e,
              content,
              (val) => {
                setContent(val);
                setTimeout(() => autoResizeTextarea(textareaRef.current, 85, 360), 0);
              },
              () => handleSubmit(),
              () => onCancel(),
              annotationInput.isOpen
            );
          }}
          placeholder="Write a note... supports markdown (type @ for tags, Enter for newline, ⌘↵ to save)"
          className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#DDD6C8] rounded-md focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#2B2C30] placeholder:text-[#A19D94] resize-none leading-relaxed"
        />

        <AnnotationAutocomplete
          isOpen={annotationInput.isOpen}
          query={annotationInput.query}
          onSelectTag={annotationInput.selectTag}
          onClose={annotationInput.close}
          className="top-full left-0 mt-1"
        />
      </div>

      {/* Scope Mode Selector */}
      <div className="grid grid-cols-3 gap-0.5 p-0.5 bg-[#F2EDE4] rounded-lg text-[10px] font-mono font-medium max-w-xs">
        <button
          type="button"
          onClick={() => setMode('single')}
          className={`py-1 rounded-md transition-all cursor-pointer ${
            mode === 'single' ? 'bg-[#FAF8F5] text-[#2B2C30] font-bold shadow-2xs' : 'text-[#71727A] hover:text-[#2B2C30]'
          }`}
        >
          Single Day
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('span');
            if (endDate === startDate) {
              const next = new Date(parseDateKey(startDate));
              next.setDate(next.getDate() + 1);
              setEndDate(formatDateKey(next));
            }
          }}
          className={`py-1 rounded-md transition-all cursor-pointer ${
            mode === 'span' ? 'bg-[#FAF8F5] text-[#2B2C30] font-bold shadow-2xs' : 'text-[#71727A] hover:text-[#2B2C30]'
          }`}
        >
          Date Span
        </button>
        <button
          type="button"
          onClick={() => setMode('multi')}
          className={`py-1 rounded-md transition-all cursor-pointer ${
            mode === 'multi' ? 'bg-[#FAF8F5] text-[#2B2C30] font-bold shadow-2xs' : 'text-[#71727A] hover:text-[#2B2C30]'
          }`}
        >
          Multi-Date
        </button>
      </div>

      {/* Date Span Controls */}
      {mode === 'span' && (
        <div className="space-y-1 p-2 bg-[#FAF8F5] border border-[#E5DFD5] rounded-md max-w-sm">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <span className="block text-[9px] font-mono text-[#8E8F95] uppercase mb-0.5">Start</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono bg-white border border-[#DDD6C8] rounded text-[#2B2C30]"
              />
            </div>
            <span className="text-[#8E8F95] mt-4">→</span>
            <div className="flex-1">
              <span className="block text-[9px] font-mono text-[#8E8F95] uppercase mb-0.5">End</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono bg-white border border-[#DDD6C8] rounded text-[#2B2C30]"
              />
            </div>
          </div>
          <div className="text-[10px] font-mono text-[#83C5BE] font-semibold text-right">
            ↳ Spans {spannedDates.length} {spannedDates.length === 1 ? 'day' : 'days'}
          </div>
        </div>
      )}

      {/* Multi-Date Controls */}
      {mode === 'multi' && (
        <div className="space-y-1.5 p-2 bg-[#FAF8F5] border border-[#E5DFD5] rounded-md max-w-sm">
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {customDates.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono bg-[#EAE3D6] text-[#2B2C30] rounded"
              >
                <span>{d.slice(5)}</span>
                {customDates.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomDate(d)}
                    className="text-[#8E8F95] hover:text-[#D23B38] cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={newDateInput}
              onChange={(e) => setNewDateInput(e.target.value)}
              className="flex-1 px-2 py-1 text-xs font-mono bg-white border border-[#DDD6C8] rounded text-[#2B2C30]"
            />
            <button
              type="button"
              onClick={handleAddCustomDate}
              className="flex items-center gap-0.5 px-2 py-1 text-[11px] bg-[#EAE3D6] hover:bg-[#DDD6C8] text-[#2B2C30] rounded cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add</span>
            </button>
          </div>
        </div>
      )}

      {/* Color Palette (2 rows) & Action Buttons */}
      <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-2 pt-2 border-t border-[#E5DFD5]">
        {/* Left: 2-row compact color swatches with shortcut hint underneath */}
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-6 gap-1 w-fit items-center" title="Select accent color">
            {/* None / Default uncolored option */}
            <button
              type="button"
              onClick={() => setColorTag(undefined)}
              className={`w-3.5 h-3.5 rounded-full border border-[#DDD6C8] flex items-center justify-center transition-all cursor-pointer ${
                !colorTag ? 'ring-2 ring-offset-1 ring-[#2B2C30] bg-[#EAE3D6]' : 'bg-[#FAF8F5] opacity-65 hover:opacity-100'
              }`}
              title="No color (Default / Clear)"
            >
              <span className="w-1 h-1 rounded-full bg-[#A19D94]" />
            </button>

            {NOTE_ACCENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColorTag(colorTag === c ? undefined : c)}
                className={`w-3.5 h-3.5 rounded-full transition-transform cursor-pointer ${
                  colorTag === c ? 'scale-125 ring-2 ring-offset-1 ring-[#2B2C30]' : 'opacity-65 hover:opacity-100'
                }`}
                style={{ backgroundColor: c }}
                title={`Accent: ${c}`}
              />
            ))}
          </div>

          {/* Shortcut hint tucked directly beneath the colors */}
          <span className="text-[10px] font-mono text-[#8E8F95] leading-none select-none">
            ⌘↵ save • ↵ newline
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-2.5 py-1 text-xs text-[#71727A] hover:text-[#2B2C30] rounded cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-[#2B2C30] hover:bg-[#404147] text-[#FAF8F5] rounded-lg shadow-2xs transition-colors cursor-pointer shrink-0"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{submitLabel}</span>
          </button>
        </div>
      </div>
    </form>
  );
};
