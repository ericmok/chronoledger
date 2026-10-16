import React, { useState, useMemo } from 'react';
import { Check } from 'lucide-react';
import { analyzeWeekSpan } from '../../utils/dateUtils';
import { NOTE_ACCENT_COLORS } from '../../types/calendar';
import { SUGGESTED_TAGS } from '../../utils/annotationUtils';
import { useAnnotationInput } from '../../hooks/useAnnotationInput';
import { AnnotationAutocomplete } from '../common/AnnotationAutocomplete';

export interface WeekOption {
  weekKey: string;
  label: string;
}

export interface WeekNoteInlineFormProps {
  initialContent?: string;
  initialWeeks?: string[];
  initialColorTag?: string;
  currentWeekKey: string;
  availableWeeks: WeekOption[];
  onSubmit: (content: string, parentWeeks: string[], colorTag?: string) => void;
  onCancel: () => void;
  submitLabel?: string;
}

export const WeekNoteInlineForm: React.FC<WeekNoteInlineFormProps> = ({
  initialContent = '',
  initialWeeks = [],
  initialColorTag,
  currentWeekKey,
  availableWeeks,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
}) => {
  const [content, setContent] = useState(initialContent);
  const [colorTag, setColorTag] = useState<string | undefined>(initialColorTag);

  // Determine initial mode from initialWeeks
  const initialSpan = useMemo(() => {
    const weeks = initialWeeks.length > 0 ? initialWeeks : [currentWeekKey];
    return analyzeWeekSpan(weeks, availableWeeks);
  }, [initialWeeks, currentWeekKey, availableWeeks]);

  const [mode, setMode] = useState<'single' | 'span' | 'multi'>(() => {
    if (initialWeeks.length > 1) {
      return initialSpan.isContiguous ? 'span' : 'multi';
    }
    return 'single';
  });

  const [startWeek, setStartWeek] = useState(initialSpan.startWeek || currentWeekKey);
  const [endWeek, setEndWeek] = useState(initialSpan.endWeek || currentWeekKey);
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>(
    initialWeeks.length > 0 ? initialWeeks : [currentWeekKey]
  );
  const [newWeekInput, setNewWeekInput] = useState('');

  // Compute spanned weeks for contiguous span mode
  const spannedWeeks = useMemo(() => {
    if (mode !== 'span') return [];
    const allKeys = availableWeeks.map((w) => w.weekKey);
    const sIdx = allKeys.indexOf(startWeek);
    const eIdx = allKeys.indexOf(endWeek);
    if (sIdx === -1 || eIdx === -1) return [startWeek];
    const min = Math.min(sIdx, eIdx);
    const max = Math.max(sIdx, eIdx);
    return allKeys.slice(min, max + 1);
  }, [mode, startWeek, endWeek, availableWeeks]);

  const handleAddWeek = (weekToAdd: string) => {
    if (weekToAdd && !selectedWeeks.includes(weekToAdd)) {
      setSelectedWeeks((prev) => [...prev, weekToAdd]);
      setNewWeekInput('');
    }
  };

  const handleRemoveWeek = (weekToRemove: string) => {
    if (selectedWeeks.length > 1) {
      setSelectedWeeks((prev) => prev.filter((w) => w !== weekToRemove));
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    let targetWeeks: string[];
    if (mode === 'single') {
      targetWeeks = [currentWeekKey];
    } else if (mode === 'span') {
      targetWeeks = spannedWeeks.length > 0 ? spannedWeeks : [currentWeekKey];
    } else {
      targetWeeks = selectedWeeks.length > 0 ? selectedWeeks : [currentWeekKey];
    }

    onSubmit(trimmed, targetWeeks, colorTag);
  };

  const annotationInput = useAnnotationInput(content, setContent);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (annotationInput.isOpen && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      return; // Handled by AnnotationAutocomplete
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="p-2.5 bg-white border border-[#2B2C30]/80 rounded-lg shadow-sm space-y-2 text-xs font-sans animate-in fade-in duration-100"
    >
      {/* Note Content Textarea with Autocomplete */}
      <div className="relative">
        <textarea
          autoFocus
          rows={2}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            annotationInput.updateCursor(e.target.value, e.target.selectionStart || 0);
          }}
          onKeyUp={(e) => {
            annotationInput.updateCursor(content, (e.target as HTMLTextAreaElement).selectionStart || 0);
          }}
          onClick={(e) => {
            annotationInput.updateCursor(content, (e.target as HTMLTextAreaElement).selectionStart || 0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Weekly note... (type @ for tags: @important, @wait, @explore...)"
          className="w-full px-2.5 py-1.5 text-xs bg-[#FAF8F5] border border-[#DDD6C8] rounded focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#2B2C30] placeholder:text-[#A19D94] resize-none"
        />

        <AnnotationAutocomplete
          isOpen={annotationInput.isOpen}
          query={annotationInput.query}
          onSelectTag={annotationInput.selectTag}
          onClose={annotationInput.close}
          className="top-full left-0 mt-1"
        />
      </div>

      {/* Quick Annotation Helper Bar */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-mono text-[#8E8F95] uppercase tracking-wider">Tags:</span>
        {SUGGESTED_TAGS.slice(0, 7).map((opt) => (
          <button
            key={opt.tag}
            type="button"
            onClick={() => annotationInput.insertTagDirectly(opt.tag)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border border-[#DDD6C8] bg-[#FAF8F5] hover:bg-[#EAE3D6] text-[#2B2C30] transition-colors cursor-pointer"
            title={opt.description}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
            <span>{opt.label}</span>
          </button>
        ))}
      </div>

      {/* Scope Mode Selector */}
      <div className="grid grid-cols-3 gap-0.5 p-0.5 bg-[#F2EDE4] rounded text-[10px] font-mono font-medium">
        <button
          type="button"
          onClick={() => setMode('single')}
          className={`py-1 rounded transition-all cursor-pointer ${
            mode === 'single' ? 'bg-[#FAF8F5] text-[#2B2C30] font-bold shadow-2xs' : 'text-[#71727A] hover:text-[#2B2C30]'
          }`}
        >
          This Week
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('span');
            if (endWeek === startWeek && availableWeeks.length > 0) {
              const curIdx = availableWeeks.findIndex((w) => w.weekKey === currentWeekKey);
              if (curIdx !== -1 && curIdx + 1 < availableWeeks.length) {
                setEndWeek(availableWeeks[curIdx + 1].weekKey);
              }
            }
          }}
          className={`py-1 rounded transition-all cursor-pointer ${
            mode === 'span' ? 'bg-[#FAF8F5] text-[#2B2C30] font-bold shadow-2xs' : 'text-[#71727A] hover:text-[#2B2C30]'
          }`}
        >
          Week Span
        </button>
        <button
          type="button"
          onClick={() => setMode('multi')}
          className={`py-1 rounded transition-all cursor-pointer ${
            mode === 'multi' ? 'bg-[#FAF8F5] text-[#2B2C30] font-bold shadow-2xs' : 'text-[#71727A] hover:text-[#2B2C30]'
          }`}
        >
          Multi-Week
        </button>
      </div>

      {/* Contiguous Span Selector */}
      {mode === 'span' && (
        <div className="space-y-1.5 p-1.5 bg-[#FAF8F5] border border-[#E5DFD5] rounded text-[11px]">
          <div className="flex items-center gap-1.5">
            <div className="flex-1 min-w-0">
              <span className="block text-[9px] font-mono text-[#8E8F95] uppercase">From</span>
              <select
                value={startWeek}
                onChange={(e) => setStartWeek(e.target.value)}
                className="w-full px-1.5 py-1 text-[11px] font-mono bg-white border border-[#DDD6C8] rounded text-[#2B2C30]"
              >
                {availableWeeks.map((w) => (
                  <option key={w.weekKey} value={w.weekKey}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[#8E8F95] mt-3">→</span>
            <div className="flex-1 min-w-0">
              <span className="block text-[9px] font-mono text-[#8E8F95] uppercase">To</span>
              <select
                value={endWeek}
                onChange={(e) => setEndWeek(e.target.value)}
                className="w-full px-1.5 py-1 text-[11px] font-mono bg-white border border-[#DDD6C8] rounded text-[#2B2C30]"
              >
                {availableWeeks.map((w) => (
                  <option key={w.weekKey} value={w.weekKey}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="text-[10px] font-mono text-[#83C5BE] font-semibold text-right">
            ↳ Spans {spannedWeeks.length} {spannedWeeks.length === 1 ? 'week' : 'weeks'}
          </div>
        </div>
      )}

      {/* Non-contiguous Multi-Week Selector */}
      {mode === 'multi' && (
        <div className="space-y-1.5 p-1.5 bg-[#FAF8F5] border border-[#E5DFD5] rounded">
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {selectedWeeks.map((wk) => {
              const opt = availableWeeks.find((w) => w.weekKey === wk);
              const label = opt ? opt.label.split('·')[0].trim() : wk;
              return (
                <span
                  key={wk}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono bg-[#EAE3D6] text-[#2B2C30] rounded"
                >
                  <span>{label}</span>
                  {selectedWeeks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveWeek(wk)}
                      className="text-[#8E8F95] hover:text-[#D23B38] cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </span>
              );
            })}
          </div>

          <div className="flex items-center gap-1">
            <select
              value={newWeekInput}
              onChange={(e) => {
                if (e.target.value) {
                  handleAddWeek(e.target.value);
                }
              }}
              className="flex-1 px-1.5 py-1 text-[11px] font-mono bg-white border border-[#DDD6C8] rounded text-[#2B2C30]"
            >
              <option value="">+ Add another week...</option>
              {availableWeeks
                .filter((w) => !selectedWeeks.includes(w.weekKey))
                .map((w) => (
                  <option key={w.weekKey} value={w.weekKey}>
                    {w.label}
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}

      {/* Color Dots & Action Buttons */}
      <div className="flex items-center justify-between pt-1 border-t border-[#E5DFD5]">
        <div className="flex items-center gap-1">
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
            />
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-2 py-1 text-[11px] text-[#71727A] hover:text-[#2B2C30] rounded cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-[#2B2C30] hover:bg-[#404147] text-[#FAF8F5] rounded shadow-2xs transition-colors cursor-pointer"
          >
            <Check className="w-3 h-3" />
            <span>{submitLabel}</span>
          </button>
        </div>
      </div>
    </form>
  );
};
