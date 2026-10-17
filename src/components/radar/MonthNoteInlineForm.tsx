import React, { useState, useMemo } from 'react';
import { Check } from 'lucide-react';
import { analyzeMonthSpan } from '../../utils/dateUtils';
import { NOTE_ACCENT_COLORS } from '../../types/calendar';
import { SUGGESTED_TAGS } from '../../utils/annotationUtils';
import { useAnnotationInput } from '../../hooks/useAnnotationInput';
import { AnnotationAutocomplete } from '../common/AnnotationAutocomplete';

export interface MonthOption {
  monthKey: string;
  label: string;
}

export interface MonthNoteInlineFormProps {
  initialContent?: string;
  initialMonths?: string[];
  initialColorTag?: string;
  currentMonthKey: string;
  availableMonths: MonthOption[];
  onSubmit: (content: string, parentMonths: string[], colorTag?: string) => void;
  onCancel: () => void;
  submitLabel?: string;
}

export const MonthNoteInlineForm: React.FC<MonthNoteInlineFormProps> = ({
  initialContent = '',
  initialMonths = [],
  initialColorTag,
  currentMonthKey,
  availableMonths,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
}) => {
  const [content, setContent] = useState(initialContent);
  const [colorTag, setColorTag] = useState<string | undefined>(initialColorTag);

  const initialSpan = useMemo(() => {
    const months = initialMonths.length > 0 ? initialMonths : [currentMonthKey];
    return analyzeMonthSpan(months);
  }, [initialMonths, currentMonthKey]);

  const [mode, setMode] = useState<'single' | 'span' | 'multi'>(() => {
    if (initialMonths.length > 1) {
      return initialSpan.isContiguous ? 'span' : 'multi';
    }
    return 'single';
  });

  const [startMonth, setStartMonth] = useState(initialSpan.startMonth || currentMonthKey);
  const [endMonth, setEndMonth] = useState(initialSpan.endMonth || currentMonthKey);
  const [selectedMonths, setSelectedMonths] = useState<string[]>(
    initialMonths.length > 0 ? initialMonths : [currentMonthKey]
  );
  const [newMonthInput, setNewMonthInput] = useState('');

  const spannedMonths = useMemo(() => {
    if (mode !== 'span') return [];
    const allKeys = availableMonths.map((m) => m.monthKey);
    const sIdx = allKeys.indexOf(startMonth);
    const eIdx = allKeys.indexOf(endMonth);
    if (sIdx === -1 || eIdx === -1) return [startMonth];
    const min = Math.min(sIdx, eIdx);
    const max = Math.max(sIdx, eIdx);
    return allKeys.slice(min, max + 1);
  }, [mode, startMonth, endMonth, availableMonths]);

  const handleAddMonth = (monthToAdd: string) => {
    if (monthToAdd && !selectedMonths.includes(monthToAdd)) {
      setSelectedMonths((prev) => [...prev, monthToAdd].sort());
      setNewMonthInput('');
    }
  };

  const handleRemoveMonth = (monthToRemove: string) => {
    if (selectedMonths.length > 1) {
      setSelectedMonths((prev) => prev.filter((m) => m !== monthToRemove));
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    let targetMonths: string[];
    if (mode === 'single') {
      targetMonths = [currentMonthKey];
    } else if (mode === 'span') {
      targetMonths = spannedMonths.length > 0 ? spannedMonths : [currentMonthKey];
    } else {
      targetMonths = selectedMonths.length > 0 ? selectedMonths : [currentMonthKey];
    }

    onSubmit(trimmed, targetMonths, colorTag);
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
      {/* Content Textarea with Autocomplete */}
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
          placeholder="Monthly horizon... (type @ for tags: @important, @wait, @explore...)"
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
        <span className="text-[10px] font-sans font-medium text-[#8E8F95] uppercase tracking-wider">Tags:</span>
        {SUGGESTED_TAGS.map((opt) => (
          <button
            key={opt.tag}
            type="button"
            onClick={() => annotationInput.insertTagDirectly(opt.tag)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans font-medium border border-[#DDD6C8] bg-[#FAF8F5] hover:bg-[#EAE3D6] text-[#2B2C30] transition-colors cursor-pointer"
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
          This Month
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('span');
            if (endMonth === startMonth && availableMonths.length > 0) {
              const curIdx = availableMonths.findIndex((m) => m.monthKey === currentMonthKey);
              if (curIdx !== -1 && curIdx + 1 < availableMonths.length) {
                setEndMonth(availableMonths[curIdx + 1].monthKey);
              }
            }
          }}
          className={`py-1 rounded transition-all cursor-pointer ${
            mode === 'span' ? 'bg-[#FAF8F5] text-[#2B2C30] font-bold shadow-2xs' : 'text-[#71727A] hover:text-[#2B2C30]'
          }`}
        >
          Month Span
        </button>
        <button
          type="button"
          onClick={() => setMode('multi')}
          className={`py-1 rounded transition-all cursor-pointer ${
            mode === 'multi' ? 'bg-[#FAF8F5] text-[#2B2C30] font-bold shadow-2xs' : 'text-[#71727A] hover:text-[#2B2C30]'
          }`}
        >
          Multi-Month
        </button>
      </div>

      {/* Month Span Controls */}
      {mode === 'span' && (
        <div className="space-y-1.5 p-1.5 bg-[#FAF8F5] border border-[#E5DFD5] rounded text-[11px]">
          <div className="flex items-center gap-1.5">
            <div className="flex-1 min-w-0">
              <span className="block text-[9px] font-mono text-[#8E8F95] uppercase">From</span>
              <select
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="w-full px-1.5 py-1 text-[11px] font-mono bg-white border border-[#DDD6C8] rounded text-[#2B2C30]"
              >
                {availableMonths.map((m) => (
                  <option key={m.monthKey} value={m.monthKey}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[#8E8F95] mt-3">→</span>
            <div className="flex-1 min-w-0">
              <span className="block text-[9px] font-mono text-[#8E8F95] uppercase">To</span>
              <select
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                className="w-full px-1.5 py-1 text-[11px] font-mono bg-white border border-[#DDD6C8] rounded text-[#2B2C30]"
              >
                {availableMonths.map((m) => (
                  <option key={m.monthKey} value={m.monthKey}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="text-[10px] font-mono text-[#83C5BE] font-semibold text-right">
            ↳ Spans {spannedMonths.length} {spannedMonths.length === 1 ? 'month' : 'months'}
          </div>
        </div>
      )}

      {/* Multi-Month Controls */}
      {mode === 'multi' && (
        <div className="space-y-1.5 p-1.5 bg-[#FAF8F5] border border-[#E5DFD5] rounded">
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {selectedMonths.map((mk) => {
              const opt = availableMonths.find((m) => m.monthKey === mk);
              const label = opt ? opt.label : mk;
              return (
                <span
                  key={mk}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono bg-[#EAE3D6] text-[#2B2C30] rounded"
                >
                  <span>{label}</span>
                  {selectedMonths.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMonth(mk)}
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
              value={newMonthInput}
              onChange={(e) => {
                if (e.target.value) {
                  handleAddMonth(e.target.value);
                }
              }}
              className="flex-1 px-1.5 py-1 text-[11px] font-mono bg-white border border-[#DDD6C8] rounded text-[#2B2C30]"
            >
              <option value="">+ Add another month...</option>
              {availableMonths
                .filter((m) => !selectedMonths.includes(m.monthKey))
                .map((m) => (
                  <option key={m.monthKey} value={m.monthKey}>
                    {m.label}
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
